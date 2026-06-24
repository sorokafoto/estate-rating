import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFirstCallByDayType,
  firstCallMinutesByApp,
  isWeekend,
  resolveDayOfWeek,
  summarizeFirstCallByDayType,
  summarizeTimingRows,
} from "./weekend-first-call.mjs";

test("isWeekend: saturday and sunday", () => {
  assert.equal(isWeekend("saturday"), true);
  assert.equal(isWeekend("Sunday"), true);
  assert.equal(isWeekend("monday"), false);
});

test("firstCallMinutesByApp: weekday vs weekend medians", () => {
  const applications = [
    {
      application_id: "APP-1",
      developer_id: "d1",
      day_of_week: "monday",
      application_datetime: new Date("2026-06-01"),
    },
    {
      application_id: "APP-2",
      developer_id: "d1",
      day_of_week: "tuesday",
      application_datetime: new Date("2026-06-02"),
    },
    {
      application_id: "APP-3",
      developer_id: "d1",
      day_of_week: "saturday",
      application_datetime: new Date("2026-06-06"),
    },
  ];
  const events = [
    {
      application_id: "APP-1",
      identified: "да",
      event_channel: "call",
      lead_response_time: 10,
    },
    {
      application_id: "APP-2",
      identified: "да",
      event_channel: "call",
      lead_response_time: 30,
    },
    {
      application_id: "APP-3",
      identified: "да",
      event_channel: "call",
      lead_response_time: 100,
    },
    {
      application_id: "APP-1",
      identified: "да",
      event_channel: "whatsapp",
      lead_response_time: 1,
    },
  ];

  const rows = firstCallMinutesByApp(events, applications);
  assert.equal(rows.length, 3);

  const summary = summarizeFirstCallByDayType(rows);
  assert.equal(summary.weekday.n, 2);
  assert.equal(summary.weekday.median_minutes, 20);
  assert.equal(summary.weekend.n, 1);
  assert.equal(summary.weekend.median_minutes, 100);
  assert.equal(summary.weekend_vs_weekday_ratio, 5);
  assert.equal(summary.weekend_slower, true);
});

test("summarizeFirstCallByDayType: empty slices", () => {
  const summary = summarizeFirstCallByDayType([]);
  assert.equal(summary.weekday.n, 0);
  assert.equal(summary.weekend.n, 0);
  assert.equal(summary.weekday.median_minutes, null);
  assert.equal(summary.weekend_vs_weekday_ratio, null);
});

test("buildFirstCallByDayType: ratio null when no weekday median", () => {
  const summary = buildFirstCallByDayType([], [50]);
  assert.equal(summary.weekend.median_minutes, 50);
  assert.equal(summary.weekend_vs_weekday_ratio, null);
});

test("resolveDayOfWeek: fallback from datetime MSK", () => {
  // 2026-06-07 11:00 UTC = Sunday in MSK (14:00)
  const day = resolveDayOfWeek({
    day_of_week: "",
    application_datetime: new Date("2026-06-07T11:00:00Z"),
  });
  assert.equal(day, "sunday");
});

test("summarizeTimingRows: time slots", () => {
  const rows = [
    { is_weekend: false, time_slot: "morning", first_call_minutes: 10 },
    { is_weekend: false, time_slot: "evening", first_call_minutes: 90 },
  ];
  const wk = summarizeTimingRows(rows);
  assert.equal(wk.morning.n, 1);
  assert.equal(wk.evening.n, 1);
  assert.equal(wk.weekday_apps_with_first_call.n, 2);
});
