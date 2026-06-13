#!/usr/bin/env node
// Одноразовый (или повторный) seed phone_registry.json из xlsx ручной разметки.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  emptyRegistry,
  normalizePhone,
  REGISTRY_VERSION,
} from "../shared/phone-registry.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import {
  paths,
  resolveDataPath,
  writeDataPath,
  PROJECT_ROOT,
  ensureDataDirs,
} from "../shared/paths.mjs";

const DEFAULT_OUT = writeDataPath(paths.phoneRegistry());
const DEFAULT_SEED = resolveDataPath(
  paths.seedIdentification(),
  "Идентификация номеров.xlsx"
);

function parseArgs(argv) {
  const args = { seed: DEFAULT_SEED, out: DEFAULT_OUT, catalog: null, replace: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--seed" && argv[i + 1]) args.seed = argv[++i];
    else if (argv[i] === "-o" && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === "--catalog" && argv[i + 1]) args.catalog = argv[++i];
    else if (argv[i] === "--replace") args.replace = true;
  }
  return args;
}

function loadRegistry(outPath, replace) {
  if (!replace && fs.existsSync(outPath)) {
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  }
  return emptyRegistry();
}

function loadDeveloperNameMap(catalogPath) {
  const map = new Map();
  if (!catalogPath || !fs.existsSync(catalogPath)) return map;
  const wb = XLSX.readFile(catalogPath);
  const sheet = wb.Sheets["Справочник"] ?? wb.Sheets["phones_flat"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0].map((h) => String(h ?? "").trim());
  const idIdx = header.indexOf("developer_id");
  const nameIdx = header.indexOf("developer_name");
  const urlIdx = header.indexOf("url");
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const name = String(row[nameIdx] ?? "").trim();
    if (!name) continue;
    map.set(name.toLowerCase(), {
      developer_id: String(row[idIdx] ?? "").trim(),
      developer_name: name,
      url: String(row[urlIdx] ?? "").trim(),
    });
  }
  return map;
}

function main() {
  const { seed, out, catalog, replace } = parseArgs(process.argv);
  if (!fs.existsSync(seed)) {
    console.error(`[seed-phone-registry] Файл не найден: ${seed}`);
    process.exit(1);
  }

  const catalogPath = catalog ?? resolveDataPath(paths.phoneBook());
  const devByName = loadDeveloperNameMap(catalogPath);
  const seedWb = XLSX.readFile(seed);
  if (seedWb.Sheets["Справочник"]) {
    const rows = XLSX.utils.sheet_to_json(seedWb.Sheets["Справочник"], { header: 1 });
    const header = rows[0].map((h) => String(h ?? "").trim());
    const idIdx = header.indexOf("developer_id");
    const nameIdx = header.indexOf("developer_name");
    const urlIdx = header.indexOf("url");
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const name = String(row[nameIdx] ?? "").trim();
      if (!name) continue;
      devByName.set(name.toLowerCase(), {
        developer_id: String(row[idIdx] ?? "").trim(),
        developer_name: name,
        url: String(row[urlIdx] ?? "").trim(),
      });
    }
  }

  const eventSheets = resolveEventSheets(seedWb.SheetNames);
  const sheetsToProcess =
    eventSheets.length > 0
      ? eventSheets.map((s) => s.sheetName)
      : [seedWb.SheetNames.includes("events messengers") ? "events messengers" : seedWb.SheetNames[0]];

  const registry = loadRegistry(out, replace);
  registry.phones ??= {};
  registry.meta ??= {};
  registry.meta.seeded_from = seed;
  registry.meta.updated_at = new Date().toISOString();

  let spamCount = 0;
  let devCount = 0;
  let skippedManual = 0;

  for (const sheetName of sheetsToProcess) {
    const sheetWs = seedWb.Sheets[sheetName];
    if (!sheetWs) continue;
    const rows = XLSX.utils.sheet_to_json(sheetWs, { header: 1 });
    if (!rows.length) continue;
    const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const phoneIdx = header.findIndex((h) => h.includes("incoming") || h === "incoming_phone_number");
    const devIdx = header.indexOf("developer_name");
    const spamIdx = header.findIndex((h) => h === "спам");
    const noteIdx = header.findIndex((h) => h.includes("заметка") || h === "заметка");
    const isMessenger = /messenger/i.test(sheetName);
    const startRow = isMessenger && rows.length > 1 ? 2 : 1;

    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row[phoneIdx == -1 ? 0 : phoneIdx] == null) continue;
      const phone = normalizePhone(row[phoneIdx == -1 ? 0 : phoneIdx]);
      if (!phone) continue;

      const existing = registry.phones[phone];
      if (existing?.source === "manual" && !replace) {
        skippedManual++;
        continue;
      }

      const spamRaw = spamIdx >= 0 ? row[spamIdx] : null;
      const isSpam = spamRaw && String(spamRaw).toLowerCase() === "спам";
      const devName = devIdx >= 0 ? String(row[devIdx] ?? "").trim() : "";
      const note = noteIdx >= 0 ? String(row[noteIdx] ?? "").trim() : "";

      if (isSpam) {
        registry.phones[phone] = {
          entity_type: "spam",
          source: "manual",
          confidence: "high",
          note: note || undefined,
        };
        spamCount++;
      } else if (devName) {
        const meta = devByName.get(devName.toLowerCase()) ?? {
          developer_id: "",
          developer_name: devName,
          url: "",
        };
        registry.phones[phone] = {
          entity_type: "developer",
          source: "manual",
          confidence: "high",
          developer_id: meta.developer_id,
          developer_name: meta.developer_name,
          url: meta.url,
          note: note || undefined,
        };
        devCount++;
      }
    }
  }

  ensureDataDirs();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(registry, null, 2) + "\n", "utf8");
  console.log(
    `[seed-phone-registry] OK: spam=${spamCount} dev=${devCount} skipped_manual=${skippedManual} merge=${!replace} total_phones=${Object.keys(registry.phones).length} -> ${path.relative(PROJECT_ROOT, out)}`
  );
}

main();
