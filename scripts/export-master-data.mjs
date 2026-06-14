#!/usr/bin/env node
// Master raw data export: source.xlsx + joined calculated sheets.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  readEventsFromWorkbook,
  readApplicationsFromWorkbook,
  readLegendCatalog,
  EVENT_FIELDS,
} from "../build/source.mjs";
import { aggregate, mergeLegendDevelopers, isInAnalyticsWindow } from "../build/aggregate.mjs";
import { computeMarket, computeSpamShare } from "../shared/market.mjs";
import { normalizePhone } from "../shared/phone-registry.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { ANALYTICS_WINDOW_HOURS, MESSENGER_CHANNELS } from "../shared/metrics.mjs";
import { paths, resolveDataPath, writeDataPath, PROJECT_ROOT, ensureDataDirs } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_REGISTRY = resolveDataPath(paths.phoneRegistry());
const DEFAULT_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "master_data.xlsx")
);

const RAW_SHEET_MAP = [
  ["legend", "raw_legend"],
  ["phone_book", "raw_phone_book"],
  ["sms_book", "raw_sms_book"],
  ["applications", "raw_applications"],
  ["events_sms_calls", "raw_events_sms_calls"],
  ["events_messengers", "raw_events_messengers"],
  ["devices", "raw_devices"],
  ["spam_prefixes", "raw_spam_prefixes"],
  ["spam_phones", "raw_spam_phones"],
];

const MASTER_EVENT_EXTRA = [
  "_sheet",
  "incoming_phone_number_norm",
  "phone_number_norm",
  "is_identified",
  "is_matched_to_application",
  "is_in_72h_window",
  "is_recontact",
  "phone_entity_type",
  "phone_source",
  "phone_confidence",
  "registry_developer_id",
  "registry_developer_name",
  "registry_url",
];

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, registry: DEFAULT_REGISTRY, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--registry" && argv[i + 1]) args.registry = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function cell(row, i) {
  if (i == null || i < 0) return "";
  const v = row[i];
  return v == null ? "" : v;
}

