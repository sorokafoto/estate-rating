import test from "node:test";
import assert from "node:assert/strict";
import { toIso } from "./export-company-events.mjs";

/** APP-1-284 (DOGMA): Excel serial заявки + строка события из source.xlsx. */
const APP_284_SERIAL = 46177.84444444445;
const EVENT_1369_STR = "04.06.2026 20:19";
const EXPECTED_LRT_MINUTES = 3;

test("toIso: Excel serial и DD.MM.YYYY в одной шкале (APP-1-284)", () => {
  const submitted = toIso(APP_284_SERIAL);
  const eventAt = toIso(EVENT_1369_STR);
  assert.ok(submitted, "submitted_at");
  assert.ok(eventAt, "event_at");

  const submittedMs = Date.parse(submitted);
  const eventMs = Date.parse(eventAt);
  const diffMin = Math.round((eventMs - submittedMs) / 60000);
  assert.equal(diffMin, EXPECTED_LRT_MINUTES);
});

test("toIso: Excel serial не сдвигается на +3ч относительно строки события", () => {
  const submitted = toIso(APP_284_SERIAL);
  const eventAt = toIso(EVENT_1369_STR);
  const wrongUtcSerial = new Date(
    Math.round((APP_284_SERIAL - 25569) * 86400 * 1000)
  ).toISOString();
  assert.notEqual(submitted, wrongUtcSerial, "старый excelToIso давал +3ч UTC");
  assert.equal(eventAt, toIso(EVENT_1369_STR));
});

test("toIso: null и пустая строка", () => {
  assert.equal(toIso(null), null);
  assert.equal(toIso(""), null);
});
