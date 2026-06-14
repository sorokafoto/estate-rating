#!/usr/bin/env node
// Применяет ручную идентификацию номеров: phone_book + spam removal + phone_registry.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { normalizePhone } from "../shared/phone-registry.mjs";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT, ensureDataDirs } from "../shared/paths.mjs";

const DEFAULT_BATCH = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "manual_phone_identifications.json")
);
const DEFAULT_PHONE_BOOK = resolveDataPath(paths.phoneBook());
const DEFAULT_SPAM_BOOK = resolveDataPath(paths.spamBook());
const DEFAULT_REGISTRY = resolveDataPath(paths.phoneRegistry());

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    phoneBook: DEFAULT_PHONE_BOOK,
    spamBook: DEFAULT_SPAM_BOOK,
    registry: DEFAULT_REGISTRY,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--batch" && argv[i + 1]) args.batch = path.resolve(argv[++i]);
    else if (argv[i] === "--phone-book" && argv[i + 1]) args.phoneBook = argv[++i];
    else if (argv[i] === "--spam-book" && argv[i + 1]) args.spamBook = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
  }
  return args;
}

function loadBatch(batchPath) {
  if (!fs.existsSync(batchPath)) {
    console.error(`[apply-manual-phones] batch не найден: ${batchPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(batchPath, "utf8"));
  const entries = (raw.entries ?? raw).map((e) => {
    const phone = normalizePhone(e.phone);
    if (!phone) return null;
    return {
      phone,
      developer_id: String(e.developer_id ?? "").trim(),
      developer_name: String(e.developer_name ?? "").trim(),
      url: String(e.url ?? "").trim(),
      status: String(e.status ?? "Подтверждён").trim(),
    };
  }).filter(Boolean);

  const byPhone = new Map();
  for (const entry of entries) {
    if (byPhone.has(entry.phone)) {
      console.warn(`[apply-manual-phones] дубликат в batch: ${entry.phone}`);
      continue;
    }
    byPhone.set(entry.phone, entry);
  }
  return [...byPhone.values()];
}

function phoneColIndex(header) {
  const h = header.map((x) => String(x ?? "").trim().toLowerCase());
  return h.findIndex((name) =>
    name === "dev_phone_number" || name === "phone_number" || name === "phone"
  );
}

function addToPhoneBook(phoneBookPath, entries) {
  if (!fs.existsSync(phoneBookPath)) {
    console.error(`[apply-manual-phones] phone_book не найден: ${phoneBookPath}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(phoneBookPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  if (!rows.length) {
    rows.push(["developer_id", "developer_name", "url", "dev_phone_number", "status"]);
  }
  const header = rows[0].map((h) => String(h ?? "").trim());
  const idIdx = header.findIndex((h) => h.toLowerCase() === "developer_id");
  const nameIdx = header.findIndex((h) => h.toLowerCase() === "developer_name");
  const urlIdx = header.findIndex((h) => h.toLowerCase() === "url");
  const phoneIdx = phoneColIndex(header);
  const statusIdx = header.findIndex((h) => h.toLowerCase() === "status");

  const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const phone = normalizePhone(rows[r][phoneIdx]);
    if (phone) seen.add(phone);
  }

  let added = 0;
  for (const entry of entries) {
    if (seen.has(entry.phone)) continue;
    const row = new Array(header.length).fill("");
    if (idIdx >= 0) row[idIdx] = entry.developer_id;
    if (nameIdx >= 0) row[nameIdx] = entry.developer_name;
    if (urlIdx >= 0) row[urlIdx] = entry.url;
    if (phoneIdx >= 0) row[phoneIdx] = entry.phone;
    if (statusIdx >= 0) row[statusIdx] = entry.status;
    rows.push(row);
    seen.add(entry.phone);
    added++;
  }

  wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
  XLSX.writeFile(wb, phoneBookPath);
  return added;
}

function removeFromSpamBook(spamBookPath, phoneSet) {
  if (!fs.existsSync(spamBookPath)) return 0;
  const wb = XLSX.readFile(spamBookPath);
  const ws = wb.Sheets.SPAM_PHONES;
  if (!ws) return 0;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return 0;
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const phoneIdx = header.indexOf("phone_number");
  let removed = 0;
  const kept = [rows[0]];
  for (let r = 1; r < rows.length; r++) {
    const phone = normalizePhone(rows[r][phoneIdx]);
    if (phone && phoneSet.has(phone)) {
      removed++;
      continue;
    }
    kept.push(rows[r]);
  }
  wb.Sheets.SPAM_PHONES = XLSX.utils.aoa_to_sheet(kept);
  XLSX.writeFile(wb, spamBookPath);
  return removed;
}

function updateRegistry(registryPath, entries) {
  const registry = fs.existsSync(registryPath)
    ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
    : { phones: {}, meta: {} };
  registry.phones ??= {};
  registry.meta ??= {};
  let updated = 0;
  for (const entry of entries) {
    registry.phones[entry.phone] = {
      entity_type: "developer",
      source: "manual",
      confidence: "high",
      developer_id: entry.developer_id,
      developer_name: entry.developer_name,
      url: entry.url,
    };
    updated++;
  }
  registry.meta.updated_at = new Date().toISOString();
  registry.meta.manual_batch_applied = path.basename(DEFAULT_BATCH);
  ensureDataDirs();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  return updated;
}

function main() {
  const { batch, phoneBook, spamBook, registry } = parseArgs(process.argv);
  const entries = loadBatch(batch);
  const phoneSet = new Set(entries.map((e) => e.phone));

  const stats = {
    batch_entries: entries.length,
    added_to_book: addToPhoneBook(phoneBook, entries),
    removed_from_spam: removeFromSpamBook(spamBook, phoneSet),
    registry_updated: updateRegistry(registry, entries),
  };

  console.log(
    `[apply-manual-phones] ${JSON.stringify(stats)} -> book=${path.relative(PROJECT_ROOT, phoneBook)} registry=${path.relative(PROJECT_ROOT, registry)}`
  );
}

main();
