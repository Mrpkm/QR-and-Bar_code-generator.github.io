/* Browser integration test: drives the real UI and writes results into #test-results.
 * Run headless:  msedge --headless=new --dump-dom test/integration.html
 */
(function () {
  "use strict";
  var results = [];
  function check(name, cond) {
    results.push((cond ? "PASS " : "FAIL ") + name);
  }
  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function messagesText(id) {
    return document.getElementById(id).textContent;
  }

  // --- 1. 4000 alphanumeric characters: EC forced to L, shapes/logo locked down ---
  var data = document.getElementById("qr-data");
  data.value = new Array(4001).join("A"); // 4000 chars
  fire(data, "input");

  var ec = document.querySelector('#qr-ec-group input:checked').value;
  check("4000 chars: EC auto-switches to L", ec === "L");
  check("4000 chars: feedback message shown", messagesText("qr-messages").indexOf("Switched to level L") !== -1);
  var dotSelect = document.getElementById("qr-dot-type");
  var enabledShapes = Array.prototype.filter.call(dotSelect.options, function (o) { return !o.disabled; });
  check("4000 chars: only square modules allowed", enabledShapes.length === 1 && enabledShapes[0].value === "square");
  check("4000 chars: logo upload disabled", document.getElementById("qr-logo").disabled);
  // 4000 alphanumeric chars fit in version 39 at L (capacity 4087)
  check("4000 chars: capacity label shows version 39", document.getElementById("qr-capacity-info").textContent.indexOf("version 39") !== -1);

  // The QR itself must render (async in qr-code-styling, so poll for the SVG).
  var pollTries = 0;
  function pollSvg() {
    var svg = document.querySelector("#qr-preview svg");
    var rendered = svg && svg.innerHTML.length > 1000;
    if (!rendered && ++pollTries < 40) return setTimeout(pollSvg, 100);
    check("4000 chars: QR SVG actually rendered", !!rendered);
    part2();
  }

  // --- 2. Color validation: low-contrast pick is rejected and reverted ---
  function part2() {
    var fg = document.getElementById("qr-fg");
    fg.value = "#dddddd";
    fire(fg, "change");
    check("low-contrast fg: reverted to black", fg.value === "#000000");
    check("low-contrast fg: error message shown", messagesText("qr-messages").indexOf("Reverted to the previous colors") !== -1);

    var bg = document.getElementById("qr-bg");
    fg.value = "#ffffff"; bg.value = "#000000";
    fire(bg, "change");
    check("inverted colors: rejected", fg.value === "#000000" && bg.value === "#ffffff");

    // --- 3. Overflow: data too long for any QR code ---
    var data = document.getElementById("qr-data");
    data.value = new Array(5001).join("a"); // 5000 bytes > 2953 max
    fire(data, "input");
    check("5000 bytes: overflow error shown", messagesText("qr-messages").indexOf("too long for any QR code") !== -1);
    check("5000 bytes: downloads disabled", document.getElementById("qr-download-png").disabled);

    // --- 4. Short data restores all options ---
    data.value = "HELLO";
    fire(data, "input");
    var dotSelect = document.getElementById("qr-dot-type");
    var allEnabled = Array.prototype.every.call(dotSelect.options, function (o) { return !o.disabled; });
    check("short data: all shapes re-enabled", allEnabled);
    check("short data: downloads re-enabled", !document.getElementById("qr-download-png").disabled);

    // --- 5. Barcode validation ---
    var format = document.getElementById("bc-format");
    var value = document.getElementById("bc-value");
    format.value = "EAN13";
    fire(format, "change");
    value.value = "590123412345";
    fire(value, "input");
    check("EAN13 valid input: no error", messagesText("bc-messages") === "");
    check("EAN13 valid input: barcode rendered", document.querySelectorAll("#bc-preview rect").length > 5);

    value.value = "abc";
    fire(value, "input");
    check("EAN13 invalid input: error shown", messagesText("bc-messages").indexOf("not valid for") !== -1);
    check("EAN13 invalid input: download disabled", document.getElementById("bc-download-png").disabled);

    part3();
  }

  // --- 6. Local-only mode: cloud UI hides itself, generation recording works ---
  function part3() {
    check("local mode: account area hidden", document.getElementById("account-area").hidden);
    check("local mode: community banner hidden", document.getElementById("community-banner").hidden);
    check("local mode: track-scans row hidden", document.getElementById("qr-track-row").hidden);
    check("local mode: Backend reports not cloud", !Backend.isCloud());

    Backend.recordGeneration("qr", { ec: "M", fg: "#000000", bg: "#ffffff" }).then(function (res) {
      check("local mode: recordGeneration resolves null (no community stats)", res === null);
      return CSStorage.getEvents();
    }).then(function (events) {
      check("local mode: generation event stored in IndexedDB", events.length >= 1);

      // --- 7. Analytics tab renders the guest dashboard ---
      document.getElementById("tab-analytics").click();
      var tries = 0;
      (function pollAnalytics() {
        var root = document.getElementById("analytics-root");
        var rendered = root.textContent.indexOf("Codes created") !== -1;
        if (!rendered && ++tries < 40) return setTimeout(pollAnalytics, 100);
        check("analytics: guest dashboard rendered", rendered);
        check("analytics: achievements section present", root.textContent.indexOf("Achievements") !== -1);
        check("analytics: personal milestones present", root.textContent.indexOf("Personal milestones") !== -1);
        finish();
      })();
    }, function () {
      check("local mode: async checks did not throw", false);
      finish();
    });
  }

  function finish() {
    document.getElementById("test-results").textContent = "RESULTS::" + results.join("::");
    // When served by a test runner, also push results out (no-op on file://).
    try { fetch("/__results", { method: "POST", body: results.join("\n") }); } catch (e) { /* ignore */ }
  }

  pollSvg();
})();
