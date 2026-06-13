#!/usr/bin/env node
// Анализирует phones_to_identify.xlsx: префиксы, частые номера, кандидаты в правила.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const DEFAULT_INPUT = resolveDataPath(paths.phonesToIdentify());
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "working", "logs", "unknown-phone-patterns-2026-06-13.xlsx");

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === "--input" || argv[i] === "-i") && argv[i + 1]) args.input = argv[++i];
    else if ((argv[i] === "--output" || argv[i] === "-o") && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim();
}

function normalizePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits[0] === "8") return `7${digits.slice(1)}`;
  return digits;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.input)) {
    console.error(`[analyze-unknown] input не найден: ${args.input}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.input);
  const sheet = wb.Sheets[wb.SheetNames.includes("phones_to_identify") ? "phones_to_identify" : wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }).map((r) => {
    const phone = normalizePhone(r.incoming_phone_number);
    return {
      incoming_phone_number: phone,
      developer_name: norm(r.developer_name),
      note: norm(r["Заметка"] ?? r.note),
      call_count: Number(r.call_count) || 0,
      first_call: norm(r.first_call),
      last_call: norm(r.last_call),
      prefix_7: norm(r.prefix_7) || phone.slice(0, 7),
      suspicious_spam: norm(r.suspicious_spam).toLowerCase(),
      suspicious_reason: norm(r.suspicious_reason),
    };
  }).filter((r) => r.incoming_phone_number);

  const byPrefix = new Map();
  for (const row of rows) {
    const key = row.prefix_7;
    if (!byPrefix.has(key)) {
      byPrefix.set(key, {
        prefix_7: key,
        phones: new Set(),
        total_calls: 0,
        suspicious_yes: 0,
        developer_names: new Set(),
        reasons: new Set(),
      });
    }
    const p = byPrefix.get(key);
    p.phones.add(row.incoming_phone_number);
    p.total_calls += row.call_count;
    if (row.suspicious_spam === "да") p.suspicious_yes++;
    if (row.developer_name) p.developer_names.add(row.developer_name);
    if (row.suspicious_reason) p.reasons.add(row.suspicious_reason);
  }

  const topPrefixes = [...byPrefix.values()]
    .map((p) => ({
      prefix_7: p.prefix_7,
      unique_phones: p.phones.size,
      total_calls: p.total_calls,
      suspicious_yes: p.suspicious_yes,
      developer_names: [...p.developer_names].slice(0, 8).join(" | "),
      reasons: [...p.reasons].slice(0, 5).join(" | "),
    }))
    .sort((a, b) => b.total_calls - a.total_calls || b.unique_phones - a.unique_phones);

  const highCallPhones = rows
    .slice()
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 200);

  const spamPrefixCandidates = topPrefixes
    .filter((p) => p.unique_phones >= 3 && (p.suspicious_yes >= 3 || p.total_calls >= 30))
    .map((p) => ({
      prefix: p.prefix_7,
      confidence: p.suspicious_yes >= 3 ? "high_review" : "medium_review",
      phones_in_pool: p.unique_phones,
      total_calls: p.total_calls,
      reason: p.suspicious_yes >= 3 ? "3+ suspicious phones" : "high call volume",
      notes: p.reasons,
    }));

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(topPrefixes), "top_prefixes");
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(highCallPhones), "high_call_phones");
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(spamPrefixCandidates), "spam_prefix_candidates");
  XLSX.writeFile(out, args.output);

  console.log(JSON.stringify({
    input: path.relative(PROJECT_ROOT, args.input),
    output: path.relative(PROJECT_ROOT, args.output),
    rows: rows.length,
    prefixes: topPrefixes.length,
    spam_prefix_candidates: spamPrefixCandidates.length,
  }, null, 2));
}

main();
