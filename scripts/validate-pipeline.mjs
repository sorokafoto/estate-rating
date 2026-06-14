#!/usr/bin/env node
// QA-отчёт по data/working/source.xlsx перед финальной сборкой рейтинга.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { ANALYTICS_WINDOW_MINUTES } from "../shared/metrics.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { readEventsFromSheet, readApplicationsFromWorkbook, readLegendCatalog } from "../build/source.mjs";
import { aggregate, mergeLegendDevelopers, isInAnalyticsWindow } from "../build/aggregate.mjs";
import { paths, resolveDataPath, PROJECT_ROOT } from "../shared/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DATA_JSON = path.join(PROJECT_ROOT, "data.json");
const TARGET_APPLICATIONS = 2100;
const EXPECTED_DEVELOPERS = 100;

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, strict: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--strict") args.strict = true;
  }
  return args;
}

function numLeadTime(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function analyzeRows(rows) {
  const byChannel = {};
  let matched = 0;
  let identifiedYes = 0;
  let identifiedNo = 0;
  let outside72h = 0;
  let inAnalytics = 0;
  const devIds = new Set();

  for (const row of rows) {
    const ch = String(row.event_channel ?? "").trim().toLowerCase() || "unknown";
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;

    const appId = String(row.application_id ?? "").trim();
    if (appId) matched++;

    const identified = String(row.identified ?? "").trim().toLowerCase();
    if (identified === "да") identifiedYes++;
    else if (identified === "нет") identifiedNo++;

    const lt = numLeadTime(row.lead_response_time);
    if (lt != null && lt > ANALYTICS_WINDOW_MINUTES) outside72h++;

    const devId = String(row.developer_id ?? "").trim();
    if (devId) devIds.add(devId);

    if (isInAnalyticsWindow(row)) inAnalytics++;
  }

  return {
    events_total: rows.length,
    events_by_channel: byChannel,
    matched_with_application_id: matched,
    matched_pct: rows.length ? Math.round((matched / rows.length) * 100) : 0,
    identified_yes: identifiedYes,
    identified_no: identifiedNo,
    outside_72h_lead_time: outside72h,
    in_analytics_window: inAnalytics,
    unique_developers: devIds.size,
  };
}

function readAllEvents(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    console.error(`[validate-pipeline] source не найден: ${sourcePath}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(sourcePath, { cellDates: true });
  const sheets = resolveEventSheets(wb.SheetNames);
  if (!sheets.length) {
    console.error(`[validate-pipeline] листы событий не найдены`);
    process.exit(1);
  }

  const bySheet = {};
  const allRows = [];
  for (const { sheetName } of sheets) {
    const rows = readEventsFromSheet(wb.Sheets[sheetName], sheetName);
    bySheet[sheetName] = analyzeRows(rows);
    allRows.push(...rows);
  }

  const applications = readApplicationsFromWorkbook(wb);
  const legendCatalog = readLegendCatalog(wb);
  const devsWithApps = new Set(applications.map((a) => a.developer_id));
  const developers = mergeLegendDevelopers(aggregate(allRows, applications), legendCatalog);
  const withoutResponse = developers
    .filter((d) => !d.insufficient_data && d.avg_response == null)
    .map((d) => d.developer_name)
    .sort((a, b) => a.localeCompare(b, "ru"));

  let developersInOutput = developers.length;
  if (fs.existsSync(DATA_JSON)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_JSON, "utf8"));
      developersInOutput = data?.meta?.developers_count ?? data?.developers?.length ?? developersInOutput;
    } catch {
      /* ignore stale json */
    }
  }

  return {
    bySheet,
    total: analyzeRows(allRows),
    sheets: sheets.map((s) => s.sheetName),
    applications_total_valid: applications.length,
    developers_with_applications: devsWithApps.size,
    legend_catalog_count: legendCatalog.length,
    developers_in_output: developersInOutput,
    developers_without_response_count: withoutResponse.length,
    developers_without_response: withoutResponse,
    aggregate_preview_count: developers.length,
  };
}

function main() {
  const { source, strict } = parseArgs(process.argv);
  const {
    bySheet,
    total,
    sheets,
    applications_total_valid,
    developers_with_applications,
    legend_catalog_count,
    developers_in_output,
    developers_without_response_count,
    developers_without_response,
    aggregate_preview_count,
  } = readAllEvents(source);

  const report = {
    source: path.relative(PROJECT_ROOT, source),
    event_sheets: sheets,
    ...total,
    by_sheet: bySheet,
    applications_total_valid,
    developers_with_applications,
    legend_catalog_count,
    developers_in_output,
    developers_without_response_count,
    developers_without_response,
    aggregate_preview_count,
    target_applications: TARGET_APPLICATIONS,
    expected: {
      developers: EXPECTED_DEVELOPERS,
      analytics_window_minutes: ANALYTICS_WINDOW_MINUTES,
    },
    warnings: [],
  };

  if (total.outside_72h_lead_time > 0) {
    report.warnings.push(
      `${total.outside_72h_lead_time} events with lead_response_time > ${ANALYTICS_WINDOW_MINUTES} (excluded from metrics)`
    );
  }
  if (legend_catalog_count && legend_catalog_count !== EXPECTED_DEVELOPERS) {
    report.warnings.push(`legend_catalog_count ${legend_catalog_count} != ${EXPECTED_DEVELOPERS}`);
  }
  if (aggregate_preview_count !== legend_catalog_count && legend_catalog_count) {
    report.warnings.push(
      `aggregate+legend count ${aggregate_preview_count} != legend_catalog_count ${legend_catalog_count}`
    );
  }
  if (developers_with_applications > EXPECTED_DEVELOPERS) {
    report.warnings.push(
      `developers_with_applications ${developers_with_applications} > ${EXPECTED_DEVELOPERS}`
    );
  }
  if (fs.existsSync(DATA_JSON) && developers_in_output !== aggregate_preview_count) {
    report.warnings.push(
      `data.json developers_count ${developers_in_output} != aggregate+legend ${aggregate_preview_count} (run build-data)`
    );
  }

  console.log(JSON.stringify(report, null, 2));

  if (strict) {
    const failed =
      total.outside_72h_lead_time > 0 ||
      aggregate_preview_count !== EXPECTED_DEVELOPERS ||
      (legend_catalog_count && aggregate_preview_count !== legend_catalog_count);
    if (failed) {
      console.error("[validate-pipeline] FAILED (--strict)");
      process.exit(1);
    }
  }
}

main();
