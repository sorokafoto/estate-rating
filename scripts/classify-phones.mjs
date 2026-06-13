#!/usr/bin/env node
// Классификация incoming_phone_number: каталог → prefix rules → registry → phones_to_review.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  classifyPhone,
  emptyRegistry,
  normalizePhone,
  upsertPhoneEntry,
} from "../shared/phone-registry.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_REGISTRY = resolveDataPath(paths.phoneRegistry());
const DEFAULT_CATALOG = resolveDataPath(paths.phoneBook());
const DEFAULT_REVIEW = writeDataPath(paths.phonesToReview());

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    registry: DEFAULT_REGISTRY,
    catalog: DEFAULT_CATALOG,
    review: DEFAULT_REVIEW,
    seed: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
    else if (argv[i] === "--catalog" && argv[i + 1]) args.catalog = argv[++i];
    else if (argv[i] === "--review" && argv[i + 1]) args.review = argv[++i];
    else if (argv[i] === "--seed") args.seed = true;
  }
  return args;
}

async function loadRegistryAsync(registryPath, seed) {
  if (!fs.existsSync(registryPath)) {
    if (seed) {
      const { execSync } = await import("node:child_process");
      execSync(`node "${path.join(PROJECT_ROOT, "scripts", "seed-phone-registry.mjs")}" -o "${registryPath}"`, {
        stdio: "inherit",
      });
    } else {
      console.warn("[classify-phones] registry не найден, создаю пустой с prefix rules");
      return emptyRegistry();
    }
  }
  if (fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  }
  return emptyRegistry();
}

function loadCatalog(catalogPath) {
  const catalog = new Map();
  if (!fs.existsSync(catalogPath)) {
    console.warn(`[classify-phones] Каталог не найден: ${catalogPath}`);
    return catalog;
  }
  const wb = XLSX.readFile(catalogPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  for (const row of rows) {
    const phoneKey = row.phone ?? row.dev_phone_number;
    const phone = normalizePhone(phoneKey);
    if (!phone) continue;
    catalog.set(phone, {
      developer_id: String(row.developer_id ?? "").trim(),
      developer_name: String(row.developer_name ?? "").trim(),
      url: String(row.url ?? "").trim(),
    });
  }
  return catalog;
}

function collectPhonesFromSheet(ws, sheetName) {
  const phones = new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (!rows.length) return phones;

  const header = rows[0].map((h) => String(h ?? "").trim());
  const phoneIdx = header.indexOf("incoming_phone_number");
  const channelIdx = header.indexOf("event_channel");
  const noteIdx = header.findIndex((h) => h.toLowerCase().includes("заметка"));
  const isMessenger = /messenger/i.test(sheetName);
  const startRow = isMessenger && rows.length > 1 && !/^E-/i.test(String(rows[1]?.[0] ?? "")) ? 2 : 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || phoneIdx < 0 || row[phoneIdx] == null) continue;
    const channel = String(row[channelIdx] ?? "").trim().toLowerCase();
    if (channel !== "call") continue;
    const rawIncoming = String(row[phoneIdx] ?? "").trim();
    if (rawIncoming.toLowerCase().includes("скрыт")) continue;
    const phone = normalizePhone(rawIncoming);
    if (!phone) continue;
    const note = noteIdx >= 0 ? String(row[noteIdx] ?? "").trim() : "";
    const prev = phones.get(phone);
    if (!prev || (note && !prev.note)) phones.set(phone, { note: note || prev?.note || "" });
  }
  return phones;
}

function collectPhonesFromSource(sourcePath) {
  const phones = new Map();
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[classify-phones] source не найден: ${sourcePath}`);
    return phones;
  }
  const wb = XLSX.readFile(sourcePath);
  const sheets = resolveEventSheets(wb.SheetNames);
  if (!sheets.length) {
    console.warn(`[classify-phones] листы событий не найдены в ${sourcePath}`);
    return phones;
  }
  for (const { sheetName } of sheets) {
    const fromSheet = collectPhonesFromSheet(wb.Sheets[sheetName], sheetName);
    for (const [phone, ctx] of fromSheet) {
      const prev = phones.get(phone);
      if (!prev || (ctx.note && !prev.note)) phones.set(phone, ctx);
    }
  }
  return phones;
}

function saveReviewCsv(reviewPath, unknownList) {
  const lines = ["phone,note"];
  for (const { phone, note } of unknownList) {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    lines.push(`${phone},${esc(note ?? "")}`);
  }
  fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
  fs.writeFileSync(reviewPath, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  const registry = await loadRegistryAsync(args.registry, args.seed);
  const catalog = loadCatalog(args.catalog);
  const phonesFromSource = collectPhonesFromSource(args.source);

  // Также обрабатываем все номера из registry (ручная разметка)
  for (const phone of Object.keys(registry.phones ?? {})) {
    if (!phonesFromSource.has(phone)) phonesFromSource.set(phone, { note: registry.phones[phone].note ?? "" });
  }

  const stats = {
    total: phonesFromSource.size,
    manual: 0,
    auto_spam: 0,
    auto_dev: 0,
    unknown: 0,
    catalog: 0,
    prefix: 0,
    updated: 0,
  };
  const unknownList = [];
  const results = new Map();

  for (const [phone, ctx] of phonesFromSource) {
    const manual = registry.phones?.[phone];
    if (manual?.source === "manual") {
      stats.manual++;
      results.set(phone, manual);
      continue;
    }

    const hit = classifyPhone(registry, phone, catalog, ctx);
    results.set(phone, hit);

    if (hit.entity_type === "spam" && hit.source !== "manual") {
      stats.auto_spam++;
      if (upsertPhoneEntry(registry, phone, { ...hit, source: hit.source })) stats.updated++;
    } else if (hit.entity_type === "developer" && hit.source !== "manual") {
      stats.auto_dev++;
      if (hit.source === "catalog") stats.catalog++;
      else stats.prefix++;
      if (upsertPhoneEntry(registry, phone, { ...hit, source: hit.source })) stats.updated++;
    } else if (hit.entity_type === "unknown") {
      stats.unknown++;
      unknownList.push({ phone, note: ctx.note });
    }
  }

  registry.meta = registry.meta ?? {};
  registry.meta.updated_at = new Date().toISOString();
  registry.meta.last_classify = {
    source: args.source,
    stats,
  };

  fs.mkdirSync(path.dirname(args.registry), { recursive: true });
  fs.writeFileSync(args.registry, JSON.stringify(registry, null, 2) + "\n", "utf8");
  saveReviewCsv(args.review, unknownList);

  console.log(
    `[classify-phones] total=${stats.total} manual=${stats.manual} auto_spam=${stats.auto_spam} auto_dev=${stats.auto_dev} (catalog=${stats.catalog} prefix=${stats.prefix}) unknown=${stats.unknown} registry_updated=${stats.updated}`
  );
  console.log(`[classify-phones] review: ${path.relative(PROJECT_ROOT, args.review)} (${unknownList.length} rows)`);
  console.log(`[classify-phones] registry: ${path.relative(PROJECT_ROOT, args.registry)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
