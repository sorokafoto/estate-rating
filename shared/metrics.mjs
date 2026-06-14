// Единый контракт метрик: каналы, колонки таблицы, типы номинаций.

/** Окно аналитики после заявки (lead_response_time в минутах). */
export const ANALYTICS_WINDOW_HOURS = 72;
export const ANALYTICS_WINDOW_MINUTES = ANALYTICS_WINDOW_HOURS * 60;

/** Плановое число заявок на одного застройщика в замере. */
export const PLANNED_APPLICATIONS_PER_DEVELOPER = 21;

/** Кворум: минимум успешно отправленных заявок для участия в рейтинге. */
export const APPLICATIONS_QUORUM = Math.floor(PLANNED_APPLICATIONS_PER_DEVELOPER / 2) + 1;

/** Порог no_call_share (%), выше которого застройщик уходит в «Недостаточно данных». */
export const NO_CALL_INSUFFICIENT_THRESHOLD = 90;

/** Достаточно ли заявок для публикации метрик рейтинга. */
export function hasApplicationsQuorum(applicationsSent) {
  return applicationsSent >= APPLICATIONS_QUORUM;
}

export const MESSENGER_CHANNELS = ["sms", "max", "whatsapp", "telegram"];

export const TABLE_COLUMNS = [
  { key: "rank", label: "#", kind: "rank" },
  { key: "developer_name", label: "Застройщик", kind: "name", sortable: true },
  {
    key: "avg_call_response",
    labelLines: ["Медианная скорость", "первого звонка"],
    kind: "num",
    sortable: true,
    format: "duration",
  },
  {
    key: "no_call_share",
    labelLines: ["Не перезвонили", "(% заявок)"],
    kind: "num",
    sortable: true,
    format: "pct",
  },
  {
    key: "avg_touches_per_responded_app",
    labelLines: ["Кол-во касаний", "за 72 часа"],
    kind: "num",
    sortable: true,
    format: "num",
  },
  {
    key: "messenger_penetration_share",
    labelLines: ["Проникновение", "мессенджеров"],
    kind: "num",
    sortable: true,
    format: "pct",
  },
  {
    key: "messenger_sms",
    label: "SMS",
    labelIcon: "sms",
    kind: "messenger_symbol",
    channel: "sms",
    sortable: true,
    format: "messenger_symbol",
  },
  {
    key: "messenger_max",
    label: "Max",
    labelIcon: "max",
    kind: "messenger_symbol",
    channel: "max",
    sortable: true,
    format: "messenger_symbol",
  },
  {
    key: "messenger_whatsapp",
    label: "WhatsApp",
    labelIcon: "whatsapp",
    kind: "messenger_symbol",
    channel: "whatsapp",
    sortable: true,
    format: "messenger_symbol",
  },
  {
    key: "messenger_telegram",
    label: "Telegram",
    labelIcon: "telegram",
    kind: "messenger_symbol",
    channel: "telegram",
    sortable: true,
    format: "messenger_symbol",
  },
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