function num(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normSheetKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findSheetName(wb, candidates) {
  const byNorm = new Map(wb.SheetNames.map((n) => [normSheetKey(n), n]));
  for (const c of candidates) {
    const hit = byNorm.get(normSheetKey(c));
    if (hit) return hit;
  }
  return null;
}

function sheetToRows(ws) {
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
}

function rowsToSheet(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function copyRawSheets(sourceWb) {
  const copied = {};
  for (const [sourceName, targetName] of RAW_SHEET_MAP) {
    const actual = findSheetName(sourceWb, [sourceName]);
    if (!actual) continue;
    const rows = sheetToRows(sourceWb.Sheets[actual]);
    copied[targetName] = { rows, sourceSheet: actual };
  }
  return copied;
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) return { phones: {} };
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function registryLookup(registry, phone) {
  const entry = registry.phones?.[phone];
  if (!entry) {
    return {
      phone_entity_type: "",
      phone_source: "",
      phone_confidence: "",
      registry_developer_id: "",
      registry_developer_name: "",
      registry_url: "",
    };
  }
  return {
    phone_entity_type: entry.entity_type ?? "",
    phone_source: entry.source ?? "",
    phone_confidence: entry.confidence ?? "",
    registry_developer_id: entry.developer_id ?? "",
    registry_developer_name: entry.developer_name ?? "",
    registry_url: entry.url ?? "",
  };
}

function readFullEventsFromSheet(ws, sheetName) {
  const rows = sheetToRows(ws);
  if (!rows.length) return [];

  const header = rows[0].map((h) => String(h ?? "").trim());
  const idx = {};
  for (let i = 0; i < header.length; i++) idx[header[i]] = i;
  for (const f of EVENT_FIELDS) {
    if (idx[f] == null) idx[f] = header.indexOf(f);
  }

  const eventIdIdx = idx.event_id;
  const isDataRow = (row) => /^E-/i.test(String(row?.[eventIdIdx] ?? "").trim());
  const isMessenger = /messenger/i.test(sheetName);
  const startRow = isMessenger && rows.length > 1 && !isDataRow(rows[1]) ? 2 : isDataRow(rows[1]) ? 1 : 2;

  const out = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const eventId = String(row[eventIdIdx] ?? "").trim();
    const channel = norm(row[idx.event_channel]);
    const hasEventId = Boolean(eventId);
    if (!hasEventId && channel !== "call") continue;
    if (!hasEventId && channel === "call" && !String(row[idx.incoming_phone_number] ?? "").trim()) continue;

    const record = { _sheet: sheetName, _row: r + 1 };
    for (const [name, colIdx] of Object.entries(idx)) {
      if (colIdx >= 0) record[name] = row[colIdx];
    }
    out.push(record);
  }
  return out;
}

function readAllFullEvents(sourceWb) {
  const events = [];
  for (const { sheetName } of resolveEventSheets(sourceWb.SheetNames)) {
    const ws = sourceWb.Sheets[sheetName];
    if (!ws) continue;
    events.push(...readFullEventsFromSheet(ws, sheetName));
  }
  return events;
}

function toAnalyticsEvent(rec) {
  return {
    application_id: String(rec.application_id ?? "").trim(),
    developer_id: String(rec.developer_id ?? "").trim(),
    developer_name: String(rec.developer_name ?? "").trim(),
    url: String(rec.url ?? "").trim(),
    event_channel: norm(rec.event_channel),
    lead_response_time: num(rec.lead_response_time),
    recontact: norm(rec.recontact),
    is_marked: norm(rec.is_marked),
    identified: norm(rec.identified),
    application_datetime: rec.application_datetime ?? null,
  };
}

function buildMasterEvents(fullEvents, registry) {
  const rows = [];
  for (const rec of fullEvents) {
    const incomingNorm = normalizePhone(rec.incoming_phone_number);
    const phoneNorm = normalizePhone(rec.phone_number);
    const analytics = toAnalyticsEvent(rec);
    const reg = registryLookup(registry, incomingNorm);
    const enriched = {
      ...rec,
      incoming_phone_number_norm: incomingNorm,
      phone_number_norm: phoneNorm,
      is_identified: analytics.identified === "да" ? "да" : "нет",
      is_matched_to_application: /^APP-/i.test(analytics.application_id) ? "да" : "нет",
      is_in_72h_window: isInAnalyticsWindow(analytics) ? "да" : "нет",
      is_recontact: analytics.recontact === "да" ? "да" : "нет",
      ...reg,
    };
    rows.push(enriched);
  }
  return rows;
}

function masterEventsHeaders(rows) {
  const keys = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!k.startsWith("_row")) keys.add(k);
    }
  }
  const base = [];
  for (const f of EVENT_FIELDS) if (keys.has(f)) base.push(f);
  for (const k of keys) {
    if (!EVENT_FIELDS.includes(k) && k !== "_sheet" && !MASTER_EVENT_EXTRA.includes(k)) base.push(k);
  }
  return [...base, ...MASTER_EVENT_EXTRA.filter((k) => k !== "_sheet" || keys.has("_sheet"))];
}

function buildMasterApplications(applications, events) {
  const byApp = new Map();
  for (const e of events) {
    if (!isInAnalyticsWindow(e)) continue;
    const appId = e.application_id;
    if (!appId) continue;
    if (!byApp.has(appId)) byApp.set(appId, []);
    byApp.get(appId).push(e);
  }

  const rows = [];
  for (const app of applications) {
    const appEvents = byApp.get(app.application_id) ?? [];
    const responseTimes = appEvents
      .map((e) => e.lead_response_time)
      .filter((v) => typeof v === "number" && v >= 0);
    const callTimes = appEvents
      .filter((e) => e.event_channel === "call")
      .map((e) => e.lead_response_time)
      .filter((v) => typeof v === "number" && v >= 0);

    const channelCounts = Object.fromEntries(MESSENGER_CHANNELS.map((c) => [c, 0]));
    channelCounts.call = 0;
    for (const e of appEvents) {
      if (e.event_channel === "call") channelCounts.call++;
      else if (channelCounts[e.event_channel] != null) channelCounts[e.event_channel]++;
    }

    const hasResponse = appEvents.length > 0;
    const hasCall = channelCounts.call > 0;

    rows.push({
      application_id: app.application_id,
      developer_id: app.developer_id,
      developer_name: app.developer_name,
      url: app.url,
      phone_number: app.phone_number,
      phone_number_norm: normalizePhone(app.phone_number),
      application_datetime: app.application_datetime,
      first_response_minutes: responseTimes.length ? Math.min(...responseTimes) : null,
      first_call_minutes: callTimes.length ? Math.min(...callTimes) : null,
      touches_total: appEvents.length,
      call_touches: channelCounts.call,
      messenger_touches: MESSENGER_CHANNELS.reduce((s, c) => s + channelCounts[c], 0),
      sms_touches: channelCounts.sms,
      max_touches: channelCounts.max,
      whatsapp_touches: channelCounts.whatsapp,
      telegram_touches: channelCounts.telegram,
      has_response_72h: hasResponse ? "да" : "нет",
      has_call_72h: hasCall ? "да" : "нет",
      no_call_72h: hasCall ? "нет" : "да",
    });
  }
  return rows;
}

