#!/usr/bin/env node
// Аудит широких spam-диапазонов: пересечения с id./unknown звонками и dev-whitelist.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  classifyPhone,
  DEFAULT_DEV_PREFIXES,
  DEFAULT_SPAM_RANGES,
  emptyRegistry,
  normalizePhone,
} from "../shared/phone-registry.mjs";
import { computeCallClassificationBreakdown } from "../shared/cycle-metrics.mjs";
import { paths, PROJECT_ROOT, resolveDataPath, writeDataPath } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "spam-range-audit.xlsx")
);

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

function loadCatalog(catalogPath) {
  const catalog = new Map();
  if (!fs.existsSync(catalogPath)) return catalog;
  const wb = XLSX.readFile(catalogPath);
  const sheetName = wb.SheetNames.includes("phones_flat") ? "phones_flat" : wb.SheetNames[0];
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets[sheetName])) {
    const phone = normalizePhone(row.phone ?? row.dev_phone_number);
    if (!phone) continue;
    catalog.set(phone, {
      developer_id: String(row.developer_id ?? "").trim(),
      developer_name: String(row.developer_name ?? "").trim(),
    });
  }
  return catalog;
}

function matchingRange(phone, ranges) {
  for (const range of ranges) {
    if (phone.startsWith(range)) return range;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[audit-spam-ranges] source не найден: ${args.source}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source, { cellDates: true });
  const registry = fs.existsSync(resolveDataPath(paths.phoneRegistry()))
    ? JSON.parse(fs.readFileSync(resolveDataPath(paths.phoneRegistry()), "utf8"))
    : emptyRegistry();
  const catalog = loadCatalog(resolveDataPath(paths.phoneBook()));
  const ranges = registry.prefix_rules?.spam_ranges ?? DEFAULT_SPAM_RANGES;
  const devPrefixes = registry.prefix_rules?.developer ?? DEFAULT_DEV_PREFIXES;

  const breakdown = computeCallClassificationBreakdown(wb, { registry, catalog });

  const byRange = new Map();
  for (const range of ranges) {
    byRange.set(range, {
      spam_range: range,
      spam_calls: 0,
      would_be_developer_in_catalog: 0,
      unknown_calls: 0,
      dev_whitelist_overrides: [],
      sample_phones: [],
    });
  }

  const ws = wb.Sheets[wb.SheetNames.find((n) => /events_sms_calls/i.test(n)) ?? wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  const header = rows[0]?.map((h) => String(h ?? "").trim()) ?? [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const start = 2;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (String(row[idx.event_channel] ?? "").trim().toLowerCase() !== "call") continue;
    const phone = normalizePhone(row[idx.incoming_phone_number]);
    if (!phone) continue;

    const range = matchingRange(phone, ranges);
    if (!range) continue;

    const bucket = byRange.get(range);
    const cls = classifyPhone(registry, phone, catalog);
    const devOverride = devPrefixes.find((d) => phone.startsWith(d.prefix));

    if (cls.entity_type === "spam") bucket.spam_calls++;
    else if (cls.entity_type === "developer") bucket.would_be_developer_in_catalog++;
    else bucket.unknown_calls++;

    if (devOverride && !bucket.dev_whitelist_overrides.includes(devOverride.developer_name)) {
      bucket.dev_whitelist_overrides.push(devOverride.developer_name);
    }
    if (bucket.sample_phones.length < 5 && !bucket.sample_phones.includes(phone)) {
      bucket.sample_phones.push(phone);
    }
  }

  const auditRows = [...byRange.values()]
    .map((b) => ({
      spam_range: b.spam_range,
      spam_calls: b.spam_calls,
      unknown_in_range: b.unknown_calls,
      developer_in_range: b.would_be_developer_in_catalog,
      dev_whitelist: b.dev_whitelist_overrides.join("; "),
      sample_phones: b.sample_phones.join(", "),
      recommendation:
        b.unknown_calls > 0 || b.would_be_developer_in_catalog > 0
          ? "проверить: добавить dev-whitelist или убрать диапазон из DEFAULT_SPAM_RANGES"
          : "оставить в SPAM_BOOK",
    }))
    .sort((a, b) => b.unknown_in_range + b.developer_in_range - (a.unknown_in_range + a.developer_in_range));

  const legend = [
    ["правило", "описание"],
    ["spam_ranges", "Широкие префиксы в phone-registry; подтверждённые пулы — только в SPAM_BOOK мастера"],
    ["dev_whitelist", "prefix_rules.developer выше spam_ranges (пример: 796288 → AVA)"],
    ["recommendation", "Не расширять spam «на глаз»; unknown/developer в диапазоне → ручная проверка"],
  ];

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(legend), "легенда");
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(auditRows), "spam_ranges");
  XLSX.writeFile(outWb, args.output);

  console.log(
    JSON.stringify(
      {
        output: args.output,
        call_classification: breakdown,
        ranges_audited: auditRows.length,
        ranges_with_unknown_or_dev: auditRows.filter(
          (r) => r.unknown_in_range > 0 || r.developer_in_range > 0
        ).length,
      },
      null,
      2
    )
  );
}

main();
