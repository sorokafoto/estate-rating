// Валидация и нормализация внешних URL (build + browser через сгенерированный assets/url-utils.js).

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function parseExternalUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
  if (u.username || u.password) return null;
  if (!u.hostname || !u.hostname.includes(".")) return null;

  return u;
}

/** Полный href для ссылки или null, если URL небезопасен. */
export function hrefFromRaw(raw) {
  const u = parseExternalUrl(raw);
  return u ? u.href : null;
}

/** Домен без протокола для хранения в публичных данных. */
export function cleanUrl(raw) {
  const u = parseExternalUrl(raw);
  if (!u) return "";
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return host + path + u.search;
}

/** href из значения в data.json (домен без протокола). */
export function hrefFromStored(stored) {
  if (!stored || typeof stored !== "string") return null;
  return hrefFromRaw(stored);
}
