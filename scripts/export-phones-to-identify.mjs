#!/usr/bin/env node
// Выгрузка unknown incoming_phone_number (звонки) в xlsx для ручной идентификации.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { classifyPhone, emptyRegistry, normalizePhone } from "../shared/phone-registry.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";

import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_REGISTRY = resolveDataPath(paths.phoneRegistry());
const DEFAULT_CATALOG = resolveDataPath(paths.phoneBook());
const DEFAULT_SPAM_BOOK = resolveDataPath(paths.spamBook());
const DEFAULT_OUTPUT = writeDataPath(paths.phonesToIdentify());

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    registry: DEFAULT_REGISTRY,
    catalog: DEFAULT_CATALOG,
    spamBook: DEFAULT_SPAM_BOOK,
    output: DEFAULT_OUTPUT,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
    else if (argv[i] === "--catalog" && argv[i + 1]) args.catalog = argv[++i];
    else if (argv[i] === "--spam-book" && argv[i + 1]) args.spamBook = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    console.warn("[export-phones-identify] registry не найден, пустой");
    return emptyRegistry();
  }
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function loadCatalog(catalogPath) {
  const catalog = new Map();
  if (!fs.existsSync(catalogPath)) return catalog;
  const wb = XLSX.readFile(catalogPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets[sheetName])) {
    const phone = normalizePhone(row.phone ?? row.dev_phone_number);
    if (!phone) continue;
    catalog.set(phone, {
      developer_id: String(row.developer_id ?? "").trim(),
      developer_name: String(row.developer_name ?? "").trim(),
      url: String(row.url ?? "").trim(),
    });
  }
  return catalog;
}

function loadSpamBook(spamBookPath) {
  const prefixes = new Map();
  const spamPhonePrefixes = new Set();

  if (!fs.existsSync(spamBookPath)) {
    console.warn(`[export-phones-identify] SPAM_BOOK не найден: ${spamBookPath}`);
    return { prefixes, spamPhonePrefixes };
  }

  const wb = XLSX.readFile(spamBookPath);

  if (wb.Sheets.SPAM_PREFIXES) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets.SPAM_PREFIXES)) {
      const prefix = String(row.prefix ?? "").trim();
      if (!prefix) continue;
      prefixes.set(prefix, {
        confidence: String(row.confidence ?? "").trim() || "medium",
        phones_in_pool: Number(row.phones_in_pool) || 0,
        pool_note: String(row.pool_note ?? "").trim(),
      });
    }
  }

  if (wb.Sheets.SPAM_PHONES) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets.SPAM_PHONES)) {
      const phone = normalizePhone(row.phone_number);
      if (phone && phone.length >= 7) spamPhonePrefixes.add(phone.slice(0, 7));
    }
  }

  return { prefixes, spamPhonePrefixes };
}

function collectFromSheet(ws, sheetName, phones) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (!rows.length) return;
  const header = rows[0].map((h) => String(h ?? "").trim());
  const phoneIdx = header.indexOf("incoming_phone_number");
  const channelIdx = header.indexOf("event_channel");
  const noteIdx = header.findIndex((h) => h.toLowerCase().includes("заметка"));
  const dateIdx = header.indexOf("event_datetime");
  const isMessenger = /messenger/i.test(sheetName);
  const startRow = isMessenger && rows.length > 1 && !/^E-/i.test(String(rows[1]?.[0] ?? "")) ? 2 : 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || phoneIdx < 0 || row[phoneIdx] == null) continue;
    if (String(row[channelIdx] ?? "").trim().toLowerCase() !== "call") continue;

    const rawIncoming = String(row[phoneIdx] ?? "").trim();
    if (rawIncoming.toLowerCase().includes("скрыт")) continue;

    const phone = normalizePhone(rawIncoming);
    if (!phone) continue;

    const note = noteIdx >= 0 ? String(row[noteIdx] ?? "").trim() : "";
    const eventDate = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";

    if (!phones.has(phone)) {
      phones.set(phone, { note: "", call_count: 0, dates: [] });
    }
    const entry = phones.get(phone);
    entry.call_count++;
    if (eventDate) entry.dates.push(eventDate);
    if (note && !entry.note) entry.note = note;
  }
}

