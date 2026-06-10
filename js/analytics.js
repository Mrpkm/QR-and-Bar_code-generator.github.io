/* Analytics tab. The account type chosen at signup picks the dashboard:
 * business (trends, devices, geography, top codes, conversion signals) or
 * personal (milestones, streaks, achievements, scan history). Guests get the
 * personal layout fed from this browser's IndexedDB history, since scan
 * tracking needs an account. All aggregation happens client-side over the
 * rows backend.js fetches; charts are Chart.js (vendored in lib/).
 */
(function () {
  "use strict";

  var rootEl = document.getElementById("analytics-root");
  var tabBtn = document.getElementById("tab-analytics");
  var charts = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hostOf(url) {
    var m = /^https?:\/\/([^/?#]+)/i.exec(url || "");
    return m ? m[1] : url;
  }

  function destroyCharts() {
    for (var i = 0; i < charts.length; i++) charts[i].destroy();
    charts = [];
  }

  // --- Aggregation helpers -----------------------------------------------------
  function countBy(rows, key) {
    var counts = {};
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][key] || "Unknown";
      counts[v] = (counts[v] || 0) + 1;
    }
    var out = [];
    for (var k in counts) if (counts.hasOwnProperty(k)) out.push({ key: k, count: counts[k] });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  function scanTimestamps(scans) {
    var out = [];
    for (var i = 0; i < scans.length; i++) out.push(new Date(scans[i].scanned_at).getTime());
    return out;
  }

  function eventTimestamps(data) {
    var out = [], i;
    if (data.signedIn) {
      for (i = 0; i < data.cloudEvents.length; i++) out.push(new Date(data.cloudEvents[i].created_at).getTime());
    } else {
      for (i = 0; i < data.localEvents.length; i++) out.push(data.localEvents[i].at);
    }
    return out;
  }

  function codeLabel(code) {
    return code.label || hostOf(code.target_url);
  }

  // --- Shared HTML fragments ------------------------------------------------------
  function statCards(cards) {
    var html = '<div class="stat-cards">';
    for (var i = 0; i < cards.length; i++) {
      html += '<div class="stat-card"><div class="stat-value">' + cards[i].value +
              '</div><div class="stat-label">' + esc(cards[i].label) + "</div></div>";
    }
    return html + "</div>";
  }

  function barList(items, max) {
    if (!items.length) return '<div class="meta">No data yet.</div>';
    var top = items[0].count || 1;
    var html = '<div class="bar-list">';
    for (var i = 0; i < Math.min(items.length, max || 10); i++) {
      var pct = Math.max(2, (items[i].count / top) * 100);
      html += '<div class="bar-row"><span class="bar-name">' + esc(items[i].key) + "</span>" +
              '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
              '<span class="bar-count">' + CSCore.formatCount(items[i].count) + "</span></div>";
    }
    return html + "</div>";
  }

  function section(title, bodyHtml, note) {
    return '<fieldset class="dash-section"><legend>' + esc(title) + "</legend>" + bodyHtml +
           (note ? '<div class="meta">' + esc(note) + "</div>" : "") + "</fieldset>";
  }

  function lineChart(canvasId, series, label) {
    if (typeof Chart === "undefined") return;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var labels = [], values = [];
    for (var i = 0; i < series.length; i++) {
      labels.push(series[i].day.slice(5)); // MM-DD
      values.push(series[i].count);
    }
    charts.push(new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: [{ label: label, data: values, borderColor: "#2456d6",
              backgroundColor: "rgba(36,86,214,0.12)", fill: true, tension: 0.25, pointRadius: 2 }] },
      options: { responsive: true, maintainAspectRatio: false,
                 scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                 plugins: { legend: { display: false } } }
    }));
  }

  function doughnutChart(canvasId, items) {
    if (typeof Chart === "undefined") return;
    var canvas = document.getElementById(canvasId);
    if (!canvas || !items.length) return;
    var labels = [], values = [];
    for (var i = 0; i < items.length; i++) { labels.push(items[i].key); values.push(items[i].count); }
    charts.push(new Chart(canvas, {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: values,
              backgroundColor: ["#2456d6", "#1d7a3a", "#9a6700", "#b42318", "#6b46c1"] }] },
      options: { responsive: true, maintainAspectRatio: false }
    }));
  }

  // --- Business dashboard -----------------------------------------------------------
  function renderBusiness(data) {
    var scans = data.scans;
    var totalScans = scans.length;
    var uniqueScans = 0, i;
    for (i = 0; i < scans.length; i++) if (!scans[i].is_repeat) uniqueScans++;
    var trackedCodes = data.codes.length;

    // Most popular codes
    var byCode = countBy(scans, "short_id");
    var labelled = [];
    var labelFor = {};
    for (i = 0; i < data.codes.length; i++) labelFor[data.codes[i].short_id] = codeLabel(data.codes[i]);
    for (i = 0; i < byCode.length; i++) {
      labelled.push({ key: labelFor[byCode[i].key] || byCode[i].key, count: byCode[i].count });
    }

    // Conversion-focused signals
    var repeatRate = totalScans ? Math.round(((totalScans - uniqueScans) / totalScans) * 100) : 0;
    var hourCounts = {};
    for (i = 0; i < scans.length; i++) {
      var h = new Date(scans[i].scanned_at).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
    var peakHour = null, peakCount = 0;
    for (var hk in hourCounts) if (hourCounts.hasOwnProperty(hk) && hourCounts[hk] > peakCount) {
      peakCount = hourCounts[hk]; peakHour = hk;
    }

    var html = "";
    html += statCards([
      { value: CSCore.formatCount(data.profile.codesCreated), label: "QR codes created" },
      { value: CSCore.formatCount(totalScans), label: "Total scans" },
      { value: CSCore.formatCount(uniqueScans), label: "Unique scans" },
      { value: trackedCodes ? (totalScans / trackedCodes).toFixed(1) : "—", label: "Scans per tracked code" }
    ]);
    html += section("Scan trend (last 30 days)", '<div class="chart-box"><canvas id="chart-trend"></canvas></div>');
    html += section("Most popular QR codes", barList(labelled, 10),
      trackedCodes ? null : "Create a QR code with “Track scans” enabled to see per-code analytics.");
    html += '<div class="dash-columns">' +
      section("Device types", '<div class="chart-box chart-box-small"><canvas id="chart-devices"></canvas></div>') +
      section("Geographic distribution", barList(countBy(scans, "country"), 12),
        "Approximate: derived from the scanner's timezone, never from IP addresses.") +
      "</div>";
    html += section("Conversion signals",
      statCards([
        { value: repeatRate + "%", label: "Repeat-scan rate" },
        { value: peakHour === null ? "—" : peakHour + ":00", label: "Peak scan hour" },
        { value: totalScans ? CSCore.formatCount(uniqueScans) : "—", label: "Reached people (est.)" }
      ]) +
      '<div class="meta">Tip: add UTM parameters (e.g. ?utm_source=qr) to your target URLs and ' +
      "downstream conversions will show up in your own web analytics — the redirect is invisible to it.</div>");

    rootEl.innerHTML = html;
    lineChart("chart-trend", CSCore.groupByDay(scanTimestamps(scans), 30, new Date().getTime()), "Scans");
    doughnutChart("chart-devices", countBy(scans, "device_type"));
  }

  // --- Personal dashboard --------------------------------------------------------------
  function renderPersonal(data) {
    var scans = data.scans;
    var timestamps = eventTimestamps(data);
    var totalCreated = data.signedIn ? data.profile.codesCreated : data.localEvents.length;

    var dayKeys = [];
    for (var i = 0; i < timestamps.length; i++) dayKeys.push(CSCore.dayKey(timestamps[i]));
    var streaks = CSCore.computeStreaks(dayKeys, CSCore.dayKey(new Date().getTime()));

    var byCode = countBy(scans, "short_id");
    var labelFor = {};
    for (i = 0; i < data.codes.length; i++) labelFor[data.codes[i].short_id] = codeLabel(data.codes[i]);
    var topCode = byCode.length
      ? esc(labelFor[byCode[0].key] || byCode[0].key) + " (" + CSCore.formatCount(byCode[0].count) + " scans)"
      : "—";

    var html = "";
    html += statCards([
      { value: CSCore.formatCount(totalCreated), label: "Codes created" },
      { value: streaks.current + (streaks.current === 1 ? " day" : " days"), label: "Current streak" },
      { value: streaks.longest + (streaks.longest === 1 ? " day" : " days"), label: "Longest streak" },
      { value: CSCore.formatCount(scans.length), label: "Total scans received" }
    ]);
    html += section("Most scanned QR code", '<div class="spotlight">' + topCode + "</div>",
      data.signedIn ? null : "Sign in and enable “Track scans” on a QR code to collect scans.");

    // Personal milestones
    var milestones = CSCore.personalMilestones(totalCreated, scans.length);
    var mHtml = '<ul class="milestone-list">';
    for (i = 0; i < milestones.length; i++) {
      mHtml += '<li class="' + (milestones[i].earned ? "earned" : "") + '">' +
               (milestones[i].earned ? "✅ " : "⬜ ") + esc(milestones[i].label) + "</li>";
    }
    mHtml += "</ul>";
    html += section("Personal milestones", mHtml);

    // Achievements (style metadata only ever exists in this browser)
    var achievements = CSCore.computeAchievements(data.localEvents, streaks);
    var aHtml = '<div class="achievements">';
    var earnedCount = 0;
    for (i = 0; i < achievements.length; i++) {
      var a = achievements[i];
      if (a.earned) earnedCount++;
      aHtml += '<div class="achievement ' + (a.earned ? "earned" : "locked") + '" title="' + esc(a.desc) + '">' +
               '<span class="achievement-icon">' + a.icon + "</span>" +
               '<span class="achievement-name">' + esc(a.label) + "</span>" +
               '<span class="meta">' + esc(a.desc) + "</span></div>";
    }
    aHtml += "</div>";
    html += section("Achievements (" + earnedCount + "/" + achievements.length + ")", aHtml,
      "Achievements are computed from codes generated in this browser.");

    // Scan history
    if (data.signedIn) {
      var rows = "";
      for (i = 0; i < Math.min(scans.length, 20); i++) {
        var s = scans[i];
        rows += "<tr><td>" + esc(new Date(s.scanned_at).toLocaleString()) + "</td><td>" +
                esc(labelFor[s.short_id] || s.short_id) + "</td><td>" + esc(s.device_type) +
                "</td><td>" + esc(s.country || "Unknown") + "</td></tr>";
      }
      html += section("Scan history",
        rows ? '<table class="scan-table"><thead><tr><th>When</th><th>Code</th><th>Device</th><th>Where</th></tr></thead><tbody>' +
               rows + "</tbody></table>"
             : '<div class="meta">No scans yet — print a tracked code and put it out in the world!</div>');
    }

    rootEl.innerHTML = html;
  }

  // --- Entry --------------------------------------------------------------------------
  function render() {
    destroyCharts();
    rootEl.innerHTML = '<div class="meta">Loading analytics…</div>';
    Backend.fetchAnalytics().then(function (data) {
      destroyCharts();
      var intro = "";
      if (!data.signedIn) {
        intro = Backend.isCloud()
          ? '<div class="msg warn">You are browsing as a guest: stats below cover this browser only. ' +
            '<button type="button" id="analytics-signin" class="link-btn-text">Sign in</button> ' +
            "to sync across devices and track real-world scans.</div>"
          : '<div class="meta">This deployment runs without cloud features — analytics cover codes generated in this browser.</div>';
      }
      if (data.signedIn && data.profile.accountType === "business") renderBusiness(data);
      else renderPersonal(data);
      if (intro) rootEl.insertAdjacentHTML("afterbegin", intro);
      var signinLink = document.getElementById("analytics-signin");
      if (signinLink) signinLink.addEventListener("click", function () {
        document.getElementById("account-signin").click();
      });
    });
  }

  tabBtn.addEventListener("click", render);
  Backend.onAuth(function () {
    if (!document.getElementById("panel-analytics").hidden) render();
  });
})();
