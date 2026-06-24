#!/usr/bin/env node
// Аудит матчинга: заявки, события в рейтинге, сироты с причинами.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { aggregate, isInAnalyticsWindow } from "../build/aggregate.mjs";
import {
  EVENT_FIELDS,
  readApplicationsFromWorkbook,
  readEventsFromWorkbook,
} from "../build/source.mjs";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import {
  ANALYTICS_WINDOW_MINUTES,
  APPLICATIONS_QUORUM,
  hasApplicationsQuorum,
} from "../shared/metrics.mjs";
import { paths, PROJECT_ROOT, resolveDataPath, writeDataPath } from "../shared/paths.mjs";
import { fileURLToPath } from "node:url";
import { toDate } from "./match-events-applications.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "match-audit.xlsx")
);

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, developer: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
    else if (argv[i] === "--developer" && argv[i + 1]) args.developer = argv[++i];
  }
  return args;
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function normPhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `7${d}`;
  if (d.length === 11 && d[0] === "8") return `7${d.slice(1)}`;
  return d;
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Wall-clock время из source (MSK в данных) для отображения в выгрузке. */
export function formatMsk(v) {
  const dt = toDate(v);
  if (!dt || Number.isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
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

function readFullEventsFromSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
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
  const startRow =
    isMessenger && rows.length > 1 && !isDataRow(rows[1]) ? 2 : isDataRow(rows[1]) ? 1 : 2;

  const out = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const eventId = String(row[eventIdIdx] ?? "").trim();
    const channel = norm(row[idx.event_channel]);
    const hasEventId = Boolean(eventId);
    if (!hasEventId && channel !== "call") continue;
    if (!hasEventId && channel === "call" && !String(row[idx.incoming_phone_number] ?? "").trim()) {
      continue;
    }

    const record = { _sheet: sheetName, _row: r + 1 };
    for (const [name, colIdx] of Object.entries(idx)) {
      if (colIdx >= 0) record[name] = row[colIdx];
    }
    out.push(record);
  }
  return out;
}

function readAllFullEvents(wb) {
  const events = [];
  for (const { sheetName } of resolveEventSheets(wb.SheetNames)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    events.push(...readFullEventsFromSheet(ws, sheetName));
  }
  return events;
}

function buildApplicationLookups(applications) {
  const byPhone = new Map();
  const byDevPhone = new Map();

  for (const app of applications) {
    const phone = normPhone(app.phone_number);
    const devId = String(app.developer_id ?? "").trim();
    if (!phone) continue;

    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(app);

    if (devId) {
      const key = `${devId}|${phone}`;
      if (!byDevPhone.has(key)) byDevPhone.set(key, []);
      byDevPhone.get(key).push(app);
    }
  }

  for (const list of byPhone.values()) {
    list.sort((a, b) => toDate(a.application_datetime) - toDate(b.application_datetime));
  }
  for (const list of byDevPhone.values()) {
    list.sort((a, b) => toDate(a.application_datetime) - toDate(b.application_datetime));
  }

  return { byPhone, byDevPhone };
}

/**
 * Кандидат-заявка для диагностики сироты: только developer_id + measurement-phone.
 * Не подставляет заявку другого застройщика на том же SIM.
 */
export function findCandidateApp(rec, lookups) {
  const devId = String(rec.developer_id ?? "").trim();
  const phone = normPhone(rec.phone_number);
  if (!devId || !phone) return null;

  const devList = lookups.byDevPhone.get(`${devId}|${phone}`);
  if (!devList?.length) return null;
  if (devList.length === 1) return devList[0];

  const eventDt = toDate(rec.event_datetime);
  if (!eventDt) return devList[0];

  let best = null;
  let bestAbs = Infinity;
  for (const app of devList) {
    const appDt = toDate(app.application_datetime);
    if (!appDt) continue;
    const abs = Math.abs(eventDt - appDt);
    if (abs < bestAbs) {
      bestAbs = abs;
      best = app;
    }
  }
  return best ?? devList[0];
}

