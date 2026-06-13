# Раскладка локальных выгрузок (`data/`)

Все PII и сырые выгрузки хранятся в `data/` (в `.gitignore`). В репозитории коммитятся только `manifest.example.json` и `.gitkeep`-маркеры подпапок.

Перекрёстные ссылки между этапами — в `data/manifest.json` (копируйте из `manifest.example.json` при первой настройке).

## Слои

| Папка | Назначение | Правило |
|-------|------------|---------|
| `inbound/master/` | Экспорт Google Sheets (мастер-шаблон) | Имена с датой: `YYYY-MM-DD-master.xlsx` |
| `inbound/parsers/` | Выгрузки android-call-log-parser, merged events | Не править после сохранения |
| `inbound/telecom/` | Beeline/T2 детализации | Не править после сохранения |
| `inbound/manual/` | Ручные xlsx вне мастера (напр. «Идентификация номеров.xlsx`) | Снимок до seed |
| `reference/` | Справочники, синхронизированные из мастера | Read-only для classify/apply |
| `working/` | Текущее состояние pipeline | Сюда пишут npm-скрипты |
| `working/logs/` | Кэши и логи lookup | Не вход в сборку рейтинга |

## Ключевые файлы

| Файл | Слой | Кто пишет |
|------|------|-----------|
| `working/source.xlsx` | working | match + ручная правка; вход `update-rating` |
| `working/phone_registry.json` | working | `seed-spam`, `seed-phones`, `classify-phones` |
| `working/phones_to_identify.xlsx` | working | `export-phones-identify` |
| `working/phones_to_review.csv` | working | `classify-phones` |
| `working/spam_prefix_candidates.xlsx` | working | `suggest-spam-prefixes` |
| `reference/developer_official_phones.xlsx` | reference | синхронизация из PHONE_BOOK |
| `reference/spam_book.xlsx` | reference | синхронизация SPAM_PHONES/PREFIXES |
| `reference/sms_mark_reference.csv` | reference | синхронизация sms_mark_reference |

## Legacy

Старый каталог `private/` поддерживается как fallback для чтения до миграции. Новые файлы кладите только в `data/`.

Переезд: `node scripts/migrate-private-to-data.mjs --apply`

## Переменная окружения

`DRR_DATA_ROOT` — альтернативный корень данных (для тестов или внешнего диска).

См. также [WORKFLOW.md](WORKFLOW.md).