function buildDeveloperIdMap(applications, legendCatalog) {
  const byName = new Map();
  for (const app of applications) {
    if (app.developer_id && app.developer_name) {
      byName.set(norm(app.developer_name), app.developer_id);
    }
  }
  for (const entry of legendCatalog) {
    if (entry.developer_id && entry.developer_name) {
      byName.set(norm(entry.developer_name), entry.developer_id);
    }
  }
  return byName;
}

function buildMasterDevelopers(developers, developerIdByName) {
  return developers.map((d) => ({
    developer_id: developerIdByName.get(norm(d.developer_name)) ?? "",
    developer_name: d.developer_name,
    url: d.url,
    applications_sent: d.applications_sent,
    insufficient_data: d.insufficient_data ? "да" : "нет",
    avg_response: d.avg_response,
    avg_call_response: d.avg_call_response,
    no_callback_share: d.no_callback_share,
    no_call_share: d.no_call_share,
    avg_recontacts: d.avg_recontacts,
    total_touches: d.total_touches,
    max_touches_per_app: d.max_touches_per_app,
    avg_touches_per_responded_app: d.avg_touches_per_responded_app,
    messenger_penetration_share: d.messenger_penetration_share,
    channel_share_sms: d.channel_share?.sms ?? null,
    channel_share_max: d.channel_share?.max ?? null,
    channel_share_whatsapp: d.channel_share?.whatsapp ?? null,
    channel_share_telegram: d.channel_share?.telegram ?? null,
    channel_share_call: d.channel_share?.call ?? null,
    messenger_channel_share_sms: d.messenger_channel_share?.sms ?? null,
    messenger_channel_share_max: d.messenger_channel_share?.max ?? null,
    messenger_channel_share_whatsapp: d.messenger_channel_share?.whatsapp ?? null,
    messenger_channel_share_telegram: d.messenger_channel_share?.telegram ?? null,
  }));
}

function buildMarketSummary(developers, events) {
  const market = computeMarket(developers);
  const spam = computeSpamShare(events);
  return [
    { metric: "sample_size", value: market.sample_size },
    { metric: "silent_developers_count", value: market.silent_developers_count },
    { metric: "slow_response_count", value: market.slow_response_count },
    { metric: "avg_response_mean", value: market.avg_response?.mean ?? null },
    { metric: "avg_response_best", value: market.avg_response?.best ?? null },
    { metric: "no_callback_share_mean", value: market.no_callback_share?.mean ?? null },
    { metric: "no_callback_share_best", value: market.no_callback_share?.best ?? null },
    { metric: "messengers_mean", value: market.messengers?.mean ?? null },
    { metric: "messengers_best", value: market.messengers?.best ?? null },
    { metric: "messengers_sms", value: market.messengers?.channels?.sms ?? null },
    { metric: "messengers_max", value: market.messengers?.channels?.max ?? null },
    { metric: "messengers_whatsapp", value: market.messengers?.channels?.whatsapp ?? null },
    { metric: "messengers_telegram", value: market.messengers?.channels?.telegram ?? null },
    { metric: "spam_share_mean", value: spam.mean },
    { metric: "spam_total_events", value: spam.total },
    { metric: "spam_events", value: spam.spam },
  ];
}

function buildPhoneRegistrySheet(registry) {
  const rows = [];
  for (const [raw, entry] of Object.entries(registry.phones ?? {})) {
    rows.push({
      phone_number: normalizePhone(raw) || raw,
      entity_type: entry.entity_type ?? "",
      source: entry.source ?? "",
      confidence: entry.confidence ?? "",
      developer_id: entry.developer_id ?? "",
      developer_name: entry.developer_name ?? "",
      url: entry.url ?? "",
      note: entry.note ?? "",
      spam_source: entry.spam_source ?? "",
    });
  }
  rows.sort((a, b) => String(a.phone_number).localeCompare(String(b.phone_number)));
  return rows;
}