/** Заявки на том же measurement-phone, в окне 72 ч до момента звонка (включительно). */
export function findActiveAppsOnSim(rec, allApplications) {
  const phone = normPhone(rec.phone_number);
  const eventDt = toDate(rec.event_datetime);
  if (!phone || !eventDt) return [];

  const active = [];
  for (const app of allApplications) {
    if (normPhone(app.phone_number) !== phone) continue;
    const appDt = toDate(app.application_datetime);
    if (!appDt) continue;
    const deltaMinutes = Math.round((eventDt - appDt) / 60000);
    if (deltaMinutes < 0 || deltaMinutes > ANALYTICS_WINDOW_MINUTES) continue;
    active.push({
      application_id: app.application_id,
      developer_name: String(app.developer_name ?? "").trim(),
      deltaMinutes,
    });
  }

  active.sort((a, b) => a.deltaMinutes - b.deltaMinutes);
  return active;
}

export function formatActiveApps(active) {
  if (!active.length) return "";
  return active
    .map((a) => `${a.application_id}:${a.developer_name}:+${a.deltaMinutes}мин`)
    .join("; ");
}

function activeAppsFields(rec, allApplications) {
  const active = findActiveAppsOnSim(rec, allApplications);
  return {
    активные_заявки_на_sim: formatActiveApps(active),
    активных_заявок_на_sim: active.length,
  };
}

/**
 * @returns {{ reason: string, candidateAppId: string, deltaMinutes: number|null }}
 */
export function diagnoseOrphan(rec, lookups) {
  const devId = String(rec.developer_id ?? "").trim();
  const devName = String(rec.developer_name ?? "").trim();
  const phone = normPhone(rec.phone_number);

  if (!devId || !devName || !phone) {
    return { reason: "нет_developer_или_phone", candidateAppId: "", deltaMinutes: null };
  }

  const eventDt = toDate(rec.event_datetime);
  if (!eventDt) {
    return { reason: "нет_event_datetime", candidateAppId: "", deltaMinutes: null };
  }

  const candidate = findCandidateApp(rec, lookups);
  if (!candidate) {
    return { reason: "нет_заявки_на_phone", candidateAppId: "", deltaMinutes: null };
  }

  const appDt = toDate(candidate.application_datetime);
  if (!appDt) {
    return {
      reason: "нет_заявки_на_phone",
      candidateAppId: candidate.application_id,
      deltaMinutes: null,
    };
  }

  const deltaMs = eventDt - appDt;
  const deltaMinutes = Math.round(deltaMs / 60000);

  if (deltaMinutes < 0) {
    return {
      reason: "до_заявки",
      candidateAppId: candidate.application_id,
      deltaMinutes,
    };
  }
  if (deltaMinutes > ANALYTICS_WINDOW_MINUTES) {
    return {
      reason: "после_72ч",
      candidateAppId: candidate.application_id,
      deltaMinutes,
    };
  }

  return {
    reason: "должен_быть_сматчен",
    candidateAppId: candidate.application_id,
    deltaMinutes,
  };
}

function eventRowBase(rec) {
  const analytics = toAnalyticsEvent(rec);
  return {
    event_id: String(rec.event_id ?? "").trim(),
    application_id: analytics.application_id,
    developer_name: analytics.developer_name,
    channel: analytics.event_channel,
    event_datetime_msk: formatMsk(rec.event_datetime),
    application_datetime_msk: formatMsk(rec.application_datetime),
    lead_response_time_min: analytics.lead_response_time,
    recontact: analytics.recontact === "да" ? "да" : analytics.recontact === "нет" ? "нет" : "",
    incoming_phone_number: String(rec.incoming_phone_number ?? "").trim(),
    phone_number: String(rec.phone_number ?? "").trim(),
    identified: analytics.identified === "да" ? "да" : "нет",
    _sheet: rec._sheet ?? "",
    _row: rec._row ?? "",
  };
}

