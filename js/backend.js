/* Backend adapter — the only file that knows whether the app is talking to
 * Supabase or running local-only. Exposes a single global `Backend`.
 *
 * Cloud mode (js/config.js filled in): auth via Supabase GoTrue with the
 * synthetic-email pattern (username -> <username>@users.codesafe.invalid, a
 * reserved TLD that can never receive mail), data via PostgREST under
 * row-level security, shared counters via security-definer RPCs.
 *
 * Local mode (config empty): generators and guest analytics work from
 * IndexedDB; every cloud method resolves to null/false so callers can hide
 * the corresponding UI instead of branching on configuration themselves.
 *
 * Community updates are broadcast as a "codesafe:community" DOM event with
 * detail { total, goal, milestoneReached } so UI modules stay decoupled.
 */
(function (root) {
  "use strict";

  var EMAIL_DOMAIN = "@users.codesafe.invalid";
  var USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  var BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  var config = root.CODESAFE_CONFIG || {};
  var client = null;
  if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY && root.supabase) {
    client = root.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  }

  var profile = null; // { id, username, accountType, codesCreated }
  var authListeners = [];

  function notifyAuth() {
    for (var i = 0; i < authListeners.length; i++) authListeners[i](profile);
  }

  function emitCommunity(detail) {
    document.dispatchEvent(new CustomEvent("codesafe:community", { detail: detail }));
  }

  function syntheticEmail(username) {
    return username.toLowerCase() + EMAIL_DOMAIN;
  }

  function rowToProfile(row) {
    return row ? { id: row.id, username: row.username, accountType: row.account_type,
                   codesCreated: row.codes_created } : null;
  }

  function loadProfile(userId) {
    return client.from("profiles").select("*").eq("id", userId).single()
      .then(function (res) {
        profile = res.error ? null : rowToProfile(res.data);
        return profile;
      });
  }

  function init() {
    if (!client) return Promise.resolve(null);
    // Sign-outs from other tabs / token expiry; sign-ins are handled explicitly.
    client.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT" && profile) { profile = null; notifyAuth(); }
    });
    return client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return null;
      return loadProfile(session.user.id);
    }).then(function () { notifyAuth(); return profile; });
  }

  // --- Accounts ----------------------------------------------------------------
  function signUp(username, password, accountType) {
    if (!client) return Promise.reject(new Error("Cloud features are not configured."));
    if (!USERNAME_RE.test(username)) {
      return Promise.reject(new Error("Username must be 3–20 characters: letters, digits, underscore."));
    }
    if ((password || "").length < 8) {
      return Promise.reject(new Error("Password must be at least 8 characters."));
    }
    return client.auth.signUp({ email: syntheticEmail(username), password: password })
      .then(function (res) {
        if (res.error) {
          var msg = /already registered/i.test(res.error.message)
            ? "That username is already taken."
            : res.error.message;
          throw new Error(msg);
        }
        if (!res.data.session) {
          // Email confirmations were left enabled in the Supabase dashboard.
          throw new Error("Signup needs email confirmation disabled in the Supabase project settings (see README).");
        }
        return client.from("profiles")
          .insert({ id: res.data.user.id, username: username, account_type: accountType });
      })
      .then(function (res) {
        if (res.error) {
          var taken = res.error.code === "23505";
          return client.auth.signOut().then(function () {
            throw new Error(taken ? "That username is already taken." : res.error.message);
          });
        }
        return client.auth.getUser();
      })
      .then(function (res) {
        return loadProfile(res.data.user.id);
      })
      .then(function () {
        notifyAuth();
        // A brand-new account: importing this browser's history is always wanted.
        return mergeGuestHistory().then(function () { return profile; }, function () { return profile; });
      });
  }

  function signIn(username, password) {
    if (!client) return Promise.reject(new Error("Cloud features are not configured."));
    return client.auth.signInWithPassword({ email: syntheticEmail(username), password: password })
      .then(function (res) {
        if (res.error) {
          var msg = /invalid login credentials/i.test(res.error.message)
            ? "Unknown username or wrong password."
            : res.error.message;
          throw new Error(msg);
        }
        return loadProfile(res.data.user.id);
      })
      .then(function () { notifyAuth(); return profile; });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    return client.auth.signOut().then(function () { profile = null; notifyAuth(); });
  }

  // --- Generation counting -------------------------------------------------------
  /* Called on every successful download. Always records the event locally
   * (achievement metadata lives only in this browser); in cloud mode it also
   * counts toward the community total — including for signed-out visitors —
   * and broadcasts the updated stats. Resolves to null when offline/local. */
  function recordGeneration(kind, meta) {
    CSStorage.addEvent({ kind: kind, at: new Date().getTime(), meta: meta || {} });
    if (!client) return Promise.resolve(null);
    return client.rpc("record_generation", { p_kind: kind }).then(function (res) {
      var row = res.error || !res.data || !res.data.length ? null : res.data[0];
      if (!row) return null;
      var detail = {
        total: row.new_total,
        goal: row.new_goal,
        milestoneReached: row.milestone_reached
      };
      if (profile) profile.codesCreated++;
      emitCommunity(detail);
      return detail;
    }, function () { return null; });
  }

  function getCommunityStats() {
    if (!client) return Promise.resolve(null);
    return client.from("community_stats").select("total,current_goal").eq("id", 1).single()
      .then(function (res) {
        if (res.error) return null;
        return { total: res.data.total, goal: res.data.current_goal };
      }, function () { return null; });
  }

  function getMilestoneHistory() {
    if (!client) return Promise.resolve([]);
    return client.from("milestones").select("goal,reached_at").order("goal")
      .then(function (res) { return res.error ? [] : res.data; }, function () { return []; });
  }

  // --- Tracked QR codes ------------------------------------------------------------
  function randomShortId() {
    var bytes = new Uint8Array(8);
    root.crypto.getRandomValues(bytes);
    var id = "";
    for (var i = 0; i < bytes.length; i++) id += BASE58.charAt(bytes[i] % 58);
    return id;
  }

  function trackUrlFor(shortId) {
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "s.html?c=" + shortId;
  }

  function createTrackedCode(targetUrl, label) {
    if (!client || !profile) return Promise.reject(new Error("Sign in to track scans."));
    if (!CSCore.isValidHttpUrl(targetUrl)) {
      return Promise.reject(new Error("Scan tracking needs an http(s) URL as the QR content."));
    }
    var attempt = function (triesLeft) {
      var shortId = randomShortId();
      return client.from("qr_codes")
        .insert({ short_id: shortId, owner: profile.id, target_url: targetUrl,
                  label: (label || "").slice(0, 60) })
        .then(function (res) {
          if (!res.error) return { shortId: shortId, url: trackUrlFor(shortId) };
          if (res.error.code === "23505" && triesLeft > 0) return attempt(triesLeft - 1);
          throw new Error("Could not create the tracking link: " + res.error.message);
        });
    };
    return attempt(3);
  }

  // --- Analytics data --------------------------------------------------------------
  function fetchAnalytics() {
    var result = { signedIn: !!profile, profile: profile,
                   cloudEvents: [], codes: [], scans: [], localEvents: [] };
    var work = [CSStorage.getEvents().then(function (evs) { result.localEvents = evs; })];
    if (client && profile) {
      work.push(client.from("creation_events").select("kind,created_at")
        .then(function (res) { if (!res.error) result.cloudEvents = res.data; }));
      work.push(client.from("qr_codes").select("short_id,target_url,label,created_at")
        .then(function (res) { if (!res.error) result.codes = res.data; }));
      work.push(client.from("scans").select("short_id,scanned_at,device_type,country,is_repeat")
        .order("scanned_at", { ascending: false }).limit(5000)
        .then(function (res) { if (!res.error) result.scans = res.data; }));
    }
    return Promise.all(work).then(function () { return result; });
  }

  // --- Guest-history merge -----------------------------------------------------------
  function hasUnmergedHistory() {
    if (!client || !profile) return Promise.resolve(false);
    if (CSStorage.kvGet("merged:" + profile.id)) return Promise.resolve(false);
    return CSStorage.getEvents().then(function (evs) { return evs.length > 0 ? evs.length : false; });
  }

  function mergeGuestHistory() {
    if (!client || !profile) return Promise.resolve(false);
    var uid = profile.id;
    if (CSStorage.kvGet("merged:" + uid)) return Promise.resolve(false);
    return CSStorage.getEvents().then(function (events) {
      CSStorage.kvSet("merged:" + uid, true);
      if (!events.length) return false;
      var rows = [];
      for (var i = 0; i < events.length; i++) {
        rows.push({ owner: uid, kind: events[i].kind,
                    created_at: new Date(events[i].at).toISOString() });
      }
      return client.from("creation_events").insert(rows).then(function (res) {
        if (res.error) return false;
        var newCount = profile.codesCreated + rows.length;
        return client.from("profiles").update({ codes_created: newCount }).eq("id", uid)
          .then(function () { profile.codesCreated = newCount; notifyAuth(); return true; });
      });
    });
  }

  root.Backend = {
    isCloud: function () { return !!client; },
    init: init,
    onAuth: function (cb) { authListeners.push(cb); },
    currentUser: function () { return profile; },
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    recordGeneration: recordGeneration,
    getCommunityStats: getCommunityStats,
    getMilestoneHistory: getMilestoneHistory,
    createTrackedCode: createTrackedCode,
    trackUrlFor: trackUrlFor,
    fetchAnalytics: fetchAnalytics,
    hasUnmergedHistory: hasUnmergedHistory,
    mergeGuestHistory: mergeGuestHistory
  };
})(window);
