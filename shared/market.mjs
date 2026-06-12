// Рыночный бенчмарк: средние и лучшие значения по агрегатам застройщиков.

const CHANNEL_KEYS = ["whatsapp", "telegram", "max", "sms"];

/** Доля входящих контактов с identified !== «да» (спам / нераспознанные). */
export function computeSpamShare(events) {
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

export function computeMarket(developers) {
  const list = Array.isArray(developers) ? developers : [];
  if (!list.length) return emptyMarket();

  const avgResponses = pick(list, (d) => d.avg_response);
  const noCallbacks = pick(list, (d) => d.no_callback_share);
  const messengerSums = list.map(messengerSum).filter((v) => v != null);

  const channels = {};
  for (const ch of CHANNEL_KEYS) {
    channels[ch] = meanInt(pick(list, (d) => (d.channel_share ? d.channel_share[ch] : null)));
  }

  return {
    sample_size: list.length,
    avg_response: stat(avgResponses, "min", roundInt),
    no_callback_share: stat(noCallbacks, "min", roundInt),
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
    avg_response: { mean: null, best: null },
    no_callback_share: { mean: null, best: null },
    messengers: { mean: null, best: null, channels },
    spam_share: { mean: null, total: 0, spam: 0 },
  };
}
