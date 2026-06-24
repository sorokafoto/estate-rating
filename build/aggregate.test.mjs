import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, mergeLegendDevelopers, insufficientDeveloperStub } from "./aggregate.mjs";

function app(overrides = {}) {
  return {
    application_id: "APP-a1",
    developer_id: "d1",
    developer_name: "Тест Дев",
    url: "example.ru",
    phone_number: "+79990000001",
    application_datetime: new Date("2026-06-01"),
    ...overrides,
  };
}

function appsForDev(count, devOverrides = {}) {
  const apps = [];
  for (let i = 1; i <= count; i++) {
    apps.push(
      app({
        application_id: `APP-a${i}`,
        ...devOverrides,
      })
    );
  }
  return apps;
}

function event(overrides = {}) {
  return {
    developer_id: "d1",
    developer_name: "Тест Дев",
    url: "example.ru",
    application_id: "APP-a1",
    identified: "да",
    lead_response_time: 10,
    recontact: "нет",
    event_channel: "whatsapp",
    ...overrides,
  };
}

/** Минимум заявок со звонком, чтобы no_call_share < 90% при N заявок. */
function minCallsToStayInRating(N) {
  for (let k = 1; k <= N; k++) {
    if (Math.round(((N - k) / N) * 100) < 90) return k;
  }
  return N;
}

/** Добавляет звонки на свободные заявки, чтобы застройщик остался в рейтинге. */
function padCallsForRating(events, applications) {
  const N = applications.length;
  const needed = minCallsToStayInRating(N);
  const appsWithCall = new Set(
    events
      .filter((e) => e.event_channel === "call" && e.application_id)
      .map((e) => e.application_id)
  );
  const extra = [...events];
  for (let i = 1; appsWithCall.size < needed && i <= N; i++) {
    const application_id = `APP-a${i}`;
    if (appsWithCall.has(application_id)) continue;
    extra.push(
      event({ application_id, event_channel: "call", lead_response_time: 1 })
    );
    appsWithCall.add(application_id);
  }
  return extra;
}

test("aggregate: avg_response — медиана времени ответа по заявкам", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 10 }),
      event({ application_id: "APP-a2", lead_response_time: 30 }),
      event({ application_id: "APP-a3", event_channel: "call", lead_response_time: 10 }),
      event({ application_id: "APP-a4", event_channel: "call", lead_response_time: 30 }),
    ],
    applications
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].avg_response, 20);
  assert.equal(devs[0].applications_sent, 11);
  assert.equal(devs[0].insufficient_data, false);
});

test("aggregate: avg_response округляется до целых минут (.5 вверх)", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 361 }),
      event({ application_id: "APP-a2", lead_response_time: 362 }),
      event({ application_id: "APP-a3", event_channel: "call", lead_response_time: 361 }),
      event({ application_id: "APP-a4", event_channel: "call", lead_response_time: 362 }),
    ],
    applications
  );
  assert.equal(devs[0].avg_response, 362);
});

test("aggregate: no_callback_share при N=11 и одной заявке с откликом", () => {
  const applications = appsForDev(11);
  const devs = aggregate([event({ application_id: "APP-a1" })], applications);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_callback_share, null);
});

test("aggregate: dev с заявкой без событий остаётся в агрегате", () => {
  const applications = appsForDev(11);
  const devs = aggregate([], applications);
  assert.equal(devs.length, 1);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_callback_share, null);
  assert.equal(devs[0].avg_response, null);
  assert.equal(devs[0].total_touches, null);
});

test("aggregate: no_callback_share = 100 при N>=11 и нуле откликов", () => {
  const applications = appsForDev(11);
  const devs = aggregate([], applications);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_callback_share, null);
  assert.equal(devs[0].applications_sent, 11);
});

test("aggregate: N_dev считается от фактических заявок, не от 21", () => {
  const applications = appsForDev(17);
  const devs = aggregate(
    padCallsForRating(
      [event({ application_id: "APP-a1", event_channel: "telegram" })],
      applications
    ),
    applications
  );
  assert.equal(devs[0].applications_sent, 17);
  assert.equal(devs[0].channel_share.telegram, 6); // 1/17 ≈ 5.88 → 6
});

test("aggregate: событие без matching application_id не создаёт dev", () => {
  const applications = [app({ application_id: "APP-a1" })];
  const devs = aggregate(
    [event({ application_id: "APP-orphan", developer_id: "d2", developer_name: "Чужой" })],
    applications
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].developer_name, "Тест Дев");
});

test("aggregate: игнорирует события с identified != да", () => {
  const applications = appsForDev(11);
  const devs = aggregate([event({ identified: "нет" })], applications);
  assert.equal(devs.length, 1);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_callback_share, null);
  assert.equal(devs[0].avg_response, null);
});

test("aggregate: игнорирует звонки без application_id", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [event({ event_channel: "call", application_id: "", lead_response_time: 5 })],
    applications
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_callback_share, null);
});

