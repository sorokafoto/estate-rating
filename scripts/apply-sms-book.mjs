#!/usr/bin/env node
// Проставляет developer_* для SMS по sms_book / sms_mark_reference.
import fs from "node:fs";
import XLSX from "xlsx";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { paths, resolveDataPath, writeDataPath } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_SMS_BOOK = resolveDataPath(paths.smsMarkReferenceXlsx());

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, smsBook: DEFAULT_SMS_BOOK };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--sms-book" && argv[i + 1]) args.smsBook = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function headerMap(header) {
  const out = new Map();
  header.forEach((h, i) => out.set(norm(h), i));
  return out;
}

function findSheet(wb, names) {
  const byNorm = new Map(wb.SheetNames.map((name) => [norm(name), name]));
  for (const name of names) {
    const hit = byNorm.get(norm(name));
    if (hit) return hit;
  }
  return null;
}

function val(row, map, name) {
  const i = map.get(norm(name));
  return i == null ? "" : row[i] ?? "";
}

function loadSmsBook(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = findSheet(wb, ["sms_mark", "sms_book", "sms_mark_reference"]) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
  const map = headerMap(rows[0] ?? []);
  const out = new Map();
  for (const row of rows.slice(1)) {
    const mark = norm(val(row, map, "sms_mark"));
    if (!mark) continue;
    out.set(mark, {
      developer_id: String(val(row, map, "developer_id")).trim(),
      developer_name: String(val(row, map, "developer_name")).trim(),
      url: String(val(row, map, "url")).trim(),
    });
  }
  return out;
}

function col(header, map, name) {
  let i = map.get(norm(name));
  if (i == null) {
    i = header.length;
    header.push(name);
    map.set(norm(name), i);
  }
  return i;
}

function applyToSheet(ws, sheetName, smsBook) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  if (!rows.length) return { rows, stats: { sms_rows: 0, identified: 0, unknown_mark: 0 } };
  const header = rows[0].map((h) => String(h ?? "").trim());
  const map = headerMap(header);
  const idx = {
    developer_id: col(header, map, "developer_id"),
    developer_name: col(header, map, "developer_name"),
    url: col(header, map, "url"),
    event_channel: col(header, map, "event_channel"),
    sms_mark: col(header, map, "sms_mark"),
    identified: col(header, map, "identified"),
  };
  rows[0] = header;
  const isMessenger = /messenger/i.test(sheetName);
  const start = isMessenger && rows.length > 1 && !/^E-/i.test(String(rows[1]?.[0] ?? "")) ? 2 : 1;
  const stats = { sms_rows: 0, identified: 0, unknown_mark: 0 };

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    while (row.length < header.length) row.push("");
    if (norm(row[idx.event_channel]) !== "sms") continue;
    stats.sms_rows++;
    const mark = norm(row[idx.sms_mark]);
    const hit = smsBook.get(mark);
    if (!hit) {
      stats.unknown_mark++;
      continue;
    }
    row[idx.developer_id] = hit.developer_id;
    row[idx.developer_name] = hit.developer_name;
    row[idx.url] = hit.url;
    row[idx.identified] = "да";
    stats.identified++;
  }
  return { rows, stats };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[apply-sms-book] source не найден: ${args.source}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.smsBook)) {
    console.error(`[apply-sms-book] sms-book не найден: ${args.smsBook}`);
    process.exit(1);
  }
  const smsBook = loadSmsBook(args.smsBook);
  const wb = XLSX.readFile(args.source);
  const sheets = resolveEventSheets(wb.SheetNames);
  const total = {};
  for (const { sheetName } of sheets) {
    const { rows, stats } = applyToSheet(wb.Sheets[sheetName], sheetName, smsBook);
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
    total[sheetName] = stats;
  }
  const writeTarget = args.source === resolveDataPath(paths.source()) ? writeDataPath(paths.source()) : args.source;
  XLSX.writeFile(wb, writeTarget);
  console.log(JSON.stringify({ source: writeTarget, sms_book_entries: smsBook.size, by_sheet: total }, null, 2));
}

main();
