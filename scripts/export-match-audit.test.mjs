import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseOrphan,
  formatMsk,
  buildMatchAudit,
  findActiveAppsOnSim,
  formatActiveApps,
  findCandidateApp,
} from "./export-match-audit.mjs";
import { aggregate } from "../build/aggregate.mjs";

function makeLookups(apps) {
  const byPhone = new Map();
  const byDevPhone = new Map();
  for (const app of apps) {
    const phone = String(app.phone_number).replace(/\D/g, "");
    const norm =
      phone.length === 10
        ? `7${phone}`
        : phone.length === 11 && phone[0] === "8"
          ? `7${phone.slice(1)}`
          : phone;
    if (!byPhone.has(norm)) byPhone.set(norm, []);
    byPhone.get(norm).push(app);
    const key = `${app.developer_id}|${norm}`;
    if (!byDevPhone.has(key)) byDevPhone.set(key, []);
    byDevPhone.get(key).push(app);
  }
  return { byPhone, byDevPhone };
}

test("formatMsk: DD.MM.YYYY HH:MM", () => {
  assert.equal(formatMsk("03.06.2026 9:07"), "03.06.2026 09:07");
});

test("diagnoseOrphan: до_заявки", () => {
  const lookups = makeLookups([
    {
      application_id: "APP-1-001",
      developer_id: "DEV-001",
      phone_number: "79001234567",
      application_datetime: "03.06.2026 10:00",
    },
  ]);
  const result = diagnoseOrphan(
    {
      developer_id: "DEV-001",
      developer_name: "Тест",
      phone_number: "79001234567",
      event_datetime: "03.06.2026 9:00",
    },
    lookups
  );
  assert.equal(result.reason, "до_заявки");
  assert.equal(result.candidateAppId, "APP-1-001");
  assert.ok(result.deltaMinutes < 0);
});

test("diagnoseOrphan: после_72ч", () => {
  const lookups = makeLookups([
    {
      application_id: "APP-1-002",
      developer_id: "DEV-001",
      phone_number: "79007654321",
      application_datetime: "01.06.2026 10:00",
    },
  ]);
  const result = diagnoseOrphan(
    {
      developer_id: "DEV-001",
      developer_name: "Тест",
      phone_number: "79007654321",
      event_datetime: "05.06.2026 12:00",
    },
    lookups
  );
  assert.equal(result.reason, "после_72ч");
  assert.equal(result.candidateAppId, "APP-1-002");
  assert.ok(result.deltaMinutes > 72 * 60);
});

test("diagnoseOrphan: нет_заявки_на_phone", () => {
  const lookups = makeLookups([]);
  const result = diagnoseOrphan(
    {
      developer_id: "DEV-001",
      developer_name: "Тест",
      phone_number: "79999999999",
      event_datetime: "03.06.2026 12:00",
    },
    lookups
  );
  assert.equal(result.reason, "нет_заявки_на_phone");
});

test("findCandidateApp: не подставляет заявку другого застройщика на том же SIM", () => {
  const lookups = makeLookups([
    {
      application_id: "APP-3-026",
      developer_id: "DEV-NN",
      phone_number: "79067084929",
      application_datetime: "02.06.2026 10:07",
    },
  ]);
  const candidate = findCandidateApp(
    {
      developer_id: "DEV-091",
      phone_number: "79067084929",
      event_datetime: "02.06.2026 14:27",
    },
    lookups
  );
  assert.equal(candidate, null);
});

test("diagnoseOrphan: Оренбургстрой на чужом SIM — нет_заявки_на_phone", () => {
  const lookups = makeLookups([
    {
      application_id: "APP-3-026",
      developer_id: "DEV-NN",
      developer_name: "Новый Нижний",
      phone_number: "79067084929",
      application_datetime: "02.06.2026 10:07",
    },
  ]);
  const result = diagnoseOrphan(
    {
      developer_id: "DEV-091",
      developer_name: "Оренбургстрой",
      phone_number: "79067084929",
      event_datetime: "02.06.2026 14:27",
    },
    lookups
  );
  assert.equal(result.reason, "нет_заявки_на_phone");
  assert.equal(result.candidateAppId, "");
});

test("diagnoseOrphan: Железно на SIM без своей заявки — нет_заявки_на_phone", () => {
  const lookups = makeLookups([
    {
      application_id: "APP-3-004",
      developer_id: "DEV-KSM",
      developer_name: "КСМ",
      phone_number: "79099553430",
      application_datetime: "02.06.2026 09:14",
    },
  ]);
  const result = diagnoseOrphan(
    {
      developer_id: "DEV-015",
      developer_name: "Железно",
      phone_number: "79099553430",
      event_datetime: "03.06.2026 10:10",
    },
    lookups
  );
  assert.equal(result.reason, "нет_заявки_на_phone");
});

