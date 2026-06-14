# Рейтинг застройщиков России по реакции на входящие заявки

Одностраничный статический сайт для публичной презентации исследования: интерактивная
сортируемая таблица-рейтинг, вкладка номинаций и две CTA-формы (lead + участие в замере).

## Главный принцип — приватность

Сырые событийные данные с PII (телефоны, время событий, ID заявок) **никогда не попадают
в браузер**. Наружу деплоится только обезличенный агрегат `data.json` (метрики уровня
застройщика + название + сайт).

```
Сырые events + applications + справочники
        │  фазы 0–4 (см. WORKFLOW.md): identify → match → source.xlsx
        ▼
data/working/source.xlsx   (PII; листы Events_sms_calls + Events_messengers)
        │  npm run update-rating  (= classify + export-phones-identify + apply + build-data)
        ▼
   data.json           (только агрегаты + developer_name + url)
        │
        ▼
   статический сайт    (index.html + assets/ + config.js + data.json)
```

Подготовка `data/working/source.xlsx` из ~10k входящих событий и 2100 заявок (100 застройщиков × 21)
описана в [WORKFLOW.md](WORKFLOW.md). Локальные выгрузки — в [DATA-LAYOUT.md](DATA-LAYOUT.md).

`npm run update-rating` — **финальный пересчёт** по уже подготовленному source, а не полный pipeline от сырых выгрузок.

## Структура проекта

| Зона | Пути | Назначение |
|------|------|------------|
| **Сайт (deploy)** | `index.html`, `assets/`, `config.js`, `data.json`, `favicon.svg`, `deploy/_headers` | Публичный лендинг |
| **Pipeline** | `build/`, `scripts/`, `shared/` | Сборка и классификация (не деплоится) |
| **Данные (PII)** | `data/` — см. [DATA-LAYOUT.md](DATA-LAYOUT.md) | Выгрузки, справочники, рабочие xlsx |

| Путь | Назначение |
|------|------------|
| `index.html`, `assets/styles.css`, `assets/app.js` | сам сайт (vanilla, без зависимостей) |
| `config.js` | единая конфигурация: путь к данным, акцент, тексты форм, номинации, endpoint формы |
| `data.json` | публичный агрегат (генерируется) |
| `shared/paths.mjs` | единые пути к `data/` (fallback на legacy `private/`) |
| `build/build-data.mjs` | шаг сборки: источник → агрегат → `data.json` + проверка PII |
| `build/source.mjs` | чтение `data/working/source.xlsx` (листы `Events_sms_calls` + `Events_messengers`) |
| `build/aggregate.mjs` | расчёт метрик по застройщику |
| `build/validate.mjs` | защитная regex-проверка отсутствия телефонов/PII |
| `build/applications-sent.json` | (удалён) знаменатель заявок теперь считается по листу applications |
| `data/working/` | изменяемое состояние pipeline (`source.xlsx`, реестр) |
| `data/reference/` | синхронизированные справочники |
| `data/inbound/` | сырые снимки экспортов (не править) |

## Запуск

**Не программистам:** пошаговые сценарии и фразы для агента — в [WORKFLOW.md](WORKFLOW.md).

```bash
npm install              # один раз
npm run update-rating    # финальный пересчёт (после подготовки data/working/source.xlsx)
npm run migrate-data     # перенос из legacy private/ (dry-run; --apply для переноса)
npm run serve            # http://localhost:4321
```

Полный pipeline (парсинг, identify, match, ручная разметка номеров) — в [WORKFLOW.md](WORKFLOW.md).
Поштучно: `classify-phones`, `apply-phones`, `build-data`, `validate-pipeline`, `suggest-spam-prefixes`.
Реестр звонков: `data/working/phone_registry.json`.

Если `data/working/source.xlsx` отсутствует — `build-data` сгенерирует демо-данные и пометит
`data.json` флагом `demo: true`.

## Метрики (считаются на сборке, не в браузере)

