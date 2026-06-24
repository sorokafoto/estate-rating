#!/usr/bin/env node
// Per-company events для внутреннего дашборда.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  readApplicationsFromWorkbook,
  SOURCE_PATH,
} from "../build/source.mjs";
import { PROJECT_ROOT, paths, resolveDataPath } from "../shared/paths.mjs";
import { ANALYTICS_WINDOW_MINUTES } from "../shared/metrics.mjs";
import { toDate } from "./match-events-applications.mjs";

const DEFAULT_OUTPUT_DIR = path.resolve(
  PROJECT_ROOT,
  "..",
  "developer-rating-dashboard",
  "company-events"
);
const QUARTER = "2026-Q2";

function parseArgs(argv) {
  const args = { source: SOURCE_PATH, outDir: DEFAULT_OUTPUT_DIR, quarter: QUARTER };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) args.outDir = argv[++i];
    else if (argv[i] === "--quarter" && argv[i + 1]) args.quarter = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function normPhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) return d;
  if (d.length === 10) return "7" + d;
  return d.length >= 10 ? d : "";
}

function companySlug(url, name) {
  const base = String(url || name || "company")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return base || "company";
}

/** Единый парсинг с match-events: wall-clock MSK из source → ISO UTC. */
export function toIso(v) {
  if (v == null || v === "") return null;
  const dt = toDate(v);
  if (dt && !Number.isNaN(dt.getTime())) return dt.toISOString();
  return typeof v === "string" ? v.trim() || null : null;
}

function formatPhoneDisplay(digits) {
  const d = normPhone(digits);
  if (d.length !== 11) return "+" + digits;
  const n = d.slice(1);
  return `+7 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8, 10)}`;
}

function eventPhoneDisplay(digits) {
  const n = normPhone(digits);
  return n ? formatPhoneDisplay(n) : "—";
}

function contactDisplay(e) {
  const ch = norm(e.event_channel);
  const smsMark = String(e.sms_mark ?? "").trim();
  if (ch === "sms" && norm(e.identified) === "да" && smsMark) return smsMark;
  return eventPhoneDisplay(e.incoming_phone_number);
}

function identifiedStatus(e) {
  if (norm(e.identified) === "да") return "developer";
  const ch = norm(e.event_channel);
  if (ch === "call" && !e.incoming_phone_number) return "unknown";
  return "spam";
}

function loadIncomingPhoneBook(phoneBookPath) {
  const map = new Map();
  if (!fs.existsSync(phoneBookPath)) return map;
  const wb = XLSX.readFile(phoneBookPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets[sheetName])) {
    const phone = normPhone(row.phone ?? row.dev_phone_number ?? row.phone_number);
    const developerId = String(row.developer_id ?? "").trim();
    if (!phone || !developerId) continue;
    map.set(phone, developerId);
  }
  return map;
}

/** Не привязывать к заявке D событие, если incoming — номер другого застройщика. */
function isCrossDeveloperIncoming(e, appDeveloperId, incomingPhoneBook) {
  if (!e.application_id || norm(e.identified) === "да") return false;
  const incomingDev = incomingPhoneBook.get(normPhone(e.incoming_phone_number));
  if (!incomingDev || !appDeveloperId) return false;
  return incomingDev !== appDeveloperId;
}

function readApplicationsWithMeta(wb, quarter) {
  const apps = readApplicationsFromWorkbook(wb);
  const ws = wb.Sheets[wb.SheetNames.find((n) => /applications/i.test(n))];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const header = rows[0].map((h) => String(h ?? "").trim());
  const qi = header.indexOf("quarter");
  const ti = header.indexOf("time_slot");
  const di = header.indexOf("day_of_week");

  const meta = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = String(row[header.indexOf("application_id")] ?? "").trim();
    if (!/^APP-/i.test(id)) continue;
    const q = qi >= 0 ? String(row[qi] ?? "").trim() : "";
    if (q && q !== quarter && !q.toLowerCase().includes("квартал")) continue;
    meta.set(id, {
      time_slot: ti >= 0 ? String(row[ti] ?? "").trim() : "",
      day_of_week: di >= 0 ? String(row[di] ?? "").trim() : "",
      quarter: q || quarter,
    });
  }

  return apps
    .filter((a) => {
      const m = meta.get(a.application_id);
      return !m || !m.quarter || m.quarter === quarter;
    })
    .map((a) => ({
      ...a,
      ...(meta.get(a.application_id) || { time_slot: "", day_of_week: "", quarter }),
    }));
}

