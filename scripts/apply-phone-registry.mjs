#!/usr/bin/env node
// Проставляет developer_* и identified в data/working/source.xlsx по phone_registry.json (все листы событий).
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

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, registry: DEFAULT_REGISTRY, catalog: DEFAULT_CATALOG };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
    else if (argv[i] === "--catalog" && argv[i + 1]) args.catalog = argv[++i];
  }
  return args;
}

function loadCatalog(catalogPath) {
  const catalog = new Map();
  if (!fs.existsSync(catalogPath)) return catalog;
  const wb = XLSX.readFile(catalogPath);
  const sheetName = wb.SheetNames.includes("phones_flat") ? "phones_flat" : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  for (const row of rows) {
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

function resolveClassification(registry, catalog, phone, note) {
  const manual = registry.phones?.[phone];
  if (manual?.source === "manual") return manual;
  return classifyPhone(registry, phone, catalog, { note });
}

function applyToSheet(ws, sheetName, registry, catalog) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return { rows: ws, stats: emptyStats() };

  const header = rows[0].map((h) => String(h ?? "").trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) {
      header.push(name);
      return header.length - 1;
    }
    return i;
  };

  const idx = {
    developer_id: col("developer_id"),
    developer_name: col("developer_name"),
    url: col("url"),
    event_channel: col("event_channel"),
    incoming_phone_number: col("incoming_phone_number"),
    identified: col("identified"),
    note: header.findIndex((h) => h.toLowerCase().includes("заметка")),
  };

  rows[0] = header;
  const isMessenger = /messenger/i.test(sheetName);
  const start = isMessenger && rows.length > 1 && !/^E-/i.test(String(rows[1]?.[0] ?? "")) ? 2 : 1;

  const stats = emptyStats();

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    while (row.length < header.length) row.push("");

    const channel = String(row[idx.event_channel] ?? "").trim().toLowerCase();
    if (channel !== "call") continue;

    const rawIncoming = String(row[idx.incoming_phone_number] ?? "").trim();
    if (rawIncoming.toLowerCase().includes("скрыт")) continue;

    const phone = normalizePhone(rawIncoming);
    if (!phone) {
      stats.skipped_no_phone++;
      continue;
    }
    stats.rows++;

    const note = idx.note >= 0 ? String(row[idx.note] ?? "").trim() : "";
    const hit = resolveClassification(registry, catalog, phone, note);

    if (hit.entity_type === "developer") {
      row[idx.developer_id] = hit.developer_id ?? "";
      row[idx.developer_name] = hit.developer_name ?? "";
      row[idx.url] = hit.url ?? "";
      row[idx.identified] = "да";
      stats.developer++;
      stats.identified_yes++;
    } else if (hit.entity_type === "spam") {
      if (row[idx.developer_id] || row[idx.developer_name]) stats.cleared_dev++;
      row[idx.developer_id] = "";
      row[idx.developer_name] = "";
      row[idx.url] = "";
      row[idx.identified] = "нет";
      stats.spam++;
      stats.identified_no++;
    } else {
      row[idx.developer_id] = "";
      row[idx.developer_name] = "";
      row[idx.url] = "";
      row[idx.identified] = "нет";
      stats.unknown++;
      stats.identified_no++;
    }
  }

  return { rows, stats };
}

function emptyStats() {
  return {
    rows: 0,
    developer: 0,
    spam: 0,
    unknown: 0,
    identified_yes: 0,
    identified_no: 0,
    cleared_dev: 0,
    skipped_no_phone: 0,
  };
}

function mergeStats(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[apply-phone-registry] source не найден: ${args.source}`);
    process.exit(1);
  }
  const registry = fs.existsSync(args.registry)
    ? JSON.parse(fs.readFileSync(args.registry, "utf8"))
    : emptyRegistry();
  const catalog = loadCatalog(args.catalog);

  const wb = XLSX.readFile(args.source);
  const sheets = resolveEventSheets(wb.SheetNames);
  if (!sheets.length) {
    console.error(`[apply-phone-registry] листы событий не найдены`);
    process.exit(1);
  }

  let totalStats = emptyStats();
  const sheetStats = {};

  for (const { sheetName } of sheets) {
    const { rows, stats } = applyToSheet(wb.Sheets[sheetName], sheetName, registry, catalog);
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
    totalStats = mergeStats(totalStats, stats);
    sheetStats[sheetName] = stats;
  }

  const writeTarget =
    args.source === resolveDataPath(paths.source())
      ? writeDataPath(paths.source())
      : args.source;

  XLSX.writeFile(wb, writeTarget);

  console.log(
    `[apply-phone-registry] sheets=${sheets.map((s) => s.sheetName).join(", ")} rows=${totalStats.rows} developer=${totalStats.developer} spam=${totalStats.spam} unknown=${totalStats.unknown} identified_да=${totalStats.identified_yes} identified_нет=${totalStats.identified_no} -> ${path.relative(PROJECT_ROOT, writeTarget)}`
  );
  for (const [name, st] of Object.entries(sheetStats)) {
    if (st.rows > 0) console.log(`  [${name}] call_rows=${st.rows}`);
  }
}

main();