test("aggregate: null метрики при отсутствии откликов", () => {
  const applications = appsForDev(11);
  const devs = aggregate([], applications);
  assert.equal(devs.length, 1);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].avg_response, null);
  assert.equal(devs[0].no_callback_share, null);
});

test("aggregate: channel_share считается от N_dev", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    padCallsForRating(
      [event({ application_id: "APP-a1", event_channel: "telegram" })],
      applications
    ),
    applications
  );
  assert.equal(devs[0].channel_share.telegram, 9); // 1/11 ≈ 9.09 → 9
  assert.equal(devs[0].channel_share.whatsapp, 0);
});

test("aggregate: опасный URL отбрасывается", () => {
  const applications = [app({ url: "evil.com@phishing.tld" })];
  const devs = aggregate([event({ url: "evil.com@phishing.tld" })], applications);
  assert.equal(devs[0].url, "");
});

test("aggregate: игнорирует события вне окна 72ч (lead_response_time > 4320 мин)", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 5000 }),
      event({ application_id: "APP-a2", lead_response_time: 3600 }),
      event({ application_id: "APP-a3", event_channel: "call", lead_response_time: 3600 }),
      event({ application_id: "APP-a4", event_channel: "call", lead_response_time: 3600 }),
    ],
    applications
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].avg_response, 3600);
  assert.equal(devs[0].no_callback_share, 73);
});

test("aggregate: isInAnalyticsWindow отсекает отрицательный lead_response_time", () => {
  const applications = appsForDev(11);
  const devs = aggregate([event({ application_id: "APP-a1", lead_response_time: -5 })], applications);
  assert.equal(devs.length, 1);
  assert.equal(devs[0].avg_response, null);
});

test("aggregate: recontact только для событий в окне", () => {
  const applications = appsForDev(19);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 10, recontact: "нет" }),
      event({ application_id: "APP-a1", lead_response_time: 5000, recontact: "да" }),
      event({ application_id: "APP-a18", event_channel: "call", lead_response_time: 1 }),
      event({ application_id: "APP-a19", event_channel: "call", lead_response_time: 1 }),
    ],
    applications
  );
  assert.equal(devs[0].avg_recontacts, 0);
  assert.equal(devs[0].total_touches, 3);
});

test("aggregate: total_touches — сумма событий, не среднее на N", () => {
  const applications = appsForDev(19);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a2" }),
      event({ application_id: "APP-a18", event_channel: "call", lead_response_time: 1 }),
      event({ application_id: "APP-a19", event_channel: "call", lead_response_time: 1 }),
    ],
    applications
  );
  assert.equal(devs[0].total_touches, 6);
});

test("aggregate: max_touches_per_app — рекорд касаний по одной заявке", () => {
  const applications = appsForDev(19);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a2" }),
      event({ application_id: "APP-a18", event_channel: "call", lead_response_time: 1 }),
      event({ application_id: "APP-a19", event_channel: "call", lead_response_time: 1 }),
    ],
    applications
  );
  assert.equal(devs[0].max_touches_per_app, 3);
});

test("aggregate: insufficient_data при N < 11 обнуляет метрики", () => {
  const applications = appsForDev(8);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 0, event_channel: "call" }),
      event({ application_id: "APP-a2", lead_response_time: 30, event_channel: "sms" }),
    ],
    applications
  );
  assert.equal(devs[0].applications_sent, 8);
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].avg_response, null);
  assert.equal(devs[0].no_callback_share, null);
  assert.equal(devs[0].avg_recontacts, null);
  assert.equal(devs[0].total_touches, null);
  assert.equal(devs[0].max_touches_per_app, null);
  assert.equal(devs[0].channel_share.call, null);
  assert.equal(devs[0].avg_call_response, null);
  assert.equal(devs[0].no_call_share, null);
  assert.equal(devs[0].messenger_penetration_share, null);
});

test("aggregate: кворум при N = 11", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 5, event_channel: "call" }),
      event({ application_id: "APP-a2", lead_response_time: 5, event_channel: "call" }),
    ],
    applications
  );
  assert.equal(devs[0].insufficient_data, false);
  assert.equal(devs[0].avg_response, 5);
});

test("mergeLegendDevelopers: добавляет stub для застройщика без заявок", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", lead_response_time: 5, event_channel: "call" }),
      event({ application_id: "APP-a2", lead_response_time: 5, event_channel: "call" }),
    ],
    applications
  );
  assert.equal(devs.length, 1);

  const merged = mergeLegendDevelopers(devs, [
    { developer_id: "DEV-049", developer_name: "ССК", url: "https://sskuban.ru/" },
  ]);
  assert.equal(merged.length, 2);

  const ssk = merged.find((d) => d.developer_name === "ССК");
  assert.ok(ssk);
  assert.equal(ssk.applications_sent, 0);
  assert.equal(ssk.insufficient_data, true);
  assert.equal(ssk.url, "sskuban.ru");
  assert.equal(ssk.avg_response, null);
  assert.equal(ssk.total_touches, null);
});

