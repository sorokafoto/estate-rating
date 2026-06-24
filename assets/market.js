/* Сгенерировано build-data — не редактировать вручную. */
(function (global) {
"use strict";
// Рыночный бенчмарк: агрегаты по рынку (без имён застройщиков).

const CHANNEL_KEYS = ["whatsapp", "telegram", "max", "sms"];

/** Порог «ответ дольше суток» для market.slow_response_count (минуты). */
const SLOW_RESPONSE_THRESHOLD_MINUTES = 1440;

/** Доля входящих контактов с identified !== «да» (спам / нераспознанные). */
function computeSpamShare(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return { mean: null, total: 0, spam: 0 };

  const spam = list.filter((e) => e.identified !== "да").length;
  const total = list.length;
  return {
    mean: roundInt((spam / total) * 100),
    total,
    spam,
  };
}

function computeMarket(developers) {
  const list = (Array.isArray(developers) ? developers : []).filter((d) => !d.insufficient_data);
  if (!list.length) return emptyMarket();

  const avgResponses = pick(list, (d) => d.avg_response);
  const avgCallResponses = pick(list, (d) => d.avg_call_response);
  const noCallbacks = pick(list, (d) => d.no_callback_share);
  const noCallShares = pick(list, (d) => d.no_call_share);
  const messengerSums = list.map(messengerSum).filter((v) => v != null);

  const channels = {};
  for (const ch of CHANNEL_KEYS) {
    channels[ch] = meanInt(pick(list, (d) => (d.channel_share ? d.channel_share[ch] : null)));
  }

  const silent_developers_count = list.filter((d) => d.no_callback_share === 100).length;
  const slow_response_count = list.filter(
    (d) => d.avg_response != null && d.avg_response > SLOW_RESPONSE_THRESHOLD_MINUTES
  ).length;

  return {
    sample_size: list.length,
    silent_developers_count,
    slow_response_count,
    avg_response: stat(avgResponses, "min", roundInt),
    avg_call_response: stat(avgCallResponses, "min", roundInt),
    no_callback_share: stat(noCallbacks, "min", roundInt),
    no_call_share: stat(noCallShares, "min", roundInt),
    messengers: {
      mean: meanInt(messengerSums),
      best: messengerSums.length ? roundInt(Math.max(...messengerSums)) : null,
      channels,
    },
  };
}

function messengerSum(d) {
  if (!d.channel_share) return null;
  return (
    (d.channel_share.whatsapp || 0) +
    (d.channel_share.telegram || 0) +
    (d.channel_share.max || 0)
  );
}

function pick(devs, fn) {
  const out = [];
  for (const d of devs) {
    const v = fn(d);
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function stat(values, better, roundFn) {
  if (!values.length) return { mean: null, best: null };
  const m = mean(values);
  const b = better === "min" ? Math.min(...values) : Math.max(...values);
  return { mean: roundFn(m), best: roundFn(b) };
}

function mean(a) {
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function meanInt(a) {
  if (!a.length) return null;
  return roundInt(mean(a));
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function roundInt(x) {
  return Math.round(x);
}

function emptyMarket() {
  const channels = Object.fromEntries(CHANNEL_KEYS.map((c) => [c, null]));
  return {
    sample_size: 0,
    silent_developers_count: 0,
    slow_response_count: 0,
    avg_response: { mean: null, best: null },
    avg_call_response: { mean: null, best: null },
    no_callback_share: { mean: null, best: null },
    no_call_share: { mean: null, best: null },
    messengers: { mean: null, best: null, channels },
    spam_share: { mean: null, total: 0, spam: 0 },
  };
}

global.APP_MARKET = { computeMarket: computeMarket, computeSpamShare: computeSpamShare };
})(typeof window !== "undefined" ? window : globalThis);
