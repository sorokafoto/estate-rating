# Security audit: developer-response-rating

**Date:** 2026-06-12  
**Method:** `performing-security-headers-audit` + code review (`static-site-security` skill)  
**Local check:** `curl -sI http://127.0.0.1:4321/` (`npm run serve`)

## Summary

| Area | Status | Notes |
|------|--------|-------|
| PII boundary | PASS | `data/` и `private/` в `.gitignore`; `validate.mjs` на сборке |
| Security headers (app) | PASS | CSP, nosniff, frame deny, referrer, permissions |
| HSTS | GAP → FIXED | Добавлен в `deploy/_headers` и nginx-фрагмент; проверить на проде после деплоя |
| CSP `unsafe-inline` | ACCEPTED | Inline-инициализация Яндекс.Метрики в `index.html` |
| `connect-src` | PASS | `'self'` + Metrika; при `formEndpoint` — добавить origin API |
| Clickjacking | PASS | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| XSS / `esc()` | PASS | Динамические поля из `data.json` через `esc()`; статические HTML-фрагменты без пользовательского ввода |
| Form endpoint delivery | PASS | `mailto` убран; отправка через endpoint (`formEndpoint` или FormSubmit fallback) |
| Cookies | N/A | Сессионных cookies нет |
| Gitleaks | PENDING | См. `.gitleaks.toml` + pre-commit в репозитории проекта |
| SPF/DKIM/DMARC (`intr.bz`) | PARTIAL | См. `deploy/EMAIL-DNS-AUDIT.md` |

## Headers assessment (local dev server)

| Header | Status | Value |
|--------|--------|-------|
| Strict-Transport-Security | MISSING (local) | Ожидаемо на `http://localhost`; на проде — из `_headers` |
| Content-Security-Policy | PRESENT | см. `deploy/_headers` |
| X-Frame-Options | PRESENT | `DENY` |
| X-Content-Type-Options | PRESENT | `nosniff` |
| Referrer-Policy | PRESENT | `strict-origin-when-cross-origin` |
| Permissions-Policy | PRESENT | camera/mic/geo отключены |

### CSP notes

- **`script-src 'unsafe-inline'`** — нужен для счётчика Метрики в `<head>`. Ужесточение: вынести счётчик в `assets/metrika.js` + nonce/hash для остального inline (низкий приоритет).
- **`form-action 'self'`** — форма отправляется только через JS endpoint, без `mailto`.
- **При включении `formEndpoint`** — обновить `connect-src` во всех трёх местах: `deploy/_headers`, `deploy/nginx-security-headers.conf`, `build/serve.mjs`.

## XSS review

- `rowHtml`, контакты, номинации, market cards — пользовательские строки через `esc()`.
- Поиск по таблице — фильтр по `developer_name`, не отражается в HTML как сырой ввод.
- Рекомендация при расширении таблицы: не вставлять новые поля из JSON без `esc()`.

## Post-deploy verification

```bash
curl -sI "https://<production-host>/" | grep -iE \
  'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'
```

Дополнительно: [securityheaders.com](https://securityheaders.com), [Mozilla Observatory](https://observatory.mozilla.org).

## Priority fixes

1. ~~Добавить HSTS на прод~~ — сделано в `deploy/_headers` / nginx.
2. После деплоя — подтвердить HSTS в ответе CDN/хостинга.
3. SPF на apex `intr.bz` — см. email audit (запись на `spf.intr.bz`, не на корне).
4. Периодический `gitleaks` перед коммитом (особенно если `private/` случайно в stage).
