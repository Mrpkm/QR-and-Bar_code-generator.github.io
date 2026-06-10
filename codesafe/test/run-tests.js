/* Unit tests for qr-capacity.js and qr-validation.js.
 * Runs under Windows Script Host: cscript //nologo test\run-tests.js
 * (WSH is ES3, so a few ES5+ shims are defined before loading the modules.)
 */
var globalThis = this;

// --- ES5/browser shims for JScript ---
if (!Array.prototype.map) {
  Array.prototype.map = function (fn) {
    var out = [];
    for (var i = 0; i < this.length; i++) out.push(fn(this[i], i, this));
    return out;
  };
}
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (x) {
    for (var i = 0; i < this.length; i++) if (this[i] === x) return i;
    return -1;
  };
}
if (!String.prototype.trim) {
  String.prototype.trim = function () { return this.replace(/^\s+|\s+$/g, ""); };
}
// ASCII-only stand-in for the tests below.
function TextEncoder() {
  this.encode = function (s) { return { length: s.length } };
}

// --- Load the modules under test ---
var fso = new ActiveXObject("Scripting.FileSystemObject");
var here = fso.GetParentFolderName(WScript.ScriptFullName);
function load(rel) {
  var stream = fso.OpenTextFile(fso.BuildPath(fso.GetParentFolderName(here), rel), 1);
  var src = stream.ReadAll();
  stream.Close();
  eval(src);
}
load("js\\qr-capacity.js");
load("js\\qr-validation.js");

// --- Tiny assert harness ---
var failures = 0, total = 0;
function eq(actual, expected, label) {
  total++;
  if (actual !== expected) {
    failures++;
    WScript.Echo("FAIL " + label + ": expected " + expected + ", got " + actual);
  }
}
function repeat(ch, n) { return new Array(n + 1).join(ch); }

// --- Capacity table spot checks against published ISO 18004 values ---
eq(QRCapacity.capacity(40, "L", "byte"), 2953, "v40-L byte");
eq(QRCapacity.capacity(40, "L", "alphanumeric"), 4296, "v40-L alnum");
eq(QRCapacity.capacity(40, "L", "numeric"), 7089, "v40-L numeric");
eq(QRCapacity.capacity(40, "H", "byte"), 1273, "v40-H byte");
eq(QRCapacity.capacity(40, "Q", "byte"), 1663, "v40-Q byte");
eq(QRCapacity.capacity(40, "M", "byte"), 2331, "v40-M byte");
eq(QRCapacity.capacity(1, "L", "byte"), 17, "v1-L byte");
eq(QRCapacity.capacity(1, "M", "alphanumeric"), 20, "v1-M alnum");
eq(QRCapacity.capacity(1, "H", "numeric"), 17, "v1-H numeric");
eq(QRCapacity.capacity(10, "L", "byte"), 271, "v10-L byte");
eq(QRCapacity.capacity(25, "L", "byte"), 1273, "v25-L byte");

// --- Mode detection ---
eq(QRCapacity.detectMode("123456"), "numeric", "numeric mode");
eq(QRCapacity.detectMode("HELLO WORLD $1/2:"), "alphanumeric", "alnum mode");
eq(QRCapacity.detectMode("hello"), "byte", "lowercase is byte mode");
eq(QRCapacity.detectMode("HTTPS://EXAMPLE.COM"), "alphanumeric", "uppercase URL is alnum");

// --- Version estimation ---
eq(QRCapacity.minVersion("HELLO WORLD", "H"), 2, "HELLO WORLD at H -> v2");
eq(QRCapacity.minVersion(repeat("A", 4296), "L"), 40, "4296 alnum at L -> v40");
eq(QRCapacity.minVersion(repeat("A", 4297), "L"), null, "4297 alnum at L -> overflow");
eq(QRCapacity.minVersion(repeat("a", 2953), "L"), 40, "2953 bytes at L -> v40");
eq(QRCapacity.minVersion(repeat("a", 2954), "L"), null, "2954 bytes at L -> overflow");

// --- bestEcLevel: 4000 alphanumeric chars only fit at L ---
eq(QRCapacity.bestEcLevel(repeat("A", 4000)), "L", "4000 alnum -> best EC is L");
eq(QRCapacity.bestEcLevel(repeat("A", 1800)), "H", "1800 alnum -> best EC is H");
eq(QRCapacity.bestEcLevel(repeat("a", 5000)), null, "5000 bytes -> impossible");

// --- Color validation ---
eq(QRValidation.validateColors("#000000", "#ffffff").level, "ok", "black on white ok");
eq(QRValidation.validateColors("#ffffff", "#000000").ok, false, "inverted rejected");
eq(QRValidation.validateColors("#cccccc", "#ffffff").ok, false, "low contrast rejected");
eq(QRValidation.validateColors("#777777", "#ffffff").level, "warn", "borderline contrast warns");
eq(Math.round(QRValidation.contrastRatio("#000000", "#ffffff")), 21, "contrast ratio 21:1");

// --- Logo policy ---
eq(QRValidation.logoPolicy("M", 10).allowed, false, "no logo at EC M");
eq(QRValidation.logoPolicy("H", 10).allowed, true, "logo ok at EC H");
eq(QRValidation.logoPolicy("H", 10).maxSize, 0.35, "EC H max logo size");
eq(QRValidation.logoPolicy("Q", 10).maxSize, 0.25, "EC Q max logo size");
eq(QRValidation.logoPolicy("H", 30).allowed, false, "no logo on very dense codes");

// --- Shape restrictions ---
eq(QRValidation.allowedDotTypes(10).length, 6, "all shapes at v10");
eq(QRValidation.allowedDotTypes(20).length, 2, "restricted shapes at v20");
eq(QRValidation.allowedDotTypes(30).length, 1, "square only at v30");
eq(QRValidation.allowedDotTypes(30)[0], "square", "square is the v30 fallback");

WScript.Echo(failures === 0 ? "All " + total + " tests passed." : failures + " of " + total + " tests FAILED.");
WScript.Quit(failures === 0 ? 0 : 1);
