/* Local persistence: IndexedDB for this browser's generation history (guest
 * analytics + achievement metadata), plus a tiny localStorage key-value helper.
 * Exposes a single global `CSStorage`. All methods return Promises and resolve
 * to safe fallbacks when IndexedDB is unavailable (private browsing, old WebViews)
 * so callers never need try/catch for the storage layer.
 */
(function (root) {
  "use strict";

  var DB_NAME = "codesafe-local";
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!root.indexedDB) { resolve(null); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  // event: { kind: "qr"|"barcode", at: ms, meta: {...} }
  function addEvent(event) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        var tx = db.transaction("events", "readwrite");
        tx.objectStore("events").add(event);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
        tx.onabort = function () { resolve(false); };
      });
    });
  }

  function getEvents() {
    return openDb().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        var req = db.transaction("events", "readonly").objectStore("events").getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    });
  }

  // localStorage helpers (JSON values, silent failure in restricted contexts).
  function kvGet(key) {
    try {
      var raw = root.localStorage.getItem("codesafe:" + key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  }

  function kvSet(key, value) {
    try {
      root.localStorage.setItem("codesafe:" + key, JSON.stringify(value));
    } catch (e) { /* storage full or blocked — non-essential */ }
  }

  root.CSStorage = {
    addEvent: addEvent,
    getEvents: getEvents,
    kvGet: kvGet,
    kvSet: kvSet
  };
})(window);
