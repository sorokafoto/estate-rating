#!/usr/bin/env node
// Группирует unknown-номера из phones_to_identify.xlsx по prefix_7 для разметки пулами.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_INPUT = resolveDataPath(paths.phonesToIdentify());
const DEFAULT_OUTPUT = writeDataPath(paths.spamPrefixCandidates());
const MIN_POOL_SIZE = 3;

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, minPool: MIN_POOL_SIZE };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) args.input = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
    else if (argv[i] === "--min-pool" && argv[i + 1]) args.minPool = Number(argv[++i]) || MIN_POOL_SIZE;
  }
  return args;
}

function main() {
  const { input, output, minPool } = parseArgs(process.argv);
  if (!fs.existsSync(input)) {
    console.error(`[suggest-spam-prefixes] input не найден: ${input}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(input);
  const sheetName = wb.SheetNames.includes("phones_to_identify")
    ? "phones_to_identify"
    : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

  const pools = new Map();
  for (const row of rows) {
    const prefix = String(row.prefix_7 ?? "").trim();
    if (!prefix) continue;
    if (!pools.has(prefix)) {
      pools.set(prefix, {
        prefix,
        phones_in_pool: 0,
        total_calls: 0,
        suspicious_count: 0,
        sample_phones: [],
        reasons: new Set(),
      });
    }
    const p = pools.get(prefix);
    p.phones_in_pool++;
    p.total_calls += Number(row.call_count) || 0;
    if (String(row.suspicious_spam ?? "").toLowerCase() === "да") p.suspicious_count++;
    const reason = String(row.suspicious_reason ?? "").trim();
    if (reason) reason.split(";").forEach((r) => p.reasons.add(r.trim()));
    if (p.sample_phones.length < 3) {
      p.sample_phones.push(String(row.incoming_phone_number ?? ""));
    }
  }

  const candidates = [...pools.values()]
    .filter((p) => p.phones_in_pool >= minPool)
    .map((p) => ({
      prefix: p.prefix,
      phones_in_pool: p.phones_in_pool,
      total_calls: p.total_calls,
      suspicious_count: p.suspicious_count,
      confidence: p.suspicious_count >= p.phones_in_pool / 2 ? "high" : "medium",
      pool_note: [...p.reasons].slice(0, 3).join("; "),
      sample_phones: p.sample_phones.join(", "),
      action: "add_to_SPAM_PREFIXES",
    }))
    .sort((a, b) => b.phones_in_pool - a.phones_in_pool);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(candidates), "prefix_candidates");
  XLSX.writeFile(outWb, output);

  console.log(
    `[suggest-spam-prefixes] pools=${pools.size} candidates(>=${minPool})=${candidates.length} -> ${path.relative(PROJECT_ROOT, output)}`
  );
}

main();
