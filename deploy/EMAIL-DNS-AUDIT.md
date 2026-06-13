# Email DNS audit: intr.bz

**Date:** 2026-06-12  
**Context:** `formEmail: hello@intr.bz` в `config.js` (mailto-формы)  
**Method:** `implementing-dmarc-dkim-spf-email-security` (DNS lookup)

## Summary

| Control | Status | Finding |
|---------|--------|---------|
| MX | PASS | Google Workspace (`aspmx.l.google.com` + alt) |
| DKIM | PASS | `google._domainkey.intr.bz` — RSA публичный ключ Google |
| DMARC | PASS | `_dmarc.intr.bz` → CNAME `dmarc.mlgd.ru` → `v=DMARC1; p=quarantine` |
| SPF (apex) | GAP | На `intr.bz` нет `v=spf1`; SPF живёт на `spf.intr.bz` |

## Records (observed)

```
# MX
intr.bz → aspmx.l.google.com (priority 1) + alt1–alt4

# DKIM (Google Workspace selector)
google._domainkey.intr.bz → v=DKIM1; k=rsa; p=...

# DMARC
_dmarc.intr.bz → CNAME dmarc.mlgd.ru
dmarc.mlgd.ru → "v=DMARC1; p=quarantine; "

# SPF (subdomain only)
spf.intr.bz → "v=spf1 include:_spf.amocrmmail.com include:spf.mlgd.ru include:_spf.google.com ~all"

# Apex TXT
intr.bz → MS=... (Microsoft verification only)
```

## Impact for mailto forms

Письма с формы отправляет **почтовый клиент пользователя** с его домена — SPF/DKIM `intr.bz` на доставку этих писем не влияют.

Записи `intr.bz` важны для:

- исходящей почты с `@intr.bz` (ответы на заявки, рассылки);
- защиты бренда от спуфинга (DMARC `quarantine` — хорошо);
- доверия к ящику `hello@intr.bz`.

## Recommendations

### 1. SPF на apex (рекомендуется)

Добавить TXT на `intr.bz`:

```
v=spf1 include:spf.intr.bz ~all
```

или перенести содержимое `spf.intr.bz` напрямую на apex и убрать дублирование.

Проверка после изменений:

```bash
dig +short TXT intr.bz | grep spf
```

### 2. DMARC reporting (опционально)

В политике на `dmarc.mlgd.ru` добавить `rua=mailto:dmarc-reports@intr.bz` (или общий ящик) для агрегированных отчётов.

### 3. Мониторинг typosquatting (низкий приоритет)

При публичном лендинге — периодически `dnstwist intr.bz` (скилл `analyzing-typosquatting-domains-with-dnstwist`).

## Verification commands

```bash
dig +short MX intr.bz
dig +short TXT google._domainkey.intr.bz
dig +short CNAME _dmarc.intr.bz
dig +short TXT dmarc.mlgd.ru
dig +short TXT intr.bz
dig +short TXT spf.intr.bz
```
