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
  var rowCount = document.getElementById("row-count");
  var searchInput = document.getElementById("search");

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
    var period = document.getElementById("rating-period");
    if (period && CFG.periodLabel) period.textContent = CFG.periodLabel;
    renderHeroStats();
    var c = CFG.contact || {};
    var fc = document.getElementById("footer-contact");
    if (fc) {
      var siteHref = c.site ? safeHref(c.site) : null;
      fc.innerHTML =
        (c.org ? esc(c.org) + "<br>" : "") +
        (siteHref
          ? '<a href="' + esc(siteHref) + '" target="_blank" rel="noopener">' + esc(stripProto(siteHref)) + "</a><br>"
          : "") +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>" : "");
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

    var intro = document.getElementById("hero-stats-intro");
    if (intro) {
      intro.textContent = stats.intro || "";
      intro.hidden = !stats.intro;
    }

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
    sorted.forEach(function (d, i) { d.__place = i + 1; });

    var q = state.query.trim().toLowerCase();
    var visible = q
      ? sorted.filter(function (d) { return String(d.developer_name).toLowerCase().indexOf(q) !== -1; })
      : sorted;

    if (!visible.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="' + COLUMNS.length + '">Ничего не найдено</td></tr>';
    } else {
      var html = "";
      for (var i = 0; i < visible.length; i++) html += rowHtml(visible[i]);
      body.innerHTML = html;
    }

    rowCount.textContent = q
      ? "Показано " + visible.length + " из " + sorted.length
      : sorted.length + " застройщиков";

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

  function rowHtml(d) {
    var top = d.__place <= 3 ? " is-top" : "";
    var cells = "";
    for (var i = 0; i < COLUMNS.length; i++) {
      var col = COLUMNS[i];
      if (col.kind === "rank") {
        cells += '<td class="col-rank"><span class="rank-num">' + d.__place + "</span></td>";
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
      } else {
        var v = getValue(d, col);
        var text = v == null ? "—" : col.fmt(v);
        var cls = v == null ? "num is-empty" : "num";
        cells += '<td class="' + cls + '">' + text + "</td>";
      }
    }
    return "<tr class=\"" + (top ? top.trim() : "") + "\">" + cells + "</tr>";
  }

  // ---------- Поиск ----------
  function setupSearch() {
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

  // ---------- Номинации ----------
  var NOM = {
    min_avg_response: { val: function (d) { return d.avg_response; }, dir: "asc", fmt: function (v) { return fmtNum(v) + " мин"; } },
    max_avg_recontacts: { val: function (d) { return d.avg_recontacts; }, dir: "desc", fmt: fmtNum },
    max_avg_touches: { val: function (d) { return d.avg_touches; }, dir: "desc", fmt: fmtNum },
    max_marked_share: { val: function (d) { return d.marked_share; }, dir: "desc", fmt: function (v) { return fmtPct(v); } },
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
    var spec = NOM[def.type];
    if (!spec) return "";
    var top = def.top || 5;
    var scored = developers
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

  // ---------- По рынку ----------
  function getMarketData() {
    if (market) return market;
    if (MARKET.computeMarket) return MARKET.computeMarket(developers);
    return null;
  }

  function renderMarket() {
    var intro = document.getElementById("market-intro");
    var host = document.getElementById("market-cards");
    var m = getMarketData();
    var n = meta.developers_count || developers.length || 0;

    if (intro) {
      intro.textContent = n
        ? "Средние по " + n + " застройщик" + pluralRu(n, "", "ам", "ам") + " в выборке"
        : "";
    }

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
        valueText = block.mean == null ? "—" : fmtNum(block.mean) + " мин";
        bestText = block.best == null ? "—" : fmtNum(block.best) + " мин";
      } else if (def.format === "pct") {
        valueText = block.mean == null ? "—" : fmtPct(block.mean);
        bestText = block.best == null ? "—" : fmtPct(block.best);
      }
    }

    return (
      '<article class="market-card">' +
      '<p class="market-card__value">' + esc(valueText) + "</p>" +
      '<h3 class="market-card__title">' + esc(def.title) + "</h3>" +
      '<p class="market-card__desc">' + esc(def.desc) + "</p>" +
      channelsHtml +
      '<p class="market-card__best">Лучший на рынке: <strong>' + esc(bestText) + "</strong></p>" +
      "</article>"
    );
  }

  function fmtChannelPct(v) {
    return v == null ? "—" : fmtPct(v);
  }

  function pluralRu(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ---------- CTA-форма ----------
  function setupForm() {
    var form = document.getElementById("cta-form");
    var status = document.getElementById("form-status");
    var submit = document.getElementById("cta-submit");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = "";
      status.className = "form-status";

      var name = field(form, "f-name");
      var site = field(form, "f-site");
      var contact = form.querySelector("#f-contact").value.trim();

      var ok = true;
      if (!name.value.trim()) { ok = setError("f-name", "Укажите название застройщика") && false; }
      else clearError("f-name");

      var normalizedUrl = normalizeUrl(site.value.trim());
      if (!site.value.trim()) { setError("f-site", "Укажите сайт"); ok = false; }
      else if (!normalizedUrl) { setError("f-site", "Похоже на некорректный адрес"); ok = false; }
      else clearError("f-site");

      if (!ok) { status.textContent = "Проверьте поля формы."; status.classList.add("is-err"); return; }

      var payload = { name: name.value.trim(), site: normalizedUrl, contact: contact };
      submit.disabled = true;
      status.textContent = "Отправляем…";

      send(payload)
        .then(function () {
          form.reset();
          status.textContent = "Заявка отправлена. Спасибо — добавим вас в следующий цикл.";
          status.classList.add("is-ok");
        })
        .catch(function () {
          status.textContent = "Не удалось отправить автоматически. Откроем письмо вручную…";
          status.classList.add("is-err");
          mailtoFallback(payload);
        })
        .then(function () { submit.disabled = false; });
    });

    function field(f, id) { return f.querySelector("#" + id); }
  }

  function send(payload) {
    if (CFG.formEndpoint) {
      return fetch(CFG.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
      });
    }
    // Нет бэкенда — открываем почтовый клиент (без сторонних сервисов).
    return new Promise(function (resolve) {
      mailtoFallback(payload);
      resolve();
    });
  }

  function mailtoFallback(payload) {
    var to = CFG.formEmail || (CFG.contact && CFG.contact.email) || "";
    if (!to) return;
    var subject = "Заявка на участие в рейтинге застройщиков";
    var bodyText =
      "Застройщик: " + payload.name + "\nСайт: " + payload.site + "\nКонтакт: " + (payload.contact || "—");
    window.location.href =
      "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyText);
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
    if (URL.hrefFromRaw) return URL.hrefFromRaw(raw) || "";
    return legacyNormalizeUrl(raw);
  }

  function safeHref(raw) {
    return URL.hrefFromRaw ? URL.hrefFromRaw(raw) : legacyNormalizeUrl(raw) || null;
  }

  function safeStoredHref(stored) {
    if (URL.hrefFromStored) return URL.hrefFromStored(stored);
    return stored ? legacyNormalizeUrl(stored) : null;
  }

  function legacyNormalizeUrl(raw) {
    if (!raw) return "";
    var candidate = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    try {
      var u = new URL(candidate);
      if (u.username || u.password) return "";
      if (!u.hostname || u.hostname.indexOf(".") === -1) return "";
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.href;
    } catch (e) {
      return "";
    }
  }

  function buildColumns(defs) {
    if (!defs.length) {
      console.warn("[app] APP_METRICS.columns не загружен — запустите npm run build-data");
      return [];
    }
    return defs.map(function (col) {
      var out = Object.assign({}, col);
      if (col.format === "pct") out.fmt = fmtPct;
      else if (col.format === "num") out.fmt = fmtNum;
      return out;
    });
  }

  // ---------- Утилиты ----------
  function fmtNum(v) {
    return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  }
  function fmtPct(v) {
    return Number(v).toLocaleString("ru-RU") + "%";
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
