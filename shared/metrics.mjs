// Единый контракт метрик: каналы, колонки таблицы, типы номинаций.

export const MESSENGER_CHANNELS = ["sms", "max", "whatsapp", "telegram"];

export const TABLE_COLUMNS = [
  { key: "rank", label: "#", kind: "rank" },
  { key: "developer_name", label: "Застройщик", kind: "name", sortable: true },
  { key: "avg_response", label: "Ср. скорость ответа, мин", kind: "num", sortable: true, format: "int" },
  { key: "no_callback_share", label: "Без ответа, %", kind: "num", sortable: true, format: "pct" },
  { key: "avg_recontacts", label: "Перезвоны", kind: "num", sortable: true, format: "num" },
  { key: "total_touches", label: "Касания", kind: "num", sortable: true, format: "int" },
  { key: "sms", label: "SMS, %", kind: "channel", channel: "sms", sortable: true, format: "pct" },
  { key: "max", label: "Max, %", kind: "channel", channel: "max", sortable: true, format: "pct" },
  { key: "whatsapp", label: "WhatsApp, %", kind: "channel", channel: "whatsapp", sortable: true, format: "pct" },
  { key: "telegram", label: "Telegram, %", kind: "channel", channel: "telegram", sortable: true, format: "pct" },
];

/** Типы номинаций из config.js — ключи должны совпадать с NOM в app.js. */
export const NOMINATION_TYPES = [
  "min_avg_response",
  "max_avg_recontacts",
  "max_total_touches",
  "most_omnichannel",
  "messenger_champion",
];
