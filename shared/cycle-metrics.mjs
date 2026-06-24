// Метрики цикла замера: идентификация, unknown-in-72h, сироты (для ретро и QA).
import fs from "node:fs";
import XLSX from "xlsx";
import { classifyPhone, emptyRegistry, normalizePhone } from "./phone-registry.mjs";
import { ANALYTICS_WINDOW_MINUTES } from "./metrics.mjs";
import { resolveEventSheets } from "./event-sheets.mjs";
import { EVENT_FIELDS, readApplicationsFromWorkbook } from "../build/source.mjs";
import { toDate } from "../scripts/match-events-applications.mjs";
import { diagnoseOrphan } from "../scripts/export-match-audit.mjs";
import { isInAnalyticsWindow } from "../build/aggregate.mjs";
import { paths, resolveDataPath } from "./paths.mjs";

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

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function buildLookups(applications) {
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

function readFullCallEvents(wb) {
  const events = [];
  for (const { sheetName } of resolveEventSheets(wb.SheetNames)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
    if (!rows.length) continue;
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
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      if (norm(row[idx.event_channel]) !== "call") continue;
      const incoming = String(row[idx.incoming_phone_number] ?? "").trim();
      if (!incoming) continue;
      const record = {};
      for (const [name, colIdx] of Object.entries(idx)) {
        if (colIdx >= 0) record[name] = row[colIdx];
      }
      events.push(record);
    }
  }
  return events;
}

function loadCatalog(catalogPath) {
  const catalog = new Map();
  if (!fs.existsSync(catalogPath)) return catalog;
  const wb = XLSX.readFile(catalogPath);
  const sheetName = wb.SheetNames.includes("phones_flat")
    ? "phones_flat"
    : wb.SheetNames.includes("Телефоны")
      ? "Телефоны"
      : wb.SheetNames[0];
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets[sheetName])) {
    const phone = normalizePhone(row.phone ?? row.dev_phone_number);
    if (!phone) continue;
    catalog.set(phone, {
      developer_id: String(row.developer_id ?? "").trim(),
      developer_name: String(row.developer_name ?? "").trim(),
      url: String(row.url ?? "").trim(),
    });
  }
  return catalog;
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) return emptyRegistry();
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

/** Звонок unknown в окне 72 ч после любой заявки на том же measurement-SIM. */
export function isUnknownCallIn72hSameSim(rec, applications) {
  const sim = normPhone(rec.phone_number);
  const eventDt = toDate(rec.event_datetime);
  if (!sim || !eventDt) return false;
  for (const app of applications) {
    if (normPhone(app.phone_number) !== sim) continue;
    const appDt = toDate(app.application_datetime);
    if (!appDt) continue;
    const deltaMin = Math.round((eventDt - appDt) / 60000);
    if (deltaMin >= 0 && deltaMin <= ANALYTICS_WINDOW_MINUTES) return true;
  }
  return false;
}

/**
 * Разбивка всех звонков: developer / spam / unknown.
 * @param {import('xlsx').WorkBook} wb
 */
export function computeCallClassificationBreakdown(wb, options = {}) {
  const registry = options.registry ?? loadRegistry(resolveDataPath(paths.phoneRegistry()));
  const catalog = options.catalog ?? loadCatalog(resolveDataPath(paths.phoneBook()));
  const applications = readApplicationsFromWorkbook(wb);
  const calls = readFullCallEvents(wb);

  let developer = 0;
  let spam = 0;
  let unknown = 0;
  let unknownIn72hSameSim = 0;
  const unknownPhones = new Map();

  for (const rec of calls) {
    const identified = norm(rec.identified) === "да";
    if (identified) {
      developer++;
      continue;
    }
    const phone = normalizePhone(rec.incoming_phone_number);
    const cls = classifyPhone(registry, phone, catalog);
    if (cls.entity_type === "spam") {
      spam++;
    } else {
      unknown++;
      if (isUnknownCallIn72hSameSim(rec, applications)) unknownIn72hSameSim++;
      unknownPhones.set(phone, (unknownPhones.get(phone) ?? 0) + 1);
    }
  }

  const topUnknownIn72h = [];
  for (const rec of calls) {
    if (norm(rec.identified) === "да") continue;
    const phone = normalizePhone(rec.incoming_phone_number);
    const cls = classifyPhone(registry, phone, catalog);
    if (cls.entity_type !== "unknown") continue;
    if (!isUnknownCallIn72hSameSim(rec, applications)) continue;
    const entry = topUnknownIn72h.find((x) => x.phone === phone);
    if (entry) entry.call_count++;
    else topUnknownIn72h.push({ phone, call_count: 1 });
  }
  topUnknownIn72h.sort((a, b) => b.call_count - a.call_count);

  return {
    total_calls: calls.length,
    developer,
    developer_share_pct: pct(developer, calls.length),
    spam,
    spam_share_pct: pct(spam, calls.length),
    unknown,
    unknown_share_pct: pct(unknown, calls.length),
    unknown_in_72h_same_sim: unknownIn72hSameSim,
    unknown_in_72h_same_sim_share_pct: pct(unknownIn72hSameSim, calls.length),
    unique_unknown_phones: unknownPhones.size,
    top_unknown_in_72h_phones: topUnknownIn72h.slice(0, 20),
  };
}

