/* Reliability rules for QR customization.
 * Classic script: exposes a single global `QRValidation`.
 *
 * Rules implemented (based on ISO 18004 guidance and scanner field practice):
 *  - Foreground/background contrast ratio (WCAG relative luminance) must be >= 4:1;
 *    >= 7:1 is recommended. Below 4:1 the change is rejected.
 *  - Foreground must be darker than background (light-on-dark codes fail on many scanners).
 *  - Logos require error correction Q or H; max logo width is capped so the obscured
 *    area stays under half the EC level's recovery budget (H ~30%, Q ~25%).
 *  - Dense codes (high QR version) restrict decorative module shapes and logos because
 *    modules become too small to survive distortion.
 */
(function (root) {
  "use strict";

  var MIN_CONTRAST = 4.0;
  var GOOD_CONTRAST = 7.0;

  // Max logo width as a fraction of QR width. Area coverage = value^2:
  // H: 0.35^2 = 12% area vs 30% recovery; Q: 0.25^2 = 6% area vs 25% recovery.
  var LOGO_MAX_SIZE = { H: 0.35, Q: 0.25, M: 0, L: 0 };

  // Density tiers by estimated QR version.
  var SHAPE_TIERS = [
    { maxVersion: 15, dots: ["square", "rounded", "extra-rounded", "classy", "classy-rounded", "dots"], logo: true },
    { maxVersion: 25, dots: ["square", "rounded"], logo: true },
    { maxVersion: 40, dots: ["square"], logo: false }
  ];

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function relativeLuminance(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(fgHex, bgHex) {
    var fg = hexToRgb(fgHex), bg = hexToRgb(bgHex);
    if (!fg || !bg) return 0;
    var l1 = relativeLuminance(fg), l2 = relativeLuminance(bg);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function fgIsDarker(fgHex, bgHex) {
    return relativeLuminance(hexToRgb(fgHex)) < relativeLuminance(hexToRgb(bgHex));
  }

  // Returns { ok, level: "ok"|"warn"|"error", ratio, message }
  function validateColors(fgHex, bgHex) {
    if (!hexToRgb(fgHex) || !hexToRgb(bgHex)) {
      return { ok: false, level: "error", ratio: 0, message: "Colors must be 6-digit hex values." };
    }
    var ratio = contrastRatio(fgHex, bgHex);
    if (!fgIsDarker(fgHex, bgHex)) {
      return {
        ok: false, level: "error", ratio: ratio,
        message: "The foreground must be darker than the background. Inverted (light-on-dark) QR codes fail on many scanners."
      };
    }
    if (ratio < MIN_CONTRAST) {
      return {
        ok: false, level: "error", ratio: ratio,
        message: "Contrast ratio " + ratio.toFixed(1) + ":1 is below the 4:1 minimum scanners need. Pick a darker foreground or lighter background."
      };
    }
    if (ratio < GOOD_CONTRAST) {
      return {
        ok: true, level: "warn", ratio: ratio,
        message: "Contrast ratio " + ratio.toFixed(1) + ":1 will scan, but 7:1 or higher is recommended for low-light and long-distance scanning."
      };
    }
    return { ok: true, level: "ok", ratio: ratio, message: "Contrast ratio " + ratio.toFixed(1) + ":1 — excellent." };
  }

  function shapeTier(version) {
    for (var i = 0; i < SHAPE_TIERS.length; i++) {
      if (version <= SHAPE_TIERS[i].maxVersion) return SHAPE_TIERS[i];
    }
    return SHAPE_TIERS[SHAPE_TIERS.length - 1];
  }

  function allowedDotTypes(version) {
    return shapeTier(version).dots;
  }

  // Logo permission for a given EC level + estimated version.
  // Returns { allowed, maxSize, reason }
  function logoPolicy(ecLevel, version) {
    if (!shapeTier(version).logo) {
      return {
        allowed: false, maxSize: 0,
        reason: "This much data produces a very dense code (version " + version + " of 40). A logo would cover too many modules to recover, so logos are disabled."
      };
    }
    var max = LOGO_MAX_SIZE[ecLevel] || 0;
    if (max === 0) {
      return {
        allowed: false, maxSize: 0,
        reason: "Logos need error correction level Q or H so the covered modules can be recovered. Raise the error correction level to add a logo."
      };
    }
    return { allowed: true, maxSize: max, reason: null };
  }

  root.QRValidation = {
    MIN_CONTRAST: MIN_CONTRAST,
    GOOD_CONTRAST: GOOD_CONTRAST,
    contrastRatio: contrastRatio,
    validateColors: validateColors,
    allowedDotTypes: allowedDotTypes,
    logoPolicy: logoPolicy
  };
})(typeof window !== "undefined" ? window : globalThis);
