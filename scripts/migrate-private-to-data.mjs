#!/usr/bin/env node
// Перенос файлов из legacy private/ в data/{reference,working,inbound}/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_PRIVATE_ROOT,
  DATA_ROOT,
  paths,
  ensureDataDirs,
  PROJECT_ROOT,
} from "../shared/paths.mjs";

const MIGRATION_MAP = [
  { from: "source.xlsx", to: paths.source() },
  { from: "phone_registry.json", to: paths.phoneRegistry() },
  { from: "phones_to_identify.xlsx", to: paths.phonesToIdentify() },
  { from: "phones_to_review.csv", to: paths.phonesToReview() },
  { from: "spam_prefix_candidates.xlsx", to: paths.spamPrefixCandidates() },
  { from: "phone_overrides.json", to: path.join(DATA_ROOT, "working", "phone_overrides.json") },
  { from: "developer_official_phones.xlsx", to: paths.phoneBook() },
  { from: "spam_book.xlsx", to: paths.spamBook() },
  { from: "sms_mark_reference.csv", to: paths.smsMarkReference() },
  { from: "sms_mark_reference.xlsx", to: paths.smsMarkReferenceXlsx() },
  { from: "incoming_phones.txt", to: path.join(DATA_ROOT, "working", "logs", "incoming_phones.txt") },
  { from: "incoming_phones_lookup.xlsx", to: path.join(DATA_ROOT, "inbound", "manual", "incoming_phones_lookup.xlsx") },
  { from: "developer_phones_cache.json", to: path.join(DATA_ROOT, "working", "logs", "developer_phones_cache.json") },
  { from: "developer_phones_run.log", to: path.join(DATA_ROOT, "working", "logs", "developer_phones_run.log") },
  { from: "lookup_cache.json", to: path.join(DATA_ROOT, "working", "logs", "lookup_cache.json") },
  { from: "lookup_run.log", to: path.join(DATA_ROOT, "working", "logs", "lookup_run.log") },
  { from: "lookup_run2.log", to: path.join(DATA_ROOT, "working", "logs", "lookup_run2.log") },
  { from: "lookup_run3.log", to: path.join(DATA_ROOT, "working", "logs", "lookup_run3.log") },
];

function parseArgs(argv) {
  return { apply: argv.includes("--apply") };
}

function draftManifest(moved) {
  const rel = (abs) => path.relative(DATA_ROOT, abs).split(path.sep).join("/");
  return {
    updated: new Date().toISOString(),
    migrated_from: "private/",
    source: {
      working: moved.includes("source.xlsx") ? "working/source.xlsx" : undefined,
      derived_from: [],
      last_step: "migrate-private-to-data",
    },
    reference: {
      phone_book: moved.includes("developer_official_phones.xlsx")
        ? "reference/developer_official_phones.xlsx"
        : undefined,
      spam_book: moved.includes("spam_book.xlsx") ? "reference/spam_book.xlsx" : undefined,
      sms_mark: moved.includes("sms_mark_reference.csv")
        ? "reference/sms_mark_reference.csv"
        : moved.includes("sms_mark_reference.xlsx")
          ? "reference/sms_mark_reference.xlsx"
          : undefined,
    },
    registry: {
      path: moved.includes("phone_registry.json") ? "working/phone_registry.json" : undefined,
      seeded_from: [],
    },
    files: Object.fromEntries(
      MIGRATION_MAP.filter(({ from }) => moved.includes(from)).map(({ from, to }) => [
        from,
        rel(to),
      ])
    ),
  };
}

function main() {
  const { apply } = parseArgs(process.argv);
  if (!fs.existsSync(LEGACY_PRIVATE_ROOT)) {
    console.log("[migrate] private/ не найден — нечего переносить.");
    return;
  }

  ensureDataDirs();
  const actions = [];

  for (const { from, to } of MIGRATION_MAP) {
    const src = path.join(LEGACY_PRIVATE_ROOT, from);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(to)) {
      actions.push({ from, to, status: "skip_exists" });
      continue;
    }
    actions.push({ from, to, status: apply ? "move" : "would_move" });
    if (apply) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(src, to);
    }
  }

  for (const a of actions) {
    const relTo = path.relative(PROJECT_ROOT, a.to);
    if (a.status === "skip_exists") {
      console.log(`[migrate] skip (exists): ${a.from} -> ${relTo}`);
    } else {
      console.log(`[migrate] ${a.status}: ${a.from} -> ${relTo}`);
    }
  }

  if (!apply) {
    console.log("\n[migrate] dry-run. Добавьте --apply для переноса.");
    return;
  }

  const moved = actions.filter((a) => a.status === "move").map((a) => a.from);
  if (moved.length && !fs.existsSync(paths.manifest())) {
    const example = path.join(DATA_ROOT, "manifest.example.json");
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, paths.manifest());
    }
    const manifest = draftManifest(moved);
    fs.writeFileSync(paths.manifest(), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`[migrate] manifest -> ${path.relative(PROJECT_ROOT, paths.manifest())}`);
  }

  const remaining = fs.readdirSync(LEGACY_PRIVATE_ROOT).filter((n) => n !== ".DS_Store");
  if (remaining.length === 0) {
    console.log("[migrate] private/ пуст — можно удалить каталог вручную.");
  } else if (remaining.length) {
    console.log(`[migrate] осталось в private/: ${remaining.join(", ")}`);
  }
}

main();