function objectsToSheet(rows, headers = null) {
  if (!rows.length) return rowsToSheet([headers ?? []]);
  const cols = headers ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const out = [cols];
  for (const row of rows) {
    out.push(cols.map((c) => row[c] ?? ""));
  }
  return rowsToSheet(out);
}

function buildExportMeta({ source, output, registry, rawCopied, counts }) {
  const generatedAt = new Date().toISOString();
  const rows = [
    ["key", "value"],
    ["generated_at", generatedAt],
    ["source_path", path.relative(PROJECT_ROOT, source)],
    ["output_path", path.relative(PROJECT_ROOT, output)],
    ["registry_path", path.relative(PROJECT_ROOT, registry)],
    ["analytics_window_hours", ANALYTICS_WINDOW_HOURS],
    ["raw_sheets_copied", rawCopied.length],
    ...rawCopied.map((s) => [`raw_sheet_${s.target}`, `${s.source} (${s.rows} rows)`]),
    ...Object.entries(counts).map(([k, v]) => [`count_${k}`, v]),
  ];
  return rowsToSheet(rows);
}

function main() {
  const { source, registry: registryPath, output } = parseArgs(process.argv);
  if (!fs.existsSync(source)) {
    console.error(`[export-master-data] source не найден: ${source}`);
    process.exit(1);
  }

  const sourceWb = XLSX.readFile(source, { cellDates: true });
  const registry = loadRegistry(registryPath);

  const rawCopied = [];
  const outWb = XLSX.utils.book_new();

  const rawSheets = copyRawSheets(sourceWb);
  for (const [targetName, { rows, sourceSheet }] of Object.entries(rawSheets)) {
    XLSX.utils.book_append_sheet(outWb, rowsToSheet(rows), targetName);
    rawCopied.push({ target: targetName, source: sourceSheet, rows: Math.max(0, rows.length - 1) });
  }

  const events = readEventsFromWorkbook(sourceWb);
  const applications = readApplicationsFromWorkbook(sourceWb);
  const legendCatalog = readLegendCatalog(sourceWb);
  const fullEvents = readAllFullEvents(sourceWb);

  const masterEvents = buildMasterEvents(fullEvents, registry);
  const masterEventsHdrs = masterEventsHeaders(masterEvents);
  XLSX.utils.book_append_sheet(outWb, objectsToSheet(masterEvents, masterEventsHdrs), "master_events");

  const masterApplications = buildMasterApplications(applications, events);
  XLSX.utils.book_append_sheet(outWb, objectsToSheet(masterApplications), "master_applications");

  const developers = mergeLegendDevelopers(aggregate(events, applications), legendCatalog);
  const developerIdByName = buildDeveloperIdMap(applications, legendCatalog);
  const masterDevelopers = buildMasterDevelopers(developers, developerIdByName);
  XLSX.utils.book_append_sheet(outWb, objectsToSheet(masterDevelopers), "master_developers");

  const marketSummary = buildMarketSummary(developers, events);
  XLSX.utils.book_append_sheet(outWb, objectsToSheet(marketSummary, ["metric", "value"]), "market_summary");

  const phoneRegistryRows = buildPhoneRegistrySheet(registry);
  XLSX.utils.book_append_sheet(outWb, objectsToSheet(phoneRegistryRows), "phone_registry");

  const counts = {
    master_events: masterEvents.length,
    master_applications: masterApplications.length,
    master_developers: masterDevelopers.length,
    phone_registry: phoneRegistryRows.length,
    market_summary: marketSummary.length,
  };

  XLSX.utils.book_append_sheet(
    outWb,
    buildExportMeta({ source, output, registry: registryPath, rawCopied, counts }),
    "export_meta"
  );

  ensureDataDirs();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  XLSX.writeFile(outWb, output);

  console.log(
    `[export-master-data] ${JSON.stringify({ raw_sheets: rawCopied.length, ...counts })} -> ${path.relative(PROJECT_ROOT, output)}`
  );
}

main();
