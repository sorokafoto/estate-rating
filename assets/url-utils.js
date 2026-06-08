/* Сгенерировано build-data — не редактировать вручную. */
(function (global) {
  "use strict";
  var ALLOWED = { "http:": true, "https:": true };

  function parseExternalUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    var candidate = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
    var u;
    try { u = new URL(candidate); } catch (e) { return null; }
    if (!ALLOWED[u.protocol]) return null;
    if (u.username || u.password) return null;
    if (!u.hostname || u.hostname.indexOf(".") === -1) return null;
    return u;
  }

  function hrefFromRaw(raw) {
    var u = parseExternalUrl(raw);
    return u ? u.href : null;
  }

  function hrefFromStored(stored) {
    if (!stored || typeof stored !== "string") return null;
    return hrefFromRaw(stored);
  }

  global.APP_URL = { parseExternalUrl: parseExternalUrl, hrefFromRaw: hrefFromRaw, hrefFromStored: hrefFromStored };
})(typeof window !== "undefined" ? window : globalThis);
