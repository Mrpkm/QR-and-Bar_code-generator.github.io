/* QR generator UI: wires controls to qr-code-styling through the validation engine.
 * Every state change goes through applyRules(), which adjusts/disables options so the
 * UI can never describe an unscannable code, then re-renders the preview.
 */
(function () {
  "use strict";

  var PREVIEW_SIZE = 300;

  var els = {
    data: document.getElementById("qr-data"),
    capacityInfo: document.getElementById("qr-capacity-info"),
    ecGroup: document.getElementById("qr-ec-group"),
    fg: document.getElementById("qr-fg"),
    bg: document.getElementById("qr-bg"),
    contrastInfo: document.getElementById("qr-contrast-info"),
    dotType: document.getElementById("qr-dot-type"),
    eyeFrame: document.getElementById("qr-eye-frame"),
    eyeBall: document.getElementById("qr-eye-ball"),
    shapeInfo: document.getElementById("qr-shape-info"),
    logo: document.getElementById("qr-logo"),
    logoClear: document.getElementById("qr-logo-clear"),
    logoSizeRow: document.getElementById("qr-logo-size-row"),
    logoSize: document.getElementById("qr-logo-size"),
    logoSizeValue: document.getElementById("qr-logo-size-value"),
    logoInfo: document.getElementById("qr-logo-info"),
    track: document.getElementById("qr-track"),
    trackLabelRow: document.getElementById("qr-track-label-row"),
    trackLabel: document.getElementById("qr-track-label"),
    trackInfo: document.getElementById("qr-track-info"),
    messages: document.getElementById("qr-messages"),
    preview: document.getElementById("qr-preview"),
    exportSize: document.getElementById("qr-export-size"),
    downloadPng: document.getElementById("qr-download-png"),
    downloadSvg: document.getElementById("qr-download-svg")
  };

  // Last values known to pass validation, used to revert rejected color picks.
  var lastValidColors = { fg: "#000000", bg: "#ffffff" };
  var logoDataUrl = null;

  var qr = new QRCodeStyling({
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    type: "svg",
    data: els.data.value,
    margin: 12,
    qrOptions: { errorCorrectionLevel: "M" },
    imageOptions: { hideBackgroundDots: true, margin: 6, imageSize: 0.25 }
  });
  qr.append(els.preview);

  function ecLevel() {
    return els.ecGroup.querySelector("input:checked").value;
  }

  function setEcLevel(level) {
    els.ecGroup.querySelector('input[value="' + level + '"]').checked = true;
  }

  function setMeta(el, text, level) {
    el.textContent = text;
    el.className = "meta" + (level ? " " + level : "");
  }

  /* Central rules pass: adjusts controls to a safe state and returns feedback messages.
   * Order matters: capacity fixes EC first, the logo rules may raise EC again, and only
   * then are density-dependent restrictions (shapes) and info labels computed. */
  function applyRules() {
    var messages = [];
    var data = els.data.value;

    // --- Capacity: fall back if the data no longer fits the selected EC level --
    if (QRCapacity.minVersion(data, ecLevel()) === null) {
      var best = QRCapacity.bestEcLevel(data);
      if (best) {
        messages.push({
          level: "warn",
          text: "Your data no longer fits at error correction " + ecLevel() +
            ". Switched to level " + best + " (the highest that still fits)."
        });
        setEcLevel(best);
      } else {
        var mode = QRCapacity.detectMode(data);
        messages.push({
          level: "error",
          text: "Data is too long for any QR code (" + QRCapacity.encodedLength(data, mode) +
            " of " + QRCapacity.maxCapacity("L", mode) + " max " +
            (mode === "byte" ? "bytes" : "characters") + " in " + mode + " mode)."
        });
      }
    }

    // --- Logo policy (may raise EC so the logo stays recoverable) --------------
    var version = QRCapacity.minVersion(data, ecLevel()) || 40;
    var policy = QRValidation.logoPolicy(ecLevel(), version);
    if (logoDataUrl && !policy.allowed && (ecLevel() === "L" || ecLevel() === "M")) {
      var target = QRCapacity.minVersion(data, "H") !== null ? "H"
        : QRCapacity.minVersion(data, "Q") !== null ? "Q" : null;
      if (target) {
        setEcLevel(target);
        version = QRCapacity.minVersion(data, target);
        policy = QRValidation.logoPolicy(target, version);
        messages.push({
          level: "warn",
          text: "Error correction raised to " + target + " so the logo's covered modules can be recovered."
        });
      }
    }
    if (logoDataUrl && !policy.allowed) {
      messages.push({ level: "error", text: policy.reason + " The logo was removed." });
      clearLogo(false);
    }

    // --- EC radios: disable levels that can't hold the data, or can't hold the logo
    els.ecGroup.querySelectorAll("input").forEach(function (input) {
      var fits = QRCapacity.minVersion(data, input.value) !== null;
      var logoOk = !logoDataUrl || QRValidation.logoPolicy(input.value, version).allowed;
      input.disabled = !fits || !logoOk;
      input.parentElement.classList.toggle("disabled", input.disabled);
      input.parentElement.title = !fits ? "Data too long for this level"
        : !logoOk ? "Too low to protect the logo — remove the logo to use this level" : "";
    });

    // --- Logo size cap (read the value before lowering max: the browser clamps) -
    if (policy.allowed) {
      var requested = parseFloat(els.logoSize.value);
      var maxPct = Math.round(policy.maxSize * policy.maxSize * 100);
      if (requested > policy.maxSize + 0.0001) {
        messages.push({
          level: "warn",
          text: "Logo size was reduced: at level " + ecLevel() + " the logo may cover at most " + maxPct + "% of the code area."
        });
      }
      els.logoSize.max = policy.maxSize;
      if (requested > policy.maxSize) els.logoSize.value = policy.maxSize;
      setMeta(els.logoInfo, "Safe at level " + ecLevel() + ": logo limited to " + maxPct +
        "% of the code area so covered modules stay recoverable.");
    } else {
      setMeta(els.logoInfo, policy.reason || "", logoDataUrl ? "warn" : "");
    }
    els.logo.disabled = !policy.allowed;
    els.logoSizeRow.hidden = !logoDataUrl;
    els.logoClear.hidden = !logoDataUrl;
    els.logoSizeValue.textContent = Math.round(parseFloat(els.logoSize.value) * 100) + "% of width";

    // --- Module shapes: restrict decorative shapes for dense codes -------------
    var allowed = QRValidation.allowedDotTypes(version);
    Array.prototype.forEach.call(els.dotType.options, function (opt) {
      opt.disabled = allowed.indexOf(opt.value) === -1;
    });
    if (allowed.indexOf(els.dotType.value) === -1) {
      var fallback = allowed.indexOf("rounded") !== -1 ? "rounded" : "square";
      els.dotType.value = fallback;
      messages.push({
        level: "warn",
        text: "Module shape was reset to “" + fallback + "” — the previous shape is unsafe at this data density."
      });
    }
    if (allowed.length < els.dotType.options.length) {
      setMeta(els.shapeInfo,
        "Dense code (version " + version + "): decorative module shapes are limited because small modules with reduced ink no longer scan reliably.",
        "warn");
    } else {
      setMeta(els.shapeInfo, "All shapes are safe at this data density.");
    }

    // --- Colors -----------------------------------------------------------------
    var colorCheck = QRValidation.validateColors(els.fg.value, els.bg.value);
    if (!colorCheck.ok) {
      messages.push({ level: "error", text: colorCheck.message + " Reverted to the previous colors." });
      els.fg.value = lastValidColors.fg;
      els.bg.value = lastValidColors.bg;
      colorCheck = QRValidation.validateColors(els.fg.value, els.bg.value);
    }
    lastValidColors = { fg: els.fg.value, bg: els.bg.value };
    setMeta(els.contrastInfo, colorCheck.message, colorCheck.level === "ok" ? "ok" : colorCheck.level);

    // --- Capacity info label (after any EC changes above) ------------------------
    var info = QRCapacity.analyze(data, ecLevel());
    var modeLabel = { numeric: "numeric (digits only)", alphanumeric: "alphanumeric (uppercase)", byte: "text (UTF-8)" }[info.mode];
    setMeta(els.capacityInfo,
      info.length + " / " + info.capacity + (info.mode === "byte" ? " bytes" : " characters") +
      " at level " + ecLevel() + " · " + modeLabel +
      (info.version ? " · QR version " + info.version + " (" + (info.version * 4 + 17) + "×" + (info.version * 4 + 17) + " modules)" : ""),
      info.fits ? "" : "error");

    els.downloadPng.disabled = !info.fits;
    els.downloadSvg.disabled = !info.fits;

    // --- Scan tracking (row visibility is managed by account.js: sign-in only) --
    if (els.track) {
      var isUrl = CSCore.isValidHttpUrl(data.trim());
      els.track.disabled = !isUrl;
      if (!isUrl && els.track.checked) els.track.checked = false;
      els.trackLabelRow.hidden = !els.track.checked;
      setMeta(els.trackInfo, els.track.checked
        ? "The downloaded code will contain a short link on this site that redirects to your URL and counts the scan."
        : isUrl
          ? "Off: the code encodes your URL directly, works forever, and cannot be tracked."
          : "Scan tracking is only available when the content is an http(s) URL.");
    }
    return { messages: messages, canRender: info.fits };
  }

  function showMessages(list) {
    els.messages.innerHTML = "";
    list.forEach(function (m) {
      var div = document.createElement("div");
      div.className = "msg " + m.level;
      div.textContent = m.text;
      els.messages.appendChild(div);
    });
  }

  function render() {
    var result = applyRules();
    showMessages(result.messages);
    if (!result.canRender || els.data.value.length === 0) return;
    qr.update(buildOptions(PREVIEW_SIZE));
  }

  function buildOptions(size, dataOverride) {
    return {
      width: size,
      height: size,
      data: dataOverride !== undefined ? dataOverride : els.data.value,
      margin: Math.max(8, Math.round(size * 0.04)), // keep a generous quiet zone
      qrOptions: { errorCorrectionLevel: ecLevel() },
      dotsOptions: { type: els.dotType.value, color: els.fg.value },
      cornersSquareOptions: { type: els.eyeFrame.value, color: els.fg.value },
      cornersDotOptions: { type: els.eyeBall.value, color: els.fg.value },
      backgroundOptions: { color: els.bg.value },
      image: logoDataUrl || undefined,
      imageOptions: {
        hideBackgroundDots: true,
        margin: Math.round(size * 0.015),
        imageSize: parseFloat(els.logoSize.value)
      }
    };
  }

  function clearLogo(rerender) {
    logoDataUrl = null;
    els.logo.value = "";
    if (rerender !== false) render();
  }

  // --- Events ------------------------------------------------------------------
  els.data.addEventListener("input", render);
  els.ecGroup.addEventListener("change", render);
  els.fg.addEventListener("change", render);
  els.bg.addEventListener("change", render);
  els.dotType.addEventListener("change", render);
  els.eyeFrame.addEventListener("change", render);
  els.eyeBall.addEventListener("change", render);
  els.logoSize.addEventListener("input", render);
  els.logoClear.addEventListener("click", function () { clearLogo(); });
  if (els.track) els.track.addEventListener("change", render);

  els.logo.addEventListener("change", function () {
    var file = els.logo.files && els.logo.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      logoDataUrl = reader.result;
      render();
    };
    reader.readAsDataURL(file);
  });

  function trackingActive() {
    return els.track && els.track.checked && !els.track.disabled &&
      window.Backend && Backend.currentUser() &&
      CSCore.isValidHttpUrl(els.data.value.trim());
  }

  function download(extension) {
    var size = parseInt(els.exportSize.value, 10);
    var finish = function (encodedData) {
      // Render a detached high-resolution copy so exports are crisp.
      var exportQr = new QRCodeStyling(Object.assign(
        { type: extension === "svg" ? "svg" : "canvas" },
        buildOptions(size, encodedData)
      ));
      exportQr.download({ name: "qr-code", extension: extension });
      if (window.Backend) {
        Backend.recordGeneration("qr", {
          ec: ecLevel(),
          dotType: els.dotType.value,
          fg: els.fg.value,
          bg: els.bg.value,
          hasLogo: !!logoDataUrl,
          version: QRCapacity.minVersion(encodedData, ecLevel())
        });
      }
    };
    if (trackingActive()) {
      // The downloaded code encodes the short redirect link, not the raw URL.
      Backend.createTrackedCode(els.data.value.trim(), els.trackLabel.value.trim())
        .then(function (code) { finish(code.url); },
              function (err) { showMessages([{ level: "error", text: err.message }]); });
    } else {
      finish(els.data.value);
    }
  }
  els.downloadPng.addEventListener("click", function () { download("png"); });
  els.downloadSvg.addEventListener("click", function () { download("svg"); });

  render();
})();
