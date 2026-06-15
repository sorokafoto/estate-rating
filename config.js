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
      { value: "2 038", label: "заявок отправлено" },
      { value: "1 548", label: "заявок украдено" },
      { value: "7 205", label: "касаний застройщиков" },
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

  // Номинации: фиксированный порядок номинантов в nominees; значения — из data.json по type.
  nominations: [
    {
      id: "russian_borzoi",
      title: "Русская борзая",
      desc: "Показали минимальное медианное время реакции на\u00A0входящие заявки с\u00A0сайта",
      type: "min_avg_response",
      nominees: ["РГ-Девелопмент", "Sminex", "ВЫБОР"],
    },
    {
      id: "greedy_alabai",
      title: "Прожорливый алабай",
      desc: "Перезвонили по наибольшей доле заявок за\u00A0неделю исследования",
      type: "max_callback_share",
      nominees: ["Точно", "Развитие", "ТЭН"],
    },
    {
      id: "chihuahua",
      title: "Чихуахуа",
      desc: "Главные жертвы воровства заявок, где мы получили больше всего спам-звонков",
      type: "max_channel_share",
      nominees: ["AFI", "КВС", "Dogma"],
      hideValues: true,
      badge: {
        text: "Победителям в\u00A0номинации дарим скидку 10% на\u00A0amoCRM.enterprise, которая поможет избежать утечек",
        href: "https://amoprime.ru/?utm_source=estaterating&utm_medium=referral&utm_content=badge",
      },
    },
    {
      id: "jack_russell",
      title: "Джек Рассел",
      desc: "Наибольшее среднее количество касаний с\u00A0клиентами за\u00A072\u00A0часа с\u00A0получения заявки",
      type: "max_avg_recontacts",
      nominees: ["AVA", "Точно", "Самолет"],
    },
    {
      id: "bulldog_grip",
      title: "Бульдожья хватка",
      desc: "Наибольшее кол-во касаний в\u00A0клиента по\u00A0одной уникальной заявке за\u00A072\u00A0часа",
      type: "max_touches_per_app",
      nominees: ["Едино", "Самолет", "AVA"],
    },
    {
      id: "omnichannel_dachshund",
      title: "Омниканальная такса",
      desc: "Используют максимум каналов связи для\u00A0поиска клиента, который не\u00A0отвечает",
      type: "most_omnichannel",
      nominees: ["Родина", "Основа", "Каскад"],
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
      staticValue: "84 из 100",
      hideBest: true,
    },
    {
      id: "spam_share",
      title: "Заявок украдено",
      desc:
        "Бич рынка — чёрные риелторы и спамеры, которые крадут данные о заявках и посетителей сайтов застройщиков из разных источников. Больше половины всех звонков в рынке приходится на них.",
      staticValue: "76%",
      hideBest: true,
    },
    {
      id: "spam_beats_market",
      title: "проигрывают спамерам в реакции",
      desc:
        "Средне-медианное время реакции спамеров по заявкам с сайтов застройщиков — 62 минуты. Таким образом они переигрывают рынок и сразу предлагают конкурирующие объекты.",
      staticValue: "89 из 100",
      hideBest: true,
    },
  ],
};
