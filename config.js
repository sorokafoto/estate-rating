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
      { value: "9 063", label: "событий зафиксировано" },
      { value: "5", label: "отслеживаемых каналов" },
    ],
  },

  // Куда отправлять заявки из форм.
  // Если пусто — используется https://formsubmit.co/ajax/<formEmail>.
  formEndpoint: "",
  formEmail: "k.soroka@introvert.bz",

  // Главный CTA — «Обсудить результаты» (lead-форма).
  leadForm: {
    privacyNote:
      "Отправляя форму, вы соглашаетесь на обработку персональных данных.",
    privacyPolicyUrl: "https://introvert.bz/privacy-policy-2/",
    privacyPolicyLinkText: "обработку персональных данных",
    successMessage:
      "Спасибо за запрос. Свяжемся с вами в ближайшее время.",
    mailtoSubject: "Запрос расширенной аналитики рейтинга",
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
      desc: "Медиана времени до первого контакта. Чтобы один долгий ответ не искажал показатель.",
      type: "min_avg_response",
      top: 3,
    },
    {
      id: "persistent",
      title: "Самый настойчивый",
      desc: "Наибольшее среднее число повторных касаний на заявку за 72 часа.",
      type: "max_avg_recontacts",
      top: 3,
    },
    {
      id: "touches",
      title: "Больше всего касаний",
      desc: "Объём работы отдела продаж в цифрах. Сумма касаний: звонки, SMS и мессенджеры. По всем заявкам.",
      type: "max_total_touches",
      top: 3,
    },
    {
      id: "omnichannel",
      title: "Самый омниканальный",
      desc: "Считаем, сколько каналов для связи задействовано хотя бы раз: SMS, Max, WhatsApp, Telegram. Побеждает тот, у кого каналов больше.",
      type: "most_omnichannel",
      top: 3,
    },
    {
      id: "messengers",
      title: "Чемпион мессенджеров",
      desc: "Наибольшая суммарная доля заявок с касанием в Max, WhatsApp или Telegram.",
      type: "messenger_champion",
      top: 3,
    },
    {
      id: "bulldog_grip",
      title: "Бульдожья хватка",
      desc: "Максимум касаний по одной заявке за 72 часа.",
      type: "max_touches_per_app",
      top: 3,
    },
  ],

  // KPI-карточки вкладки «Рынок» — рыночная аналитика без имён (номинации — отдельная вкладка).
  marketCards: [
    {
      id: "no_callback",
      title: "Заявок без ответа",
      desc: "Средняя доля заявок, по которым не было ни одного контакта за 72 часа.",
      metric: "no_callback_share",
      format: "pct",
      hideBest: true,
    },
    {
      id: "silent_developers",
      title: "Застройщиков без единого ответа",
      desc: "Компаний в выборке, у которых 100% заявок остались без контакта. Часть «молчания» может быть связана с неидентифицированными звонками — см. методологию.",
      metric: "silent_developers_count",
      format: "count",
      hideBest: true,
    },
    {
      id: "response_speed",
      title: "До первого контакта",
      desc: "Типичное время до первого касания на рынке — по застройщикам, у которых был хотя бы один отклик.",
      metric: "avg_response",
      format: "minutes",
      hideBest: true,
    },
    {
      id: "slow_response",
      title: "Ответ дольше суток",
      desc: "Застройщиков, у которых типичный первый контакт наступает позже 24 часов.",
      metric: "slow_response_count",
      format: "count",
      hideBest: true,
    },
    {
      id: "spam_share",
      title: "Контакты не от застройщика",
      desc: "Доля звонков и SMS после заявки, которые пришли не от застройщика: спам, риелторы, неизвестные номера.",
      metric: "spam_share",
      format: "pct",
      hideBest: true,
    },
    {
      id: "messengers",
      title: "Контакт в мессенджере",
      desc: "Средняя доля заявок, по которым застройщик написал в Max, WhatsApp или Telegram.",
      metric: "messengers",
      format: "messengers",
      hideBest: true,
    },
  ],
};
