import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { resolveEventSheets, idPrefixForSheet } from "../shared/event-sheets.mjs";
import { readEventsFromWorkbook } from "./source.mjs";

const HEADERS = [
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

function makeWorkbook() {
  const wb = XLSX.utils.book_new();
  const scRows = [
    HEADERS,
    ["E-SC-0001", "APP-1", "DEV-1", "Dev One", "a.ru", "79001112233", "", "sms", "", "", "", "", "", "да"],
  ];
  const mRows = [
    HEADERS,
    ["описание"],
    ["E-M-0001", "APP-2", "DEV-2", "Dev Two", "b.ru", "79009998877", "", "whatsapp", "", "", "", "", "", "да"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scRows), "Events_sms_calls");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mRows), "Events_messengers");
  return wb;
}

test("resolveEventSheets: находит оба канонических листа", () => {
  const wb = makeWorkbook();
  const resolved = resolveEventSheets(wb.SheetNames);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].sheetName, "Events_sms_calls");
  assert.equal(resolved[1].sheetName, "Events_messengers");
});

test("resolveEventSheets: legacy aliases", () => {
  const resolved = resolveEventSheets(["applications all", "events calls&sms", "events messengers"]);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].def.idPrefix, "E-SC-");
  assert.equal(resolved[1].def.idPrefix, "E-M-");
});

test("idPrefixForSheet", () => {
  assert.equal(idPrefixForSheet("Events_messengers"), "E-M-");
  assert.equal(idPrefixForSheet("Events_sms_calls"), "E-SC-");
});

test("readEventsFromWorkbook: объединяет оба листа", () => {
  const wb = makeWorkbook();
  const events = readEventsFromWorkbook(wb);
  assert.equal(events.length, 2);
  assert.equal(events[0].developer_name, "Dev One");
  assert.equal(events[1].developer_name, "Dev Two");
  assert.equal(events[0].event_channel, "sms");
  assert.equal(events[1].event_channel, "whatsapp");
});
