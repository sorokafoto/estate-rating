/* Логика сайта: вкладки, сортируемая таблица, номинации, CTA-форма.
   Агрегация уже выполнена на шаге сборки — здесь только отображение data.json. */
(function () {
  "use strict";
  var CFG = window.APP_CONFIG || {};
  var URL = window.APP_URL || {};
  var METRICS = window.APP_METRICS || {};
  var MARKET = window.APP_MARKET || {};

  // ---------- Колонки таблицы (из shared/metrics.mjs через assets/metrics.js) ----------
  var COLUMNS = buildColumns(METRICS.columns || []);

  var state = { sortKey: "avg_response", dir: "asc", query: "" };
  var developers = [];
  var meta = {};
  var market = null;
  var nominationsRendered = false;
  var marketRendered = false;

  var head = document.getElementById("rank-head");
  var body = document.getElementById("rank-body");
  var searchInput = document.getElementById("search");
  var searchWrap = searchInput ? searchInput.closest(".search") : null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyConfig();
    setupTabs();
    setupSearch();
    setupForm();
    loadData();
  }

  function applyConfig() {
    if (CFG.accentColor) document.documentElement.style.setProperty("--accent", CFG.accentColor);
    renderHeroStats();
    renderPeriod();
    renderLeadFormCopy();
    var c = CFG.contact || {};
    var fc = document.getElementById("footer-contact");
    if (fc) {
      var siteHref = (c.siteHref || c.site) ? safeHref(c.siteHref || c.site) : null;
      var siteLabel = c.site || (siteHref ? stripProto(siteHref) : null);
      fc.innerHTML =
        (c.org ? esc(c.org) + "<br>" : "") +
        (siteHref
          ? '<a href="' + esc(siteHref) + '" target="_blank" rel="noopener">' + esc(siteLabel) + "</a><br>"
          : "") +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>" : "");
    }
    var fj = document.getElementById("footer-join-note");
    if (fj && c.email) {
      fj.innerHTML =
        "Не нашли себя в рейтинге?<br>" +
        "Напишите " +
        '<a href="mailto:' + esc(c.email) + '">на&nbsp;почту</a>, включим в следующий цикл.';
    }
  }

  function loadData() {
    // 1) Инлайн-данные (data.js) — работают и при открытии index.html как file:// без сервера.
    if (window.APP_DATA && window.APP_DATA.developers) {
      useData(window.APP_DATA);
      return;
    }
    // 2) Иначе грузим data.json по сети (нужен http-сервер: npm run serve).
    fetch(CFG.dataUrl || "data.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(useData)
      .catch(function (err) {
        body.innerHTML =
          '<tr class="empty-row"><td colspan="' +
          COLUMNS.length +
          '">Не удалось загрузить данные (' +
          esc(err.message) +
          "). Откройте сайт через локальный сервер: npm run serve.</td></tr>";
      });
  }

  function useData(data) {
    developers = (data.developers || []).slice();
    meta = data.meta || {};
    market = data.market || null;
    onDataReady();
  }

  function onDataReady() {
    renderPeriod();
    buildHead();
    render();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncRankWidth);
    window.addEventListener("resize", syncRankWidth);

    // Если вкладка номинаций или рынка уже открыта (диплинк) — отрисовать после загрузки данных.
    var nomTab = document.getElementById("tab-nominations");
    if (nomTab && nomTab.getAttribute("aria-selected") === "true") {
      renderNominations();
      nominationsRendered = true;
    }
    var mktTab = document.getElementById("tab-market");
    if (mktTab && mktTab.getAttribute("aria-selected") === "true") {
      renderMarket();
      marketRendered = true;
    }
  }

  // ---------- Hero stats ----------
  function renderHeroStats() {
    var stats = CFG.heroStats;
    var root = document.getElementById("hero-stats");
    if (!stats || !stats.items || !stats.items.length || !root) return;

    var grid = document.getElementById("hero-stats-grid");
    if (grid) {
      grid.innerHTML = stats.items
        .map(function (item) {
          return (
            '<li class="hero-stat">' +
            '<p class="hero-stat__value">' + esc(item.value) + "</p>" +
            '<p class="hero-stat__label">' + esc(item.label) + "</p>" +
            "</li>"
          );
        })
        .join("");
    }

    root.hidden = false;
  }

  function renderLeadFormCopy() {
    renderPrivacyNote(CFG.leadForm || {});
  }

  function renderPrivacyNote(lf) {
    var el = document.getElementById("lead-privacy");
    if (!el || !lf.privacyNote) return;

    var url = lf.privacyPolicyUrl ? safeHref(lf.privacyPolicyUrl) : null;
    var linkText = lf.privacyPolicyLinkText || "обработку персональных данных";
    var note = lf.privacyNote;
    var idx = note.indexOf(linkText);

    if (url && idx !== -1) {
      el.innerHTML =
        esc(note.slice(0, idx)) +
        '<a href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(linkText) +
        "</a>" +
        esc(note.slice(idx + linkText.length));
    } else {
      el.textContent = note;
    }
  }

  function renderPeriod() {
    var el = document.getElementById("rating-period");
    if (!el) return;
    var text = CFG.heroBadge || CFG.periodLabel || "";
    el.textContent = text;
    el.hidden = !text;
  }

  // ---------- Таблица ----------
  function buildHead() {
    var tr = document.createElement("tr");
    COLUMNS.forEach(function (col) {
      var th = document.createElement("th");
      th.className = colClass(col);
      if (col.sortable) {
        th.classList.add("col-sortable");
        th.tabIndex = 0;
        var active = state.sortKey === col.key;
        th.setAttribute("aria-sort", active ? (state.dir === "asc" ? "ascending" : "descending") : "none");
        var inner = document.createElement("span");
        inner.className = "th-inner";
        inner.appendChild(document.createTextNode(col.label));
        var arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = active ? (state.dir === "asc" ? "▲" : "▼") : "▲";
        inner.appendChild(arrow);
        th.appendChild(inner);
        th.addEventListener("click", function () { onSort(col.key); });
        th.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(col.key); }
        });
      } else {
        th.textContent = col.label;
      }
      tr.appendChild(th);
    });
    head.innerHTML = "";
    head.appendChild(tr);
  }

  function colClass(col) {
    if (col.kind === "rank") return "col-rank";
    if (col.kind === "name") return "col-name";
    return "num";
  }

  function onSort(key) {
    if (state.sortKey === key) {
      state.dir = state.dir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.dir = "asc";
    }
    buildHead();
    render();
  }

  function getValue(dev, col) {
    if (col.kind === "name") return dev.developer_name || "";
    if (col.kind === "channel") return dev.channel_share ? nullish(dev.channel_share[col.channel]) : null;
    return nullish(dev[col.key]);
  }

  function sortList(list) {
    var col = find(COLUMNS, "key", state.sortKey) || COLUMNS[2];
    var dir = state.dir === "asc" ? 1 : -1;
    return list.slice().sort(function (a, b) {
      if (Boolean(a.insufficient_data) !== Boolean(b.insufficient_data)) {
        return a.insufficient_data ? 1 : -1;
      }
      if (col.kind === "name") return cmpName(a, b) * dir;
      var av = getValue(a, col), bv = getValue(b, col);
      if (av == null && bv == null) return cmpName(a, b);
      if (av == null) return 1; // пустые всегда вниз
      if (bv == null) return -1;
      if (av === bv) return cmpName(a, b);
      return (av - bv) * dir;
    });
  }

  function cmpName(a, b) {
    return String(a.developer_name).localeCompare(String(b.developer_name), "ru");
  }

  function render() {
    var sorted = sortList(developers);
    var places = new Map();
    sorted.forEach(function (d, i) { places.set(d, i + 1); });

    var q = state.query.trim().toLowerCase();
    var visible = q
      ? sorted.filter(function (d) { return String(d.developer_name).toLowerCase().indexOf(q) !== -1; })
      : sorted;

    if (!visible.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="' + COLUMNS.length + '">Ничего не найдено</td></tr>';
    } else {
      var html = "";
      for (var i = 0; i < visible.length; i++) html += rowHtml(visible[i], places.get(visible[i]));
      body.innerHTML = html;
    }

    // Ширина колонки «#» зависит от видимого контента (фильтр/сортировка),
    // поэтому синхронизируем сдвиг липкой колонки на каждом рендере.
    syncRankWidth();
  }

  // Сдвиг липкой колонки «Застройщик» = реальная ширина колонки «#»
  // (фикс. число не подходит: ширина зависит от шрифта/контента).
  function syncRankWidth() {
    var rk = body.querySelector("tr .col-rank") || head.querySelector(".col-rank");
    var tbl = document.getElementById("rank-table");
    if (!rk || !tbl) return;
    var w = rk.getBoundingClientRect().width;
    tbl.style.setProperty("--rank-w", w + "px");
  }

  function rowHtml(d, place) {
    var insufficient = Boolean(d.insufficient_data);
    var top = !insufficient && place <= 3 ? " is-top" : "";
    var rowCls = top ? top.trim() : "";
    if (insufficient) rowCls = (rowCls ? rowCls + " " : "") + "is-insufficient";
    var cells = "";
    for (var i = 0; i < COLUMNS.length; i++) {
      var col = COLUMNS[i];
      if (col.kind === "rank") {
        cells += '<td class="col-rank"><span class="rank-num">' + (insufficient ? "—" : place) + "</span></td>";
      } else if (col.kind === "name") {
        var storedUrl = d.url || "";
        var linkHref = safeStoredHref(storedUrl);
        var rawName = d.developer_name || "—";
        var name = esc(rawName);
        var titleAttr = storedUrl
          ? ' title="' + esc(rawName + " · " + storedUrl) + '"'
          : rawName !== "—"
            ? ' title="' + esc(rawName) + '"'
            : "";
        var nameCell = linkHref
          ? '<a class="dev-link" href="' + esc(linkHref) + '"' + titleAttr + ' target="_blank" rel="noopener">' + name + "</a>"
          : '<span class="dev-link"' + titleAttr + ">" + name + "</span>";
        cells += '<td class="col-name">' + nameCell + "</td>";
      } else if (insufficient && col.key === "avg_response") {
        cells += '<td class="num is-insufficient"><span class="insufficient-label">Недостаточно данных</span></td>';
      } else {
        var v = insufficient ? null : getValue(d, col);
        var text = v == null ? "—" : col.fmt(v);
        var cls = v == null ? "num is-empty" : "num";
        if (v != null && Number(v) === 0) cls += " is-zero";
        cells += '<td class="' + cls + '">' + text + "</td>";
      }
    }
    return '<tr class="' + rowCls + '">' + cells + "</tr>";
  }

  // ---------- Поиск ----------
  function setupSearch() {
    if (!searchInput) return;
    searchInput.addEventListener("input", function () {
      state.query = searchInput.value;
      render();
    });
  }

  // ---------- Вкладки ----------
  function setupTabs() {
    var tabs = [
      document.getElementById("tab-rating"),
      document.getElementById("tab-nominations"),
      document.getElementById("tab-market"),
    ];
    var panels = {
      "tab-rating": document.getElementById("panel-rating"),
      "tab-nominations": document.getElementById("panel-nominations"),
      "tab-market": document.getElementById("panel-market"),
    };
    tabs.forEach(function (tab, idx) {
      tab.addEventListener("click", function () { activate(tab); });
      tab.addEventListener("keydown", function (e) {
        var dirKey = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dirKey) return;
        e.preventDefault();
        var next = tabs[(idx + dirKey + tabs.length) % tabs.length];
        next.focus();
        activate(next);
      });
    });

    function activate(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[t.id].hidden = !on;
      });
      if (searchWrap) searchWrap.hidden = tab.id !== "tab-rating";
      if (tab.id === "tab-nominations" && !nominationsRendered) {
        renderNominations();
        nominationsRendered = true;
      }
      if (tab.id === "tab-market" && !marketRendered) {
        renderMarket();
        marketRendered = true;
      }
    }

    // Диплинки: #nominations и #market открывают соответствующие вкладки.
    var hash = (location.hash || "").toLowerCase();
    if (hash === "#nominations") activate(tabs[1]);
    else if (hash === "#market") activate(tabs[2]);
  }

  // ---------- Номинации (ключи NOM должны совпадать с config.nominations[].type) ----------
  var NOM = {
    min_avg_response: { val: function (d) { return d.avg_response; }, dir: "asc", fmt: fmtDurationMinutes },
    max_avg_recontacts: { val: function (d) { return d.avg_recontacts; }, dir: "desc", fmt: fmtNum },
    max_total_touches: { val: function (d) { return d.total_touches; }, dir: "desc", fmt: fmtInt },
    most_omnichannel: { val: omniCount, dir: "desc", fmt: function (v) { return String(v); } },
    messenger_champion: { val: messengerSum, dir: "desc", fmt: function (v) { return fmtPct(v); } },
  };

  var CHANNELS = METRICS.channels || ["whatsapp", "telegram", "sms", "max"];

  function omniCount(d) {
    if (!d.channel_share) return null;
    var n = 0;
    CHANNELS.forEach(function (c) {
      if ((d.channel_share[c] || 0) > 0) n++;
    });
    return n;
  }
  function messengerSum(d) {
    if (!d.channel_share) return null;
    return (d.channel_share.whatsapp || 0) + (d.channel_share.telegram || 0) + (d.channel_share.max || 0);
  }

  function renderNominations() {
    var host = document.getElementById("nominations");
    var defs = CFG.nominations || [];
    host.innerHTML = defs.map(nomCardHtml).join("");
  }

  function nomCardHtml(def) {
    if (def.type === "delta") return deltaCardHtml(def);
    var spec = NOM[def.type];
    if (!spec) return "";
    var top = def.top || 5;
    var scored = developers
      .filter(function (d) { return !d.insufficient_data; })
      .map(function (d) { return { name: d.developer_name, v: nullish(spec.val(d)) }; })
      .filter(function (x) {
        if (x.v == null) return false;
        return def.type === "min_avg_response" ? true : x.v > 0;
      });
    scored.sort(function (a, b) {
      if (a.v === b.v) return String(a.name).localeCompare(String(b.name), "ru");
      return spec.dir === "asc" ? a.v - b.v : b.v - a.v;
    });
    scored = scored.slice(0, top);

    var list = scored.length
      ? scored
          .map(function (x, i) {
            return (
              '<li class="nom-item' + (i === 0 ? " nom-item--lead" : "") + '">' +
              '<span class="nom-pos">' + (i + 1) + "</span>" +
              '<span class="nom-name">' + esc(x.name) + "</span>" +
              '<span class="nom-val">' + spec.fmt(x.v) + "</span>" +
              "</li>"
            );
          })
          .join("")
      : '<li class="nom-item"><span class="nom-name muted">Недостаточно данных</span></li>';

    return (
      '<article class="nom-card">' +
      '<h3 class="nom-card__title">' + nomIcon() + esc(def.title) + "</h3>" +
      '<p class="nom-card__desc">' + esc(def.desc) + "</p>" +
      '<ol class="nom-list">' + list + "</ol>" +
      "</article>"
    );
  }

  function nomIcon() {
    return (
      '<svg class="nom-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5"/></svg>'
    );
  }

  // Карточка-хайлайт «Дельта»: самый быстрый против самого медленного.
  function deltaCardHtml(def) {
    var withResp = developers
      .filter(function (d) { return !d.insufficient_data; })
      .map(function (d) { return { name: d.developer_name, v: nullish(d.avg_response) }; })
      .filter(function (x) { return x.v != null; });

    var list;
    if (withResp.length < 2) {
      list = '<li class="nom-item"><span class="nom-name muted">Недостаточно данных</span></li>';
    } else {
      var fastest = withResp.reduce(function (a, b) { return b.v < a.v ? b : a; });
      var slowest = withResp.reduce(function (a, b) { return b.v > a.v ? b : a; });
      list =
        deltaRow("↑", "быстрее всех", fastest, true) +
        deltaRow("↓", "медленнее всех", slowest, false);
    }

    return (
      '<article class="nom-card">' +
      '<h3 class="nom-card__title">' + nomIcon() + esc(def.title) + "</h3>" +
      '<p class="nom-card__desc">' + esc(def.desc) + "</p>" +
      '<ol class="nom-list">' + list + "</ol>" +
      "</article>"
    );
  }

  function deltaRow(pos, label, item, lead) {
    return (
      '<li class="nom-item' + (lead ? " nom-item--lead" : "") + '">' +
      '<span class="nom-pos">' + pos + "</span>" +
      '<span class="nom-name">' + esc(item.name) +
      ' <span class="muted">— ' + esc(label) + "</span></span>" +
      '<span class="nom-val">' + fmtDurationMinutes(item.v) + "</span>" +
      "</li>"
    );
  }

  // ---------- По рынку ----------
  function getMarketData() {
    if (market) return market;
    if (MARKET.computeMarket) return MARKET.computeMarket(developers);
    return null;
  }

  function renderMarket() {
    var host = document.getElementById("market-cards");
    var m = getMarketData();

    if (!host) return;
    if (!m) {
      host.innerHTML = '<p class="muted">Недостаточно данных</p>';
      return;
    }

    var defs = CFG.marketCards || [];
    host.innerHTML = defs.map(function (def) { return marketCardHtml(def, m); }).join("");
  }

  function marketCardHtml(def, m) {
    var block = m[def.metric];
    if (def.metric === "messengers") block = m.messengers;

    var valueText = "—";
    var bestText = "—";
    var channelsHtml = "";

    if (block) {
      if (def.format === "messengers") {
        valueText = block.mean == null ? "—" : fmtPct(block.mean);
        bestText = block.best == null ? "—" : fmtPct(block.best);
        if (block.channels) {
          var parts = [
            "WhatsApp " + fmtChannelPct(block.channels.whatsapp),
            "Telegram " + fmtChannelPct(block.channels.telegram),
            "Max " + fmtChannelPct(block.channels.max),
          ];
          channelsHtml =
            '<p class="market-card__channels">' +
            parts.join(" · ") +
            (block.channels.sms != null ? ' <span class="market-card__sms">· SMS ' + fmtChannelPct(block.channels.sms) + "</span>" : "") +
            "</p>";
        }
      } else if (def.format === "minutes") {
        valueText = block.mean == null ? "—" : fmtDurationMinutes(block.mean);
        bestText = block.best == null ? "—" : fmtDurationMinutes(block.best);
      } else if (def.format === "pct") {
        valueText = block.mean == null ? "—" : fmtPct(block.mean);
        bestText = block.best == null ? "—" : fmtPct(block.best);
      }
    }

    var bestHtml = def.hideBest
      ? ""
      : '<p class="market-card__best">Лучший на рынке: <strong>' + esc(bestText) + "</strong></p>";

    return (
      '<article class="market-card">' +
      '<p class="market-card__value">' + esc(valueText) + "</p>" +
      '<h3 class="market-card__title">' + esc(def.title) + "</h3>" +
      '<p class="market-card__desc">' + esc(def.desc) + "</p>" +
      channelsHtml +
      bestHtml +
      "</article>"
    );
  }

  function fmtChannelPct(v) {
    return v == null ? "—" : fmtPct(v);
  }

  // ---------- CTA-формы ----------
  var FREEMAIL = [];
  var MIN_FILL_MS = 1800;
  var MIN_RETRY_MS = 15000;
  var LAST_SUBMIT_KEY = "lead_form_last_submit_at";
  var MAX_LEN = {
    fullname: 120,
    role: 120,
    email: 160,
    phone: 24,
    company: 160,
    site: 220,
    message: 2000,
  };

  function setupForm() {
    var lf = CFG.leadForm || {};
    FREEMAIL = (lf.freemailDomains || []).map(function (d) {
      return String(d).toLowerCase();
    });
    setupLeadForm();
  }

  function setupLeadForm() {
    var form = document.getElementById("lead-form");
    var status = document.getElementById("lead-form-status");
    var submit = document.getElementById("lead-submit");
    var lf = CFG.leadForm || {};
    if (!form) return;
    form.dataset.startedAt = String(Date.now());
    form.addEventListener("focusin", function () {
      if (!form.dataset.startedAt) form.dataset.startedAt = String(Date.now());
    });

    var emailInput = document.getElementById("lead-email");
    if (emailInput) {
      emailInput.addEventListener("input", function () {
        updateFreemailHint(emailInput, lf.freemailHint);
      });
      emailInput.addEventListener("blur", function () {
        updateFreemailHint(emailInput, lf.freemailHint);
      });
    }
    setupLiveValidation(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = "";
      status.className = "form-status";
      if (isBotSubmission(form)) {
        status.textContent = "Сработала антиспам-защита. Подождите пару секунд и отправьте форму снова.";
        status.classList.add("is-err");
        return;
      }
      if (isRateLimited()) {
        status.textContent = "Форма уже отправлялась недавно. Повторите попытку через 15 секунд.";
        status.classList.add("is-err");
        return;
      }

      var fullname = formField(form, "lead-fullname");
      var role = formField(form, "lead-role");
      var email = formField(form, "lead-email");
      var phone = formField(form, "lead-phone");
      var company = formField(form, "lead-company");
      var site = formField(form, "lead-site");
      var message = formField(form, "lead-message");

      var ok = true;
      if (!requireText(fullname, "lead-fullname", "Укажите ФИО")) ok = false;
      if (!requireText(role, "lead-role", "Укажите должность")) ok = false;
      if (!requireEmail(email, "lead-email")) ok = false;
      if (!requirePhone(phone, "lead-phone")) ok = false;
      if (!requireText(company, "lead-company", "Укажите название застройщика")) ok = false;

      var normalizedUrl = normalizeUrl(site.value.trim());
      if (!site.value.trim()) {
        setError("lead-site", "Укажите сайт");
        ok = false;
      } else if (!normalizedUrl) {
        setError("lead-site", "Похоже на некорректный адрес");
        ok = false;
      } else clearError("lead-site");

      if (!ok) {
        status.textContent = "Проверьте поля формы.";
        status.classList.add("is-err");
        return;
      }

      var payload = {
        form_type: "discuss_results",
        fullname: cleanText(fullname.value, MAX_LEN.fullname),
        role: cleanText(role.value, MAX_LEN.role),
        email: cleanText(email.value, MAX_LEN.email),
        phone: cleanText(normalizePhone(phone.value), MAX_LEN.phone),
        company: cleanText(company.value, MAX_LEN.company),
        site: normalizedUrl,
        message: cleanText(message.value, MAX_LEN.message),
      };

      submit.disabled = true;
      submitForm(form, payload, {
        status: status,
        submit: submit,
        subject: lf.mailtoSubject || "Запрос на разбор результатов рейтинга",
        buildBody: formatLeadBody,
        successMessage: lf.successMessage || "Заявка отправлена. Мы с вами скоро свяжемся.",
        endpointSuccessMessage: "Заявка отправлена. Мы с вами скоро свяжемся.",
      });
    });
  }

  function submitForm(form, payload, opts) {
    var endpoint = resolveFormEndpoint();
    if (!endpoint) {
      opts.status.textContent = "Не настроен endpoint формы. Укажите APP_CONFIG.formEndpoint или formEmail.";
      opts.status.classList.add("is-err");
      opts.submit.disabled = false;
      return;
    }

    opts.status.textContent = "Отправляем…";
    send(payload, endpoint, opts.subject, opts.buildBody)
      .then(function () {
        markSubmittedNow();
        form.reset();
        form.dataset.startedAt = String(Date.now());
        opts.status.textContent = opts.endpointSuccessMessage || opts.successMessage;
        opts.status.classList.add("is-ok");
      })
      .catch(function () {
        opts.status.textContent = "Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами по почте.";
        opts.status.classList.add("is-err");
      })
      .then(function () {
        opts.submit.disabled = false;
      });
  }

  function requireText(input, id, msg) {
    if (!input.value.trim()) {
      setError(id, msg);
      return false;
    }
    clearError(id);
    return true;
  }

  function requireEmail(input, id) {
    var val = input.value.trim();
    if (!val) {
      setError(id, "Укажите e-mail");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setError(id, "Похоже на некорректный e-mail");
      return false;
    }
    if (isFreemail(val)) {
      setError(id, freemailHintText());
      return true;
    }
    clearError(id);
    return true;
  }

  function requirePhone(input, id) {
    var val = input.value.trim();
    if (!val) {
      setError(id, "Укажите телефон");
      return false;
    }
    var digits = normalizePhone(val);
    if (digits.length < 10) {
      setError(id, "Укажите полный номер телефона");
      return false;
    }
    if (digits.length > 15) {
      setError(id, "Телефон выглядит некорректно");
      return false;
    }
    clearError(id);
    return true;
  }

  function setupLiveValidation(form) {
    bindValidation("lead-fullname", function (el) {
      if (el.value.trim()) clearError("lead-fullname");
    });
    bindValidation("lead-role", function (el) {
      if (el.value.trim()) clearError("lead-role");
    });
    bindValidation("lead-phone", function (el) {
      if (normalizePhone(el.value).length >= 10 && normalizePhone(el.value).length <= 15) {
        clearError("lead-phone");
      }
    });
    bindValidation("lead-company", function (el) {
      if (el.value.trim()) clearError("lead-company");
    });
    bindValidation("lead-site", function (el) {
      if (normalizeUrl(el.value.trim())) clearError("lead-site");
    });
    bindValidation("lead-message", function () {
      clearError("lead-message");
    });

    function bindValidation(id, check) {
      var el = formField(form, id);
      if (!el) return;
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") check(el);
      });
      el.addEventListener("blur", function () {
        check(el);
      });
    }
  }

  function updateFreemailHint(input, warnText) {
    var val = input.value.trim();
    if (isFreemail(val)) {
      setError(input.id, warnText || freemailHintText());
      return;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      clearError(input.id);
    }
  }

  function isFreemail(email) {
    var domain = emailDomain(email);
    return domain && FREEMAIL.indexOf(domain) !== -1;
  }

  function freemailHintText() {
    return (CFG.leadForm && CFG.leadForm.freemailHint) || "Укажите рабочую почту на домене компании";
  }

  function emailDomain(email) {
    var at = email.lastIndexOf("@");
    if (at === -1) return "";
    return email.slice(at + 1).toLowerCase();
  }

  function formatLeadBody(payload) {
    var lines = [
      "Тип формы: " + payload.form_type,
      "ФИО: " + payload.fullname,
      "Должность: " + payload.role,
      "E-mail: " + payload.email,
      "Телефон: " + (payload.phone || "—"),
      "Застройщик: " + payload.company,
      "Сайт: " + payload.site,
      "Комментарий: " + (payload.message || "—"),
    ];
    return lines.join("\n");
  }

  function formField(f, id) {
    return f.querySelector("#" + id);
  }

  function send(payload, endpoint, subject, buildBody) {
    var req = buildDeliveryPayload(payload, endpoint, subject, buildBody);
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeout = controller
      ? setTimeout(function () {
          controller.abort();
        }, 12000)
      : null;
    return fetch(endpoint, {
      method: "POST",
      headers: Object.assign({ "X-Requested-With": "XMLHttpRequest" }, req.headers),
      body: req.body,
      mode: "cors",
      credentials: "omit",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
      })
      .finally(function () {
        if (timeout) clearTimeout(timeout);
      });
  }

  function resolveFormEndpoint() {
    var direct = safeHref(CFG.formEndpoint || "");
    if (direct) return direct;
    var formEmail = cleanText(CFG.formEmail || (CFG.contact && CFG.contact.email) || "", 254);
    if (!formEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail)) return null;
    return "https://formsubmit.co/ajax/" + encodeURIComponent(formEmail);
  }

  function buildDeliveryPayload(payload, endpoint, subject, buildBody) {
    var url;
    try {
      url = new URL(endpoint);
    } catch (e) {
      return {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      };
    }
    if (url.hostname === "formsubmit.co") {
      var bodyText = buildBody ? buildBody(payload) : JSON.stringify(payload, null, 2);
      return {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: subject || "Заявка с сайта рейтинга",
          _template: "table",
          name: payload.fullname,
          email: payload.email,
          message: bodyText,
          phone: payload.phone || "",
          role: payload.role || "",
          company: payload.company || "",
          site: payload.site || "",
          form_type: payload.form_type || "discuss_results",
        }),
      };
    }
    return {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    };
  }

  function isBotSubmission(form) {
    if (isLocalDevHost()) return false;
    var trap = formField(form, "lead-company-site");
    if (trap && trap.value.trim()) return true;
    var startedAt = Number(form.dataset.startedAt || 0);
    if (!startedAt) return false;
    return Date.now() - startedAt < MIN_FILL_MS;
  }

  function isRateLimited() {
    try {
      var prev = Number(localStorage.getItem(LAST_SUBMIT_KEY) || 0);
      if (!prev) return false;
      return Date.now() - prev < MIN_RETRY_MS;
    } catch (e) {
      return false;
    }
  }

  function markSubmittedNow() {
    try {
      localStorage.setItem(LAST_SUBMIT_KEY, String(Date.now()));
    } catch (e) {}
  }

  function cleanText(value, maxLen) {
    var out = String(value == null ? "" : value).trim();
    if (!maxLen || out.length <= maxLen) return out;
    return out.slice(0, maxLen);
  }

  function isLocalDevHost() {
    var h = String((window.location && window.location.hostname) || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  }

  function setError(id, msg) {
    var input = document.getElementById(id);
    input.setAttribute("aria-invalid", "true");
    var span = document.querySelector('.field__error[data-for="' + id + '"]');
    if (span) span.textContent = msg;
    return true;
  }
  function clearError(id) {
    var input = document.getElementById(id);
    input.removeAttribute("aria-invalid");
    var span = document.querySelector('.field__error[data-for="' + id + '"]');
    if (span) span.textContent = "";
  }

  function normalizeUrl(raw) {
    var trimmed = cleanText(raw, MAX_LEN.site);
    if (!trimmed) return "";
    var href = URL.hrefFromRaw ? URL.hrefFromRaw(trimmed) || "" : "";
    if (href) return cleanText(href, MAX_LEN.site);
    try {
      var candidate = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
      var parsed = new window.URL(candidate);
      if (!/^https?:$/i.test(parsed.protocol)) return "";
      if (!parsed.hostname || parsed.hostname.indexOf(".") === -1) return "";
      return cleanText(parsed.href, MAX_LEN.site);
    } catch (e) {
      return "";
    }
  }

  function normalizePhone(raw) {
    return String(raw || "").replace(/\D+/g, "");
  }

  function safeHref(raw) {
    return URL.hrefFromRaw ? URL.hrefFromRaw(raw) : null;
  }

  function safeStoredHref(stored) {
    return URL.hrefFromStored ? URL.hrefFromStored(stored) : null;
  }

  function buildColumns(defs) {
    if (!defs.length) {
      console.warn("[app] APP_METRICS.columns не загружен — запустите npm run build-data");
      return [];
    }
    return defs.map(function (col) {
      var out = Object.assign({}, col);
      if (col.format === "pct") out.fmt = fmtPct;
      else if (col.format === "int") out.fmt = fmtInt;
      else if (col.format === "num") out.fmt = fmtNum;
      else if (col.format === "duration") out.fmt = fmtDurationMinutes;
      return out;
    });
  }

  // ---------- Утилиты ----------
  function fmtNum(v) {
    return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  }
  function fmtInt(v) {
    return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }
  function fmtPct(v) {
    return Number(v).toLocaleString("ru-RU") + "%";
  }
  /** Минуты из data.json → «5 мин.», «1 ч. 5 мин.», «71 ч. 39 мин.» */
  function fmtDurationMinutes(v) {
    var total = Math.round(Number(v));
    if (!Number.isFinite(total)) return "—";
    if (total < 60) return total + " мин.";
    var h = Math.floor(total / 60);
    var m = total % 60;
    var text = h + " ч.";
    if (m) text += " " + m + " мин.";
    return text;
  }
  function nullish(v) {
    return v === undefined ? null : v;
  }
  function find(arr, key, val) {
    for (var i = 0; i < arr.length; i++) if (arr[i][key] === val) return arr[i];
    return null;
  }
  function stripProto(u) {
    return String(u || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