function readEventsWithPhones(wb) {
  const resolved = wb.SheetNames.filter((n) => /events/i.test(n));
  const byId = new Map();

  for (const sheetName of resolved) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    if (!rows.length) continue;
    const header = rows[0].map((h) => String(h ?? "").trim());
    const idx = {
      event_id: header.indexOf("event_id"),
      application_id: header.indexOf("application_id"),
      developer_id: header.indexOf("developer_id"),
      developer_name: header.indexOf("developer_name"),
      phone_number: header.indexOf("phone_number"),
      event_channel: header.indexOf("event_channel"),
      event_datetime: header.indexOf("event_datetime"),
      incoming_phone_number: header.indexOf("incoming_phone_number"),
      lead_response_time: header.indexOf("lead_response_time"),
      identified: header.indexOf("identified"),
      sms_mark: header.indexOf("sms_mark"),
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const event_id = String(row[idx.event_id] ?? "").trim();
      const application_id = String(row[idx.application_id] ?? "").trim();
      if (!application_id && !event_id && !row[idx.incoming_phone_number]) continue;

      const key = event_id || `${sheetName}-${r}`;
      byId.set(key, {
        event_id: event_id || key,
        application_id,
        developer_id: String(row[idx.developer_id] ?? "").trim(),
        developer_name: String(row[idx.developer_name] ?? "").trim(),
        phone_number: String(row[idx.phone_number] ?? "").trim(),
        event_channel: norm(row[idx.event_channel]),
        event_datetime: row[idx.event_datetime],
        incoming_phone_number: String(row[idx.incoming_phone_number] ?? "").trim(),
        lead_response_time:
          typeof row[idx.lead_response_time] === "number"
            ? row[idx.lead_response_time]
            : Number(String(row[idx.lead_response_time] ?? "").replace(",", ".")) || null,
        identified: String(row[idx.identified] ?? "").trim(),
        sms_mark: idx.sms_mark >= 0 ? String(row[idx.sms_mark] ?? "").trim() : "",
      });
    }
  }

  return [...byId.values()];
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error("Нет source.xlsx:", args.source);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source);
  const applications = readApplicationsWithMeta(wb, args.quarter);
  const events = readEventsWithPhones(wb);
  const incomingPhoneBook = loadIncomingPhoneBook(resolveDataPath(paths.phoneBook()));

  const byDev = new Map();
  for (const app of applications) {
    const key = app.developer_id || app.developer_name;
    if (!byDev.has(key)) {
      byDev.set(key, {
        developer_id: app.developer_id,
        developer_name: app.developer_name,
        url: app.url,
        applications: [],
        events: [],
      });
    }
    byDev.get(key).applications.push(app);
  }

  const appToDevKey = new Map();
  const appDeveloperId = new Map();
  for (const [key, dev] of byDev) {
    for (const app of dev.applications) {
      appToDevKey.set(app.application_id, key);
      appDeveloperId.set(app.application_id, app.developer_id);
    }
  }

  for (const e of events) {
    if (
      e.application_id &&
      isCrossDeveloperIncoming(e, appDeveloperId.get(e.application_id), incomingPhoneBook)
    ) {
      continue;
    }
    let devKey = e.developer_id && byDev.has(e.developer_id) ? e.developer_id : null;
    if (!devKey && e.application_id) devKey = appToDevKey.get(e.application_id);
    if (!devKey) continue;
    if (e.application_id && !appToDevKey.has(e.application_id)) continue;
    const mins = e.lead_response_time;
    if (typeof mins === "number" && Number.isFinite(mins)) {
      if (mins < 0 || mins > ANALYTICS_WINDOW_MINUTES) continue;
    }

    byDev.get(devKey).events.push(e);
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  let count = 0;

  for (const dev of byDev.values()) {
    if (!dev.applications.length) continue;

    const appCallMap = new Map();
    for (const e of dev.events) {
      if (norm(e.identified) !== "да" || e.event_channel !== "call") continue;
      if (!appCallMap.has(e.application_id)) appCallMap.set(e.application_id, true);
    }

    const outApps = dev.applications.map((a) => ({
      application_id: a.application_id,
      submitted_at: toIso(a.application_datetime),
      time_slot: a.time_slot || "",
      day_of_week: a.day_of_week || "",
      got_identified_call: Boolean(appCallMap.get(a.application_id)),
      phone_number: eventPhoneDisplay(a.phone_number),
    }));

    const outEvents = dev.events.map((e) => {
      const status = identifiedStatus(e);
      const smsMark = String(e.sms_mark ?? "").trim();
      const event = {
        event_id: e.event_id,
        application_id: e.application_id,
        event_at: toIso(e.event_datetime),
        minutes_since_application:
          typeof e.lead_response_time === "number" && Number.isFinite(e.lead_response_time)
            ? Math.round(e.lead_response_time)
            : null,
        channel: e.event_channel || "unknown",
        from_phone: contactDisplay(e),
        identified_status: status,
        verification_confidence: norm(e.identified) === "да" ? "high" : "low",
      };
      if (norm(e.event_channel) === "sms" && smsMark) event.sms_mark = smsMark;
      return event;
    });

    const slug = companySlug(dev.url, dev.developer_name);
    const payload = {
      developer_name: dev.developer_name,
      url: dev.url,
      quarter_id: args.quarter,
      applications: outApps,
      events: outEvents,
    };

    fs.writeFileSync(
      path.join(args.outDir, `${slug}.json`),
      JSON.stringify(payload, null, 2) + "\n",
      "utf8"
    );
    count++;
  }

  console.log(`Wrote ${count} files to ${args.outDir}`);
}

main();
