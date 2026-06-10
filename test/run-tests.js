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
load("js\\analytics-core.js");

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

// ============================================================
// analytics-core.js (CSCore)
// ============================================================

// --- Community milestone ladder ---
eq(CSCore.goalFor(0), 100, "goal at 0 is 100");
eq(CSCore.goalFor(99), 100, "goal at 99 is 100");
eq(CSCore.goalFor(100), 1000, "goal advances at exactly 100");
eq(CSCore.goalFor(999), 1000, "goal at 999 is 1,000");
eq(CSCore.goalFor(1000000), 10000000, "goal at 1M is 10M");
eq(CSCore.goalFor(10000000), 100000000, "ladder keeps advancing past 10M");
eq(CSCore.milestonesCrossed(99, 100).length, 1, "99->100 crosses one milestone");
eq(CSCore.milestonesCrossed(99, 100)[0], 100, "99->100 crosses the 100 milestone");
eq(CSCore.milestonesCrossed(99, 1500).length, 2, "99->1500 crosses 100 and 1,000");
eq(CSCore.milestonesCrossed(100, 101).length, 0, "100->101 crosses nothing");

// --- URL validation (also guards s.html redirects) ---
eq(CSCore.isValidHttpUrl("https://example.com/x?y=1"), true, "https URL valid");
eq(CSCore.isValidHttpUrl("http://example.com"), true, "http URL valid");
eq(CSCore.isValidHttpUrl("javascript:alert(1)"), false, "javascript: rejected");
eq(CSCore.isValidHttpUrl("ftp://example.com"), false, "ftp rejected");
eq(CSCore.isValidHttpUrl("just some text"), false, "plain text rejected");

// --- Device classification ---
eq(CSCore.deviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobile", "iPhone is mobile");
eq(CSCore.deviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet", "iPad is tablet");
eq(CSCore.deviceType("Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile Safari"), "mobile", "Android phone is mobile");
eq(CSCore.deviceType("Mozilla/5.0 (Linux; Android 14; SM-X910) Safari"), "tablet", "Android without Mobile is tablet");
eq(CSCore.deviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop", "Windows is desktop");
eq(CSCore.deviceType(""), "desktop", "empty UA falls back to desktop");

// --- Timezone-derived geography ---
eq(CSCore.countryFromTimeZone("Europe/Budapest"), "Hungary", "Budapest -> Hungary");
eq(CSCore.countryFromTimeZone("America/New_York"), "United States", "New York -> United States");
eq(CSCore.countryFromTimeZone("Mars/Olympus_Mons"), null, "unknown zone -> null");
eq(CSCore.countryFromTimeZone(null), null, "missing zone -> null");

// --- Day keys and streaks ---
eq(CSCore.dayKey(new Date(2026, 5, 10, 12, 0, 0).getTime()), "2026-06-10", "dayKey formats local date");
eq(CSCore.shiftDayKey("2026-03-01", -1), "2026-02-28", "shift back over month edge");
eq(CSCore.shiftDayKey("2024-02-28", 1), "2024-02-29", "shift handles leap day");

var st = CSCore.computeStreaks(["2026-06-08", "2026-06-09", "2026-06-10"], "2026-06-10");
eq(st.current, 3, "3-day streak ending today");
eq(st.longest, 3, "longest matches current");
st = CSCore.computeStreaks(["2026-06-08", "2026-06-09"], "2026-06-10");
eq(st.current, 2, "streak ending yesterday still counts");
st = CSCore.computeStreaks(["2026-06-01", "2026-06-02", "2026-06-05"], "2026-06-05");
eq(st.current, 1, "gap resets current streak");
eq(st.longest, 2, "longest remembers the earlier run");
st = CSCore.computeStreaks([], "2026-06-10");
eq(st.current, 0, "no events -> no streak");
eq(st.longest, 0, "no events -> no longest");
st = CSCore.computeStreaks(["2026-06-10", "2026-06-10", "2026-06-10"], "2026-06-10");
eq(st.current, 1, "duplicate days count once");

// --- Trend grouping ---
var NOW = new Date(2026, 5, 10, 15, 0, 0).getTime();
var DAY = 86400000;
var series = CSCore.groupByDay([NOW, NOW - 3600000, NOW - DAY], 3, NOW);
eq(series.length, 3, "groupByDay returns one entry per day");
eq(series[2].day, "2026-06-10", "last entry is today");
eq(series[2].count, 2, "two events today");
eq(series[1].count, 1, "one event yesterday");
eq(series[0].count, 0, "zero-filled day with no events");

// --- Personal milestones ---
var pm = CSCore.personalMilestones(10, 0);
eq(pm.length, 7, "seven personal milestones");
eq(pm[1].earned, true, "10 codes earns codes-10");
eq(pm[2].earned, false, "10 codes does not earn codes-50");
eq(pm[4].earned, false, "no scans -> scans-1 not earned");

// --- Achievements ---
function ach(events, streaks) { return CSCore.computeAchievements(events, streaks || { longest: 0 }); }
function findAch(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
var noon = new Date(2026, 5, 10, 12, 0, 0).getTime();
eq(findAch(ach([]), "first-steps").earned, false, "no events -> First Steps locked");
eq(findAch(ach([{ kind: "qr", at: noon, meta: {} }]), "first-steps").earned, true, "one event -> First Steps");
eq(findAch(ach([{ kind: "qr", at: noon, meta: { hasLogo: true } }]), "logo-lover").earned, true, "logo earns Logo Lover");
eq(findAch(ach([{ kind: "qr", at: noon, meta: { version: 31 } }]), "heavyweight").earned, true, "v31 earns Heavyweight");
eq(findAch(ach([{ kind: "qr", at: noon, meta: { version: 12 } }]), "heavyweight").earned, false, "v12 is not Heavyweight");
eq(findAch(ach([{ kind: "qr", at: new Date(2026, 5, 10, 3, 0, 0).getTime(), meta: {} }]), "night-owl").earned, true, "3am earns Night Owl");
var colorEvents = [];
for (var ci = 0; ci < 5; ci++) {
  colorEvents.push({ kind: "qr", at: noon, meta: { fg: "#00000" + ci, bg: "#ffffff" } });
}
eq(findAch(ach(colorEvents), "colorist").earned, true, "5 color pairs earn Colorist");
var fmtEvents = [
  { kind: "barcode", at: noon, meta: { format: "CODE128" } },
  { kind: "barcode", at: noon, meta: { format: "EAN13" } },
  { kind: "barcode", at: noon, meta: { format: "UPC" } },
  { kind: "barcode", at: noon, meta: { format: "MSI" } }
];
eq(findAch(ach(fmtEvents), "polyglot").earned, true, "4 formats earn Polyglot");
eq(findAch(ach([], { longest: 7 }), "week-streak").earned, true, "7-day streak earns On Fire");

// --- Count formatting ---
eq(CSCore.formatCount(0), "0", "format 0");
eq(CSCore.formatCount(999), "999", "format 999");
eq(CSCore.formatCount(1000), "1,000", "format 1,000");
eq(CSCore.formatCount(1234567), "1,234,567", "format 1,234,567");

WScript.Echo(failures === 0 ? "All " + total + " tests passed." : failures + " of " + total + " tests FAILED.");
WScript.Quit(failures === 0 ? 0 : 1);
