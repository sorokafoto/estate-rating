// Чтение приватного источника (XLSX) в массив сырых событий.
// PII-поля читаются ТОЛЬКО здесь, на этапе сборки, и дальше отбрасываются агрегацией.
import fs from "node:fs";
import XLSX from "xlsx";
import { resolveEventSheets } from "../shared/event-sheets.mjs";
import { paths, resolveDataPath } from "../shared/paths.mjs";
import { dayOfWeekFromDatetime } from "../shared/weekend-first-call.mjs";

export const SOURCE_PATH = resolveDataPath(paths.source());

// Ключи столбцов в строке 0 файла. Строка 1 — русские описания (пропускаем).
export const EVENT_FIELDS = [
  "event_id",
  "application_id",
  "developer_id",
  "developer_name",
  "url",
  "phone_number",
  "application_datetime",
  "event_channel",
  "event_datetime",
  "incoming_phone_number",
  "lead_response_time",
  "recontact",
  "is_marked",
  "identified",
];

export function sourceExists() {
  return fs.existsSync(SOURCE_PATH);
}

function isDataRow(row, eventIdIdx) {
  if (!row || eventIdIdx == null) return false;
  const id = String(row[eventIdIdx] ?? "").trim();
  return /^E-/i.test(id);
}

function cell(row, i) {
  if (i == null) return "";
  const v = row[i];
  return v == null ? "" : String(v).trim();
}
function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}
function num(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Прочитать события с одного листа (общий контракт колонок).
 * @param {import('xlsx').WorkSheet} ws
 * @param {string} [sheetName] — для определения dataStart (messengers: row 3)
 */
export function readEventsFromSheet(ws, sheetName = "") {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  if (!rows.length) return [];

  const header = rows[0].map((h) => String(h || "").trim());
  const idx = {};
  EVENT_FIELDS.forEach((f) => {
    const i = header.indexOf(f);
    if (i !== -1) idx[f] = i;
  });

  const dataStart = isDataRow(rows[1], idx.event_id) ? 1 : 2;
  const isMessengerSheet = /messenger/i.test(sheetName);
  const startRow = isMessengerSheet && !isDataRow(rows[1], idx.event_id) ? 2 : dataStart;

  const events = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const eventId = cell(row, idx.event_id);
    const channel = norm(cell(row, idx.event_channel));
    const hasEventId = Boolean(eventId);
    if (!hasEventId && channel !== "call") continue;
    if (!hasEventId && channel === "call" && !cell(row, idx.incoming_phone_number)) continue;
    events.push({
      application_id: cell(row, idx.application_id),
      developer_id: cell(row, idx.developer_id),
      developer_name: cell(row, idx.developer_name),
      url: cell(row, idx.url),
      event_channel: channel,
      lead_response_time: num(row[idx.lead_response_time]),
      recontact: norm(cell(row, idx.recontact)),
      is_marked: norm(cell(row, idx.is_marked)),
      identified: norm(cell(row, idx.identified)),
      application_datetime: row[idx.application_datetime] ?? null,
    });
  }
  return events;
}

/**
 * Прочитать все листы событий из workbook и объединить.
 * @param {import('xlsx').WorkBook} wb
 */
export function readEventsFromWorkbook(wb) {
  const resolved = resolveEventSheets(wb.SheetNames);
  if (!resolved.length) {
    throw new Error(
      `Листы событий не найдены. Ожидаются: Events_sms_calls, Events_messengers (или legacy-имена)`
    );
  }

  const events = [];
  for (const { sheetName } of resolved) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    events.push(...readEventsFromSheet(ws, sheetName));
  }
  return events;
}

function normSheetKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findSheet(wb, names) {
  const byNorm = new Map(wb.SheetNames.map((n) => [normSheetKey(n), n]));
  for (const name of names) {
    const hit = byNorm.get(normSheetKey(name));
    if (hit) return hit;
  }
  return null;
}

function isAppDataRow(row, appIdIdx) {
  if (!row || appIdIdx == null) return false;
  return /^APP-/i.test(String(row[appIdIdx] ?? "").trim());
}

/**
 * Прочитать фактические заявки из листа applications.
 * PII (phone_number) используется только на этапе сборки и не попадает в data.json.
 */
export function readApplicationsFromWorkbook(wb) {
  const sheetName = findSheet(wb, ["applications", "applications all"]);
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  if (!rows.length) return [];

  const header = rows[0].map((h) => String(h ?? "").trim());
  const idx = {
    application_id: header.indexOf("application_id"),
    developer_id: header.indexOf("developer_id"),
    developer_name: header.indexOf("developer_name"),
    url: header.indexOf("url"),
    phone_number: header.indexOf("phone_number"),
    application_datetime: header.indexOf("application_datetime"),
    day_of_week: header.indexOf("day_of_week"),
    time_slot: header.indexOf("time_slot"),
  };

  const startRow = isAppDataRow(rows[1], idx.application_id) ? 1 : 2;
  const apps = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const application_id = cell(row, idx.application_id);
    if (!/^APP-/i.test(application_id)) continue;
    const developer_id = cell(row, idx.developer_id);
    const developer_name = cell(row, idx.developer_name);
    const url = cell(row, idx.url);
    const phone_number = cell(row, idx.phone_number);
    const application_datetime = idx.application_datetime >= 0 ? row[idx.application_datetime] ?? null : null;
    if (!developer_id || !phone_number || application_datetime == null || application_datetime === "") continue;

    const day_of_week =
      idx.day_of_week >= 0 ? cell(row, idx.day_of_week) : "";
    const time_slot = idx.time_slot >= 0 ? cell(row, idx.time_slot) : "";

    apps.push({
      application_id,
      developer_id,
      developer_name,
      url,
      phone_number,
      application_datetime,
      day_of_week: day_of_week || dayOfWeekFromDatetime(application_datetime),
      time_slot,
    });
  }

  return apps;
}

/**
 * Уникальный каталог застройщиков из листа legend (developer_id / name / url).
 * @param {import('xlsx').WorkBook} wb
 */
export function readLegendCatalog(wb) {
  const sheetName = findSheet(wb, ["legend", "Справочник"]);
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  if (!rows.length) return [];

  const header = rows[0].map((h) => String(h ?? "").trim());
  const idx = {
    developer_id: header.indexOf("developer_id"),
    developer_name: header.indexOf("developer_name"),
    url: header.indexOf("url"),
  };
  if (idx.developer_id < 0 || idx.developer_name < 0) return [];

  const startRow = /^DEV-/i.test(cell(rows[1], idx.developer_id)) ? 1 : 2;
  const byId = new Map();

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const developer_id = cell(row, idx.developer_id);
    const developer_name = cell(row, idx.developer_name);
    if (!/^DEV-/i.test(developer_id) || !developer_name) continue;
    if (byId.has(developer_id)) continue;
    byId.set(developer_id, {
      developer_id,
      developer_name,
      url: idx.url >= 0 ? cell(row, idx.url) : "",
    });
  }

  return [...byId.values()];
}

export function readSourceWorkbook() {
  const wb = XLSX.readFile(SOURCE_PATH, { cellDates: true });
  return {
    events: readEventsFromWorkbook(wb),
    applications: readApplicationsFromWorkbook(wb),
    legendCatalog: readLegendCatalog(wb),
  };
}

export function readSource() {
  return readSourceWorkbook().events;
}
