// Агрегация сырых событий в публичные метрики уровня застройщика.
// На выходе — только обезличенные поля из белого списка.
import {
  MESSENGER_CHANNELS,
  ANALYTICS_WINDOW_MINUTES,
  hasApplicationsQuorum,
} from "../shared/metrics.mjs";
import { cleanUrl } from "../shared/url.mjs";

export { MESSENGER_CHANNELS };

/** Событие попадает в метрики рейтинга (второй барьер после match). */
export function isInAnalyticsWindow(e) {
  if (e.identified !== "да") return false;
  if (!e.application_id) return false;
  if (!e.developer_id) return false;
  const t = e.lead_response_time;
  if (typeof t !== "number" || !Number.isFinite(t)) return false;
  if (t < 0 || t > ANALYTICS_WINDOW_MINUTES) return false;
  return true;
}

/**
 * @param {object[]} events — сырые события после match/identify
 * @param {object[]} applications — фактически отправленные заявки (лист applications)
 */
export function aggregate(events, applications = []) {
  const byDev = new Map();

  for (const app of applications) {
    const developer_id = String(app.developer_id ?? "").trim();
    const application_id = String(app.application_id ?? "").trim();
    if (!developer_id || !/^APP-/i.test(application_id)) continue;

    if (!byDev.has(developer_id)) {
      byDev.set(developer_id, {
        developer_id,
        developer_name: app.developer_name || "",
        url: app.url || "",
        apps: new Map(),
      });
    }

    const dev = byDev.get(developer_id);
    if (!dev.developer_name && app.developer_name) dev.developer_name = app.developer_name;
    if (!dev.url && app.url) dev.url = app.url;
    if (!dev.apps.has(application_id)) dev.apps.set(application_id, []);
  }

  for (const e of events) {
    if (!isInAnalyticsWindow(e)) continue;
    const dev = byDev.get(e.developer_id);
    if (!dev) continue;
    const appId = e.application_id;
    if (!appId || !dev.apps.has(appId)) continue;
    dev.apps.get(appId).push(e);
  }

  const developers = [];
  for (const dev of byDev.values()) {
    const N = dev.apps.size;
    const apps = [...dev.apps.values()];
    const responded = apps.filter((appEvents) => appEvents.length > 0).length;

    const firstContacts = [];
    let totalTouches = 0;
    let totalRecontacts = 0;
    let appsWithCall = 0;
    const appsWithChannel = Object.fromEntries(MESSENGER_CHANNELS.map((c) => [c, 0]));

    for (const appEvents of apps) {
      totalTouches += appEvents.length;
      const responses = appEvents
        .map((e) => e.lead_response_time)
        .filter((v) => typeof v === "number" && v >= 0);
      if (responses.length) firstContacts.push(Math.min(...responses));
      totalRecontacts += Math.max(0, appEvents.length - 1);
      const channelsHit = new Set(appEvents.map((e) => e.event_channel));
      for (const c of MESSENGER_CHANNELS) if (channelsHit.has(c)) appsWithChannel[c] += 1;
      if (channelsHit.has("call")) appsWithCall += 1;
    }

    const channel_share = {};
    for (const c of MESSENGER_CHANNELS) {
      channel_share[c] = N > 0 ? roundInt((appsWithChannel[c] / N) * 100) : null;
    }
    channel_share.call = N > 0 ? roundInt((appsWithCall / N) * 100) : null;

    const insufficient_data = !hasApplicationsQuorum(N);

    developers.push({
      developer_name: dev.developer_name,
      url: cleanUrl(dev.url),
      applications_sent: N,
      insufficient_data,
      avg_response: insufficient_data
        ? null
        : firstContacts.length
          ? roundInt(median(firstContacts))
          : null,
      no_callback_share: insufficient_data
        ? null
        : N > 0
          ? clamp(roundInt(((N - responded) / N) * 100), 0, 100)
          : null,
      avg_recontacts: insufficient_data ? null : N > 0 ? round1(totalRecontacts / N) : null,
      total_touches: insufficient_data ? null : totalTouches,
      channel_share: insufficient_data
        ? Object.fromEntries([...MESSENGER_CHANNELS, "call"].map((c) => [c, null]))
        : channel_share,
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