function buildLegendRows() {
  return [
    ["термин", "описание"],
    ["в рейтинге", "Событие с identified=да, application_id, developer_id и lead_response_time в [0, 4320] мин"],
    ["сирота", "identified=да, но application_id пустой — не попало в total_touches"],
    ["до_заявки", "Звонок раньше application_datetime единственной заявки на measurement-phone"],
    ["после_72ч", "Звонок позже application_datetime + 72 часа"],
    [
      "нет_заявки_на_phone",
      "Нет заявки этого застройщика (developer_id) на measurement-phone события",
    ],
    ["нет_event_datetime", "Не удалось распарсить event_datetime"],
    ["нет_developer_или_phone", "Пустой developer_id, developer_name или phone_number"],
    ["должен_быть_сматчен", "В окне 72ч после заявки, но application_id пуст — возможный баг матчера"],
    ["окно аналитики", `${ANALYTICS_WINDOW_MINUTES} минут (72 часа) после заявки`],
    ["кворум", `${APPLICATIONS_QUORUM} заявок на застройщика`],
    ["application_datetime_msk", "Время заявки, отображение в Europe/Moscow"],
    ["event_datetime_msk", "Время события, отображение в Europe/Moscow"],
    [
      "активные_заявки_на_sim",
      "Все заявки на measurement-phone, где звонок попадает в [application_datetime, +72ч] — формат APP:id:застройщик:+Nмин",
    ],
  ];
}

function objectsToSheet(rows, headers) {
  if (!rows.length) return XLSX.utils.aoa_to_sheet([headers ?? []]);
  const cols = headers ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const out = [cols];
  for (const row of rows) out.push(cols.map((c) => row[c] ?? ""));
  return XLSX.utils.aoa_to_sheet(out);
}

function filterByDeveloper(records, developerFilter) {
  if (!developerFilter) return records;
  const needle = developerFilter.trim().toLowerCase();
  return records.filter((r) => String(r.developer_name ?? "").trim().toLowerCase() === needle);
}

