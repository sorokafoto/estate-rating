// Fallback-генератор сырья (если приватного источника нет).
// Та же схема, что и реальный лог; данные помечаются как демо.
const CHANNELS = ["call", "whatsapp", "telegram", "sms", "max"];
const NAMES = [
  "Самолёт", "ПИК", "ЛСР", "Эталон", "ДОНСТРОЙ", "ФСК", "Гранель", "А101",
  "Брусника", "Setl Group", "ЦДС", "КОРТРОС", "ИНГРАД", "Глоракс", "Кронверк",
  "Унистрой", "Расцветай", "ССК", "КАСКАД", "Союз", "Атлант", "Родина", "Аквилон",
];

let seed = 42;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(a) {
  return a[Math.floor(rnd() * a.length)];
}

export function generateMock() {
  const events = [];
  let eid = 1;
  NAMES.forEach((name, di) => {
    const developer_id = `DEV-${String(di + 1).padStart(3, "0")}`;
    const url = `${name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-")}.ru`;
    const apps = 6 + Math.floor(rnd() * 12);
    for (let a = 0; a < apps; a++) {
      const application_id = `APP-${di}-${String(a).padStart(3, "0")}`;
      const touches = 1 + Math.floor(rnd() * 4);
      for (let t = 0; t < touches; t++) {
        events.push({
          application_id,
          developer_id,
          developer_name: name,
          url,
          event_channel: t === 0 ? pick(["whatsapp", "max", "call"]) : pick(CHANNELS),
          lead_response_time: Math.max(1, Math.round(rnd() * 600)),
          recontact: t === 0 ? "нет" : pick(["да", "нет"]),
          is_marked: pick(["да", "нет", "нет"]),
          identified: rnd() > 0.05 ? "да" : "нет",
          application_datetime: null,
        });
        eid++;
      }
    }
  });
  return events;
}