В метрики идут только события с `identified = да`, привязанные к заявке (`application_id`),
в окне **72 часа** после `application_datetime`. Фильтр: `lead_response_time` в **минутах**, 0–4320.
События позже 72 ч хранятся в source, но в рейтинг не входят (match не заполняет `application_id`).

- **Ср. скорость ответа** (`avg_response`) — медиана `lead_response_time` (минуты) до первого контакта
- **Без ответа, %** — `(N − заявок_с_откликом) / N`, где `N` — число отправленных заявок
  (берётся из количества строк для данного застройщика на листе `applications`).
- **Перезвоны/72ч** — сумма событий с `recontact = да` на заявку.
- **Касаний всего** — сумма всех контактов (звонки, SMS, мессенджеры) по заявкам в выборке за 72 ч.
- **WhatsApp/Telegram/SMS/Max, %** — доля заявок (из `N`) с контактом по каналу.

Нет данных по метрике → `null` (в таблице «—»), не 0.

## Деплой (граница site ↔ pipeline)

**Публикуется только deploy surface:**

- `index.html`, `assets/**`, `config.js`, `data.json`, `data.js` (опционально), `favicon.svg`, `deploy/_headers`

**Никогда не заливать на хостинг:**

- `data/` — все PII-выгрузки
- `build/`, `scripts/`, `shared/` — pipeline-код
- `node_modules/`, `*.xlsx`, `*.csv`, ключи, `.env`

Локально `npm run serve` отдаёт только deploy surface; запросы к `data/`, `scripts/`, `shared/` → 403.

Папка `data/` и legacy `private/` исключены через `.gitignore`. Перекрёстные ссылки между выгрузками — `data/manifest.json` (шаблон: `data/manifest.example.json`).

Заголовки безопасности (CSP, HSTS и др.): см. `deploy/_headers` (Netlify/Cloudflare Pages) или
`deploy/nginx-security-headers.conf` (nginx). Локально те же заголовки выставляет `npm run serve`
(HSTS только на проде). Аудиты: `deploy/SECURITY-AUDIT.md`, `deploy/EMAIL-DNS-AUDIT.md`.

Секреты в git: `pre-commit install` (см. `.pre-commit-config.yaml`) или
`../../.cursor/scripts/gitleaks-scan.sh` из корня workspace.

Контракт метрик: `shared/metrics.mjs` → при сборке генерируются `assets/metrics.js` и
`assets/url-utils.js`. Тесты: `npm test`.

## CTA-формы

### Главная — «Обсудить результаты» (`#discuss-results`)

Lead-форма для застройщиков из рейтинга: персональный разбор метрик, закрытые данные,
консультация по мессенджерам и процессам продаж.

Поля: ФИО, должность, корпоративный e-mail, телефон (опц.), название застройщика, сайт,
тема обсуждения (select), комментарий (опц.). Тексты и темы — в `config.js` → `leadForm`.

При freemail-домене (gmail, yandex.ru и др.) показывается мягкое предупреждение, отправка не блокируется.

Mailto subject: `Запрос на разбор результатов рейтинга`. В теле письма — `form_type: discuss_results`.

### Вторичная — «Участвовать в следующем замере» (`#join-rating`)

Компактная форма для застройщиков, которых нет в текущем рейтинге: название + сайт.
Тексты — в `config.js` → `ratingForm`.

Mailto subject: `Заявка на участие в рейтинге застройщиков`. В теле — `form_type: join_rating`.

### Отправка

Обе формы используют общие `formEndpoint` / `formEmail`.

- Если `formEndpoint` задан — отправка идёт на него (`POST JSON`).
- Если `formEndpoint` пуст — используется безопасный fallback на
  `https://formsubmit.co/ajax/<formEmail>` (без `mailto` и без открытия почтового клиента).

## Ограничения первой версии

- Замер: 100 застройщиков, 21 заявка на каждого; в таблице на сайте — столько, сколько есть
  идентифицированных данных после match.
- Знаменатель «отправленные заявки» — считается по количеству валидных строк в листе `applications` для каждого застройщика.
