import test from "node:test";
import assert from "node:assert/strict";
import { computeMarket } from "../shared/market.mjs";

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
      median_response: 15,
      no_callback_share: 30,
      channel_share: { whatsapp: 10, telegram: 5, max: 0, sms: 2 },
    },
  ]);
  assert.equal(m.sample_size, 1);
  assert.equal(m.avg_response.mean, 20);
  assert.equal(m.avg_response.best, 20);
  assert.equal(m.median_response.mean, 15);
  assert.equal(m.no_callback_share.mean, 30);
  assert.equal(m.messengers.mean, 15);
  assert.equal(m.messengers.best, 15);
  assert.equal(m.messengers.channels.whatsapp, 10);
});

test("computeMarket: среднее по нескольким, null исключаются", () => {
  const m = computeMarket([
    { avg_response: 10, median_response: 10, no_callback_share: 20, channel_share: { whatsapp: 0, telegram: 0, max: 0, sms: 0 } },
    { avg_response: 30, median_response: 20, no_callback_share: 40, channel_share: { whatsapp: 20, telegram: 0, max: 10, sms: 0 } },
    { avg_response: null, median_response: null, no_callback_share: null, channel_share: null },
  ]);
  assert.equal(m.sample_size, 3);
  assert.equal(m.avg_response.mean, 20);
  assert.equal(m.avg_response.best, 10);
  assert.equal(m.median_response.mean, 15);
  assert.equal(m.no_callback_share.mean, 30);
  assert.equal(m.no_callback_share.best, 20);
  assert.equal(m.messengers.mean, 15);
  assert.equal(m.messengers.best, 30);
});