test("buildMatchAudit: нет ложных должен_быть_сматчен для id на чужом SIM", () => {
  const applications = [
    {
      application_id: "APP-3-026",
      developer_id: "DEV-NN",
      developer_name: "Новый Нижний",
      url: "https://example.ru",
      phone_number: "79067084929",
      application_datetime: "02.06.2026 10:07",
    },
  ];
  const fullEvents = [
    {
      event_id: "",
      application_id: "",
      developer_id: "DEV-091",
      developer_name: "Оренбургстрой",
      phone_number: "79067084929",
      event_channel: "call",
      event_datetime: "02.06.2026 14:27",
      incoming_phone_number: "79083240868",
      identified: "да",
    },
  ];
  const aggregateDevelopers = aggregate([], applications);
  const audit = buildMatchAudit({ applications, fullEvents, aggregateDevelopers });
  assert.equal(audit.eventsOrphans.length, 1);
  assert.equal(audit.eventsOrphans[0].причина_нематча, "нет_заявки_на_phone");
  assert.equal(
    audit.eventsOrphans.filter((e) => e.причина_нематча === "должен_быть_сматчен").length,
    0
  );
});

test("findActiveAppsOnSim: несколько заявок на одном SIM", () => {
  const apps = [
    {
      application_id: "APP-3-043",
      developer_name: "РГ-Девелопмент",
      phone_number: "79670167941",
      application_datetime: "02.06.2026 13:21",
    },
    {
      application_id: "APP-1-342",
      developer_name: "Брусника",
      phone_number: "79670167941",
      application_datetime: "05.06.2026 13:20",
    },
  ];
  const active = findActiveAppsOnSim(
    {
      phone_number: "79670167941",
      event_datetime: "02.06.2026 13:33",
    },
    apps
  );
  assert.equal(active.length, 1);
  assert.equal(active[0].application_id, "APP-3-043");
  assert.equal(formatActiveApps(active), "APP-3-043:РГ-Девелопмент:+12мин");
});

test("buildMatchAudit: in-rating vs orphan split", () => {
  const applications = [
    {
      application_id: "APP-1-010",
      developer_id: "DEV-010",
      developer_name: "Альфа",
      url: "https://alfa.ru",
      phone_number: "79001111111",
      application_datetime: "01.06.2026 10:00",
    },
  ];
  const fullEvents = [
    {
      event_id: "E-SC-0001",
      application_id: "APP-1-010",
      developer_id: "DEV-010",
      developer_name: "Альфа",
      phone_number: "79001111111",
      application_datetime: "01.06.2026 10:00",
      event_channel: "call",
      event_datetime: "01.06.2026 11:00",
      incoming_phone_number: "74950000000",
      lead_response_time: 60,
      recontact: "нет",
      identified: "да",
    },
    {
      event_id: "",
      application_id: "",
      developer_id: "DEV-010",
      developer_name: "Альфа",
      phone_number: "79001111111",
      event_channel: "call",
      event_datetime: "05.06.2026 12:00",
      incoming_phone_number: "74950000000",
      identified: "да",
    },
  ];

  const aggregateDevelopers = aggregate(
    fullEvents.map((e) => ({
      application_id: String(e.application_id ?? "").trim(),
      developer_id: String(e.developer_id ?? "").trim(),
      developer_name: String(e.developer_name ?? "").trim(),
      url: "",
      event_channel: String(e.event_channel ?? "").trim().toLowerCase(),
      lead_response_time:
        e.lead_response_time === "" || e.lead_response_time == null
          ? null
          : Number(e.lead_response_time),
      recontact: String(e.recontact ?? "").trim().toLowerCase(),
      is_marked: "",
      identified: String(e.identified ?? "").trim().toLowerCase(),
      application_datetime: e.application_datetime ?? null,
    })),
    applications
  );

  const audit = buildMatchAudit({ applications, fullEvents, aggregateDevelopers });
  assert.equal(audit.eventsInRating.length, 1);
  assert.equal(audit.eventsOrphans.length, 1);
  assert.equal(audit.eventsOrphans[0].причина_нематча, "после_72ч");
  assert.equal(audit.developers[0].касаний_в_рейтинге, 1);
  assert.equal(audit.developers[0].касаний_идентифицированных_сирот, 1);
});
