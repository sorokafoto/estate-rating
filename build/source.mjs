// Чтение приватного источника (XLSX) в массив сырых событий.
// PII-поля читаются ТОЛЬКО здесь, на этапе сборки, и дальше отбрасываются агрегацией.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_PATH = path.join(__dirname, "..", "private", "source.xlsx");
const SHEET_NAME = "events messengers";

// Ключи столбцов в строке 0 файла. Строка 1 — русские описания (пропускаем).
const FIELDS = [
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

export function readSource() {
  const wb = XLSX.readFile(SOURCE_PATH, { cellDates: true });
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`Лист "${SHEET_NAME}" не найден в источнике`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  // rows[0] — ключи; rows[1] — либо русские описания, либо первая строка данных.
  const header = rows[0].map((h) => String(h || "").trim());
  const idx = {};
  FIELDS.forEach((f) => {
    const i = header.indexOf(f);
    if (i !== -1) idx[f] = i;
  });

  const dataStart = isDataRow(rows[1], idx.event_id) ? 1 : 2;

  const events = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row[idx.event_id] == null || String(row[idx.event_id]).trim() === "") continue;
    events.push({
      application_id: cell(row, idx.application_id),
      developer_id: cell(row, idx.developer_id),
      developer_name: cell(row, idx.developer_name),
      url: cell(row, idx.url),
      event_channel: norm(cell(row, idx.event_channel)),
      lead_response_time: num(row[idx.lead_response_time]),
      recontact: norm(cell(row, idx.recontact)),
      is_marked: norm(cell(row, idx.is_marked)),
      identified: norm(cell(row, idx.identified)),
      application_datetime: row[idx.application_datetime] ?? null,
    });
  }
  return events;
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
