// Медиана первого id. звонка по будням / выходным (и слотам для ретро).
import { ANALYTICS_WINDOW_MINUTES } from "./metrics.mjs";

export const WEEKEND_DAYS = new Set(["saturday", "sunday"]);
export const MIN_SLICE_N = 3;

export function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

export function isWeekend(dayOfWeek) {
  return WEEKEND_DAYS.has(norm(dayOfWeek));
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function dayOfWeekFromDatetime(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return norm(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", weekday: "long" }).format(d)
  );
}

/** day_of_week из xlsx или fallback по application_datetime (MSK). */
export function resolveDayOfWeek(app) {
  const fromSheet = norm(app?.day_of_week);
  if (fromSheet) return fromSheet;
  return dayOfWeekFromDatetime(app?.application_datetime);
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function roundInt(x) {
  return Math.round(x);
}

function sliceMedian(list, roundMedians) {
  const med = median(list.map((r) => r.first_call_minutes));
  return {
    n: list.length,
    median_minutes: med == null ? null : roundMedians ? roundInt(med) : med,
  };
}

/**
 * Строки «заявка + первый звонок» из сырых events/applications (build pipeline).
 * @param {object[]} events
 * @param {object[]} applications
 */
export function firstCallMinutesByApp(events, applications) {
  const appById = new Map();
  for (const app of applications || []) {
    const application_id = String(app.application_id ?? "").trim();
    if (!/^APP-/i.test(application_id)) continue;
    appById.set(application_id, app);
  }

  const callsByApp = new Map();
  for (const e of events || []) {
    if (norm(e.identified) !== "да") continue;
    if (norm(e.event_channel) !== "call") continue;
    const application_id = String(e.application_id ?? "").trim();
    if (!application_id) continue;
    const mins = Number(e.lead_response_time);
    if (!Number.isFinite(mins) || mins < 0 || mins > ANALYTICS_WINDOW_MINUTES) continue;
    const prev = callsByApp.get(application_id);
    if (prev == null || mins < prev) callsByApp.set(application_id, mins);
  }

  const rows = [];
  for (const [application_id, first_call_minutes] of callsByApp) {
    const app = appById.get(application_id);
    if (!app) continue;
    const day_of_week = resolveDayOfWeek(app);
    rows.push({
      application_id,
      developer_id: app.developer_id,
      developer_name: app.developer_name,
      day_of_week,
      time_slot: app.time_slot || "",
      is_weekend: isWeekend(day_of_week),
      first_call_minutes,
    });
  }
  return rows;
}

/** Строки из company-events JSON (дашборд / export-retro-metrics). */
export function firstCallRowsFromCompany(company) {
  const apps = company.applications || [];
  const events = company.events || [];
  const callsByApp = new Map();

  for (const e of events) {
    if (norm(e.channel) !== "call") continue;
    if (norm(e.identified_status) !== "developer") continue;
    if (!e.application_id) continue;
    const mins = Number(e.minutes_since_application);
    if (!Number.isFinite(mins)) continue;
    const prev = callsByApp.get(e.application_id);
    if (prev == null || mins < prev) callsByApp.set(e.application_id, mins);
  }

  const rows = [];
  for (const app of apps) {
    const mins = callsByApp.get(app.application_id);
    if (mins == null) continue;
    const day_of_week = resolveDayOfWeek(app);
    rows.push({
      application_id: app.application_id,
      developer_name: company.developer_name,
      day_of_week,
      time_slot: app.time_slot || "",
      is_weekend: isWeekend(day_of_week),
      first_call_minutes: mins,
    });
  }
  return rows;
}

export function buildFirstCallByDayType(weekdayMinutes, weekendMinutes) {
  const weekdayMedian = median(weekdayMinutes);
  const weekendMedian = median(weekendMinutes);
  return {
    weekday: {
      n: weekdayMinutes.length,
      median_minutes: weekdayMedian != null ? roundInt(weekdayMedian) : null,
    },
    weekend: {
      n: weekendMinutes.length,
      median_minutes: weekendMedian != null ? roundInt(weekendMedian) : null,
    },
    weekend_vs_weekday_ratio:
      weekdayMedian != null && weekendMedian != null && weekdayMedian > 0
        ? round1(weekendMedian / weekdayMedian)
        : null,
    weekend_slower:
      weekdayMedian != null && weekendMedian != null ? weekendMedian > weekdayMedian : null,
  };
}

export function emptyFirstCallByDayType() {
  return {
    weekday: { n: 0, median_minutes: null },
    weekend: { n: 0, median_minutes: null },
    weekend_vs_weekday_ratio: null,
    weekend_slower: null,
  };
}

/** Агрегат для data.json / дашборда. */
export function summarizeFirstCallByDayType(rows) {
  const weekday = (rows || []).filter((r) => !r.is_weekend);
  const weekend = (rows || []).filter((r) => r.is_weekend);
  return buildFirstCallByDayType(
    weekday.map((r) => r.first_call_minutes),
    weekend.map((r) => r.first_call_minutes)
  );
}

/** Расширенный срез для ретро (утро / день / вечер). */
export function summarizeTimingRows(rows, { roundMedians = false } = {}) {
  const weekday = (rows || []).filter((r) => !r.is_weekend);
  const weekend = (rows || []).filter((r) => r.is_weekend);
  const morning = (rows || []).filter((r) => norm(r.time_slot) === "morning");
  const afternoon = (rows || []).filter((r) => norm(r.time_slot) === "afternoon");
  const evening = (rows || []).filter((r) => norm(r.time_slot) === "evening");

  const weekdaySlice = sliceMedian(weekday, roundMedians);
  const weekendSlice = sliceMedian(weekend, roundMedians);

  return {
    weekday_apps_with_first_call: weekdaySlice,
    weekend_apps_with_first_call: weekendSlice,
    morning: sliceMedian(morning, roundMedians),
    afternoon: sliceMedian(afternoon, roundMedians),
    evening: sliceMedian(evening, roundMedians),
    weekend_vs_weekday_ratio:
      weekdaySlice.median_minutes && weekendSlice.median_minutes
        ? round1(weekendSlice.median_minutes / weekdaySlice.median_minutes)
        : null,
  };
}

export function countAppsByDayType(companies) {
  let weekday = 0;
  let weekend = 0;
  for (const company of companies || []) {
    for (const app of company.applications || []) {
      if (isWeekend(resolveDayOfWeek(app))) weekend += 1;
      else weekday += 1;
    }
  }
  return { weekday, weekend, total: weekday + weekend };
}

export function perDeveloperWeekendComparison(companies, minSliceN = MIN_SLICE_N) {
  const byDev = new Map();

  for (const company of companies || []) {
    const rows = firstCallRowsFromCompany(company);
    const weekday = rows.filter((r) => !r.is_weekend).map((r) => r.first_call_minutes);
    const weekend = rows.filter((r) => r.is_weekend).map((r) => r.first_call_minutes);
    if (weekday.length < minSliceN || weekend.length < minSliceN) continue;

    const weekdayMedian = median(weekday);
    const weekendMedian = median(weekend);
    if (weekdayMedian == null || weekendMedian == null) continue;

    byDev.set(company.developer_name, {
      developer_name: company.developer_name,
      url: company.url,
      weekday_n: weekday.length,
      weekend_n: weekend.length,
      weekday_median_minutes: roundInt(weekdayMedian),
      weekend_median_minutes: roundInt(weekendMedian),
      weekend_slower: weekendMedian > weekdayMedian,
      ratio:
        weekdayMedian > 0 ? round1(weekendMedian / weekdayMedian) : null,
    });
  }

  const comparable = [...byDev.values()];
  const slowerOnWeekend = comparable
    .filter((d) => d.weekend_slower)
    .sort((a, b) => b.ratio - a.ratio || b.weekend_median_minutes - a.weekend_median_minutes);
  const fasterOnWeekend = comparable
    .filter((d) => !d.weekend_slower)
    .sort((a, b) => a.ratio - b.ratio || a.weekend_median_minutes - b.weekend_median_minutes);

  return {
    comparable_developers: comparable.length,
    top_slower_on_weekend: slowerOnWeekend.slice(0, 10),
    exceptions_faster_on_weekend: fasterOnWeekend.slice(0, 5),
  };
}

export function computeWeekendMetrics(companies) {
  const allRows = (companies || []).flatMap((c) => firstCallRowsFromCompany(c));
  return {
    app_distribution: countAppsByDayType(companies),
    market: summarizeTimingRows(allRows),
    per_developer: perDeveloperWeekendComparison(companies),
  };
}
