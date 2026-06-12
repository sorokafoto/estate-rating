// Агрегация сырых событий в публичные метрики уровня застройщика.
// На выходе — только обезличенные поля из белого списка.
import { MESSENGER_CHANNELS } from "../shared/metrics.mjs";
import { cleanUrl } from "../shared/url.mjs";

export { MESSENGER_CHANNELS };

export function aggregate(events, applicationsSent) {
  const def = applicationsSent?.default ?? 21;
  const overrides = applicationsSent?.overrides ?? {};

  // Группировка: developer_id -> application_id -> [events]
  const byDev = new Map();
  for (const e of events) {
    if (e.identified !== "да") continue; // в метрики идут только опознанные события
    if (!e.developer_id) continue;
    if (!byDev.has(e.developer_id)) {
      byDev.set(e.developer_id, {
        developer_id: e.developer_id,
        developer_name: e.developer_name || "",
        url: e.url || "",
        apps: new Map(),
        events: [],
      });
    }
    const dev = byDev.get(e.developer_id);
    if (!dev.developer_name && e.developer_name) dev.developer_name = e.developer_name;
    if (!dev.url && e.url) dev.url = e.url;
    dev.events.push(e);
    const appId = e.application_id || `__noapp_${dev.events.length}`;
    if (!dev.apps.has(appId)) dev.apps.set(appId, []);
    dev.apps.get(appId).push(e);
  }

  const developers = [];
  for (const dev of byDev.values()) {
    const N = clampPositive(overrides[dev.developer_id] ?? def);
    const apps = [...dev.apps.values()];
    const responded = apps.length;

    const firstContacts = [];
    let totalTouches = 0;
    let totalRecontacts = 0;
    const appsWithChannel = Object.fromEntries(MESSENGER_CHANNELS.map((c) => [c, 0]));

    for (const appEvents of apps) {
      totalTouches += appEvents.length;
      const responses = appEvents
        .map((e) => e.lead_response_time)
        .filter((v) => typeof v === "number" && v >= 0);
      if (responses.length) firstContacts.push(Math.min(...responses));
      totalRecontacts += appEvents.filter((e) => e.recontact === "да").length;
      const channelsHit = new Set(appEvents.map((e) => e.event_channel));
      for (const c of MESSENGER_CHANNELS) if (channelsHit.has(c)) appsWithChannel[c] += 1;
    }

    const channel_share = {};
    for (const c of MESSENGER_CHANNELS) {
      channel_share[c] = N > 0 ? roundInt((appsWithChannel[c] / N) * 100) : null;
    }

    developers.push({
      developer_name: dev.developer_name,
      url: cleanUrl(dev.url),
      avg_response: firstContacts.length ? roundInt(median(firstContacts)) : null,
      no_callback_share: N > 0 ? clamp(roundInt(((N - responded) / N) * 100), 0, 100) : null,
      avg_recontacts: N > 0 ? round1(totalRecontacts / N) : null,
      total_touches: totalTouches,
      channel_share,
    });
  }

  return developers;
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function roundInt(x) {
  return Math.round(x);
}
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
function clampPositive(x) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

