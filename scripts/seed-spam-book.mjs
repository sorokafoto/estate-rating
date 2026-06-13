#!/usr/bin/env node
// Загружает SPAM_BOOK (SPAM_PHONES + SPAM_PREFIXES) в phone_registry.json.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  DEFAULT_DEV_PREFIXES,
  DEFAULT_SPAM_RANGES,
  DEFAULT_NOTE_KEYWORDS,
  emptyRegistry,
  normalizePhone,
} from "../shared/phone-registry.mjs";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT, ensureDataDirs } from "../shared/paths.mjs";

const DEFAULT_SPAM_BOOK = resolveDataPath(paths.spamBook());
const DEFAULT_REGISTRY = writeDataPath(paths.phoneRegistry());

function parseArgs(argv) {
  const args = { spamBook: DEFAULT_SPAM_BOOK, registry: DEFAULT_REGISTRY, merge: true };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--spam-book" && argv[i + 1]) args.spamBook = argv[++i];
    else if (argv[i] === "-o" && argv[i + 1]) args.registry = argv[++i];
    else if (argv[i] === "--replace") args.merge = false;
  }
  return args;
}

function loadRegistry(registryPath, merge) {
  if (merge && fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  }
  return emptyRegistry();
}

function readSheetRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

function main() {
  const { spamBook, registry: registryPath, merge } = parseArgs(process.argv);
  if (!fs.existsSync(spamBook)) {
    console.error(`[seed-spam] SPAM_BOOK не найден: ${spamBook}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(spamBook);
  const registry = loadRegistry(registryPath, merge);

  registry.phones ??= {};
  registry.prefix_rules ??= {};
  registry.prefix_rules.developer ??= DEFAULT_DEV_PREFIXES;
  registry.prefix_rules.spam_ranges ??= DEFAULT_SPAM_RANGES;
  registry.note_keywords ??= DEFAULT_NOTE_KEYWORDS;

  let phonesAdded = 0;
  let phonesUpdated = 0;

  const phoneRows = readSheetRows(wb, "SPAM_PHONES");
  if (phoneRows.length) {
    const header = phoneRows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const phoneIdx = header.indexOf("phone_number");
    const confIdx = header.indexOf("confidence");
    const srcIdx = header.indexOf("source");
    const noteIdx = header.indexOf("note");

    for (let r = 1; r < phoneRows.length; r++) {
      const row = phoneRows[r];
      if (!row) continue;
      const phone = normalizePhone(row[phoneIdx]);
      if (!phone) continue;

      const existing = registry.phones[phone];
      const entry = {
        entity_type: "spam",
        source: "manual",
        confidence: String(row[confIdx] ?? "high").trim() || "high",
        note: noteIdx >= 0 ? String(row[noteIdx] ?? "").trim() || undefined : undefined,
        spam_source: srcIdx >= 0 ? String(row[srcIdx] ?? "").trim() || undefined : undefined,
      };

      if (existing?.source === "manual" && existing.entity_type === "developer") {
        continue;
      }
      if (existing) phonesUpdated++;
      else phonesAdded++;
      registry.phones[phone] = entry;
    }
  }

  let prefixesHigh = 0;
  let prefixesMedium = 0;
  const prefixRows = readSheetRows(wb, "SPAM_PREFIXES");
  const spamPrefixes = [];

  if (prefixRows.length) {
    const header = prefixRows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const prefixIdx = header.indexOf("prefix");
    const confIdx = header.indexOf("confidence");

    for (let r = 1; r < prefixRows.length; r++) {
      const row = prefixRows[r];
      if (!row) continue;
      const prefix = String(row[prefixIdx] ?? "").replace(/\D/g, "");
      if (!prefix) continue;
      const conf = String(row[confIdx] ?? "high").trim().toLowerCase();
      if (conf === "high") {
        spamPrefixes.push(prefix);
        prefixesHigh++;
      } else {
        prefixesMedium++;
      }
    }
  }

  registry.prefix_rules.spam = [...new Set(spamPrefixes)].sort();

  registry.meta ??= {};
  registry.meta.seeded_spam_from = spamBook;
  registry.meta.updated_at = new Date().toISOString();

  ensureDataDirs();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");

  console.log(
    `[seed-spam] phones_added=${phonesAdded} phones_updated=${phonesUpdated} prefix_high=${prefixesHigh} prefix_medium_skipped=${prefixesMedium} total_spam_phones=${Object.values(registry.phones).filter((p) => p.entity_type === "spam").length} prefix_rules=${registry.prefix_rules.spam.length} -> ${path.relative(PROJECT_ROOT, registryPath)}`
  );
}

main();
