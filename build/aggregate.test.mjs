import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "./aggregate.mjs";

const applicationsSent = { default: 2, overrides: {} };

function event(overrides = {}) {
  return {
    developer_id: "d1",
    developer_name: "Тест Дев",
    url: "example.ru",
    application_id: "a1",
    identified: "да",
    lead_response_time: 10,
    recontact: "нет",
    event_channel: "whatsapp",
    is_marked: "да",
    ...overrides,
  };
}

test("aggregate: среднее и медиана времени ответа", () => {
  const devs = aggregate(
    [
      event({ application_id: "a1", lead_response_time: 10 }),
      event({ application_id: "a2", lead_response_time: 30 }),
    ],
    applicationsSent
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].avg_response, 20);
  assert.equal(devs[0].median_response, 20);
});

test("aggregate: no_callback_share при N=2 и одной заявке с откликом", () => {
  const devs = aggregate([event({ application_id: "a1" })], applicationsSent);
  assert.equal(devs[0].no_callback_share, 50);
});

test("aggregate: игнорирует события с identified != да", () => {
  const devs = aggregate([event({ identified: "нет" })], applicationsSent);
  assert.equal(devs.length, 0);
});

test("aggregate: null метрики при отсутствии откликов", () => {
  const devs = aggregate([], applicationsSent);
  assert.equal(devs.length, 0);
});

test("aggregate: channel_share считается от N", () => {
  const devs = aggregate([event({ application_id: "a1", event_channel: "telegram" })], applicationsSent);
  assert.equal(devs[0].channel_share.telegram, 50);
  assert.equal(devs[0].channel_share.whatsapp, 0);
});

test("aggregate: опасный URL отбрасывается", () => {
  const devs = aggregate([event({ url: "evil.com@phishing.tld" })], applicationsSent);
  assert.equal(devs[0].url, "");
});

test("aggregate: total_touches — сумма событий, не среднее на N", () => {
  const devs = aggregate(
    [
      event({ application_id: "a1" }),
      event({ application_id: "a1" }),
      event({ application_id: "a1" }),
      event({ application_id: "a2" }),
    ],
    applicationsSent
  );
  assert.equal(devs[0].total_touches, 4);
});
