/* Pure analytics logic: community milestone ladder, streaks, achievements,
 * device/geo classification, URL validation, date grouping.
 * Classic script exposing a single global `CSCore`; no DOM access, ES3-compatible
 * so the cscript unit-test harness (test/run-tests.js) can load it.
 */
(function (root) {
  "use strict";

  var DAY_MS = 86400000;

  // --- Community milestone ladder -------------------------------------------
  // 100 -> 1,000 -> 10,000 -> 100,000 -> 1,000,000 -> 10,000,000, then keeps
  // multiplying by 10 ("Goal automatically advances when reached").
  var FIRST_GOAL = 100;

  function goalFor(total) {
    var goal = FIRST_GOAL;
    while (total >= goal) goal = goal * 10;
    return goal;
  }

  // Milestones completed when the total moves prev -> next (used to mirror the
  // server-side ladder for the celebration overlay and for tests).
  function milestonesCrossed(prevTotal, newTotal) {
    var crossed = [];
    var goal = goalFor(prevTotal);
    while (newTotal >= goal) {
      crossed.push(goal);
      goal = goal * 10;
    }
    return crossed;
  }

  // --- Small shared validators / classifiers --------------------------------
  function isValidHttpUrl(s) {
    return /^https?:\/\/[^\s]+$/i.test(s);
  }

  function deviceType(ua) {
    ua = ua || "";
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) ||
        (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
    return "desktop";
  }

  // Coarse "when available" geography: IANA timezone -> country name.
  // Deliberately not exhaustive — unknown zones report null and the dashboards
  // show an honest "Unknown" bucket. No IP lookups, no permissions, no APIs.
  var TZ_COUNTRY = {
    "America/New_York": "United States", "America/Chicago": "United States",
    "America/Denver": "United States", "America/Phoenix": "United States",
    "America/Los_Angeles": "United States", "America/Anchorage": "United States",
    "America/Detroit": "United States", "Pacific/Honolulu": "United States",
    "America/Toronto": "Canada", "America/Vancouver": "Canada",
    "America/Edmonton": "Canada", "America/Winnipeg": "Canada", "America/Halifax": "Canada",
    "America/Mexico_City": "Mexico", "America/Tijuana": "Mexico", "America/Monterrey": "Mexico",
    "America/Guatemala": "Guatemala", "America/Costa_Rica": "Costa Rica",
    "America/Panama": "Panama", "America/Havana": "Cuba",
    "America/Santo_Domingo": "Dominican Republic", "America/Puerto_Rico": "Puerto Rico",
    "America/Bogota": "Colombia", "America/Lima": "Peru", "America/Caracas": "Venezuela",
    "America/Guayaquil": "Ecuador", "America/La_Paz": "Bolivia",
    "America/Santiago": "Chile", "America/Asuncion": "Paraguay",
    "America/Montevideo": "Uruguay", "America/Argentina/Buenos_Aires": "Argentina",
    "America/Sao_Paulo": "Brazil", "America/Fortaleza": "Brazil",
    "America/Manaus": "Brazil", "America/Recife": "Brazil",
    "Europe/London": "United Kingdom", "Europe/Dublin": "Ireland",
    "Europe/Lisbon": "Portugal", "Europe/Madrid": "Spain", "Europe/Paris": "France",
    "Europe/Brussels": "Belgium", "Europe/Amsterdam": "Netherlands",
    "Europe/Luxembourg": "Luxembourg", "Europe/Zurich": "Switzerland",
    "Europe/Berlin": "Germany", "Europe/Vienna": "Austria", "Europe/Prague": "Czechia",
    "Europe/Warsaw": "Poland", "Europe/Budapest": "Hungary",
    "Europe/Bratislava": "Slovakia", "Europe/Ljubljana": "Slovenia",
    "Europe/Zagreb": "Croatia", "Europe/Belgrade": "Serbia",
    "Europe/Sarajevo": "Bosnia and Herzegovina", "Europe/Skopje": "North Macedonia",
    "Europe/Tirane": "Albania", "Europe/Sofia": "Bulgaria",
    "Europe/Bucharest": "Romania", "Europe/Chisinau": "Moldova",
    "Europe/Athens": "Greece", "Europe/Istanbul": "Turkey",
    "Europe/Rome": "Italy", "Europe/Malta": "Malta",
    "Europe/Copenhagen": "Denmark", "Europe/Oslo": "Norway",
    "Europe/Stockholm": "Sweden", "Europe/Helsinki": "Finland",
    "Europe/Tallinn": "Estonia", "Europe/Riga": "Latvia", "Europe/Vilnius": "Lithuania",
    "Europe/Kyiv": "Ukraine", "Europe/Kiev": "Ukraine", "Europe/Minsk": "Belarus",
    "Europe/Moscow": "Russia", "Asia/Yekaterinburg": "Russia",
    "Asia/Novosibirsk": "Russia", "Asia/Vladivostok": "Russia",
    "Atlantic/Reykjavik": "Iceland",
    "Africa/Casablanca": "Morocco", "Africa/Algiers": "Algeria", "Africa/Tunis": "Tunisia",
    "Africa/Cairo": "Egypt", "Africa/Lagos": "Nigeria", "Africa/Accra": "Ghana",
    "Africa/Nairobi": "Kenya", "Africa/Addis_Ababa": "Ethiopia",
    "Africa/Kinshasa": "DR Congo", "Africa/Johannesburg": "South Africa",
    "Asia/Jerusalem": "Israel", "Asia/Beirut": "Lebanon", "Asia/Amman": "Jordan",
    "Asia/Damascus": "Syria", "Asia/Baghdad": "Iraq", "Asia/Riyadh": "Saudi Arabia",
    "Asia/Kuwait": "Kuwait", "Asia/Qatar": "Qatar", "Asia/Bahrain": "Bahrain",
    "Asia/Dubai": "United Arab Emirates", "Asia/Muscat": "Oman", "Asia/Tehran": "Iran",
    "Asia/Baku": "Azerbaijan", "Asia/Yerevan": "Armenia", "Asia/Tbilisi": "Georgia",
    "Asia/Kabul": "Afghanistan", "Asia/Karachi": "Pakistan",
    "Asia/Kolkata": "India", "Asia/Calcutta": "India",
    "Asia/Colombo": "Sri Lanka", "Asia/Kathmandu": "Nepal", "Asia/Dhaka": "Bangladesh",
    "Asia/Yangon": "Myanmar", "Asia/Bangkok": "Thailand",
    "Asia/Phnom_Penh": "Cambodia", "Asia/Vientiane": "Laos",
    "Asia/Ho_Chi_Minh": "Vietnam", "Asia/Saigon": "Vietnam",
    "Asia/Kuala_Lumpur": "Malaysia", "Asia/Singapore": "Singapore",
    "Asia/Jakarta": "Indonesia", "Asia/Makassar": "Indonesia",
    "Asia/Manila": "Philippines", "Asia/Brunei": "Brunei",
    "Asia/Hong_Kong": "Hong Kong", "Asia/Macau": "Macau", "Asia/Taipei": "Taiwan",
    "Asia/Shanghai": "China", "Asia/Chongqing": "China", "Asia/Urumqi": "China",
    "Asia/Seoul": "South Korea", "Asia/Pyongyang": "North Korea",
    "Asia/Tokyo": "Japan", "Asia/Ulaanbaatar": "Mongolia",
    "Asia/Almaty": "Kazakhstan", "Asia/Tashkent": "Uzbekistan",
    "Australia/Sydney": "Australia", "Australia/Melbourne": "Australia",
    "Australia/Brisbane": "Australia", "Australia/Perth": "Australia",
    "Australia/Adelaide": "Australia", "Australia/Darwin": "Australia",
    "Australia/Hobart": "Australia",
    "Pacific/Auckland": "New Zealand", "Pacific/Fiji": "Fiji",
    "Pacific/Guam": "Guam", "Pacific/Port_Moresby": "Papua New Guinea"
  };

  function countryFromTimeZone(tz) {
    if (!tz) return null;
    return TZ_COUNTRY[tz] || null;
  }

  // --- Date helpers ----------------------------------------------------------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Local-calendar day key for a timestamp: "YYYY-MM-DD".
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // Day keys are compared on a UTC scale so DST shifts can't break "consecutive".
  function parseDayKey(key) {
    var parts = key.split("-");
    return Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function shiftDayKey(key, days) {
    var ms = parseDayKey(key) + days * DAY_MS;
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  /* Usage streaks over a list of day keys (duplicates fine, order irrelevant).
   * current: consecutive days with activity ending today — or ending yesterday,
   * so the streak isn't shown broken before the user generates anything today.
   * longest: best run anywhere in history. */
  function computeStreaks(dayKeys, todayKey) {
    var present = {}, i;
    for (i = 0; i < dayKeys.length; i++) present[dayKeys[i]] = true;

    var current = 0;
    var cursor = present[todayKey] ? todayKey : shiftDayKey(todayKey, -1);
    while (present[cursor]) {
      current++;
      cursor = shiftDayKey(cursor, -1);
    }

    var unique = [];
    for (var key in present) if (present.hasOwnProperty(key)) unique.push(key);
    unique.sort();
    var longest = 0, run = 0;
    for (i = 0; i < unique.length; i++) {
      run = (i > 0 && parseDayKey(unique[i]) - parseDayKey(unique[i - 1]) === DAY_MS) ? run + 1 : 1;
      if (run > longest) longest = run;
    }
    return { current: current, longest: longest };
  }

  // Counts per local day for the last `days` days (oldest first), zero-filled
  // so trend charts have a continuous axis.
  function groupByDay(timestamps, days, nowMs) {
    var counts = {}, i;
    for (i = 0; i < timestamps.length; i++) {
      var key = dayKey(timestamps[i]);
      counts[key] = (counts[key] || 0) + 1;
    }
    var out = [];
    var today = dayKey(nowMs);
    for (i = days - 1; i >= 0; i--) {
      var k = shiftDayKey(today, -i);
      out.push({ day: k, count: counts[k] || 0 });
    }
    return out;
  }

  // --- Personal milestones & achievements ------------------------------------
  var PERSONAL_MILESTONES = [
    { id: "codes-1",    metric: "codes", threshold: 1,    label: "First code created" },
    { id: "codes-10",   metric: "codes", threshold: 10,   label: "10 codes created" },
    { id: "codes-50",   metric: "codes", threshold: 50,   label: "50 codes created" },
    { id: "codes-100",  metric: "codes", threshold: 100,  label: "100 codes created" },
    { id: "scans-1",    metric: "scans", threshold: 1,    label: "First scan received" },
    { id: "scans-100",  metric: "scans", threshold: 100,  label: "100 scans received" },
    { id: "scans-1000", metric: "scans", threshold: 1000, label: "1,000 scans received" }
  ];

  function personalMilestones(codesCreated, totalScans) {
    var out = [];
    for (var i = 0; i < PERSONAL_MILESTONES.length; i++) {
      var m = PERSONAL_MILESTONES[i];
      var value = m.metric === "codes" ? codesCreated : totalScans;
      out.push({ id: m.id, label: m.label, earned: value >= m.threshold,
                 progress: value, threshold: m.threshold });
    }
    return out;
  }

  /* Fun achievements, computed from this browser's locally stored generation
   * events: [{ kind: "qr"|"barcode", at: ms, meta: {...} }]. Style metadata
   * (colors, logos, formats) is only ever recorded locally, so achievements
   * need no new server-side data collection. */
  function computeAchievements(events, streaks) {
    var total = events.length;
    var hasLogo = false, heavyweight = false, nightOwl = false;
    var colorPairs = {}, colorCount = 0;
    var formats = {}, formatCount = 0;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var meta = ev.meta || {};
      if (ev.kind === "qr") {
        if (meta.hasLogo) hasLogo = true;
        if (meta.version && meta.version >= 30) heavyweight = true;
        if (meta.fg && meta.bg) {
          var pair = meta.fg + "|" + meta.bg;
          if (!colorPairs[pair]) { colorPairs[pair] = true; colorCount++; }
        }
      } else if (ev.kind === "barcode" && meta.format) {
        if (!formats[meta.format]) { formats[meta.format] = true; formatCount++; }
      }
      var hour = new Date(ev.at).getHours();
      if (hour >= 0 && hour < 5) nightOwl = true;
    }

    return [
      { id: "first-steps", icon: "🌱", label: "First Steps",
        desc: "Generate your first code", earned: total >= 1 },
      { id: "prolific", icon: "✍️", label: "Prolific",
        desc: "Generate 25 codes", earned: total >= 25 },
      { id: "logo-lover", icon: "🖼️", label: "Logo Lover",
        desc: "Embed a logo in a QR code", earned: hasLogo },
      { id: "colorist", icon: "🎨", label: "Colorist",
        desc: "Use 5 different color combinations", earned: colorCount >= 5 },
      { id: "heavyweight", icon: "🏋️", label: "Heavyweight",
        desc: "Generate a dense QR code (version 30+)", earned: heavyweight },
      { id: "polyglot", icon: "📚", label: "Barcode Polyglot",
        desc: "Use 4 different barcode formats", earned: formatCount >= 4 },
      { id: "night-owl", icon: "🦉", label: "Night Owl",
        desc: "Generate a code between midnight and 5 am", earned: nightOwl },
      { id: "week-streak", icon: "🔥", label: "On Fire",
        desc: "Generate codes 7 days in a row", earned: (streaks && streaks.longest >= 7) }
    ];
  }

  // --- Formatting -------------------------------------------------------------
  function formatCount(n) {
    var s = String(n), out = "", count = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) out = "," + out;
    }
    return out;
  }

  root.CSCore = {
    FIRST_GOAL: FIRST_GOAL,
    goalFor: goalFor,
    milestonesCrossed: milestonesCrossed,
    isValidHttpUrl: isValidHttpUrl,
    deviceType: deviceType,
    countryFromTimeZone: countryFromTimeZone,
    dayKey: dayKey,
    shiftDayKey: shiftDayKey,
    computeStreaks: computeStreaks,
    groupByDay: groupByDay,
    personalMilestones: personalMilestones,
    computeAchievements: computeAchievements,
    formatCount: formatCount
  };
})(typeof window !== "undefined" ? window : globalThis);
