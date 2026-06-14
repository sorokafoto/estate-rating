// Реестр телефонов: нормализация, prefix-правила, классификация incoming_phone_number.
export const REGISTRY_VERSION = 1;

/** Подтверждённые spam-пулы (7 цифр после 7). */
export const DEFAULT_SPAM_PREFIXES = [
  "7906847",
  "7966136",
  "7969053",
  "7963755",
  "7967596",
  "7981294",
  "7981201",
  "7968083",
  "7871277",
  "7495493",
  "7964516",
  "7981584",
  "7960841",
  "7961053",
  "7963108",
  "7967143",
  "7967969",
  "7963978",
  "7964386",
  "7968996",
  "7969281",
  "7991779",
  "7963636",
  "7963659",
  "7963661",
  "7977089",
  "7960045",
  "7961052",
  "7963640",
  "7963754",
  "7964594",
  "7964714",
  "7965096",
  "7965152",
  "7965287",
  "7965380",
  "7965381",
  "7966135",
  "7967211",
  "7968410",
  "7968418",
  "7969121",
];

/** Whitelist застройщиков по префиксу (выше spam-диапазонов). */
export const DEFAULT_DEV_PREFIXES = [
  {
    prefix: "796288",
    developer_name: "AVA",
    developer_id: "DEV-026",
    url: "https://avadom.ru",
  },
];

/** Широкие spam-диапазоны Beeline/MTS (применяются после dev-whitelist). */
export const DEFAULT_SPAM_RANGES = ["7963", "7967", "7968", "7969", "79068", "7981"];

export const DEFAULT_NOTE_KEYWORDS = [
  { keyword: "риэлтор", entity_type: "spam" },
  { keyword: "агент москва", entity_type: "spam" },
  { keyword: "кц ", entity_type: "spam" },
  { keyword: "ао все операторы", entity_type: "spam" },
  { keyword: "ао мы вам перезвоним", entity_type: "spam" },
  { keyword: "ао мы перезвоним", entity_type: "spam" },
  { keyword: "операторы заняты", entity_type: "spam" },
];

export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}

export function emptyRegistry() {
  return {
    meta: {
      version: REGISTRY_VERSION,
      updated_at: null,
      seeded_from: null,
    },
    prefix_rules: {
      developer: DEFAULT_DEV_PREFIXES,
      spam: DEFAULT_SPAM_PREFIXES,
      spam_ranges: DEFAULT_SPAM_RANGES,
    },
    note_keywords: DEFAULT_NOTE_KEYWORDS,
    phones: {},
  };
}

/**
 * @param {object} registry
 * @param {string} phone - normalized
 * @param {Map<string, object>} catalog - phone -> {developer_id, developer_name, url}
 * @param {{ note?: string }} [ctx]
 * @returns {{ entity_type: string, source: string, rule?: string, developer_id?: string, developer_name?: string, url?: string, confidence: string }}
 */
export function classifyPhone(registry, phone, catalog, ctx = {}) {
  const manual = registry.phones?.[phone];
  if (manual?.entity_type && manual.source === "manual") {
    return { ...manual, source: "manual" };
  }

  const devRules = registry.prefix_rules?.developer ?? DEFAULT_DEV_PREFIXES;
  for (const rule of devRules) {
    if (phone.startsWith(rule.prefix)) {
      return {
        entity_type: "developer",
        source: "prefix_dev",
        rule: rule.prefix,
        developer_id: rule.developer_id ?? "",
        developer_name: rule.developer_name ?? "",
        url: rule.url ?? "",
        confidence: "high",
      };
    }
  }

  const cat = catalog.get(phone);
  if (cat) {
    return {
      entity_type: "developer",
      source: "catalog",
      developer_id: cat.developer_id,
      developer_name: cat.developer_name,
      url: cat.url ?? "",
      confidence: "high",
    };
  }

  if (manual?.entity_type) {
    return { ...manual, source: manual.source ?? "registry" };
  }

  const spamPrefixes = registry.prefix_rules?.spam ?? DEFAULT_SPAM_PREFIXES;
  for (const prefix of spamPrefixes) {
    if (phone.startsWith(prefix)) {
      return {
        entity_type: "spam",
        source: "prefix_block",
        rule: prefix,
        confidence: "high",
      };
    }
  }

  const spamRanges = registry.prefix_rules?.spam_ranges ?? DEFAULT_SPAM_RANGES;
  for (const range of spamRanges) {
    if (phone.startsWith(range)) {
      return {
        entity_type: "spam",
        source: "prefix_range",
        rule: range,
        confidence: "medium",
      };
    }
  }

  const note = String(ctx.note ?? "").toLowerCase();
  if (note) {
    for (const { keyword, entity_type } of registry.note_keywords ?? DEFAULT_NOTE_KEYWORDS) {
      if (note.includes(keyword.toLowerCase())) {
        return {
          entity_type,
          source: "note_keyword",
          rule: keyword,
          confidence: "high",
        };
      }
    }
  }

  return { entity_type: "unknown", source: "none", confidence: "low" };
}

/** Запись в registry.phones без перезаписи manual. */
export function upsertPhoneEntry(registry, phone, entry) {
  const existing = registry.phones[phone];
  if (existing?.source === "manual") return false;
  registry.phones[phone] = entry;
  return true;
}
