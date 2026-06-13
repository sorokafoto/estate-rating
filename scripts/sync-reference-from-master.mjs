#!/usr/bin/env node
// Синхронизирует локальные reference-файлы из мастер-шаблона Google Sheets/XLSX.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";
import { paths, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_MASTER = latestMaster();

function parseArgs(argv) {
  const args = { master: DEFAULT_MASTER };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--master" && argv[i + 1]) args.master = path.resolve(argv[++i]);
  }
  return args;
}

function latestMaster() {
  const dir = path.join(PROJECT_ROOT, "data", "working");
  if (!fs.existsSync(dir)) return "";
  const candidates = fs
    .readdirSync(dir)
    .filter((name) => /^Мастер.*\.xlsx$/i.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] ?? "";
}

function normName(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findSheet(wb, names) {
  const byNorm = new Map(wb.SheetNames.map((name) => [normName(name), name]));
  for (const name of names) {
    const hit = byNorm.get(normName(name));
    if (hit) return hit;
  }
  return null;
}

function readRows(wb, names) {
  const sheet = findSheet(wb, names);
  if (!sheet) throw new Error(`Не найден лист: ${names.join(" / ")}`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", blankrows: false });
  return { sheet, rows };
}

function headerMap(header) {
  const out = new Map();
  header.forEach((h, i) => out.set(normName(h), i));
  return out;
}

function val(row, map, name) {
  const i = map.get(normName(name));
  return i == null ? "" : row[i] ?? "";
}

function normalizePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits[0] === "8") return `7${digits.slice(1)}`;
  return digits;
}

function buildLegend(rows) {
  const header = headerMap(rows[0] ?? []);
  const byId = new Map();
  const byName = new Map();
  for (const row of rows.slice(1)) {
    const developerId = String(val(row, header, "developer_id")).trim();
    const developerName = String(val(row, header, "developer_name")).trim();
    const url = String(val(row, header, "url")).trim();
    if (!developerId || !developerName) continue;
    const entry = { developer_id: developerId, developer_name: developerName, url };
    byId.set(developerId, entry);
    byName.set(normName(developerName), entry);
  }
  return { byId, byName };
}

function phoneBookRows(rows, legend) {
  const header = headerMap(rows[0] ?? []);
  const out = [["developer_id", "developer_name", "url", "dev_phone_number", "status"]];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const phone = normalizePhone(val(row, header, "phone_number") || val(row, header, "dev_phone_number"));
    if (!phone || seen.has(phone)) continue;
    const developerId = String(val(row, header, "developer_id")).trim();
    const developerName = String(val(row, header, "developer_name")).trim();
    const fromLegend = legend.byId.get(developerId) ?? legend.byName.get(normName(developerName));
    out.push([
      developerId || fromLegend?.developer_id || "",
      developerName || fromLegend?.developer_name || "",
      fromLegend?.url || String(val(row, header, "url")).trim(),
      phone,
      String(val(row, header, "status") || "Подтверждён").trim(),
    ]);
    seen.add(phone);
  }
  return out;
}

function smsBookRows(rows, legend) {
  const header = headerMap(rows[0] ?? []);
  const out = [["developer_id", "developer_name", "url", "sms_mark"]];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const smsMark = String(val(row, header, "sms_mark")).trim();
    if (!smsMark) continue;
    const developerId = String(val(row, header, "developer_id")).trim();
    const developerName = String(val(row, header, "developer_name")).trim();
    const fromLegend = legend.byId.get(developerId) ?? legend.byName.get(normName(developerName));
    const key = `${developerId || fromLegend?.developer_id || ""}|${smsMark.toLowerCase()}`;
    if (seen.has(key)) continue;
    out.push([
      developerId || fromLegend?.developer_id || "",
      developerName || fromLegend?.developer_name || "",
      fromLegend?.url || "",
      smsMark,
    ]);
    seen.add(key);
  }
  return out;
}

function spamRows(rows, headers) {
  const header = headerMap(rows[0] ?? []);
  const out = [headers];
  const seen = new Set();
  const keyCol = headers[0];
  for (const row of rows.slice(1)) {
    const first = keyCol === "phone_number" ? normalizePhone(val(row, header, keyCol)) : String(val(row, header, keyCol)).replace(/\D/g, "");
    if (!first || seen.has(first)) continue;
    out.push(headers.map((name, idx) => (idx === 0 ? first : val(row, header, name))));
    seen.add(first);
  }
  return out;
}

function writeWorkbook(filePath, sheets) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  XLSX.writeFile(wb, filePath);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function updateManifest(masterPath, counts) {
  const manifestPath = path.join(PROJECT_ROOT, "data", "manifest.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.updated = new Date().toISOString();
  manifest.master_template = {
    path: path.relative(path.join(PROJECT_ROOT, "data"), masterPath),
    sha256: sha256(masterPath),
    synced_at: new Date().toISOString(),
    counts,
  };
  manifest.reference = {
    phone_book: "reference/developer_official_phones.xlsx",
    spam_book: "reference/spam_book.xlsx",
    sms_mark: "reference/sms_mark_reference.xlsx",
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function main() {
  const { master } = parseArgs(process.argv);
  if (!master || !fs.existsSync(master)) {
    console.error(`[sync-reference] master не найден: ${master || "(empty)"}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(master);
  const legendRows = readRows(wb, ["legend", "Справочник"]).rows;
  const legend = buildLegend(legendRows);
  const phones = phoneBookRows(readRows(wb, ["phone_book", "PHONE_BOOK", "phones_flat", "Телефоны"]).rows, legend);
  const sms = smsBookRows(readRows(wb, ["sms_book", "sms_mark_reference", "sms_mark"]).rows, legend);
  const spamPhones = spamRows(readRows(wb, ["spam_phones", "SPAM_PHONES"]).rows, ["phone_number", "confidence", "source", "note", "verified_at"]);
  const spamPrefixes = spamRows(readRows(wb, ["spam_prefixes", "SPAM_PREFIXES"]).rows, ["prefix", "confidence", "pool_note", "phones_in_pool"]);

  writeWorkbook(writeDataPath(paths.phoneBook()), [["phones_flat", phones]]);
  writeWorkbook(writeDataPath(paths.smsMarkReferenceXlsx()), [["sms_mark", sms]]);
  writeWorkbook(writeDataPath(paths.spamBook()), [
    ["SPAM_PHONES", spamPhones],
    ["SPAM_PREFIXES", spamPrefixes],
  ]);

  const counts = {
    legend: legendRows.length - 1,
    phone_book: phones.length - 1,
    sms_book: sms.length - 1,
    spam_phones: spamPhones.length - 1,
    spam_prefixes: spamPrefixes.length - 1,
  };
  updateManifest(master, counts);
  console.log(`[sync-reference] OK ${path.relative(PROJECT_ROOT, master)}`);
  console.log(JSON.stringify(counts, null, 2));
}

main();
