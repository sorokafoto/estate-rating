// Шаг сборки: приватный источник -> агрегат -> публичный data.json (+ PII-валидация).
// Запуск: npm run build-data
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSource, sourceExists } from "./source.mjs";
import { generateMock } from "./mock.mjs";
import { aggregate } from "./aggregate.mjs";
import { computeMarket, computeSpamShare } from "../shared/market.mjs";
import { validatePublicData } from "./validate.mjs";
import { jsonForScript } from "./safe-json.mjs";
import { emitBrowserArtifacts } from "./emit-browser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "data.json");
const OUT_JS_PATH = path.join(__dirname, "..", "data.js");
const APPS_SENT_PATH = path.join(__dirname, "applications-sent.json");

function main() {
  const demo = !sourceExists();
  if (demo) {
    console.warn("[build-data] Приватный источник не найден (private/source.xlsx). Использую демо-данные.");
  }
  const events = demo ? generateMock() : readSource();

  const applicationsSent = JSON.parse(fs.readFileSync(APPS_SENT_PATH, "utf8"));
  const developers = aggregate(events, applicationsSent);

  // Дефолтная сортировка: быстрые сверху (NULL — в конец).
  developers.sort((a, b) => byNullableAsc(a.avg_response, b.avg_response));

  const period = computePeriod(events);
  const data = {
    meta: {
      title: "Рейтинг скорости реакции застройщиков на заявки",
      demo,
      partial: !demo, // реальный срез — часть данных (первая версия)
      source: demo ? "mock" : "xlsx",
      period,
      developers_count: developers.length,
      assumed_applications_default: applicationsSent.default ?? 21,
      generated_at: new Date().toISOString(),
    },
    market: {
      ...computeMarket(developers),
      spam_share: computeSpamShare(events),
    },
    developers,
  };

  validatePublicData(data); // безопасность: весь публичный объект

  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(OUT_PATH, json + "\n", "utf8");
  // data.js — тот же агрегат для file://; JSON экранируется от </script> XSS.
  fs.writeFileSync(OUT_JS_PATH, "window.APP_DATA = " + jsonForScript(data) + ";\n", "utf8");
  emitBrowserArtifacts();
  console.log(
    `[build-data] OK: ${developers.length} застройщиков -> ${path.relative(process.cwd(), OUT_PATH)} + data.js + assets/metrics.js (${demo ? "demo" : "xlsx"})`
  );
}

function byNullableAsc(a, b) {
  const an = a == null, bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return a - b;
}

function computePeriod(events) {
  const dates = events
    .map((e) => e.application_datetime)
    .filter((d) => d instanceof Date && !isNaN(d));
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return min.getTime() === max.getTime() ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}
function pad(n) {
  return String(n).padStart(2, "0");
}

main();
