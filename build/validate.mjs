// Защитный слой: проверяет, что в публичном data.json нет PII.
// При нарушении сборка падает (process.exit(1)).
const FORBIDDEN_KEYS = [
  "phone_number",
  "incoming_phone_number",
  "event_id",
  "event_datetime",
  "application_id",
  "application_datetime",
  "developer_id",
];

// Телефоны РФ в разных написаниях + любые длинные цепочки цифр.
const PHONE_PATTERNS = [
  /(?:\+?7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/,
  /\d{10,}/,
];
const FORBIDDEN_VALUES = [/скрыт/i];

export function validatePublicData(data) {
  const errors = [];
  const payload = data?.developers ?? data;

  const keys = collectKeys(payload);
  for (const k of FORBIDDEN_KEYS) {
    if (keys.has(k)) errors.push(`Запрещённый ключ в data.json: "${k}"`);
  }

  const strings = collectStrings(payload);
  for (const s of strings) {
    for (const re of PHONE_PATTERNS) {
      if (re.test(s)) errors.push(`Похоже на телефон/PII: "${truncate(s)}"`);
    }
    for (const re of FORBIDDEN_VALUES) {
      if (re.test(s)) errors.push(`Запрещённое значение: "${truncate(s)}"`);
    }
  }

  if (errors.length) {
    console.error("\n[build-data] PII-валидация не пройдена:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
}

function collectKeys(obj, acc = new Set()) {
  if (Array.isArray(obj)) obj.forEach((v) => collectKeys(v, acc));
  else if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      acc.add(k);
      collectKeys(obj[k], acc);
    }
  }
  return acc;
}
function collectStrings(obj, acc = []) {
  if (Array.isArray(obj)) obj.forEach((v) => collectStrings(v, acc));
  else if (obj && typeof obj === "object") Object.values(obj).forEach((v) => collectStrings(v, acc));
  else if (typeof obj === "string") acc.push(obj);
  return acc;
}
function truncate(s) {
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}