/**
 * Разбивка сирот среди id. звонков.
 * @param {import('xlsx').WorkBook} wb
 */
export function computeOrphanBreakdown(wb) {
  const applications = readApplicationsFromWorkbook(wb);
  const lookups = buildLookups(applications);
  const calls = readFullCallEvents(wb).filter((e) => norm(e.identified) === "да");

  const reasons = {};
  let matchedInRating = 0;
  let orphans = 0;
  let shouldMatchFalsePositives = 0;

  for (const rec of calls) {
    const analytics = {
      application_id: String(rec.application_id ?? "").trim(),
      developer_id: String(rec.developer_id ?? "").trim(),
      lead_response_time:
        typeof rec.lead_response_time === "number"
          ? rec.lead_response_time
          : rec.lead_response_time === "" || rec.lead_response_time == null
            ? null
            : Number(rec.lead_response_time),
      identified: "да",
    };
    if (isInAnalyticsWindow(analytics)) {
      matchedInRating++;
      continue;
    }
    if (/^APP-/i.test(analytics.application_id)) continue;

    orphans++;
    const diag = diagnoseOrphan(rec, lookups);
    reasons[diag.reason] = (reasons[diag.reason] ?? 0) + 1;
    if (diag.reason === "должен_быть_сматчен") shouldMatchFalsePositives++;
  }

  return {
    identified_calls: calls.length,
    matched_in_rating: matchedInRating,
    matched_in_rating_share_pct: pct(matchedInRating, calls.length),
    orphans,
    orphan_share_pct: pct(orphans, calls.length),
    orphan_reasons: reasons,
    should_match_false_positives: shouldMatchFalsePositives,
  };
}

/** Целевые KPI Q3 (из плана улучшений). */
export const Q3_TARGETS = {
  identified_share_calls_pct: 70,
  unknown_share_calls_pct: 10,
  orphan_share_identified_calls_pct: 22,
  before_application_share_identified_calls_pct: 5,
  should_match_false_positives: 0,
};

export function compareToQ3Targets(classification, orphans) {
  return {
    identified_share_calls_pct: {
      actual: classification.developer_share_pct,
      target: Q3_TARGETS.identified_share_calls_pct,
      met: classification.developer_share_pct >= Q3_TARGETS.identified_share_calls_pct,
    },
    unknown_share_calls_pct: {
      actual: classification.unknown_share_pct,
      target: Q3_TARGETS.unknown_share_calls_pct,
      met: classification.unknown_share_pct <= Q3_TARGETS.unknown_share_calls_pct,
    },
    orphan_share_identified_calls_pct: {
      actual: orphans.orphan_share_pct,
      target: Q3_TARGETS.orphan_share_identified_calls_pct,
      met: orphans.orphan_share_pct <= Q3_TARGETS.orphan_share_identified_calls_pct,
    },
    before_application: {
      actual: orphans.orphan_reasons?.до_заявки ?? 0,
      actual_share_pct: pct(orphans.orphan_reasons?.до_заявки ?? 0, orphans.identified_calls),
      target_share_pct: Q3_TARGETS.before_application_share_identified_calls_pct,
    },
    should_match_false_positives: {
      actual: orphans.should_match_false_positives,
      target: Q3_TARGETS.should_match_false_positives,
      met: orphans.should_match_false_positives <= Q3_TARGETS.should_match_false_positives,
    },
  };
}
