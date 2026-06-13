#!/usr/bin/env node
// Обогащает phone_book/spam_phones/spam_prefixes в мастер-шаблоне ручной идентификацией.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";
import { paths, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DATA_WORKING = path.join(PROJECT_ROOT, "data", "working");
const DEFAULT_MASTER = latest(/^Мастер.*\.xlsx$/i);
const DEFAULT_MANUAL = latest(/^Идентификация номеров.*\.xlsx$/i);

function parseArgs(argv) {
  const args = {
    master: DEFAULT_MASTER,
    manual: DEFAULT_MANUAL,
    out: "",
    writeSource: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--master" && argv[i + 1]) args.master = path.resolve(argv[++i]);
    else if (argv[i] === "--manual" && argv[i + 1]) args.manual = path.resolve(argv[++i]);
    else if (argv[i] === "-o" && argv[i + 1]) args.out = path.resolve(argv[++i]);
    else if (argv[i] === "--write-source") args.writeSource = true;
  }
  if (!args.out && args.master) {
    const ext = path.extname(args.master);
    args.out = path.join(path.dirname(args.master), `${path.basename(args.master, ext)} — enriched${ext}`);
  }
  return args;
}

function latest(pattern) {
  if (!fs.existsSync(DATA_WORKING)) return "";
  const candidates = fs
    .readdirSync(DATA_WORKING)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(DATA_WORKING, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] ?? "";
}

function normName(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits[0] === "8") return `7${digits.slice(1)}`;
  return digits;
}

function findSheet(wb, names) {
  const byNorm = new Map(wb.SheetNames.map((name) => [normName(name), name]));
  for (const name of names) {
    const hit = byNorm.get(normName(name));
    if (hit) return hit;
  }
  return null;
}

function readAoa(wb, names) {
  const name = findSheet(wb, names);
  if (!name) throw new Error(`Не найден лист: ${names.join(" / ")}`);
  return { name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false }) };
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

function setVal(row, map, header, name, value) {
  let i = map.get(normName(name));
  if (i == null) {
    i = header.length;
    header.push(name);
    map.set(normName(name), i);
  }
  row[i] = value;
}

function buildLegend(rows) {
  const map = headerMap(rows[0] ?? []);
  const byName = new Map();
  const byId = new Map();
  for (const row of rows.slice(1)) {
    const developerId = String(val(row, map, "developer_id")).trim();
    const developerName = String(val(row, map, "developer_name")).trim();
    const url = String(val(row, map, "url")).trim();
    if (!developerId || !developerName) continue;
    const entry = { developer_id: developerId, developer_name: developerName, url };
    byName.set(normName(developerName), entry);
    byId.set(developerId, entry);
  }
  return { byName, byId };
}

function ensureColumns(rows, required) {
  if (!rows.length) rows.push(required.slice());
  const header = rows[0].map((h) => String(h ?? "").trim());
  const map = headerMap(header);
  for (const name of required) {
    if (!map.has(normName(name))) {
      map.set(normName(name), header.length);
      header.push(name);
    }
  }
  rows[0] = header;
  for (const row of rows.slice(1)) while (row.length < header.length) row.push("");
  return { header, map };
}

function hasTruthySpam(v) {
  return ["да", "спам", "spam", "true", "1"].includes(normName(v));
}

function hasExplicitNoSpam(v) {
  return ["нет", "no", "false", "0"].includes(normName(v));
}

function isAmbiguousSpamCell(v) {
  const text = normName(v);
  return Boolean(text) && !hasTruthySpam(text) && !hasExplicitNoSpam(text);
}

function appendPhoneBook(rows, entry, seen, added, source) {
  const { header, map } = ensureColumns(rows, ["developer_id", "developer_name", "dev_phone_number", "status"]);
  const phone = normalizePhone(entry.phone);
  if (!phone || seen.has(phone)) return false;
  const row = Array(header.length).fill("");
  setVal(row, map, header, "developer_id", entry.developer_id);
  setVal(row, map, header, "developer_name", entry.developer_name);
  setVal(row, map, header, "dev_phone_number", phone);
  setVal(row, map, header, "status", entry.status || "Подтверждён");
  rows.push(row);
  seen.add(phone);
  added.push({ phone_number: phone, developer_id: entry.developer_id, developer_name: entry.developer_name, source });
  return true;
}

