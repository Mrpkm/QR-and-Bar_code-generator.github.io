/* QR capacity math (ISO/IEC 18004).
 * Classic script: exposes a single global `QRCapacity`.
 * Also works under Node for unit testing via globalThis.
 */
(function (root) {
  "use strict";

  // Data codewords available per version (index 0 = version 1) for EC levels L, M, Q, H.
  var DATA_CODEWORDS = {
    L: [19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956],
    M: [16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334],
    Q: [13, 22, 34, 48, 62, 76, 88, 110, 132, 154, 180, 206, 244, 261, 295, 325, 367, 397, 445, 485, 512, 568, 614, 664, 718, 754, 808, 871, 911, 985, 1033, 1115, 1171, 1231, 1286, 1354, 1426, 1502, 1582, 1666],
    H: [9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385, 406, 442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222, 1276]
  };

  var ALNUM_RE = /^[0-9A-Z $%*+\-./:]*$/;
  var NUM_RE = /^[0-9]*$/;

  // Character-count-indicator bit widths by mode for version groups 1-9 / 10-26 / 27-40.
  var CCI_BITS = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16]
  };

  function versionGroup(version) {
    return version <= 9 ? 0 : version <= 26 ? 1 : 2;
  }

  function detectMode(text) {
    if (NUM_RE.test(text)) return "numeric";
    if (ALNUM_RE.test(text)) return "alphanumeric";
    return "byte";
  }

  function utf8ByteLength(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, "utf8");
  }

  // Length of the input in the units the mode counts in (chars for numeric/alnum, bytes for byte mode).
  function encodedLength(text, mode) {
    return mode === "byte" ? utf8ByteLength(text) : text.length;
  }

  // Max characters that fit in a given version + EC level for a mode.
  function capacity(version, ecLevel, mode) {
    var codewords = DATA_CODEWORDS[ecLevel][version - 1];
    var bits = codewords * 8 - 4 - CCI_BITS[mode][versionGroup(version)];
    if (bits < 0) return 0;
    if (mode === "numeric") {
      var groups = Math.floor(bits / 10);
      var rem = bits - groups * 10;
      return groups * 3 + (rem >= 7 ? 2 : rem >= 4 ? 1 : 0);
    }
    if (mode === "alphanumeric") {
      var pairs = Math.floor(bits / 11);
      return pairs * 2 + (bits - pairs * 11 >= 6 ? 1 : 0);
    }
    return Math.floor(bits / 8); // byte
  }

  function maxCapacity(ecLevel, mode) {
    return capacity(40, ecLevel, mode);
  }

  // Smallest version that fits the text at the given EC level, or null if it doesn't fit at all.
  function minVersion(text, ecLevel) {
    var mode = detectMode(text);
    var len = encodedLength(text, mode);
    for (var v = 1; v <= 40; v++) {
      if (capacity(v, ecLevel, mode) >= len) return v;
    }
    return null;
  }

  // Highest EC level (H > Q > M > L) at which the text still fits, or null.
  function bestEcLevel(text) {
    var order = ["H", "Q", "M", "L"];
    for (var i = 0; i < order.length; i++) {
      if (minVersion(text, order[i]) !== null) return order[i];
    }
    return null;
  }

  function analyze(text, ecLevel) {
    var mode = detectMode(text);
    return {
      mode: mode,
      length: encodedLength(text, mode),
      capacity: maxCapacity(ecLevel, mode),
      version: minVersion(text, ecLevel),
      fits: minVersion(text, ecLevel) !== null
    };
  }

  root.QRCapacity = {
    detectMode: detectMode,
    encodedLength: encodedLength,
    capacity: capacity,
    maxCapacity: maxCapacity,
    minVersion: minVersion,
    bestEcLevel: bestEcLevel,
    analyze: analyze
  };
})(typeof window !== "undefined" ? window : globalThis);
