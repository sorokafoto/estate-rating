# Импорт справочников в мастер-шаблон Google Sheets

Мастер-шаблон — **единая таблица правды**. Справочники правятся только там; локальный проект синхронизируется из экспорта мастера.

## Файлы для первичного наполнения

Сгенерированы командой `npm run export-master-reference` в папке:

`data/export-for-master/`

| Файл | Вкладка в мастере | Строк (на 2026-06-13) |
|------|-------------------|------------------------|
| `*-master-reference-seed.xlsx` (3 листа) | `phone_book`, `spam_phones`, `spam_prefixes` | см. manifest |
| `*-PHONE_BOOK.csv` | `phone_book` | ~1023 |
| `*-SPAM_PHONES.csv` | `spam_phones` | ~668 |
| `*-SPAM_PREFIXES.csv` | `spam_prefixes` | ~295 |

### Как импортировать в Google Sheets

**Вариант A — один XLSX (удобнее):**

1. Откройте мастер-шаблон в Google Sheets.
2. File → Import → Upload → выберите `*-master-reference-seed.xlsx`.
3. Для каждого листа: «Replace current sheet» или создайте вкладки `phone_book`, `spam_phones`, `spam_prefixes` и вставьте данные.

**Вариант B — CSV по вкладкам:**

1. В мастере создайте вкладки с точными именами: `phone_book`, `spam_phones`, `spam_prefixes`.
2. File → Import → Upload CSV → выберите соответствующий файл → «Replace data at selected cell» → A1.

### Колонки (не менять порядок заголовков)

**phone_book** — белый список: кто звонил = застройщик

| Колонка | Описание |
|---------|----------|
| developer_id | ID из листа Справочник |
| developer_name | Название |
| url | Сайт |
| dev_phone_number | Входящий номер (11 цифр, с 7) |
| status | Подтверждён / … |

**spam_phones** — проверенный спам (номера)

| Колонка | Описание |
|---------|----------|
| phone_number | Номер |
| confidence | high / medium (в реестр попадают только high-префиксы; номера — все) |
| source | osint, manual, mined … |
| note | Комментарий |
| verified_at | Дата проверки |

**spam_prefixes** — маски пулов спама (7963*, 7495176…)

| Колонка | Описание |
|---------|----------|
| prefix | Цифры без +7 |
| confidence | high → автоматически в blacklist |
| pool_note | Откуда пул |
| phones_in_pool | Сколько номеров в пуле |

---

## Когда обогащать мастер (агент напоминает)

После этих шагов пайплайна **новые строки добавляются в мастер**, не только локально:

| Ситуация | Куда в мастере | Откуда взять |
|----------|----------------|--------------|
| Новый неизвестный звонок после `export-phones-identify` | `phone_book` или `spam_phones` | `data/working/phones_to_identify.xlsx` |
| Остаток после `classify-phones` | `phone_book` / `spam_phones` | `data/working/phones_to_review.csv` |
| Новая SMS-маркировка | `sms_book` | unknown при identify |
| Подтверждённый спам-пул (≥3 номера) | `spam_prefixes` (`confidence=high`) | `suggest-spam-prefixes` |
| Новый застройщик в выборке | `legend` + `phone_book` | вручную |

**Правило:** если агент нашёл dev/spam/маркировку — он говорит: «Добавь в мастер-шаблон, вкладка X, строки …» и после твоего подтверждения синхронизирует экспорт в `data/reference/`.

---

## Цикл синхронизации (после правок в мастере)

1. Экспорт мастера → `data/inbound/master/YYYY-MM-DD-master.xlsx`
2. `npm run sync-reference-from-master`
3. `npm run seed-spam`
4. `npm run classify-phones` → `npm run apply-phones`
5. match → `npm run update-rating`

См. [WORKFLOW.md](../WORKFLOW.md), фаза 0.
