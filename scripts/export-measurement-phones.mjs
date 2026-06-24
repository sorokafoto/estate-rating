#!/usr/bin/env node
// Экспорт тестовых номеров цикла замера (лист devices + сверка с applications).
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { paths, resolveDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_OUTPUT = path.resolve(
  PROJECT_ROOT,
  "..",
  "developer-rating-dashboard",
  "measurement-phones.json"
);

const PERIOD_META = {
  "2026-Q2": {
    label: "II квартал 2026",
    study_from: "2026-06-02",
    study_to: "2026-06-08",
  },
};

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, quarter: "2026-Q2" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
    else if (argv[i] === "--quarter" && argv[i + 1]) args.quarter = argv[++i];
  }
  return args;
}

function normPhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) return d;
  if (d.length === 10) return "7" + d;
  return d.length >= 10 ? d : "";
}

function sheetRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Лист «${name}» не найден`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  return { header, rows: rows.slice(1) };
}

function col(header, ...names) {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error("Нет source.xlsx:", args.source);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source);
  const { header: dh, rows: deviceRows } = sheetRows(wb, "devices");
  const { header: ah, rows: appRows } = sheetRows(wb, "applications");

  const dPhone = col(dh, "phone_number");
  const dDevice = col(dh, "device_id");
  const aPhone = col(ah, "phone_number");
  const aQuarter = col(ah, "quarter");

  const devices = deviceRows
    .map((r) => ({
      device_id: r[dDevice],
      phone_number: normPhone(r[dPhone]),
    }))
    .filter((d) => d.phone_number);

  const appPhones = new Set();
  for (const r of appRows) {
    const q = String(r[aQuarter] ?? "").trim();
    if (q && q !== args.quarter) continue;
    const p = normPhone(r[aPhone]);
    if (p) appPhones.add(p);
  }

  const application_phones = [...appPhones].sort();
  const all_phones = devices.map((d) => d.phone_number);
  const verification_phones = all_phones.filter((p) => !appPhones.has(p));
  const verification_phone = verification_phones[0] || null;

  const meta = PERIOD_META[args.quarter] || { label: args.quarter };

  const out = {
    generated_at: new Date().toISOString(),
    source: path.relative(PROJECT_ROOT, args.source),
    periods: {
      [args.quarter]: {
        ...meta,
        quarter_id: args.quarter,
        application_phones,
        verification_phone,
        verification_phones,
        all_phones: [...new Set(all_phones)].sort(),
        devices,
        counts: {
          application: application_phones.length,
          verification: verification_phones.length,
          total: all_phones.length,
        },
      },
    },
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote", args.output);
  console.log(
    `  ${args.quarter}: ${application_phones.length} заявочных, ${verification_phones.length} проверочных, ${all_phones.length} всего`
  );
}

main();
