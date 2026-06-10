/* Developer tab: site-wide trends for the operator — the overview a small or
 * medium developer needs to judge how the platform is doing. The tab is only
 * visible to 'developer' accounts (created with the server-verified code), and
 * the dev_overview RPC enforces the same check server-side, so hiding the tab
 * is presentation, not security.
 */
(function () {
  "use strict";

  var rootEl = document.getElementById("dev-root");
  var tabBtn = document.getElementById("tab-dev");
  if (!rootEl || !tabBtn) return;
  var charts = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function destroyCharts() {
    for (var i = 0; i < charts.length; i++) charts[i].destroy();
    charts = [];
  }

  function statCards(cards) {
    var html = '<div class="stat-cards">';
    for (var i = 0; i < cards.length; i++) {
      html += '<div class="stat-card"><div class="stat-value">' + cards[i].value +
              '</div><div class="stat-label">' + esc(cards[i].label) + "</div></div>";
    }
    return html + "</div>";
  }

  function section(title, bodyHtml, note) {
    return '<fieldset class="dash-section"><legend>' + esc(title) + "</legend>" + bodyHtml +
           (note ? '<div class="meta">' + esc(note) + "</div>" : "") + "</fieldset>";
  }

  function barList(items) {
    if (!items.length) return '<div class="meta">No data yet.</div>';
    var top = items[0].count || 1;
    for (var i = 0; i < items.length; i++) if (items[i].count > top) top = items[i].count;
    var html = '<div class="bar-list">';
    for (i = 0; i < items.length; i++) {
      var pct = Math.max(2, (items[i].count / top) * 100);
      html += '<div class="bar-row"><span class="bar-name">' + esc(items[i].key) + "</span>" +
              '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
              '<span class="bar-count">' + CSCore.formatCount(items[i].count) + "</span></div>";
    }
    return html + "</div>";
  }

  function objToBars(obj) {
    var out = [];
    for (var k in obj) if (obj.hasOwnProperty(k)) out.push({ key: k, count: obj[k] });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  // dev_overview returns sparse [{day, count}] arrays; zero-fill the last 30 days.
  function zeroFill30(sparse) {
    var byDay = {};
    for (var i = 0; i < sparse.length; i++) byDay[sparse[i].day] = sparse[i].count;
    var today = CSCore.dayKey(new Date().getTime());
    var out = [];
    for (i = 29; i >= 0; i--) {
      var k = CSCore.shiftDayKey(today, -i);
      out.push({ day: k, count: byDay[k] || 0 });
    }
    return out;
  }

  function lineChart(canvasId, sparse, label, color) {
    if (typeof Chart === "undefined") return;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var series = zeroFill30(sparse || []);
    var labels = [], values = [];
    for (var i = 0; i < series.length; i++) {
      labels.push(series[i].day.slice(5));
      values.push(series[i].count);
    }
    charts.push(new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: [{ label: label, data: values, borderColor: color,
              backgroundColor: "transparent", tension: 0.25, pointRadius: 2 }] },
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

  function render() {
    destroyCharts();
    rootEl.innerHTML = '<div class="meta">Loading site-wide trends…</div>';
    Backend.fetchDevOverview().then(function (d) {
      destroyCharts();
      var countries = [];
      for (var i = 0; i < (d.countries || []).length; i++) {
        countries.push({ key: d.countries[i].country, count: d.countries[i].count });
      }

      var html = "";
      html += statCards([
        { value: CSCore.formatCount(d.total_users), label: "Registered users" },
        { value: CSCore.formatCount(d.active_users_7d), label: "Active users (7 days)" },
        { value: CSCore.formatCount(d.community_total) + " / " + CSCore.formatCount(d.community_goal), label: "Community counter" },
        { value: CSCore.formatCount(d.tracked_codes), label: "Tracked QR codes" },
        { value: CSCore.formatCount(d.total_scans), label: "Total scans" },
        { value: CSCore.formatCount(d.unique_scans), label: "Unique scans" }
      ]);
      html += '<div class="dash-columns">' +
        section("Signups (last 30 days)", '<div class="chart-box chart-box-small"><canvas id="dev-chart-signups"></canvas></div>') +
        section("Generations by signed-in users (last 30 days)", '<div class="chart-box chart-box-small"><canvas id="dev-chart-gens"></canvas></div>',
          "Anonymous generations count toward the community total but are not stored per-day.") +
        "</div>";
      html += '<div class="dash-columns">' +
        section("Scans (last 30 days)", '<div class="chart-box chart-box-small"><canvas id="dev-chart-scans"></canvas></div>') +
        section("Scan devices", '<div class="chart-box chart-box-small"><canvas id="dev-chart-devices"></canvas></div>') +
        "</div>";
      html += '<div class="dash-columns">' +
        section("Accounts by type", barList(objToBars(d.users_by_type || {}))) +
        section("Generations by kind", barList(objToBars(d.generations_by_kind || {}))) +
        "</div>";
      html += section("Scan geography (top 10)", barList(countries),
        "Approximate: derived from scanner timezones, never from IP addresses.");

      var ms = d.milestones || [];
      var mHtml = ms.length ? "" : '<div class="meta">No community milestones reached yet.</div>';
      for (i = 0; i < ms.length; i++) {
        mHtml += "<div>🏆 " + CSCore.formatCount(ms[i].goal) + " codes — " +
                 esc(new Date(ms[i].reached_at).toLocaleDateString()) + "</div>";
      }
      html += section("Community milestone history", mHtml);

      rootEl.innerHTML = html;
      lineChart("dev-chart-signups", d.signups_30d, "Signups", "#2456d6");
      lineChart("dev-chart-gens", d.generations_30d, "Generations", "#1d7a3a");
      lineChart("dev-chart-scans", d.scans_30d, "Scans", "#6b46c1");
      doughnutChart("dev-chart-devices", objToBars(d.devices || {}));
    }, function (err) {
      rootEl.innerHTML = '<div class="msg error">' + esc(err && err.message ? err.message : "Could not load trends.") + "</div>";
    });
  }

  tabBtn.addEventListener("click", render);
})();
