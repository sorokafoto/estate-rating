import test from "node:test";
import assert from "node:assert/strict";
import { computeMarket, computeSpamShare } from "../shared/market.mjs";

test("computeMarket: пустой массив", () => {
  const m = computeMarket([]);
  assert.equal(m.sample_size, 0);
  assert.equal(m.avg_response.mean, null);
  assert.equal(m.messengers.mean, null);
});

test("computeMarket: один застройщик", () => {
  const m = computeMarket([
    {
      avg_response: 20,
      no_callback_share: 30,
      channel_share: { whatsapp: 10, telegram: 5, max: 0, sms: 2 },
    },
  ]);
  assert.equal(m.sample_size, 1);
  assert.equal(m.avg_response.mean, 20);
  assert.equal(m.avg_response.best, 20);
  assert.equal(m.no_callback_share.mean, 30);
  assert.equal(m.messengers.mean, 15);
  assert.equal(m.messengers.best, 15);
  assert.equal(m.messengers.channels.whatsapp, 10);
});

test("computeMarket: среднее по нескольким, null исключаются", () => {
  const m = computeMarket([
    { avg_response: 10, no_callback_share: 20, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
    { avg_response: 30, no_callback_share: 40, channel_share: { whatsapp: 20, telegram: 0, max: 10, sms: 0 } },
    { avg_response: null, no_callback_share: null, channel_share: null },
  ]);
  assert.equal(m.sample_size, 3);
  assert.equal(m.avg_response.mean, 20);
  assert.equal(m.avg_response.best, 10);
  assert.equal(m.no_callback_share.mean, 30);
  assert.equal(m.no_callback_share.best, 20);
  assert.equal(m.messengers.mean, 15);
  assert.equal(m.messengers.best, 30);
});

test("computeMarket: исключает insufficient_data из бенчмарка", () => {
  const m = computeMarket([
    { avg_response: 10, no_callback_share: 20, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
    {
      insufficient_data: true,
      avg_response: 0,
      no_callback_share: 50,
      channel_share: { whatsapp: 100, telegram: 0, max: 0, sms: 0 },
    },
  ]);
  assert.equal(m.sample_size, 1);
  assert.equal(m.avg_response.mean, 10);
  assert.equal(m.avg_response.best, 10);
});

test("computeSpamShare: доля identified !== да", () => {
  const s = computeSpamShare([
    { identified: "да" },
    { identified: "да" },
    { identified: "нет" },
    { identified: "да" },
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.spam, 1);
  assert.equal(s.mean, 25);
});

test("computeSpamShare: пустой массив", () => {
  const s = computeSpamShare([]);
  assert.equal(s.mean, null);
  assert.equal(s.total, 0);
});

test("computeMarket: silent_developers_count и slow_response_count", () => {
  const m = computeMarket([
    { no_callback_share: 100, avg_response: 2000, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
    { no_callback_share: 100, avg_response: 10, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
    { no_callback_share: 50, avg_response: 1400, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
  ]);
  assert.equal(m.silent_developers_count, 2);
  assert.equal(m.slow_response_count, 1);
});