function appendSpamPhone(rows, entry, seen, added, source) {
  const { header, map } = ensureColumns(rows, ["phone_number", "confidence", "source", "note", "verified_at"]);
  const phone = normalizePhone(entry.phone);
  if (!phone || seen.has(phone)) return false;
  const row = Array(header.length).fill("");
  setVal(row, map, header, "phone_number", phone);
  setVal(row, map, header, "confidence", entry.confidence || "high");
  setVal(row, map, header, "source", entry.source || source);
  setVal(row, map, header, "note", entry.note || "");
  setVal(row, map, header, "verified_at", entry.verified_at || "2026-06-13");
  rows.push(row);
  seen.add(phone);
  added.push({ phone_number: phone, confidence: entry.confidence || "high", note: entry.note || "", source });
  return true;
}

function appendSpamPrefix(rows, entry, seen, added) {
  const { header, map } = ensureColumns(rows, ["prefix", "confidence", "pool_note", "phones_in_pool"]);
  const prefix = String(entry.prefix ?? "").replace(/\D/g, "");
  if (!prefix || seen.has(prefix)) return false;
  const row = Array(header.length).fill("");
  setVal(row, map, header, "prefix", prefix);
  setVal(row, map, header, "confidence", entry.confidence || "high");
  setVal(row, map, header, "pool_note", entry.pool_note || "manual 2026-06-13 explicit spam pool");
  setVal(row, map, header, "phones_in_pool", entry.phones_in_pool || "");
  rows.push(row);
  seen.add(prefix);
  added.push({ prefix, confidence: entry.confidence || "high", phones_in_pool: entry.phones_in_pool || "" });
  return true;
}

function existingPhones(rows, names) {
  const { header, map } = ensureColumns(rows, names);
  const out = new Set();
  for (const row of rows.slice(1)) {
    const phone = normalizePhone(val(row, map, "phone_number") || val(row, map, "dev_phone_number"));
    if (phone) out.add(phone);
  }
  return out;
}

function existingPrefixes(rows) {
  const { map } = ensureColumns(rows, ["prefix"]);
  const out = new Set();
  for (const row of rows.slice(1)) {
    const prefix = String(val(row, map, "prefix")).replace(/\D/g, "");
    if (prefix) out.add(prefix);
  }
  return out;
}

function processManualPhoneBook(wb, phoneRows, legend, seenDevPhones, addedPhoneBook) {
  const sheet = findSheet(wb, ["phone_book", "PHONE_BOOK", "phones_flat"]);
  if (!sheet) return;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", blankrows: false });
  const map = headerMap(rows[0] ?? []);
  for (const row of rows.slice(1)) {
    const phone = normalizePhone(val(row, map, "dev_phone_number") || val(row, map, "phone_number"));
    if (!phone) continue;
    const developerId = String(val(row, map, "developer_id")).trim();
    const developerName = String(val(row, map, "developer_name")).trim();
    const hit = legend.byId.get(developerId) ?? legend.byName.get(normName(developerName));
    if (!hit) continue;
    appendPhoneBook(phoneRows, { phone, ...hit, status: val(row, map, "status") || "Подтверждён" }, seenDevPhones, addedPhoneBook, "manual_phone_book");
  }
}

function processManualSheets(wb, phoneRows, spamRows, prefixRows, legend, seenDevPhones, seenSpamPhones, seenPrefixes) {
  const addedPhoneBook = [];
  const addedSpamPhones = [];
  const addedPrefixes = [];
  const review = [];
  const explicitSpamByPrefix = new Map();

  processManualPhoneBook(wb, phoneRows, legend, seenDevPhones, addedPhoneBook);

  for (const sheet of ["phones_to_identify", "events messengers"]) {
    if (!wb.Sheets[sheet]) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", blankrows: false });
    const map = headerMap(rows[0] ?? []);
    for (const row of rows.slice(1)) {
      const phone = normalizePhone(val(row, map, "incoming_phone_number"));
      if (!phone) continue;
      const spam = val(row, map, "Спам");
      const developerName = String(val(row, map, "developer_name")).trim();
      const note = String(val(row, map, "Заметка")).trim();
      const prefix = String(val(row, map, "prefix_7")).replace(/\D/g, "") || phone.slice(0, 7);

      // Колонку «Асессор» намеренно не читаем.
      if (hasTruthySpam(spam)) {
        const added = appendSpamPhone(
          spamRows,
          { phone, confidence: "high", source: "manual_call_2026-06-13", note, verified_at: "2026-06-13" },
          seenSpamPhones,
          addedSpamPhones,
          "manual_identification"
        );
        if (added && prefix) explicitSpamByPrefix.set(prefix, (explicitSpamByPrefix.get(prefix) || 0) + 1);
        continue;
      }

      if (hasExplicitNoSpam(spam) && developerName) {
        const hit = legend.byName.get(normName(developerName));
        if (hit) {
          appendPhoneBook(phoneRows, { phone, ...hit, status: "Подтверждён" }, seenDevPhones, addedPhoneBook, "manual_identification");
        } else {
          review.push({ reason: "developer_not_found_in_legend", phone_number: phone, developer_name: developerName, note });
        }
        continue;
      }

      if (isAmbiguousSpamCell(spam)) {
        review.push({ reason: "ambiguous_spam_cell", phone_number: phone, spam_value: spam, developer_name: developerName, note });
      } else if (developerName && !seenDevPhones.has(phone)) {
        review.push({ reason: "developer_without_explicit_no_spam", phone_number: phone, developer_name: developerName, note });
      }
    }
  }

  for (const [prefix, count] of explicitSpamByPrefix.entries()) {
    if (count >= 3) {
      appendSpamPrefix(prefixRows, { prefix, phones_in_pool: count }, seenPrefixes, addedPrefixes);
    }
  }

  return { addedPhoneBook, addedSpamPhones, addedPrefixes, review };
}

