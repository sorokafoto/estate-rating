#!/usr/bin/env node
// Выгрузка номеров из справочников + call_count из source.xlsx.
// --kind landline (default): городские, не 79…
// --kind mobile: мобильные 79…, без номеров из landline_phones.xlsx
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { normalizePhone } from "../shared/phone-registry.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT, ensureDataDirs } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_REGISTRY = resolveDataPath(paths.phoneRegistry());
const DEFAULT_PHONE_BOOK = resolveDataPath(paths.phoneBook());
const DEFAULT_SPAM_BOOK = resolveDataPath(paths.spamBook());
const DEFAULT_LANDLINE_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "landline_phones.xlsx")
);
const DEFAULT_MOBILE_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "mobile_phones.xlsx")
);

const HEADERS = ["phone_number", "call_count", "developer_name", "is_spam"];

function parseArgs(argv) {
  const args = {
    kind: "landline",
    source: DEFAULT_SOURCE,
    registry: DEFAULT_REGISTRY,
    phoneBook: DEFAULT_PHONE_BOOK,
    spamBook: DEFAULT_SPAM_BOOK,
    excludeLandline: DEFAULT_LANDLINE_OUTPUT,
    output: null,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--kind" && argv[i + 1]) args.kind = argv[++i];
    else if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
    else if (argv[i] === "--phone-book" && argv[i + 1]) args.phoneBook = argv[++i];
    else if (argv[i] === "--spam-book" && argv[i + 1]) args.spamBook = argv[++i];
    else if (argv[i] === "--exclude-landline" && argv[i + 1]) args.excludeLandline = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
  }
  if (!args.output) {
    args.output = args.kind === "mobile" ? DEFAULT_MOBILE_OUTPUT : DEFAULT_LANDLINE_OUTPUT;
  }
  return args;
}

function isLandline(phone) {
  return phone.length === 11 && phone.startsWith("7") && !phone.startsWith("79");
}

function isMobile(phone) {
  return phone.length === 11 && phone.startsWith("79");
}

function emptyMeta() {
  return { inPhoneBook: false, inSpam: false, developer_name: "" };
}

function loadPhoneBook(phoneBookPath, records, acceptsPhone) {
  let count = 0;
  if (!fs.existsSync(phoneBookPath)) return count;
  const wb = XLSX.readFile(phoneBookPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets[sheetName])) {
    const phone = normalizePhone(row.dev_phone_number ?? row.phone_number ?? row.phone);
    if (!phone || !acceptsPhone(phone)) continue;
    const meta = records.get(phone) ?? emptyMeta();
    meta.inPhoneBook = true;
    const name = String(row.developer_name ?? "").trim();
    if (name) meta.developer_name = name;
    records.set(phone, meta);
    count++;
  }
  return count;
}

function loadSpamBook(spamBookPath, records, acceptsPhone) {
  let count = 0;
  if (!fs.existsSync(spamBookPath)) return count;
  const wb = XLSX.readFile(spamBookPath);
  const ws = wb.Sheets.SPAM_PHONES ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return count;
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const phoneIdx = header.indexOf("phone_number");
  for (let r = 1; r < rows.length; r++) {
    const phone = normalizePhone(rows[r][phoneIdx]);
    if (!phone || !acceptsPhone(phone)) continue;
    const meta = records.get(phone) ?? emptyMeta();
    meta.inSpam = true;
    records.set(phone, meta);
    count++;
  }
  return count;
}

function loadRegistry(registryPath, records, acceptsPhone) {
  let count = 0;
  if (!fs.existsSync(registryPath)) return count;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  for (const [raw, entry] of Object.entries(registry.phones ?? {})) {
    const phone = normalizePhone(raw);
    if (!phone || !acceptsPhone(phone)) continue;
    const meta = records.get(phone) ?? emptyMeta();
    if (entry.entity_type === "developer") {
      const name = String(entry.developer_name ?? "").trim();
      if (name && !meta.developer_name) meta.developer_name = name;
    }
    records.set(phone, meta);
    count++;
  }
  return count;
}

function loadExcludePhones(filePath) {
  const exclude = new Set();
  if (!filePath || !fs.existsSync(filePath)) return exclude;
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return exclude;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return exclude;
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const phoneIdx = header.indexOf("phone_number");
  if (phoneIdx < 0) return exclude;
  for (let r = 1; r < rows.length; r++) {
    const phone = normalizePhone(rows[r][phoneIdx]);
    if (phone) exclude.add(phone);
  }
  return exclude;
}

function countCalls(sourcePath) {
  const counts = new Map();
  if (!fs.existsSync(sourcePath)) return counts;

  const wb = XLSX.readFile(sourcePath);
  const sheets = resolveEventSheets(wb.SheetNames);
  for (const { sheetName } of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) continue;
    const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const channelIdx = header.indexOf("event_channel");
    const phoneIdx = header.indexOf("incoming_phone_number");
    if (channelIdx < 0 || phoneIdx < 0) continue;

    const isMessenger = /messenger/i.test(sheetName);
    const start =
      isMessenger && rows.length > 1 && !/^E-/i.test(String(rows[1]?.[0] ?? "")) ? 2 : 1;

    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      if (String(row[channelIdx] ?? "").trim().toLowerCase() !== "call") continue;
      const phone = normalizePhone(row[phoneIdx]);
      if (!phone) continue;
      counts.set(phone, (counts.get(phone) || 0) + 1);
    }
  }
  return counts;
}

function main() {
  const { kind, source, registry, phoneBook, spamBook, excludeLandline, output } = parseArgs(
    process.argv
  );
  const acceptsPhone = kind === "mobile" ? isMobile : isLandline;
  const sheetName = kind === "mobile" ? "mobile_phones" : "landline_phones";
  const logTag = kind === "mobile" ? "export-mobile-phones" : "export-landline-phones";

  const exclude = kind === "mobile" ? loadExcludePhones(excludeLandline) : new Set();
  const records = new Map();

  const stats = {
    kind,
    phone_book: loadPhoneBook(phoneBook, records, acceptsPhone),
    spam_book: loadSpamBook(spamBook, records, acceptsPhone),
    registry: loadRegistry(registry, records, acceptsPhone),
  };
  stats.union_before_exclude = records.size;

  if (exclude.size) {
    let removed = 0;
    for (const phone of [...records.keys()]) {
      if (exclude.has(phone)) {
        records.delete(phone);
        removed++;
      }
    }
    stats.excluded_landline_overlap = removed;
  }

  stats.union = records.size;

  const callCounts = countCalls(source);

  const rows = [HEADERS];
  const sorted = [...records.entries()].sort((a, b) => {
    const ca = callCounts.get(a[0]) || 0;
    const cb = callCounts.get(b[0]) || 0;
    if (cb !== ca) return cb - ca;
    return a[0].localeCompare(b[0]);
  });

  let withCalls = 0;
  let withDeveloper = 0;
  let withSpam = 0;

  for (const [phone, meta] of sorted) {
    const call_count = callCounts.get(phone) || 0;
    if (call_count > 0) withCalls++;
    if (meta.developer_name) withDeveloper++;
    if (meta.inSpam) withSpam++;
    rows.push([
      phone,
      call_count,
      meta.developer_name || "",
      meta.inSpam ? "да" : "",
    ]);
  }

  stats.with_call_count_gt_0 = withCalls;
  stats.with_developer_name = withDeveloper;
  stats.with_is_spam = withSpam;

  ensureDataDirs();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  XLSX.writeFile(wb, output);

  console.log(`[${logTag}] ${JSON.stringify(stats)} -> ${path.relative(PROJECT_ROOT, output)}`);
}

main();
