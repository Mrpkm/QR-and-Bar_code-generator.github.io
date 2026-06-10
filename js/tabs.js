/* Tab switching between the QR and barcode panels. */
(function () {
  "use strict";
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    });
  });
})();