test("insufficientDeveloperStub: N=0 обнуляет метрики", () => {
  const stub = insufficientDeveloperStub({ developer_name: "ССК", url: "https://sskuban.ru/" });
  assert.equal(stub.insufficient_data, true);
  assert.equal(stub.channel_share.call, null);
  assert.equal(stub.avg_call_response, null);
  assert.equal(stub.messenger_channel_share.sms, null);
});

test("aggregate: avg_call_response — медиана первого звонка по заявке, не всех звонков", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 10 }),
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 50 }),
      event({ application_id: "APP-a2", event_channel: "call", lead_response_time: 30 }),
    ],
    applications
  );
  assert.equal(devs[0].avg_call_response, 20);
});

test("aggregate: avg_call_response — медиана устойчива к выбросам", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 0 }),
      event({ application_id: "APP-a2", event_channel: "call", lead_response_time: 1 }),
      event({ application_id: "APP-a3", event_channel: "call", lead_response_time: 956 }),
    ],
    applications
  );
  assert.equal(devs[0].avg_call_response, 1);
});

test("aggregate: SMS без звонка не входит в avg_call_response, но увеличивает no_call_share", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 10 }),
      event({ application_id: "APP-a2", event_channel: "call", lead_response_time: 20 }),
      event({ application_id: "APP-a3", event_channel: "sms", lead_response_time: 5 }),
    ],
    applications
  );
  assert.equal(devs[0].insufficient_data, false);
  assert.equal(devs[0].avg_call_response, 15);
  assert.equal(devs[0].no_call_share, 82);
});

test("aggregate: no_call_share >= 90% → insufficient_data и null метрики", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 10 })],
    applications
  );
  assert.equal(devs[0].insufficient_data, true);
  assert.equal(devs[0].no_call_share, null);
  assert.equal(devs[0].avg_call_response, null);
});

test("aggregate: no_call_share = 89% остаётся в рейтинге", () => {
  const applications = appsForDev(19);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 10 }),
      event({ application_id: "APP-a2", event_channel: "call", lead_response_time: 20 }),
    ],
    applications
  );
  assert.equal(devs[0].insufficient_data, false);
  assert.equal(devs[0].no_call_share, 89);
});

test("aggregate: avg_touches_per_responded_app = totalTouches / respondedApps", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    [
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a1" }),
      event({ application_id: "APP-a2" }),
      event({ application_id: "APP-a3", event_channel: "call", lead_response_time: 1 }),
      event({ application_id: "APP-a4", event_channel: "call", lead_response_time: 1 }),
    ],
    applications
  );
  assert.equal(devs[0].avg_touches_per_responded_app, 1.5);
});

test("aggregate: messenger_penetration_share = messengerApps / N", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    padCallsForRating(
      [
        event({ application_id: "APP-a1", event_channel: "whatsapp" }),
        event({ application_id: "APP-a2", event_channel: "call" }),
      ],
      applications
    ),
    applications
  );
  assert.equal(devs[0].messenger_penetration_share, 9);
});

test("aggregate: messenger_channel_share считается внутри messengerApps", () => {
  const applications = appsForDev(11);
  const devs = aggregate(
    padCallsForRating(
      [
        event({ application_id: "APP-a1", event_channel: "sms" }),
        event({ application_id: "APP-a2", event_channel: "whatsapp" }),
        event({ application_id: "APP-a3", event_channel: "call" }),
      ],
      applications
    ),
    applications
  );
  assert.equal(devs[0].messenger_channel_share.sms, 50);
  assert.equal(devs[0].messenger_channel_share.whatsapp, 50);
  assert.equal(devs[0].messenger_penetration_share, 18);
});

test("aggregate: first_call_by_day_type — медианы будни vs выходные", () => {
  const applications = appsForDev(11).map((a, i) => ({
    ...a,
    day_of_week: i < 8 ? "monday" : "saturday",
  }));
  const events = padCallsForRating(
    [
      event({ application_id: "APP-a1", event_channel: "call", lead_response_time: 10 }),
      event({ application_id: "APP-a2", event_channel: "call", lead_response_time: 30 }),
      event({ application_id: "APP-a9", event_channel: "call", lead_response_time: 100 }),
      event({ application_id: "APP-a10", event_channel: "call", lead_response_time: 200 }),
    ],
    applications
  );
  const devs = aggregate(events, applications);
  const slice = devs[0].first_call_by_day_type;
  assert.equal(slice.weekday.n, 2);
  assert.equal(slice.weekday.median_minutes, 20);
  assert.equal(slice.weekend.n, 2);
  assert.equal(slice.weekend.median_minutes, 150);
  assert.equal(slice.weekend_slower, true);
});
