#!/usr/bin/env node
// Match events to applications by developer_id + phone_number + nearest previous application_datetime.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { paths, resolveDataPath, writeDataPath } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_WINDOW_HOURS = 72;

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, appsSheet: "applications", windowHours: DEFAULT_WINDOW_HOURS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--apps-sheet" && argv[i + 1]) args.appsSheet = argv[++i];
    else if (argv[i] === "--window-hours" && argv[i + 1]) args.windowHours = Number(argv[++i]);
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

function headerMap(header) {
  const out = new Map();
  header.forEach((h, i) => out.set(norm(h), i));
  return out;
}

function col(header, map, name) {
  let i = map.get(name);
  if (i == null) {
    i = header.length;
    header.push(name);
    map.set(name, i);
  }
  return i;
}

function excelDateToDate(n) {
  const parsed = XLSX.SSF.parse_date_code(n);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S || 0));
}

export function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v)) return v;
  if (typeof v === "number") return excelDateToDate(v);
  const text = norm(v);
  if (!text) return null;
  const dotted = text.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dotted) {
    return new Date(
      Number(dotted[3]),
      Number(dotted[2]) - 1,
      Number(dotted[1]),
      Number(dotted[4] || 0),
      Number(dotted[5] || 0),
      Number(dotted[6] || 0)
    );
  }
  const iso = new Date(text);
  if (!Number.isNaN(iso)) return iso;
  return null;
}

function readApplications(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`applications sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  const header = rows[0] ?? [];
  const map = headerMap(header);
  const idx = {
    application_id: map.get("application_id"),
    developer_id: map.get("developer_id"),
    phone_number: map.get("phone_number"),
    application_datetime: map.get("application_datetime"),
  };
  const lookup = new Map();
  let apps = 0;
  for (const row of rows.slice(1)) {
    const appId = norm(row[idx.application_id]);
    if (!/^APP-/i.test(appId)) continue;
    const developerId = norm(row[idx.developer_id]);
    const phone = normalizePhone(row[idx.phone_number]);
    const appDt = toDate(row[idx.application_datetime]);
    if (!developerId || !phone || !appDt) continue;
    const key = `${developerId}|${phone}`;
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push({ application_id: appId, developer_id: developerId, phone_number: phone, application_datetime: appDt });
    apps++;
  }
  for (const list of lookup.values()) list.sort((a, b) => a.application_datetime - b.application_datetime);
  return { lookup, apps, keys: lookup.size };
}

function findApplication(candidates, eventDt, windowMs) {
  if (!candidates || !eventDt) return null;
  let best = null;
  for (const app of candidates) {
    const delta = eventDt - app.application_datetime;
    if (delta < 0) continue;
    if (delta > windowMs) continue;
    if (!best || app.application_datetime > best.application_datetime) best = app;
  }
  return best;
}

function clear(row, idx) {
  row[idx.event_id] = "";
  row[idx.application_id] = "";
  row[idx.application_datetime] = "";
  row[idx.lead_response_time] = "";
  row[idx.recontact] = "";
}

function idPrefix(sheetName) {
  return /messenger/i.test(sheetName) ? "E-M-" : "E-SC-";
}

function matchSheet(ws, sheetName, applications, windowMs) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  if (!rows.length) return { rows, stats: {} };
  const header = rows[0].map((h) => norm(h));
  const map = headerMap(header);
  const idx = {
    event_id: col(header, map, "event_id"),
    application_id: col(header, map, "application_id"),
    developer_id: col(header, map, "developer_id"),
    developer_name: col(header, map, "developer_name"),
    phone_number: col(header, map, "phone_number"),
    application_datetime: col(header, map, "application_datetime"),
    event_datetime: col(header, map, "event_datetime"),
    lead_response_time: col(header, map, "lead_response_time"),
    recontact: col(header, map, "recontact"),
  };
  rows[0] = header;
  const start = /messenger/i.test(sheetName) && rows.length > 1 && !/^E-/i.test(norm(rows[1]?.[0])) ? 2 : 1;
  const prefix = idPrefix(sheetName);
  let seq = 1;
  const stats = { matched: 0, skipped: 0, not_found: 0, before_or_outside_window: 0, missing_event_datetime: 0 };
  const matchedByApp = new Map();

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    while (row.length < header.length) row.push("");
    const developerId = norm(row[idx.developer_id]);
    const developerName = norm(row[idx.developer_name]);
    const phone = normalizePhone(row[idx.phone_number]);
    if (!developerId || !developerName || !phone) {
      stats.skipped++;
      clear(row, idx);
      continue;
    }

    const eventDt = toDate(row[idx.event_datetime]);
    if (!eventDt) {
      stats.missing_event_datetime++;
      clear(row, idx);
      continue;
    }

    const candidates = applications.lookup.get(`${developerId}|${phone}`);
    const app = findApplication(candidates, eventDt, windowMs);
    if (!candidates) {
      stats.not_found++;
      clear(row, idx);
      continue;
    }
    if (!app) {
      stats.before_or_outside_window++;
      clear(row, idx);
      continue;
    }

    row[idx.event_id] = `${prefix}${String(seq).padStart(4, "0")}`;
    row[idx.application_id] = app.application_id;
    row[idx.application_datetime] = app.application_datetime;
    row[idx.lead_response_time] = Math.round((eventDt - app.application_datetime) / 60000);
    row[idx.recontact] = "нет";
    seq++;
    stats.matched++;
    if (!matchedByApp.has(app.application_id)) matchedByApp.set(app.application_id, []);
    matchedByApp.get(app.application_id).push({ row, eventDt });
  }

  for (const list of matchedByApp.values()) {
    list.sort((a, b) => a.eventDt - b.eventDt);
    for (let i = 0; i < list.length; i++) list[i].row[idx.recontact] = i === 0 ? "нет" : "да";
  }

  return { rows, stats };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[match-events] source не найден: ${args.source}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(args.source, { cellDates: true });
  const applications = readApplications(wb, args.appsSheet);
  const sheets = resolveEventSheets(wb.SheetNames);
  const bySheet = {};
  const windowMs = args.windowHours * 60 * 60 * 1000;
  for (const { sheetName } of sheets) {
    const { rows, stats } = matchSheet(wb.Sheets[sheetName], sheetName, applications, windowMs);
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
    bySheet[sheetName] = stats;
  }
  const writeTarget = args.source === resolveDataPath(paths.source()) ? writeDataPath(paths.source()) : args.source;
  XLSX.writeFile(wb, writeTarget);
  console.log(JSON.stringify({ source: writeTarget, applications, by_sheet: bySheet }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