export function buildMatchAudit({
  applications,
  fullEvents,
  aggregateDevelopers,
  allApplications = applications,
}) {
  const lookups = buildApplicationLookups(allApplications);
  const aggByName = new Map(
    aggregateDevelopers.map((d) => [String(d.developer_name).trim(), d])
  );

  const devNames = new Set(applications.map((a) => String(a.developer_name).trim()).filter(Boolean));
  for (const e of fullEvents) {
    const n = String(e.developer_name ?? "").trim();
    if (n) devNames.add(n);
  }

  const eventsInRating = [];
  const eventsOrphans = [];
  const eventsOutsideMatched = [];

  for (const rec of fullEvents) {
    const analytics = toAnalyticsEvent(rec);
    const isIdentified = analytics.identified === "да";
    const hasAppId = /^APP-/i.test(analytics.application_id);
    const inRating = isInAnalyticsWindow(analytics);

    if (inRating) {
      eventsInRating.push({
        ...eventRowBase(rec),
        ...activeAppsFields(rec, allApplications),
        в_рейтинге: "да",
      });
      continue;
    }

    if (hasAppId && isIdentified) {
      eventsOutsideMatched.push({
        ...eventRowBase(rec),
        ...activeAppsFields(rec, allApplications),
        в_рейтинге: "нет",
        причина_вне_рейтинга:
          typeof analytics.lead_response_time === "number" &&
          analytics.lead_response_time > ANALYTICS_WINDOW_MINUTES
            ? "после_72ч"
            : typeof analytics.lead_response_time === "number" && analytics.lead_response_time < 0
              ? "до_заявки"
              : "прочее",
      });
      continue;
    }

    if (isIdentified && !hasAppId) {
      const diag = diagnoseOrphan(rec, lookups);
      eventsOrphans.push({
        ...eventRowBase(rec),
        ...activeAppsFields(rec, allApplications),
        причина_нематча: diag.reason,
        заявка_кандидат: diag.candidateAppId,
        дельта_мин_до_кандидата: diag.deltaMinutes,
        попадет_в_company_events: "да",
        попадет_в_рейтинг: "нет",
      });
    }
  }

  const ratingByApp = new Map();
  for (const e of eventsInRating) {
    if (!ratingByApp.has(e.application_id)) ratingByApp.set(e.application_id, []);
    ratingByApp.get(e.application_id).push(e);
  }

  const orphansByPhone = new Map();
  for (const e of eventsOrphans) {
    const phone = normPhone(e.phone_number);
    if (!phone) continue;
    orphansByPhone.set(phone, (orphansByPhone.get(phone) ?? 0) + 1);
  }

  const applicationRows = applications.map((app) => {
    const appEvents = ratingByApp.get(app.application_id) ?? [];
    const responseTimes = appEvents
      .map((e) => e.lead_response_time_min)
      .filter((v) => typeof v === "number" && v >= 0);
    const phone = normPhone(app.phone_number);

    return {
      application_id: app.application_id,
      developer_name: app.developer_name,
      phone_number: app.phone_number,
      application_datetime_msk: formatMsk(app.application_datetime),
      в_знаменателе_рейтинга: "да",
      есть_ответ_в_72ч: appEvents.length > 0 ? "да" : "нет",
      касаний_в_рейтинге: appEvents.length,
      первый_ответ_мин: responseTimes.length ? Math.min(...responseTimes) : "",
      event_ids_в_рейтинге: appEvents.map((e) => e.event_id).filter(Boolean).join("; "),
      сирот_на_этом_phone: orphansByPhone.get(phone) ?? 0,
    };
  });

  const developerRows = [...devNames]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((developerName) => {
      const devApps = applications.filter((a) => String(a.developer_name).trim() === developerName);
      const sent = devApps.length;
      const devEvents = fullEvents.filter((e) => String(e.developer_name ?? "").trim() === developerName);
      const inRating = eventsInRating.filter((e) => e.developer_name === developerName);
      const orphans = eventsOrphans.filter((e) => e.developer_name === developerName);
      const outsideMatched = eventsOutsideMatched.filter((e) => e.developer_name === developerName);
      const appsWithResponse = new Set(inRating.map((e) => e.application_id)).size;

      const companyEventsCount = devEvents.filter((e) => {
        const a = toAnalyticsEvent(e);
        return isInAnalyticsWindow(a);
      }).length;
      const agg = aggByName.get(developerName);
      const ratingTouches = agg?.total_touches ?? (agg?.insufficient_data ? null : inRating.length);
      const ratingTouchesNum = typeof ratingTouches === "number" ? ratingTouches : inRating.length;

      return {
        developer_name: developerName,
        заявок_отправлено: sent,
        кворум_достигнут: hasApplicationsQuorum(sent) ? "да" : "нет",
        заявок_с_ответом_72ч: appsWithResponse,
        касаний_в_рейтинге: ratingTouchesNum,
        касаний_идентифицированных_сирот: orphans.length,
        касаний_вне_72ч_с_привязкой: outsideMatched.length,
        касаний_в_company_events: companyEventsCount,
        расхождение_dashboard_vs_рейтинг: companyEventsCount - ratingTouchesNum,
        сверка_агрегат_total_touches: agg?.total_touches ?? "н/д",
        сверка_совпадает:
          agg?.total_touches == null
            ? agg?.insufficient_data
              ? "недостаточно данных"
              : "нет в агрегате"
            : agg.total_touches === ratingTouchesNum
              ? "да"
              : "нет",
      };
    });

  return {
    legend: buildLegendRows(),
    developers: developerRows,
    applications: applicationRows,
    eventsInRating,
    eventsOrphans,
    eventsOutsideMatched,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[export-match-audit] source не найден: ${args.source}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source, { cellDates: true });
  let applications = readApplicationsFromWorkbook(wb);
  let fullEvents = readAllFullEvents(wb);

  if (args.developer) {
    applications = filterByDeveloper(applications, args.developer);
    fullEvents = filterByDeveloper(fullEvents, args.developer);
  }

  const analyticsEvents = readEventsFromWorkbook(wb);
  const allApplications = readApplicationsFromWorkbook(wb);
  const aggregateDevelopers = aggregate(analyticsEvents, allApplications);

  const audit = buildMatchAudit({
    applications,
    fullEvents,
    allApplications,
    aggregateDevelopers: args.developer
      ? aggregateDevelopers.filter(
          (d) => String(d.developer_name).trim().toLowerCase() === args.developer.trim().toLowerCase()
        )
      : aggregateDevelopers,
  });

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(audit.legend), "легенда");
  XLSX.utils.book_append_sheet(
    outWb,
    objectsToSheet(audit.developers, [
      "developer_name",
      "заявок_отправлено",
      "кворум_достигнут",
      "заявок_с_ответом_72ч",
      "касаний_в_рейтинге",
      "касаний_идентифицированных_сирот",
      "касаний_вне_72ч_с_привязкой",
      "касаний_в_company_events",
      "расхождение_dashboard_vs_рейтинг",
      "сверка_агрегат_total_touches",
      "сверка_совпадает",
    ]),
    "застройщики"
  );
  XLSX.utils.book_append_sheet(
    outWb,
    objectsToSheet(audit.applications, [
      "application_id",
      "developer_name",
      "phone_number",
      "application_datetime_msk",
      "в_знаменателе_рейтинга",
      "есть_ответ_в_72ч",
      "касаний_в_рейтинге",
      "первый_ответ_мин",
      "event_ids_в_рейтинге",
      "сирот_на_этом_phone",
    ]),
    "заявки"
  );
  XLSX.utils.book_append_sheet(
    outWb,
    objectsToSheet(audit.eventsInRating, [
      "event_id",
      "application_id",
      "developer_name",
      "channel",
      "event_datetime_msk",
      "application_datetime_msk",
      "lead_response_time_min",
      "recontact",
      "incoming_phone_number",
      "phone_number",
      "identified",
      "активных_заявок_на_sim",
      "активные_заявки_на_sim",
      "в_рейтинге",
    ]),
    "события_в_рейтинге"
  );
  XLSX.utils.book_append_sheet(
    outWb,
    objectsToSheet(audit.eventsOrphans, [
      "event_id",
      "application_id",
      "developer_name",
      "channel",
      "event_datetime_msk",
      "application_datetime_msk",
      "lead_response_time_min",
      "recontact",
      "incoming_phone_number",
      "phone_number",
      "identified",
      "активных_заявок_на_sim",
      "активные_заявки_на_sim",
      "причина_нематча",
      "заявка_кандидат",
      "дельта_мин_до_кандидата",
      "попадет_в_company_events",
      "попадет_в_рейтинг",
    ]),
    "события_сироты"
  );
  XLSX.utils.book_append_sheet(
    outWb,
    objectsToSheet(audit.eventsOutsideMatched, [
      "event_id",
      "application_id",
      "developer_name",
      "channel",
      "event_datetime_msk",
      "application_datetime_msk",
      "lead_response_time_min",
      "recontact",
      "incoming_phone_number",
      "phone_number",
      "identified",
      "активных_заявок_на_sim",
      "активные_заявки_на_sim",
      "в_рейтинге",
      "причина_вне_рейтинга",
    ]),
    "события_вне_рейтинга"
  );

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  XLSX.writeFile(outWb, args.output);

  const mismatches = audit.developers.filter((d) => d.сверка_совпадает === "нет");
  if (mismatches.length) {
    console.warn(
      "[export-match-audit] расхождение с aggregate:",
      mismatches.map((d) => d.developer_name).join(", ")
    );
  }

  console.log(
    JSON.stringify(
      {
        output: args.output,
        developer_filter: args.developer,
        counts: {
          developers: audit.developers.length,
          applications: audit.applications.length,
          events_in_rating: audit.eventsInRating.length,
          events_orphans: audit.eventsOrphans.length,
          events_outside_matched: audit.eventsOutsideMatched.length,
        },
      },
      null,
      2
    )
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