function collectCallPhones(sourcePath) {
  const phones = new Map();
  if (!fs.existsSync(sourcePath)) {
    console.error(`[export-phones-identify] source не найден: ${sourcePath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(sourcePath);
  const sheets = resolveEventSheets(wb.SheetNames);
  if (!sheets.length) {
    console.error(`[export-phones-identify] листы событий не найдены`);
    process.exit(1);
  }
  for (const { sheetName } of sheets) {
    collectFromSheet(wb.Sheets[sheetName], sheetName, phones);
  }

  return phones;
}

function formatDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!Number.isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function dateRange(dates) {
  const parsed = dates.map(formatDate).filter(Boolean).sort();
  if (!parsed.length) return { first: "", last: "" };
  return { first: parsed[0], last: parsed[parsed.length - 1] };
}

function buildSuspiciousReasons(phone, prefix7, poolSize, spamBook) {
  const reasons = [];

  const prefixRule = spamBook.prefixes.get(prefix7);
  if (prefixRule) {
    const poolInfo = prefixRule.phones_in_pool ? `, ${prefixRule.phones_in_pool} in pool` : "";
    reasons.push(`SPAM_PREFIX:${prefix7} (${prefixRule.confidence}${poolInfo})`);
  }

  if (poolSize >= 2) {
    reasons.push(`POOL:${poolSize} unknown`);
  }

  if (spamBook.spamPhonePrefixes.has(prefix7)) {
    reasons.push("SIBLING_SPAM:same prefix as SPAM_PHONES");
  }

  return reasons;
}

function main() {
  const args = parseArgs(process.argv);
  const registry = loadRegistry(args.registry);
  const catalog = loadCatalog(args.catalog);
  const spamBook = loadSpamBook(args.spamBook);
  const callPhones = collectCallPhones(args.source);

  const unknownByPrefix = new Map();
  const unknownList = [];

  for (const [phone, ctx] of callPhones) {
    const hit = classifyPhone(registry, phone, catalog, { note: ctx.note });
    if (hit.entity_type !== "unknown") continue;

    const prefix7 = phone.length >= 7 ? phone.slice(0, 7) : phone;
    unknownByPrefix.set(prefix7, (unknownByPrefix.get(prefix7) ?? 0) + 1);
    unknownList.push({ phone, ...ctx, prefix7 });
  }

  const rows = unknownList.map(({ phone, note, call_count, dates, prefix7 }) => {
    const poolSize = unknownByPrefix.get(prefix7) ?? 1;
    const reasons = buildSuspiciousReasons(phone, prefix7, poolSize, spamBook);
    const { first, last } = dateRange(dates);

    return {
      incoming_phone_number: phone,
      developer_name: "",
      Спам: "",
      Заметка: note,
      call_count,
      first_call: first,
      last_call: last,
      prefix_7: prefix7,
      suspicious_spam: reasons.length ? "да" : "нет",
      suspicious_reason: reasons.join("; "),
    };
  });

  rows.sort((a, b) => {
    const susp = (b.suspicious_spam === "да") - (a.suspicious_spam === "да");
    if (susp !== 0) return susp;
    return b.call_count - a.call_count;
  });

  const suspicious = rows.filter((r) => r.suspicious_spam === "да").length;

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const outWb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(outWb, ws, "phones_to_identify");
  XLSX.writeFile(outWb, args.output);

  console.log(
    `[export-phones-identify] total_unknown=${rows.length} suspicious=${suspicious} -> ${path.relative(PROJECT_ROOT, args.output)}`
  );
}

main();
