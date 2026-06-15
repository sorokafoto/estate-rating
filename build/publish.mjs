// Production bundle: копирует только deploy surface в publish/
// Запуск: npm run publish
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripCommentsForFile } from "./strip-comments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, ".."));
const OUT = path.join(ROOT, "publish");

/** @type {string[]} */
const ROOT_FILES = [
  "index.html",
  "config.js",
  "favicon.svg",
  "data.json",
  "data.js",
];

const COPY_DIRS = ["assets"];

const STRIP_EXTENSIONS = new Set([".html", ".css", ".js", ".svg"]);

const FORBIDDEN_IN_PUBLISH = new Set([
  "data",
  "build",
  "scripts",
  "shared",
  "docs",
  "node_modules",
  "private",
  ".git",
  "icons",
]);

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest, { strip = false } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (strip) {
    const ext = path.extname(src).toLowerCase();
    if (STRIP_EXTENSIONS.has(ext)) {
      const text = fs.readFileSync(src, "utf8");
      fs.writeFileSync(dest, stripCommentsForFile(src, text), "utf8");
      return;
    }
  }
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else copyFile(src, dest, { strip: true });
  }
}

function main() {
  rmDir(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  for (const name of ROOT_FILES) {
    const src = path.join(ROOT, name);
    if (!fs.existsSync(src)) {
      console.error(`[publish] Отсутствует обязательный файл: ${name}`);
      process.exit(1);
    }
    copyFile(src, path.join(OUT, name), { strip: true });
  }

  for (const dir of COPY_DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.error(`[publish] Отсутствует каталог: ${dir}/`);
      process.exit(1);
    }
    copyDir(src, path.join(OUT, dir));
  }

  // Sanity: forbidden top-level dirs must not appear under publish/
  const offenders = [];
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (FORBIDDEN_IN_PUBLISH.has(entry.name)) offenders.push(entry.name);
    if (entry.isFile() && /\.(xlsx|xls|csv|pem|key)$/i.test(entry.name)) {
      offenders.push(entry.name);
    }
  }
  function walk(relDir) {
    const abs = path.join(OUT, relDir);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(relDir, entry.name));
      else if (/\.(xlsx|xls|csv|pem|key)$/i.test(entry.name)) {
        offenders.push(path.join(relDir, entry.name));
      }
    }
  }
  walk(".");

  if (offenders.length) {
    console.error("[publish] Запрещённые артефакты в publish/:");
    for (const o of offenders) console.error("  - " + o);
    process.exit(1);
  }

  checkJsSyntax(OUT);

  const fileCount = countFiles(OUT);
  console.log(`[publish] Готово: ${OUT} (${fileCount} файлов, комментарии удалены)`);
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
    else n += 1;
  }
  return n;
}

function checkJsSyntax(dir) {
  function walk(abs, rel) {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const entryAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(entryAbs, entryRel);
      else if (entry.name.endsWith(".js")) {
        try {
          execSync(`node --check ${JSON.stringify(entryAbs)}`, { stdio: "pipe" });
        } catch {
          console.error(`[publish] Синтаксическая ошибка после strip: ${entryRel}`);
          process.exit(1);
        }
      }
    }
  }
  walk(dir, "");
}

main();
