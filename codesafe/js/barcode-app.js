/* Barcode generator UI built on JsBarcode. All rendering is local (SVG element). */
(function () {
  "use strict";

  var els = {
    format: document.getElementById("bc-format"),
    value: document.getElementById("bc-value"),
    hint: document.getElementById("bc-format-hint"),
    width: document.getElementById("bc-width"),
    height: document.getElementById("bc-height"),
    text: document.getElementById("bc-text"),
    messages: document.getElementById("bc-messages"),
    preview: document.getElementById("bc-preview"),
    downloadPng: document.getElementById("bc-download-png"),
    downloadSvg: document.getElementById("bc-download-svg")
  };

  var FORMAT_HINTS = {
    CODE128: { hint: "Letters, digits and symbols (ASCII). Best general-purpose format.", sample: "EXAMPLE-1234" },
    CODE39: { hint: "Uppercase letters, digits and - . $ / + % space.", sample: "CODE-39" },
    EAN13: { hint: "Exactly 12 digits (the 13th check digit is added automatically).", sample: "590123412345" },
    EAN8: { hint: "Exactly 7 digits (the 8th check digit is added automatically).", sample: "9638507" },
    UPC: { hint: "Exactly 11 digits (the 12th check digit is added automatically).", sample: "12345678901" },
    ITF14: { hint: "Exactly 13 digits (the 14th check digit is added automatically).", sample: "1234567890123" },
    MSI: { hint: "Digits only.", sample: "123456" },
    codabar: { hint: "Digits and - $ : / . +, framed by start/stop letters A–D.", sample: "A12345B" }
  };

  var lastRenderValid = false;

  function render() {
    var format = els.format.value;
    setHint();
    var valid = true;
    try {
      JsBarcode(els.preview, els.value.value, {
        format: format,
        width: parseInt(els.width.value, 10),
        height: parseInt(els.height.value, 10),
        displayValue: els.text.checked,
        margin: 12,
        valid: function (ok) { valid = ok; }
      });
    } catch (e) {
      valid = false;
    }
    lastRenderValid = valid;
    els.messages.innerHTML = "";
    if (!valid && els.value.value.length > 0) {
      var div = document.createElement("div");
      div.className = "msg error";
      div.textContent = "“" + els.value.value + "” is not valid for " +
        els.format.options[els.format.selectedIndex].text + ". " + FORMAT_HINTS[format].hint;
      els.messages.appendChild(div);
      els.preview.innerHTML = "";
    }
    els.downloadPng.disabled = !valid;
    els.downloadSvg.disabled = !valid;
  }

  function setHint() {
    els.hint.textContent = FORMAT_HINTS[els.format.value].hint;
    els.hint.className = "meta";
  }

  function svgMarkup() {
    return new XMLSerializer().serializeToString(els.preview);
  }

  function triggerDownload(href, filename) {
    var a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  els.downloadSvg.addEventListener("click", function () {
    if (!lastRenderValid) return;
    var blob = new Blob([svgMarkup()], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    triggerDownload(url, "barcode.svg");
    URL.revokeObjectURL(url);
  });

  els.downloadPng.addEventListener("click", function () {
    if (!lastRenderValid) return;
    var svg = els.preview;
    var bounds = svg.getBoundingClientRect();
    var scale = 3; // export at 3x screen resolution for print quality
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svgMarkup()], { type: "image/svg+xml" }));
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(bounds.width * scale);
      canvas.height = Math.round(bounds.height * scale);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      triggerDownload(canvas.toDataURL("image/png"), "barcode.png");
    };
    img.src = url;
  });

  els.format.addEventListener("change", function () {
    // Swap in a known-good sample if the current value is invalid for the new format.
    var probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var ok = true;
    try {
      JsBarcode(probe, els.value.value, { format: els.format.value, valid: function (v) { ok = v; } });
    } catch (e) { ok = false; }
    if (!ok) els.value.value = FORMAT_HINTS[els.format.value].sample;
    render();
  });
  els.value.addEventListener("input", render);
  els.width.addEventListener("change", render);
  els.height.addEventListener("change", render);
  els.text.addEventListener("change", render);

  render();
})();