function writeRowsToSheet(wb, sheetName, rows) {
  wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
}

function writeReport(reportPath, result) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const wb = XLSX.utils.book_new();
  const sheets = [
    ["added_phone_book", result.addedPhoneBook],
    ["added_spam_phones", result.addedSpamPhones],
    ["added_spam_prefixes", result.addedPrefixes],
    ["review", result.review],
  ];
  for (const [name, rows] of sheets) {
    const data = rows.length ? rows : [{ empty: "yes" }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
  }
  XLSX.writeFile(wb, reportPath);
}

function copyToSource(outPath) {
  const sourcePath = writeDataPath(paths.source());
  const backupDir = path.join(DATA_WORKING, "backup");
  fs.mkdirSync(backupDir, { recursive: true });
  if (fs.existsSync(sourcePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(sourcePath, path.join(backupDir, `source-${stamp}.xlsx`));
  }
  fs.copyFileSync(outPath, sourcePath);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.master || !fs.existsSync(args.master)) {
    console.error(`[enrich-master] master не найден: ${args.master || "(empty)"}`);
    process.exit(1);
  }
  if (!args.manual || !fs.existsSync(args.manual)) {
    console.error(`[enrich-master] manual не найден: ${args.manual || "(empty)"}`);
    process.exit(1);
  }

  const masterWb = XLSX.readFile(args.master, { cellDates: true });
  const manualWb = XLSX.readFile(args.manual, { cellDates: true });

  const legend = buildLegend(readAoa(masterWb, ["legend", "Справочник"]).rows);
  const phoneSheet = readAoa(masterWb, ["phone_book", "PHONE_BOOK", "phones_flat"]);
  const spamPhoneSheet = readAoa(masterWb, ["spam_phones", "SPAM_PHONES"]);
  const spamPrefixSheet = readAoa(masterWb, ["spam_prefixes", "SPAM_PREFIXES"]);

  const phoneRows = phoneSheet.rows.map((r) => r.slice());
  const spamRows = spamPhoneSheet.rows.map((r) => r.slice());
  const prefixRows = spamPrefixSheet.rows.map((r) => r.slice());

  const result = processManualSheets(
    manualWb,
    phoneRows,
    spamRows,
    prefixRows,
    legend,
    existingPhones(phoneRows, ["dev_phone_number", "phone_number"]),
    existingPhones(spamRows, ["phone_number"]),
    existingPrefixes(prefixRows)
  );

  writeRowsToSheet(masterWb, phoneSheet.name, phoneRows);
  writeRowsToSheet(masterWb, spamPhoneSheet.name, spamRows);
  writeRowsToSheet(masterWb, spamPrefixSheet.name, prefixRows);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  XLSX.writeFile(masterWb, args.out);

  const reportPath = path.join(DATA_WORKING, "logs", "manual-identification-2026-06-13-report.xlsx");
  writeReport(reportPath, result);

  if (args.writeSource) copyToSource(args.out);

  const summary = {
    master: path.relative(PROJECT_ROOT, args.master),
    manual: path.relative(PROJECT_ROOT, args.manual),
    output: path.relative(PROJECT_ROOT, args.out),
    output_sha256: sha256(args.out),
    wrote_source: args.writeSource,
    report: path.relative(PROJECT_ROOT, reportPath),
    added: {
      phone_book: result.addedPhoneBook.length,
      spam_phones: result.addedSpamPhones.length,
      spam_prefixes: result.addedPrefixes.length,
      review: result.review.length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
