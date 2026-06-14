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
      id: "response_speed",
      title: "До первого контакта",
      desc:
        "Среднее время от заявки на сайте до первого звонка от застройщика на рынке — очень долгое. В половине случаев быстрее звонят спамеры, которые перехватывают заявки.",
      metric: "avg_response",
      format: "minutes",
      hideBest: true,
    },
    {
      id: "no_callback",
      title: "Заявок без ответа",
      desc:
        "По каждой третьей заявке, оставленной клиентами, застройщики вообще ни разу не перезванивают, либо их номера телефонии блокируются анти-спам фильтрами операторов связи.",
      metric: "no_callback_share",
      format: "pct",
      hideBest: true,
    },
    {
      id: "touches_per_app",
      title: "Касания делают за 3 дня",
      desc:
        "Типичный застройщик звонит клиенту по заявке даже чуть реже, чем один раз в день, и почти никогда не догоняет SMS-сообщениями, в мессенджерах и перезвонами в течение дня.",
      staticValue: "2,5",
      hideBest: true,
    },
    {
      id: "no_messengers",
      title: "Вообще не используют мессенджеры",
      desc:
        "В колл-центрах застройщиков практически отсутствует культура и техническая возможность общения в мессенджерах. Если клиент не берёт трубку, никто не спрашивает удобное время звонка в чате.",
      staticValue: "76 из 100",
      hideBest: true,
    },
    {
      id: "spam_share",
      title: "Всех касаний делают спамеры",
      desc:
        "Бич рынка — чёрные риелторы и спамеры, которые крадут данные о заявках и посетителей сайтов застройщиков из разных источников. Почти половина всех звонков в рынке приходится на них.",
      metric: "spam_share",
      format: "pct",
      hideBest: true,
    },
    {
      id: "spam_beats_market",
      title: "Обыгрывают спамеров в реакции",
      desc:
        "Средне-медианное время реакции спамеров по заявкам с сайтов застройщиков — 62 минуты. Таким образом они переигрывают 89% рынка и сразу предлагают конкурирующие объекты.",
      staticValue: "11 из 100",
      hideBest: true,
    },
  ],
};
