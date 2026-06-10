/* Community progress banner: "QR Codes Successfully Generated: X / Goal".
 * Cloud-only — a per-browser number labeled "community" would be a lie, so the
 * banner stays hidden in local mode. The total is painted instantly from a
 * localStorage cache, refreshed on load, after every own download (via the
 * "codesafe:community" event from backend.js), and on a 60-second poll while
 * the tab is visible. Milestone crossings trigger a confetti celebration and
 * the full history is preserved server-side and viewable from the banner.
 */
(function () {
  "use strict";

  if (!Backend.isCloud()) return;

  var els = {
    banner: document.getElementById("community-banner"),
    total: document.getElementById("community-total"),
    goal: document.getElementById("community-goal"),
    fill: document.getElementById("community-bar-fill"),
    historyBtn: document.getElementById("community-history-btn"),
    history: document.getElementById("community-history")
  };

  var POLL_MS = 60000;
  var lastShown = null;

  function paint(stats) {
    if (!stats || typeof stats.total !== "number") return;
    lastShown = stats;
    els.total.textContent = CSCore.formatCount(stats.total);
    els.goal.textContent = CSCore.formatCount(stats.goal);
    var pct = Math.min(100, (stats.total / stats.goal) * 100);
    els.fill.style.width = pct.toFixed(2) + "%";
    els.banner.hidden = false;
    CSStorage.kvSet("community", stats);
  }

  function refresh() {
    Backend.getCommunityStats().then(paint);
  }

  // --- Milestone celebration -------------------------------------------------
  function celebrate(milestone) {
    var overlay = document.createElement("div");
    overlay.className = "celebration";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");

    for (var i = 0; i < 80; i++) {
      var piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.left = (Math.random() * 100) + "%";
      piece.style.background = "hsl(" + Math.floor(Math.random() * 360) + ", 85%, 60%)";
      piece.style.animationDelay = (Math.random() * 1.2) + "s";
      piece.style.animationDuration = (2.2 + Math.random() * 2) + "s";
      overlay.appendChild(piece);
    }

    var card = document.createElement("div");
    card.className = "celebration-card";
    var h = document.createElement("h2");
    h.textContent = "🎉 Milestone reached!";
    var p = document.createElement("p");
    p.textContent = "The community has generated " + CSCore.formatCount(milestone) + " QR codes. Thank you!";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Keep going";
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btn);
    overlay.appendChild(card);

    function dismiss() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    btn.addEventListener("click", dismiss);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) dismiss(); });
    setTimeout(dismiss, 8000);
    document.body.appendChild(overlay);
    btn.focus();
  }

  // --- Milestone history popover ----------------------------------------------
  function toggleHistory() {
    if (!els.history.hidden) { els.history.hidden = true; return; }
    Backend.getMilestoneHistory().then(function (rows) {
      els.history.innerHTML = "";
      var title = document.createElement("strong");
      title.textContent = "Past milestones";
      els.history.appendChild(title);
      if (!rows.length) {
        var none = document.createElement("div");
        none.textContent = "None yet — the first goal is " + CSCore.formatCount(CSCore.FIRST_GOAL) + " codes.";
        els.history.appendChild(none);
      }
      for (var i = 0; i < rows.length; i++) {
        var line = document.createElement("div");
        var when = new Date(rows[i].reached_at);
        line.textContent = CSCore.formatCount(rows[i].goal) + " codes — " + when.toLocaleDateString();
        els.history.appendChild(line);
      }
      els.history.hidden = false;
    });
  }

  // --- Wiring -------------------------------------------------------------------
  document.addEventListener("codesafe:community", function (e) {
    var detail = e.detail;
    paint({ total: detail.total, goal: detail.goal });
    if (detail.milestoneReached) celebrate(detail.milestoneReached);
  });

  els.historyBtn.addEventListener("click", toggleHistory);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
  setInterval(function () {
    if (document.visibilityState === "visible") refresh();
  }, POLL_MS);

  paint(CSStorage.kvGet("community")); // instant paint from last visit
  refresh();
})();
