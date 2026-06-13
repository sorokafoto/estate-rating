#!/usr/bin/env node
// Выгрузка справочников из data/reference/ в формат вкладок мастер-шаблона Google Sheets.
// Запуск: npm run export-master-reference
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { paths, resolveDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const PHONE_BOOK = resolveDataPath(paths.phoneBook());
const SPAM_BOOK = resolveDataPath(paths.spamBook());

const OUT_DIR = path.join(PROJECT_ROOT, "data", "export-for-master");
const STAMP = new Date().toISOString().slice(0, 10);

const PHONE_BOOK_HEADERS = [
  "developer_id",
  "developer_name",
  "dev_phone_number",
  "status",
];

const SPAM_PHONES_HEADERS = [
  "phone_number",
  "confidence",
  "source",
  "note",
  "verified_at",
];

const SPAM_PREFIXES_HEADERS = [
  "prefix",
  "confidence",
  "pool_note",
  "phones_in_pool",
];

function readRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

function mapPhoneBook(rows) {
  if (!rows.length) return [PHONE_BOOK_HEADERS];
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const out = [PHONE_BOOK_HEADERS];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const phone = row[idx("dev_phone_number")] ?? row[idx("phone_number")] ?? row[idx("phone")];
    if (!phone) continue;
    out.push([
      row[idx("developer_id")] ?? "",
      row[idx("developer_name")] ?? "",
      phone,
      row[idx("status")] ?? "Подтверждён",
    ]);
  }
  return out;
}

function mapSheet(rows, headers, rename = {}) {
  if (!rows.length) return [headers];
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const out = [headers];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    out.push(
      headers.map((h) => {
        const key = rename[h] ?? h;
        const i = idx(key);
        return i >= 0 ? row[i] ?? "" : "";
      })
    );
  }
  return out;
}

function writeCsv(filePath, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  fs.writeFileSync(filePath, csv, "utf8");
}

function main() {
  if (!fs.existsSync(PHONE_BOOK)) {
    console.error(`[export-master-reference] PHONE_BOOK не найден: ${PHONE_BOOK}`);
    process.exit(1);
  }
  if (!fs.existsSync(SPAM_BOOK)) {
    console.error(`[export-master-reference] SPAM_BOOK не найден: ${SPAM_BOOK}`);
    process.exit(1);
  }

  const phoneRows = mapPhoneBook(readRows(PHONE_BOOK, "phones_flat"));
  const spamPhoneRows = mapSheet(readRows(SPAM_BOOK, "SPAM_PHONES"), SPAM_PHONES_HEADERS);
  const spamPrefixRows = mapSheet(readRows(SPAM_BOOK, "SPAM_PREFIXES"), SPAM_PREFIXES_HEADERS);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = `${STAMP}-master-reference-seed`;
  const xlsxPath = path.join(OUT_DIR, `${base}.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phoneRows), "phone_book");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(spamPhoneRows), "spam_phones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(spamPrefixRows), "spam_prefixes");
  XLSX.writeFile(wb, xlsxPath);

  writeCsv(path.join(OUT_DIR, `${base}-PHONE_BOOK.csv`), phoneRows);
  writeCsv(path.join(OUT_DIR, `${base}-SPAM_PHONES.csv`), spamPhoneRows);
  writeCsv(path.join(OUT_DIR, `${base}-SPAM_PREFIXES.csv`), spamPrefixRows);

  const manifest = {
    exported_at: new Date().toISOString(),
    source: {
      phone_book: path.relative(PROJECT_ROOT, PHONE_BOOK),
      spam_book: path.relative(PROJECT_ROOT, SPAM_BOOK),
    },
    counts: {
      phone_book: phoneRows.length - 1,
      spam_phones: spamPhoneRows.length - 1,
      spam_prefixes: spamPrefixRows.length - 1,
    },
    files: {
      xlsx: path.relative(PROJECT_ROOT, xlsxPath),
      csv: [
        `${base}-PHONE_BOOK.csv`,
        `${base}-SPAM_PHONES.csv`,
        `${base}-SPAM_PREFIXES.csv`,
      ],
    },
    target_tabs: ["phone_book", "spam_phones", "spam_prefixes"],
  };
  fs.writeFileSync(path.join(OUT_DIR, `${base}-manifest.json`), JSON.stringify(manifest, null, 2) + "\n");

  console.log("[export-master-reference] OK");
  console.log(`  phone_book:     ${manifest.counts.phone_book} строк`);
  console.log(`  spam_phones:    ${manifest.counts.spam_phones} строк`);
  console.log(`  spam_prefixes:  ${manifest.counts.spam_prefixes} строк`);
  console.log(`  -> ${path.relative(PROJECT_ROOT, xlsxPath)}`);
  console.log(`  -> ${path.relative(PROJECT_ROOT, OUT_DIR)}/ (${base}-*.csv)`);
}

main();
