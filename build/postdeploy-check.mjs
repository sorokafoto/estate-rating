// Post-deploy: проверка HTTPS-заголовков estaterating.ru
// Запуск после заливки publish/: npm run postdeploy-check
import { execSync } from "node:child_process";

const URL = process.env.DEPLOY_URL || "https://estaterating.ru/";

const REQUIRED = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
];

const CSP_MUST = ["formsubmit.co", "mc.yandex.ru"];

const OG_TITLE =
  "Рейтинг застройщиков России по реакции на входящие заявки";
const OG_IMAGE_PATH = "/assets/images/logo_share.png";

function checkOpenGraph(baseUrl) {
  const gaps = [];
  let html;
  try {
    html = execSync(`curl -sL ${baseUrl}`, { encoding: "utf8", timeout: 15000 });
  } catch {
    gaps.push("не удалось загрузить HTML для проверки og-тегов");
    return gaps;
  }

  if (!html.includes(`property="og:title" content="${OG_TITLE}"`)) {
    gaps.push(`og:title не содержит ожидаемый текст`);
  }
  if (!html.includes(`property="og:image" content="${baseUrl.replace(/\/$/, "")}${OG_IMAGE_PATH}"`)) {
    gaps.push("og:image не указывает на ожидаемый URL");
  }

  const imageUrl = `${baseUrl.replace(/\/$/, "")}${OG_IMAGE_PATH}`;
  try {
    const head = execSync(`curl -sSI ${imageUrl}`, { encoding: "utf8", timeout: 15000 });
    const status = head.split("\n")[0] || "";
    if (!/200/.test(status)) gaps.push(`og:image не отвечает 200: ${status.trim()}`);
  } catch {
    gaps.push("не удалось проверить og:image");
  }

  return gaps;
}

function main() {
  let raw;
  try {
    raw = execSync(`curl -sSI ${URL}`, { encoding: "utf8", timeout: 15000 });
  } catch (e) {
    console.error(`[postdeploy] Не удалось подключиться к ${URL}`);
    console.error("  Залейте publish/ на сервер и настройте DNS/SSL, затем повторите.");
    process.exit(1);
  }

  const headers = new Map();
  for (const line of raw.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }

  const gaps = [];
  for (const h of REQUIRED) {
    if (!headers.has(h)) gaps.push(`нет заголовка: ${h}`);
  }

  const csp = headers.get("content-security-policy") || "";
  for (const needle of CSP_MUST) {
    if (!csp.includes(needle)) gaps.push(`CSP не содержит ${needle}`);
  }

  if (gaps.length) {
    console.error("[postdeploy] GAP:");
    for (const g of gaps) console.error("  - " + g);
    process.exit(1);
  }

  const ogGaps = checkOpenGraph(URL);
  if (ogGaps.length) {
    console.error("[postdeploy] OG GAP:");
    for (const g of ogGaps) console.error("  - " + g);
    process.exit(1);
  }

  console.log(`[postdeploy] ${URL} — security headers OK`);
  for (const h of REQUIRED) console.log(`  ${h}: ${(headers.get(h) || "").slice(0, 80)}…`);
  console.log(`[postdeploy] og:title и og:image OK`);
}

main();
