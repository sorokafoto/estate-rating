// Единый контракт метрик: каналы, колонки таблицы, типы номинаций.

/** Окно аналитики после заявки (lead_response_time в минутах). */
export const ANALYTICS_WINDOW_HOURS = 72;
export const ANALYTICS_WINDOW_MINUTES = ANALYTICS_WINDOW_HOURS * 60;

/** Плановое число заявок на одного застройщика в замере. */
export const PLANNED_APPLICATIONS_PER_DEVELOPER = 21;

/** Кворум: минимум успешно отправленных заявок для участия в рейтинге. */
export const APPLICATIONS_QUORUM = Math.floor(PLANNED_APPLICATIONS_PER_DEVELOPER / 2) + 1;

/** Достаточно ли заявок для публикации метрик рейтинга. */
export function hasApplicationsQuorum(applicationsSent) {
  return applicationsSent >= APPLICATIONS_QUORUM;
}

export const MESSENGER_CHANNELS = ["sms", "max", "whatsapp", "telegram"];

export const TABLE_COLUMNS = [
  { key: "rank", label: "#", kind: "rank" },
  { key: "developer_name", label: "Застройщик", kind: "name", sortable: true },
  { key: "avg_response", label: "Скорость ответа", kind: "num", sortable: true, format: "duration" },
  { key: "no_callback_share", label: "Без ответа, %", kind: "num", sortable: true, format: "pct" },
  { key: "avg_recontacts", label: "Повторные касания", kind: "num", sortable: true, format: "num" },
  { key: "total_touches", label: "Касания", kind: "num", sortable: true, format: "int" },
  { key: "call", label: "Звонок, %", kind: "channel", channel: "call", sortable: true, format: "pct" },
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
  "max_touches_per_app",
];
