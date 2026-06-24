#!/usr/bin/env node
// Воспроизводимые метрики для ретро Q2 2026: source.xlsx + company-events/.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  readEventsFromWorkbook,
  readApplicationsFromWorkbook,
  SOURCE_PATH,
} from "../build/source.mjs";
import {
  computeCallClassificationBreakdown,
  computeOrphanBreakdown,
  compareToQ3Targets,
  Q3_TARGETS,
} from "../shared/cycle-metrics.mjs";
import { PROJECT_ROOT, paths, resolveDataPath, writeDataPath } from "../shared/paths.mjs";
import { computeWeekendMetrics } from "../shared/weekend-first-call.mjs";

const DEFAULT_EVENTS_DIR = path.resolve(
  PROJECT_ROOT,
  "..",
  "developer-rating-dashboard",
  "company-events"
);
const DEFAULT_OUTPUT_JSON = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "retro-2026-q2-metrics.json")
);
const DEFAULT_OUTPUT_MD = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "retro-2026-q2-metrics.md")
);

const TARGET_APPLICATIONS = 2100;
const PLANNED_APPS_PER_DEV = 21;

function parseArgs(argv) {
  const args = {
    source: SOURCE_PATH,
    eventsDir: DEFAULT_EVENTS_DIR,
    outJson: DEFAULT_OUTPUT_JSON,
    outMd: DEFAULT_OUTPUT_MD,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--events-dir" && argv[i + 1]) args.eventsDir = argv[++i];
    else if (argv[i] === "--out-json" && argv[i + 1]) args.outJson = argv[++i];
    else if (argv[i] === "--out-md" && argv[i + 1]) args.outMd = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function isIdentified(e) {
  return norm(e.identified) === "да";
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function fmtInt(n) {
  return Number(n).toLocaleString("ru-RU");
}

function computeIdentificationMetrics(events) {
  const all = events.length;
  const identified = events.filter(isIdentified).length;
  const calls = events.filter((e) => norm(e.event_channel) === "call");
  const callsIdentified = calls.filter(isIdentified).length;

  return {
    all_events: all,
    identified,
    identified_share_pct: pct(identified, all),
    unidentified: all - identified,
    unidentified_share_pct: pct(all - identified, all),
    calls: calls.length,
    calls_identified: callsIdentified,
    calls_identified_share_pct: pct(callsIdentified, calls.length),
    calls_unidentified: calls.length - callsIdentified,
    calls_unidentified_share_pct: pct(calls.length - callsIdentified, calls.length),
  };
}

function appsByDeveloper(applications) {
  const byDev = new Map();
  for (const app of applications) {
    const key = app.developer_id || app.developer_name;
    if (!byDev.has(key)) {
      byDev.set(key, {
        developer_id: app.developer_id,
        developer_name: app.developer_name,
        url: app.url,
        count: 0,
      });
    }
    byDev.get(key).count += 1;
  }
  return [...byDev.values()];
}

function computeApplicationMetrics(applications) {
  const sent = applications.length;
  const byDev = appsByDeveloper(applications);
  const full = byDev.filter((d) => d.count >= PLANNED_APPS_PER_DEV);
  const partial = byDev.filter(
    (d) => d.count >= 11 && d.count < PLANNED_APPS_PER_DEV
  );
  const belowQuorum = byDev
    .filter((d) => d.count < 11)
    .sort((a, b) => a.count - b.count || a.developer_name.localeCompare(b.developer_name, "ru"));

  const ssk = byDev.find((d) => norm(d.url).includes("sskuban"));

  return {
    target_applications: TARGET_APPLICATIONS,
    sent,
    gap: sent - TARGET_APPLICATIONS,
    sent_share_pct: pct(sent, TARGET_APPLICATIONS),
    developers_with_full_quota: full.length,
    developers_partial_11_20: partial.length,
    developers_below_quorum: belowQuorum.map((d) => ({
      developer_name: d.developer_name,
      url: d.url,
      applications_sent: d.count,
    })),
    ssk: ssk
      ? {
          developer_name: ssk.developer_name,
          url: ssk.url,
          applications_sent: ssk.count,
        }
      : { developer_name: "ССК", url: "sskuban.ru", applications_sent: 0 },
  };
}

function loadCompanyEvents(eventsDir) {
  if (!fs.existsSync(eventsDir)) return [];
  return fs
    .readdirSync(eventsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(eventsDir, f), "utf8")));
}

function renderMarkdown(metrics) {
  const id = metrics.identification;
  const cls = metrics.call_classification;
  const orphans = metrics.orphans;
  const targets = metrics.q3_targets;
  const apps = metrics.applications;
  const wk = metrics.weekend_hypothesis.market;
  const dist = metrics.weekend_hypothesis.app_distribution;

  const orphanReasonLines = Object.entries(orphans.orphan_reasons ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `| ${reason} | **${fmtInt(count)}** |`)
    .join("\n");

  const topUnknownLines = (cls.top_unknown_in_72h_phones ?? [])
    .slice(0, 10)
    .map((r) => `| ${r.phone} | **${r.call_count}** |`)
    .join("\n");

  const lines = [
    "<!-- generated by scripts/export-retro-metrics.mjs -->",
    "",
    "### Идентификация (фрагмент)",
    "",
    `| Метрика | Значение |`,
    `|---------|----------|`,
    `| Все входящие события | **${fmtInt(id.all_events)}** |`,
    `| Идентифицированы | **${fmtInt(id.identified)}** (**${id.identified_share_pct}%**) |`,
    `| Не идентифицированы | **${fmtInt(id.unidentified)}** (**${id.unidentified_share_pct}%**) |`,
    `| Только звонки | **${fmtInt(id.calls)}** |`,
    `| Звонки идентифицированы | **${fmtInt(id.calls_identified)}** (**${id.calls_identified_share_pct}%**) |`,
    `| Звонки не идентифицированы | **${fmtInt(id.calls_unidentified)}** (**${id.calls_unidentified_share_pct}%**) |`,
    "",
    "### Классификация звонков",
    "",
    `| Категория | Звонков | % |`,
    `|-----------|---------|---|`,
    `| Застройщик (id.) | **${fmtInt(cls.developer)}** | **${cls.developer_share_pct}%** |`,
    `| Spam | **${fmtInt(cls.spam)}** | **${cls.spam_share_pct}%** |`,
    `| Unknown | **${fmtInt(cls.unknown)}** | **${cls.unknown_share_pct}%** |`,
    `| Unknown в 72 ч на том же SIM | **${fmtInt(cls.unknown_in_72h_same_sim)}** | **${cls.unknown_in_72h_same_sim_share_pct}%** |`,
    "",
    "### Сироты (id. звонки без рейтинга)",
    "",
    `| Метрика | Значение |`,
    `|---------|----------|`,
    `| Id. звонков | **${fmtInt(orphans.identified_calls)}** |`,
    `| В рейтинге | **${fmtInt(orphans.matched_in_rating)}** (**${orphans.matched_in_rating_share_pct}%**) |`,
    `| Сироты | **${fmtInt(orphans.orphans)}** (**${orphans.orphan_share_pct}%**) |`,
    `| Ложные «должен_быть_сматчен» | **${fmtInt(orphans.should_match_false_positives)}** |`,
    "",
    "| Причина сироты | Кол-во |",
    "|----------------|--------|",
    orphanReasonLines || "| — | — |",
    "",
    "### Top unknown-in-72h (кандидаты в PHONE_BOOK)",
    "",
    "| Номер | Звонков в 72 ч |",
    "|-------|----------------|",
    topUnknownLines || "| — | — |",
    "",
    "### Цели Q3",
    "",
    `| KPI | Факт | Цель | OK |`,
    `|-----|------|------|-----|`,
    `| identified_share (calls) | ${targets.identified_share_calls_pct.actual}% | ≥ ${targets.identified_share_calls_pct.target}% | ${targets.identified_share_calls_pct.met ? "да" : "нет"} |`,
    `| unknown_share | ${targets.unknown_share_calls_pct.actual}% | ≤ ${targets.unknown_share_calls_pct.target}% | ${targets.unknown_share_calls_pct.met ? "да" : "нет"} |`,
    `| orphan_share (id.) | ${targets.orphan_share_identified_calls_pct.actual}% | ≤ ${targets.orphan_share_identified_calls_pct.target}% | ${targets.orphan_share_identified_calls_pct.met ? "да" : "нет"} |`,
    `| до_заявки (id.) | ${targets.before_application.actual_share_pct}% (${targets.before_application.actual}) | ≤ ${targets.before_application.target_share_pct}% | — |`,
    `| ложные should_match | ${targets.should_match_false_positives.actual} | ${targets.should_match_false_positives.target} | ${targets.should_match_false_positives.met ? "да" : "нет"} |`,
    "",
    "### Заявки (фрагмент)",
    "",
    `| Метрика | Значение |`,
    `|---------|----------|`,
    `| Цель | **${fmtInt(apps.target_applications)}** |`,
    `| Отправлено | **${fmtInt(apps.sent)}** (**${apps.gap >= 0 ? "+" : ""}${apps.gap}**, ${apps.sent_share_pct}%) |`,
    `| Застройщиков с ≥21 заявкой | **${apps.developers_with_full_quota}** |`,
    `| С кворумом 11–20 | **${apps.developers_partial_11_20}** |`,
    "",
    "### Выходные vs будни (фрагмент)",
    "",
    `| Срез | N | Медиана, мин |`,
    `|------|---|--------------|`,
    `| Будни | ${wk.weekday_apps_with_first_call.n} | **${wk.weekday_apps_with_first_call.median_minutes}** |`,
    `| Выходные | ${wk.weekend_apps_with_first_call.n} | **${wk.weekend_apps_with_first_call.median_minutes}** |`,
    `| Утро | ${wk.morning.n} | **${wk.morning.median_minutes}** |`,
    `| День | ${wk.afternoon.n} | **${wk.afternoon.median_minutes}** |`,
    `| Вечер | ${wk.evening.n} | **${wk.evening.median_minutes}** |`,
    "",
    `Распределение заявок: **${fmtInt(dist.weekday)}** будни / **${fmtInt(dist.weekend)}** выходные (всего **${fmtInt(dist.total)}**).`,
    "",
  ];

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`source not found: ${args.source}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source);
  const events = readEventsFromWorkbook(wb);
  const applications = readApplicationsFromWorkbook(wb);
  const companies = loadCompanyEvents(args.eventsDir);
  const callClassification = computeCallClassificationBreakdown(wb);
  const orphans = computeOrphanBreakdown(wb);

  const metrics = {
    generated_at: new Date().toISOString(),
    source: args.source,
    company_events_dir: args.eventsDir,
    identification: computeIdentificationMetrics(events),
    call_classification: callClassification,
    orphans,
    q3_targets: compareToQ3Targets(callClassification, orphans),
    q3_target_constants: Q3_TARGETS,
    applications: computeApplicationMetrics(applications),
    weekend_hypothesis: computeWeekendMetrics(companies),
  };

  fs.mkdirSync(path.dirname(args.outJson), { recursive: true });
  fs.writeFileSync(args.outJson, JSON.stringify(metrics, null, 2) + "\n", "utf8");
  fs.writeFileSync(args.outMd, renderMarkdown(metrics) + "\n", "utf8");

  console.log(`Wrote ${args.outJson}`);
  console.log(`Wrote ${args.outMd}`);
}

main();
