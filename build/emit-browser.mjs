// Генерация browser-артефактов из shared-модулей (без бандлера).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TABLE_COLUMNS, MESSENGER_CHANNELS } from "../shared/metrics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "..", "assets");
const MARKET_SRC = path.join(__dirname, "..", "shared", "market.mjs");

export function emitBrowserArtifacts() {
  emitMetricsJs();
  emitUrlUtilsJs();
  emitMarketJs();
}

function emitMetricsJs() {
  const payload = { channels: MESSENGER_CHANNELS, columns: TABLE_COLUMNS };
  const content =
    "/* Сгенерировано build-data — не редактировать вручную. */\n" +
    "window.APP_METRICS = " +
    JSON.stringify(payload, null, 2) +
    ";\n";
  fs.writeFileSync(path.join(ASSETS, "metrics.js"), content, "utf8");
}

function emitUrlUtilsJs() {
  const content = `/* Сгенерировано build-data — не редактировать вручную. */
(function (global) {
  "use strict";
  var ALLOWED = { "http:": true, "https:": true };

  function parseExternalUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    var candidate = /^https?:\\/\\//i.test(trimmed) ? trimmed : "https://" + trimmed;
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
`;
  fs.writeFileSync(path.join(ASSETS, "url-utils.js"), content, "utf8");
}

function emitMarketJs() {
  const raw = fs.readFileSync(MARKET_SRC, "utf8");
  const body = raw.replace(/^export /gm, "");
  const content =
    "/* Сгенерировано build-data — не редактировать вручную. */\n" +
    '(function (global) {\n"use strict";\n' +
    body +
    '\nglobal.APP_MARKET = { computeMarket: computeMarket, computeSpamShare: computeSpamShare };\n' +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";
  fs.writeFileSync(path.join(ASSETS, "market.js"), content, "utf8");
}
