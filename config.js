/*
  Единая точка конфигурации сайта.
  Меняйте здесь: источник данных, акцентный цвет, тексты, endpoint формы.
*/
window.APP_CONFIG = {
  // Путь к публичному агрегату (генерируется build-data).
  dataUrl: "data.json",

  // Один акцентный цвет (плоская заливка). Применяется через CSS-переменную.
  accentColor: "#1F44FF",

  // Бейдж над заголовком hero и период в футере.
  heroBadge: "II квартал 2026 года",

  // Фактоиды масштаба исследования в hero (статичный копирайт).
  heroStats: {
    items: [
      { value: "100", label: "застройщиков России" },
      { value: "2 100+", label: "заявок отправлено" },
      { value: "6 000+", label: "событий собрано" },
      { value: "5", label: "каналов под наблюдением" },
    ],
  },

  // Куда отправлять заявку из CTA-формы.
  // Если пусто — используется mailto-фолбэк на formEmail (без сторонних сервисов).
  formEndpoint: "",
  formEmail: "hello@intr.bz",

  // Контакты в футере.
  contact: {
    org: "Интроверт системс",
    site: "https://introvert.bz/",
    email: "hello@intr.bz",
  },

  // Номинации считаются из data.json (имена не захардкожены).
  // type — какую метрику и в какую сторону брать; logic в app.js.
  nominations: [
    {
      id: "fastest",
      title: "Самый быстрый ответ",
      desc: "Наименьшее среднее время до первого контакта по любому каналу.",
      type: "min_avg_response",
      top: 5,
    },
    {
      id: "persistent",
      title: "Самый настойчивый",
      desc: "Больше всего повторных контактов за 72 часа на заявку.",
      type: "max_avg_recontacts",
      top: 5,
    },
    {
      id: "touches",
      title: "Больше всего касаний",
      desc: "Наибольшее среднее число касаний (любой канал) за 72 часа на заявку.",
      type: "max_avg_touches",
      top: 5,
    },
    {
      id: "marked",
      title: "Лучшая маркировка номеров",
      desc: "Наибольшая доля маркированных номеров.",
      type: "max_marked_share",
      top: 5,
    },
    {
      id: "omnichannel",
      title: "Самый омниканальный",
      desc: "Наибольшее число каналов с ненулевой долей контактов.",
      type: "most_omnichannel",
      top: 5,
    },
    {
      id: "messengers",
      title: "Чемпион мессенджеров",
      desc: "Наибольшая суммарная доля контактов в WhatsApp, Telegram и Max.",
      type: "messenger_champion",
      top: 5,
    },
  ],

  // KPI-карточки вкладки «По рынку» — данные из data.json.market (или fallback в app.js).
  marketCards: [
    {
      id: "avg_response",
      title: "Среднее время ответа",
      desc: "Сколько минут в среднем проходит от заявки до первого контакта по любому каналу.",
      metric: "avg_response",
      format: "minutes",
    },
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
      id: "median_response",
      title: "Медиана времени ответа",
      desc: "Типичная скорость первого контакта — без влияния единичных задержек.",
      metric: "median_response",
      format: "minutes",
    },
  ],
};
