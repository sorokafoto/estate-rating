/*
  Единая точка конфигурации сайта.
  Меняйте здесь: источник данных, акцентный цвет, тексты, endpoint формы.
*/
window.APP_CONFIG = {
  // Путь к публичному агрегату (генерируется build-data).
  dataUrl: "data.json",

  // Один акцентный цвет (плоская заливка). Применяется через CSS-переменную.
  accentColor: "#1F44FF",

  // Подпись периода в шапке таблицы (results-bar).
  heroBadge: "II квартал 2026 года",

  // Фактоиды масштаба исследования в hero (статичный копирайт).
  heroStats: {
    items: [
      { value: "100", label: "застройщиков России" },
      { value: "2 000+", label: "заявок отправлено" },
      { value: "10 000+", label: "событий собрано" },
      { value: "5", label: "отслеживаемых каналов" },
    ],
  },

  // Куда отправлять заявки из форм.
  // Если пусто — используется mailto-фолбэк на formEmail (без сторонних сервисов).
  formEndpoint: "",
  formEmail: "hello@intr.bz",

  // Главный CTA — «Обсудить результаты» (lead-форма).
  leadForm: {
    privacyNote:
      "Отправляя форму, вы соглашаетесь на обработку персональных данных",
    privacyPolicyUrl: "https://introvert.bz/privacy-policy-2/",
    privacyPolicyLinkText: "обработку персональных данных",
    successMessage:
      "Спасибо за сообщение, мы с вами скоро свяжемся",
    mailtoSubject: "Запрос на разбор результатов рейтинга",
    freemailDomains: [
      "gmail.com",
      "googlemail.com",
      "yandex.ru",
      "ya.ru",
      "mail.ru",
      "bk.ru",
      "inbox.ru",
      "list.ru",
      "icloud.com",
      "outlook.com",
      "hotmail.com",
    ],
    freemailHint: "Укажите рабочую почту на домене компании",
  },

  // Контакты в футере.
  contact: {
    org: "Интроверт Системс",
    site: "https://introvert.bz/",
    siteHref:
      "https://introvert.bz/?utm_source=estaterating&utm_medium=referral&utm_content=footer",
    email: "hello@intr.bz",
  },

  // Номинации считаются из data.json (имена не захардкожены).
  // type — какую метрику и в какую сторону брать; logic в app.js.
  nominations: [
    {
      id: "fastest",
      title: "Самый быстрый ответ",
      desc: "Рейтинг по медиане времени до первого контакта по любому каналу — она не искажается единичными долгими ответами. В таблице этот показатель назван «ср. скорость ответа» для наглядности.",
      type: "min_avg_response",
      top: 3,
    },
    {
      id: "persistent",
      title: "Самый настойчивый",
      desc: "Больше всего повторных контактов за 72 часа на заявку.",
      type: "max_avg_recontacts",
      top: 3,
    },
    {
      id: "touches",
      title: "Больше всего касаний",
      desc: "Наибольшее суммарное число контактов (звонки, SMS, мессенджеры) за период замера.",
      type: "max_total_touches",
      top: 3,
    },
    {
      id: "omnichannel",
      title: "Самый омниканальный",
      desc: "Наибольшее число каналов с ненулевой долей контактов.",
      type: "most_omnichannel",
      top: 3,
    },
    {
      id: "messengers",
      title: "Чемпион мессенджеров",
      desc: "Наибольшая суммарная доля контактов в WhatsApp, Telegram и Max.",
      type: "messenger_champion",
      top: 3,
    },
  ],

  // KPI-карточки вкладки «По рынку» — данные из data.json.market (или fallback в app.js).
  marketCards: [
    {
      id: "no_callback",
      title: "Заявок без ответа",
      desc: "Доля заявок, по которым не было контакта в течение 72 часов.",
      metric: "no_callback_share",
      format: "pct",
    },
    {
      id: "messengers",
      title: "Мессенджеры",
      desc: "Суммарная доля заявок с контактом в WhatsApp, Telegram или Max.",
      metric: "messengers",
      format: "messengers",
    },
    {
      id: "response_speed",
      title: "Ср. скорость ответа",
      desc: "Типичное время первого контакта по выборке застройщиков.",
      metric: "avg_response",
      format: "minutes",
    },
    {
      id: "spam_share",
      title: "Процент спам-звонков (нераспознанных)",
      desc: "Доля входящих контактов на наши номера, которые не удалось отнести к застройщику.",
      metric: "spam_share",
      format: "pct",
      hideBest: true,
    },
  ],
};
