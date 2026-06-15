// Проверка publish/: PII, запрещённые пути, статические ссылки из index.html
// Запуск: npm run verify-publish
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicData } from "./validate.mjs";
import { findRemainingComments } from "./strip-comments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, ".."));
const PUBLISH = path.join(ROOT, "publish");

const FORBIDDEN_SEGMENTS = new Set([
  "data",
  "build",
  "scripts",
  "shared",
  "docs",
  "node_modules",
  "private",
  ".git",
]);

const LOCAL_REF =
  /(?:href|src)=["'](?!https?:|\/\/|#|mailto:|data:|javascript:)([^"'?#]+)/gi;

function fail(msg) {
  console.error("[verify-publish] FAIL:", msg);
  process.exit(1);
}

function checkStaticLinks() {
  const htmlPath = path.join(PUBLISH, "index.html");
  if (!fs.existsSync(htmlPath)) fail("publish/index.html не найден — сначала npm run publish");

  const html = fs.readFileSync(htmlPath, "utf8");
  const missing = [];
  let m;
  while ((m = LOCAL_REF.exec(html)) !== null) {
    const ref = m[1].trim();
    if (!ref || ref.startsWith("assets/") === false && !/^[a-z0-9._-]+$/i.test(ref.split("/")[0])) {
      // root-level or assets paths only
    }
    const target = path.join(PUBLISH, ref);
    if (!fs.existsSync(target)) missing.push(ref);
  }

  // Also scan JS/CSS in publish for relative asset refs (simple)
  for (const rel of ["assets/app.js", "assets/styles.css", "config.js"]) {
    const p = path.join(PUBLISH, rel);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    let u;
    while ((u = urlRe.exec(text)) !== null) {
      const ref = u[1];
      if (ref.startsWith("http") || ref.startsWith("data:")) continue;
      const resolved = path.normalize(path.join(path.dirname(p), ref));
      if (!resolved.startsWith(PUBLISH) || !fs.existsSync(resolved)) {
        missing.push(`${rel} → ${ref}`);
      }
    }
  }

  if (missing.length) {
    console.error("[verify-publish] Битые локальные ссылки:");
    for (const x of [...new Set(missing)]) console.error("  - " + x);
    process.exit(1);
  }
  console.log("[verify-publish] Статические ссылки: OK");
}

function main() {
  if (!fs.existsSync(PUBLISH)) fail("Папка publish/ не найдена — сначала npm run publish");

  const offenders = [];
  for (const entry of fs.readdirSync(PUBLISH, { withFileTypes: true })) {
    if (FORBIDDEN_SEGMENTS.has(entry.name)) offenders.push(entry.name);
  }
  function walkPublish(relDir) {
    const abs = path.join(PUBLISH, relDir);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = relDir === "." ? entry.name : path.join(relDir, entry.name);
      if (entry.isDirectory()) walkPublish(rel);
      else if (/\.(xlsx|xls|csv)$/i.test(entry.name)) offenders.push(rel);
    }
  }
  walkPublish(".");
  if (offenders.length) {
    console.error("[verify-publish] Запрещённые файлы/каталоги в publish/:");
    for (const o of offenders) console.error("  - " + o);
    process.exit(1);
  }
  console.log("[verify-publish] Allowlist: OK (нет pipeline/PII-каталогов)");

  const data = JSON.parse(fs.readFileSync(path.join(PUBLISH, "data.json"), "utf8"));
  validatePublicData(data);
  console.log("[verify-publish] PII-валидация data.json: OK");

  checkStaticLinks();
  checkNoComments();
  console.log("[verify-publish] Все проверки пройдены");
}

function checkNoComments() {
  const textExt = /\.(html|css|js|svg)$/i;
  const issues = [];
  function walk(relDir) {
    const abs = path.join(PUBLISH, relDir);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = relDir === "." ? entry.name : path.join(relDir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (textExt.test(entry.name)) {
        const content = fs.readFileSync(path.join(abs, entry.name), "utf8");
        const hits = findRemainingComments(entry.name, content);
        if (hits.length) issues.push(`${rel}: ${hits.join(", ")}`);
      }
    }
  }
  walk(".");
  if (issues.length) {
    console.error("[verify-publish] Остались комментарии:");
    for (const i of issues) console.error("  - " + i);
    process.exit(1);
  }
  console.log("[verify-publish] Комментарии: удалены");
}

main();
