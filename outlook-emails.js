/**
 * outlook-emails.js
 * Outlook emaily modul pro kb-dashboard.
 */

const OutlookEmailsModule = (() => {
  let allEmails = [];
  let activeFolder = "";
  let showHidden = false;
  let badgeEditor = null;
  const activeFilters = { date: "", akce: false, high: false };

  const PRIORITIES = ["vysoká", "střední", "nízká"];
  const CATEGORIES = [
    "akce_required",
    "informace",
    "meeting",
    "projekt",
    "administrativa",
    "ostatní"
  ];

  const FOLDERS = [
    { value: "", label: "Všechny složky" },
    { value: "Doručená pošta", label: "Doručená pošta" },
    { value: "0000_ACTION", label: "0000_ACTION" },
    { value: "0000_KB – k jednání", label: "0000_KB – k jednání" },
    { value: "0000_KB - zpracováno", label: "0000_KB - zpracováno" },
    { value: "0000_WAITING", label: "0000_WAITING" }
  ];

  const CSS = `
    .oe-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:16px; }
    .oe-search { position:relative; }
    .oe-search input { padding-left:28px; min-width:220px; }
    .oe-search-icon { position:absolute; left:8px; top:50%; transform:translateY(-50%); opacity:.45; font-style:normal; }
    .oe-stats { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
    .oe-stat {
      background:var(--color-bg-secondary, #f8f7f4);
      border:1px solid var(--color-border, rgba(60,60,58,.12));
      border-radius:8px; padding:10px 16px; min-width:100px; flex:1;
      cursor:pointer; transition:all .15s;
    }
    .oe-stat:hover {
      border-color:var(--color-accent, #534ab7);
      background:var(--color-bg, #fff);
    }
    .oe-stat-val { font-size:22px; font-weight:600; color:var(--color-text-primary, #2c2c2a); }
    .oe-stat-lbl { font-size:11px; color:var(--color-text-secondary, #888); margin-top:2px; }
    .oe-updated {
      font-size:12px; color:var(--color-text-secondary, #888);
      margin-bottom:14px; padding:8px 12px;
      background:var(--color-bg-secondary, #f8f7f4);
      border:1px solid var(--color-border, rgba(60,60,58,.1));
      border-radius:8px;
    }
    .oe-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
    .oe-tab {
      padding:6px 12px; border-radius:20px; font-size:12px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.15)); background:transparent;
      cursor:pointer; transition:all .15s; color:var(--color-text-secondary, #888);
    }
    .oe-tab:hover { border-color:var(--color-accent, #534ab7); color:var(--color-text-primary, #2c2c2a); }
    .oe-tab.active { background:#eeedfe; color:#534ab7; border-color:#534ab7; }
    .oe-toggle {
      display:inline-flex; align-items:center; gap:6px; font-size:13px;
      color:var(--color-text-secondary, #888); cursor:pointer; user-select:none;
    }
    .oe-toggle input { accent-color:#534ab7; }
    .oe-list { display:flex; flex-direction:column; gap:8px; }
    .oe-card {
      background:var(--color-bg, #fff);
      border:1px solid var(--color-border, rgba(60,60,58,.12));
      border-radius:10px; overflow:hidden; transition:opacity .15s, background .15s;
    }
    .oe-card-resolved { opacity:.55; background:var(--color-bg-secondary, #f8f7f4); }
    .oe-card-hidden { opacity:.5; }
    .oe-card-head {
      display:flex; align-items:flex-start; gap:10px; padding:12px 14px;
      cursor:pointer; user-select:none;
    }
    .oe-card-head:hover { background:var(--color-bg-secondary, #f8f7f4); }
    .oe-card-toggle {
      width:22px; height:22px; border-radius:6px; flex-shrink:0;
      border:1px solid var(--color-border, rgba(60,60,58,.15));
      display:flex; align-items:center; justify-content:center;
      font-size:11px; color:var(--color-text-secondary, #888);
    }
    .oe-card.open .oe-card-toggle { transform:rotate(90deg); }
    .oe-card-main { flex:1; min-width:0; }
    .oe-card-title { font-size:14px; font-weight:600; line-height:1.35; margin:0 0 4px; }
    .oe-card-meta { font-size:11px; color:var(--color-text-secondary, #888); display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    .oe-card-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start; position:relative; }
    .oe-badge {
      display:inline-block; padding:2px 8px; border-radius:20px;
      font-size:11px; font-weight:500; white-space:nowrap;
    }
    .oe-badge-clickable { cursor:pointer; }
    .oe-badge-clickable:hover { filter:brightness(.95); box-shadow:0 0 0 1px rgba(83,74,183,.25); }
    .oe-badge-admin { background:#e6f1fb; color:#185fa5; }
    .oe-badge-projekt { background:#eeedfe; color:#534ab7; }
    .oe-badge-info { background:#eaf3de; color:#3b6d11; }
    .oe-badge-akce { background:#faece7; color:#993c1d; }
    .oe-badge-meeting { background:#eeedfe; color:#3c3489; }
    .oe-badge-ostatni { background:#f1efe8; color:#888780; }
    .oe-badge-prio-nizka { background:#f1efe8; color:#888780; }
    .oe-badge-prio-stredni { background:#faeeda; color:#ba7517; }
    .oe-badge-prio-vysoka { background:#fcebeb; color:#a32d2d; }
    .oe-badge-hidden { background:#f1efe8; color:#888780; border:1px dashed #888780; }
    .oe-inline-select {
      position:absolute; top:100%; right:0; z-index:20; margin-top:4px;
      background:var(--color-bg, #fff); border:1px solid var(--color-border, rgba(60,60,58,.15));
      border-radius:8px; padding:4px; box-shadow:0 4px 16px rgba(0,0,0,.1);
    }
    .oe-inline-select select {
      font-size:12px; padding:4px 8px; border:1px solid var(--color-border, rgba(60,60,58,.15));
      border-radius:6px; background:var(--color-bg, #fff); color:inherit;
    }
    .oe-card-body {
      display:none; padding:0 14px 14px 46px;
      border-top:1px solid var(--color-border, rgba(60,60,58,.08));
    }
    .oe-card.open .oe-card-body { display:block; }
    .oe-field { margin-bottom:12px; }
    .oe-field-lbl {
      font-size:10px; font-weight:500; text-transform:uppercase;
      letter-spacing:.05em; opacity:.45; margin-bottom:4px;
    }
    .oe-field-val { font-size:13px; line-height:1.55; }
    .oe-field-val.muted { opacity:.7; }
    .oe-list-items { margin:0; padding-left:18px; }
    .oe-list-items li { margin-bottom:4px; }
    .oe-keywords { display:flex; gap:6px; flex-wrap:wrap; }
    .oe-kw {
      padding:2px 8px; border-radius:12px; font-size:11px;
      background:var(--color-bg-secondary, #f8f7f4);
      border:1px solid var(--color-border, rgba(60,60,58,.1));
    }
    .oe-topic-tags { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
    .oe-topic-tag {
      display:inline-flex; align-items:center; gap:4px;
      padding:3px 8px; border-radius:14px; font-size:11px;
      background:#eeedfe; color:#534ab7; border:1px solid rgba(83,74,183,.2);
    }
    .oe-topic-remove {
      border:none; background:transparent; cursor:pointer; padding:0 2px;
      font-size:12px; line-height:1; color:inherit; opacity:.6;
    }
    .oe-topic-remove:hover { opacity:1; }
    .oe-topic-add { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .oe-topic-add select {
      min-width:180px; font-size:12px; padding:6px 8px;
      border:1px solid var(--color-border, rgba(60,60,58,.15)); border-radius:6px;
      background:var(--color-bg, #fff); color:inherit;
    }
    .oe-stav-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
    .oe-btn {
      padding:7px 14px; border-radius:7px; font-size:13px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.2)); background:transparent;
      cursor:pointer; color:var(--color-text-primary, #2c2c2a); transition:all .15s;
    }
    .oe-btn:hover { background:var(--color-bg-secondary, #f8f7f4); }
    .oe-btn.small { padding:5px 10px; font-size:12px; }
    .oe-empty { text-align:center; padding:48px 20px; opacity:.4; font-size:14px; }
    .oe-toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#2c2c2a; color:#fff; padding:8px 18px; border-radius:8px;
      font-size:13px; z-index:9999; opacity:0; transition:opacity .2s; pointer-events:none;
    }
    .oe-toast.show { opacity:1; }
  `;

  function init(container) {
    injectCSS();
    container.innerHTML = buildHTML();
    bindEvents(container);
    load();
  }

  function injectCSS() {
    if (document.getElementById("oe-styles")) return;
    const s = document.createElement("style");
    s.id = "oe-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildHTML() {
    return `
      <p class="oe-updated" id="oe-last-updated">Poslední aktualizace emailů: —</p>

      <div class="oe-stats">
        <div class="oe-stat" data-oe-filter="all"><div class="oe-stat-val" id="oe-s-total">—</div><div class="oe-stat-lbl">Celkem emailů</div></div>
        <div class="oe-stat" data-oe-filter="today"><div class="oe-stat-val" id="oe-s-today">—</div><div class="oe-stat-lbl">Dnes</div></div>
        <div class="oe-stat" data-oe-filter="akce"><div class="oe-stat-val" id="oe-s-akce">—</div><div class="oe-stat-lbl">Akce</div></div>
        <div class="oe-stat" data-oe-filter="high"><div class="oe-stat-val" id="oe-s-high">—</div><div class="oe-stat-lbl">Vysoká priorita</div></div>
      </div>

      <div class="oe-tabs" id="oe-tabs">
        ${FOLDERS.map((f) => `<button type="button" class="oe-tab${f.value === "" ? " active" : ""}" data-folder="${escAttr(f.value)}">${esc(f.label)}</button>`).join("")}
      </div>

      <div class="oe-toolbar">
        <div class="oe-search">
          <em class="oe-search-icon">🔍</em>
          <input type="text" id="oe-search" placeholder="Fulltext hledání…">
        </div>
        <select id="oe-f-kat">
          <option value="">Všechny kategorie</option>
          ${CATEGORIES.map((c) => `<option value="${escAttr(c)}">${esc(c)}</option>`).join("")}
        </select>
        <select id="oe-f-prio">
          <option value="">Všechny priority</option>
          ${PRIORITIES.map((p) => `<option value="${escAttr(p)}">${esc(p)}</option>`).join("")}
        </select>
        <label class="oe-toggle">
          <input type="checkbox" id="oe-show-hidden">
          Zobrazit skryté
        </label>
        <button type="button" class="oe-btn" id="oe-reload">↻ Obnovit</button>
      </div>

      <div class="oe-list" id="oe-list">
        <div class="oe-empty">Načítám…</div>
      </div>

      <div class="oe-toast" id="oe-toast"></div>
    `;
  }

  function bindEvents() {
    document.querySelectorAll(".oe-stat[data-oe-filter]").forEach((card) => {
      card.addEventListener("click", () => {
        resetListFilters();
        const kind = card.dataset.oeFilter;
        if (kind === "today") activeFilters.date = new Date().toISOString().slice(0, 10);
        else if (kind === "akce") activeFilters.akce = true;
        else if (kind === "high") document.getElementById("oe-f-prio").value = "vysoká";
        filter();
      });
    });

    document.getElementById("oe-tabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest(".oe-tab");
      if (!tab) return;
      activeFolder = tab.dataset.folder || "";
      document.querySelectorAll(".oe-tab").forEach((t) => t.classList.toggle("active", t === tab));
      filter();
    });

    document.getElementById("oe-search")?.addEventListener("input", filter);
    document.getElementById("oe-f-kat")?.addEventListener("change", filter);
    document.getElementById("oe-f-prio")?.addEventListener("change", filter);
    document.getElementById("oe-show-hidden")?.addEventListener("change", (e) => {
      showHidden = !!e.target.checked;
      load();
    });
    document.getElementById("oe-reload")?.addEventListener("click", load);

    document.getElementById("oe-list")?.addEventListener("click", handleListClick);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".oe-card-badges") && !e.target.closest(".oe-inline-select")) {
        closeBadgeEditor();
      }
    });
  }

  function handleListClick(e) {
    const badge = e.target.closest("[data-oe-badge]");
    if (badge) {
      e.stopPropagation();
      openBadgeEditor(badge.dataset.emailId, badge.dataset.oeBadge);
      return;
    }

    const stavBtn = e.target.closest("[data-oe-stav]");
    if (stavBtn) {
      e.stopPropagation();
      setStav(stavBtn.dataset.emailId, stavBtn.dataset.oeStavValue);
      return;
    }

    const topicRemove = e.target.closest("[data-oe-topic-remove]");
    if (topicRemove) {
      e.stopPropagation();
      removeTopic(topicRemove.dataset.emailId, topicRemove.dataset.topicId);
      return;
    }

    const topicAdd = e.target.closest("[data-oe-topic-add]");
    if (topicAdd) {
      e.stopPropagation();
      const select = document.querySelector(`[data-oe-topic-select="${topicAdd.dataset.emailId}"]`);
      if (select?.value) addTopic(topicAdd.dataset.emailId, select.value);
      return;
    }

    const head = e.target.closest(".oe-card-head");
    if (head) {
      const card = head.closest(".oe-card");
      if (card) card.classList.toggle("open");
    }
  }

  function resetListFilters() {
    activeFilters.date = "";
    activeFilters.akce = false;
    activeFilters.high = false;
    const search = document.getElementById("oe-search");
    const kat = document.getElementById("oe-f-kat");
    const prio = document.getElementById("oe-f-prio");
    if (search) search.value = "";
    if (kat) kat.value = "";
    if (prio) prio.value = "";
  }

  async function ensureTopicsLoaded() {
    if (window.kbTopics?.loadTopics) {
      try { await window.kbTopics.loadTopics(); } catch (_) {}
      return;
    }
    try {
      await OutlookEmailsDB.getTopics();
    } catch (_) {}
  }

  function getTopics() {
    return window.kbTopics?.topics || [];
  }

  function getPriorita(email) {
    return email.priorita_manual || email.priorita || "střední";
  }

  function getKategorie(email) {
    return email.kategorie_manual || email.kategorie || "ostatní";
  }

  function getEmail(id) {
    return allEmails.find((e) => String(e.id) === String(id));
  }

  function patchLocalEmail(id, patch) {
    const idx = allEmails.findIndex((e) => String(e.id) === String(id));
    if (idx >= 0) Object.assign(allEmails[idx], patch);
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace("T", " ");
    return d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  }

  function updateLastUpdated(processedAt) {
    const el = document.getElementById("oe-last-updated");
    if (!el) return;
    el.textContent = processedAt
      ? `Poslední aktualizace emailů: ${formatDateTime(processedAt)}`
      : "Poslední aktualizace emailů: —";
  }

  async function load() {
    const list = document.getElementById("oe-list");
    try {
      await ensureTopicsLoaded();
      showHidden = !!document.getElementById("oe-show-hidden")?.checked;
      const [emails, stats, lastUpdated] = await Promise.all([
        OutlookEmailsDB.getAll({ limit: 500, showHidden }),
        OutlookEmailsDB.getStats({ showHidden }),
        OutlookEmailsDB.getLastUpdated()
      ]);
      allEmails = emails;
      updateStats(stats);
      updateLastUpdated(lastUpdated);
      filter();
    } catch (e) {
      if (list) list.innerHTML = `<div class="oe-empty">Chyba: ${esc(e.message)}</div>`;
    }
  }

  function updateStats(s) {
    document.getElementById("oe-s-total").textContent = s.total;
    document.getElementById("oe-s-today").textContent = s.today;
    document.getElementById("oe-s-akce").textContent = s.akce;
    document.getElementById("oe-s-high").textContent = s.high;
    window.kbOutlookEmails = { stats: s };
    document.dispatchEvent(new CustomEvent("kb:outlook-emails-loaded", { detail: s }));
  }

  function hasAkce(email) {
    const tasks = email.ukoly || [];
    return tasks.length > 0 || getKategorie(email) === "akce_required";
  }

  function filter() {
    const q = (document.getElementById("oe-search")?.value || "").toLowerCase();
    const kat = document.getElementById("oe-f-kat")?.value || "";
    const pri = document.getElementById("oe-f-prio")?.value || "";
    const openIds = new Set(
      [...document.querySelectorAll(".oe-card.open")].map((c) => c.dataset.id)
    );

    let emails = allEmails.filter((email) => {
      if (activeFolder && email.folder !== activeFolder) return false;
      if (q && !JSON.stringify(email).toLowerCase().includes(q)) return false;
      if (kat && getKategorie(email) !== kat) return false;
      if (pri && getPriorita(email) !== pri) return false;
      if (activeFilters.date && (email.received_at || "").slice(0, 10) !== activeFilters.date) return false;
      if (activeFilters.akce && !hasAkce(email)) return false;
      return true;
    });

    renderList(emails, openIds);
  }

  const katBadge = {
    administrativa: "oe-badge-admin",
    projekt: "oe-badge-projekt",
    informace: "oe-badge-info",
    akce_required: "oe-badge-akce",
    meeting: "oe-badge-meeting",
    ostatní: "oe-badge-ostatni"
  };

  const prioBadge = {
    nízká: "oe-badge-prio-nizka",
    střední: "oe-badge-prio-stredni",
    vysoká: "oe-badge-prio-vysoka"
  };

  function topicsForEmail(email) {
    const ids = new Set((email.topic_ids || []).map(String));
    return getTopics().filter((t) => ids.has(String(t.id)));
  }

  function renderTopicSection(email) {
    const linked = topicsForEmail(email);
    const linkedIds = new Set(linked.map((t) => String(t.id)));
    const available = getTopics().filter((t) => !linkedIds.has(String(t.id)));

    const tags = linked.length
      ? linked.map((t) => `
          <span class="oe-topic-tag">
            ${esc(t.name)}
            <button type="button" class="oe-topic-remove" data-oe-topic-remove data-email-id="${email.id}" data-topic-id="${escAttr(t.id)}" title="Odebrat">×</button>
          </span>`).join("")
      : `<span class="oe-field-val muted">Zatím bez témat</span>`;

    const select = getTopics().length
      ? `<select data-oe-topic-select="${email.id}">
          <option value="">— přidat téma —</option>
          ${available.map((t) => `<option value="${escAttr(t.id)}">${esc(t.name)}</option>`).join("")}
        </select>
        <button type="button" class="oe-btn small" data-oe-topic-add data-email-id="${email.id}">Přidat</button>`
      : `<span class="oe-field-val muted">Nejdříve vytvořte téma (modul Témata)</span>`;

    return `
      <div class="oe-field">
        <div class="oe-field-lbl">Témata</div>
        <div class="oe-topic-tags">${tags}</div>
        <div class="oe-topic-add">${select}</div>
      </div>`;
  }

  function renderStavButtons(email) {
    const stav = email.stav || "aktivní";
    if (stav !== "aktivní") {
      return `<div class="oe-stav-row">
        <button type="button" class="oe-btn small" data-oe-stav data-email-id="${email.id}" data-oe-stav-value="aktivní">↩ Znovu otevřít</button>
      </div>`;
    }
    return `<div class="oe-stav-row">
      <button type="button" class="oe-btn small" data-oe-stav data-email-id="${email.id}" data-oe-stav-value="vyřešeno">✅ Vyřešeno</button>
      <button type="button" class="oe-btn small" data-oe-stav data-email-id="${email.id}" data-oe-stav-value="není_třeba">🚫 Není třeba řešit</button>
      <button type="button" class="oe-btn small" data-oe-stav data-email-id="${email.id}" data-oe-stav-value="skryto">👁 Skrýt</button>
    </div>`;
  }

  function cardClasses(email) {
    const stav = email.stav || "aktivní";
    const classes = ["oe-card"];
    if (stav === "vyřešeno" || stav === "není_třeba") classes.push("oe-card-resolved");
    if (stav === "skryto") classes.push("oe-card-hidden");
    return classes.join(" ");
  }

  function renderList(emails, openIds = new Set()) {
    const list = document.getElementById("oe-list");
    if (!emails.length) {
      list.innerHTML = `<div class="oe-empty">Žádné emaily</div>`;
      return;
    }

    list.innerHTML = emails.map((email) => {
      const title = email.tema || email.subject || "—";
      const sender = email.sender_name || email.sender_email || "—";
      const date = (email.received_at || "").slice(0, 16).replace("T", " ");
      const kat = getKategorie(email);
      const prio = getPriorita(email);
      const tasks = email.ukoly || [];
      const deadlines = email.terminy || [];
      const keywords = email.klicova_slova || [];
      const stav = email.stav || "aktivní";
      const isOpen = openIds.has(String(email.id));

      return `
        <article class="${cardClasses(email)}${isOpen ? " open" : ""}" data-id="${email.id}">
          <div class="oe-card-head">
            <div class="oe-card-toggle">▶</div>
            <div class="oe-card-main">
              <h3 class="oe-card-title">${esc(title)}</h3>
              <div class="oe-card-meta">
                <span>${esc(sender)}</span>
                <span>${esc(date)}</span>
                ${email.folder ? `<span>${esc(email.folder)}</span>` : ""}
                ${email.has_attachments ? "<span>📎</span>" : ""}
                ${stav === "skryto" ? '<span class="oe-badge oe-badge-hidden">SKRYTO</span>' : ""}
              </div>
            </div>
            <div class="oe-card-badges" data-email-id="${email.id}">
              <span class="oe-badge oe-badge-clickable ${katBadge[kat] || "oe-badge-ostatni"}" data-oe-badge="kat" data-email-id="${email.id}">${esc(kat)}</span>
              <span class="oe-badge oe-badge-clickable ${prioBadge[prio] || "oe-badge-prio-stredni"}" data-oe-badge="prio" data-email-id="${email.id}">${esc(prio)}</span>
            </div>
          </div>
          <div class="oe-card-body">
            ${renderStavButtons(email)}
            <div class="oe-field">
              <div class="oe-field-lbl">Téma</div>
              <div class="oe-field-val">${esc(email.subject || title)}</div>
            </div>
            <div class="oe-field">
              <div class="oe-field-lbl">Shrnutí</div>
              <div class="oe-field-val">${esc(email.shrnuti || "—")}</div>
            </div>
            <div class="oe-field">
              <div class="oe-field-lbl">Úkoly</div>
              <div class="oe-field-val">
                ${tasks.length
                  ? `<ul class="oe-list-items">${tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
                  : '<span class="muted">—</span>'}
              </div>
            </div>
            <div class="oe-field">
              <div class="oe-field-lbl">Termíny</div>
              <div class="oe-field-val">
                ${deadlines.length
                  ? `<ul class="oe-list-items">${deadlines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
                  : '<span class="muted">—</span>'}
              </div>
            </div>
            <div class="oe-field">
              <div class="oe-field-lbl">Klíčová slova</div>
              <div class="oe-keywords">
                ${keywords.length
                  ? keywords.map((kw) => `<span class="oe-kw">${esc(kw)}</span>`).join("")
                  : '<span class="oe-field-val muted">—</span>'}
              </div>
            </div>
            ${renderTopicSection(email)}
          </div>
        </article>`;
    }).join("");

    if (badgeEditor) restoreBadgeEditor();
  }

  function closeBadgeEditor() {
    badgeEditor = null;
    document.querySelectorAll(".oe-inline-select").forEach((el) => el.remove());
  }

  function openBadgeEditor(emailId, type) {
    const email = getEmail(emailId);
    if (!email) return;

    closeBadgeEditor();
    const badges = document.querySelector(`.oe-card-badges[data-email-id="${emailId}"]`);
    if (!badges) return;

    const options = type === "prio" ? PRIORITIES : CATEGORIES;
    const current = type === "prio" ? getPriorita(email) : getKategorie(email);
    const select = document.createElement("div");
    select.className = "oe-inline-select";
    select.innerHTML = `
      <select>
        ${options.map((o) => `<option value="${escAttr(o)}"${o === current ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select>`;

    select.addEventListener("click", (e) => e.stopPropagation());
    select.querySelector("select").addEventListener("change", async (e) => {
      const value = e.target.value;
      if (type === "prio") await savePriorita(emailId, value);
      else await saveKategorie(emailId, value);
      closeBadgeEditor();
    });

    badges.appendChild(select);
    badgeEditor = { emailId, type };
    select.querySelector("select").focus();
  }

  function restoreBadgeEditor() {
    if (!badgeEditor) return;
    openBadgeEditor(badgeEditor.emailId, badgeEditor.type);
  }

  async function setStav(id, stav) {
    try {
      const updated = await OutlookEmailsDB.updateStav(id, stav);
      if (updated) patchLocalEmail(id, updated);
      else patchLocalEmail(id, { stav });
      if (stav === "skryto" && !showHidden) {
        allEmails = allEmails.filter((e) => String(e.id) !== String(id));
      }
      const stats = await OutlookEmailsDB.getStats({ showHidden });
      updateStats(stats);
      filter();
      toast(stav === "aktivní" ? "↩ Email znovu otevřen" : "✓ Stav uložen");
    } catch (e) {
      toast("Chyba: " + e.message, true);
    }
  }

  async function savePriorita(id, priorita) {
    try {
      const updated = await OutlookEmailsDB.updatePrioritaManual(id, priorita);
      if (updated) patchLocalEmail(id, updated);
      else patchLocalEmail(id, { priorita_manual: priorita });
      filter();
      toast("✓ Priorita uložena");
    } catch (e) {
      toast("Chyba: " + e.message, true);
    }
  }

  async function saveKategorie(id, kategorie) {
    try {
      const updated = await OutlookEmailsDB.updateKategorieManual(id, kategorie);
      if (updated) patchLocalEmail(id, updated);
      else patchLocalEmail(id, { kategorie_manual: kategorie });
      filter();
      toast("✓ Kategorie uložena");
    } catch (e) {
      toast("Chyba: " + e.message, true);
    }
  }

  async function addTopic(emailId, topicId) {
    const email = getEmail(emailId);
    if (!email) return;
    const ids = [...(email.topic_ids || []).map(String)];
    if (ids.includes(String(topicId))) return;
    ids.push(String(topicId));
    try {
      const updated = await OutlookEmailsDB.updateTopicIds(emailId, ids);
      if (updated) patchLocalEmail(emailId, updated);
      else patchLocalEmail(emailId, { topic_ids: ids });
      filter();
      toast("✓ Téma přidáno");
    } catch (e) {
      toast("Chyba: " + e.message, true);
    }
  }

  async function removeTopic(emailId, topicId) {
    const email = getEmail(emailId);
    if (!email) return;
    const ids = (email.topic_ids || []).map(String).filter((id) => id !== String(topicId));
    try {
      const updated = await OutlookEmailsDB.updateTopicIds(emailId, ids);
      if (updated) patchLocalEmail(emailId, updated);
      else patchLocalEmail(emailId, { topic_ids: ids });
      filter();
      toast("✓ Téma odebráno");
    } catch (e) {
      toast("Chyba: " + e.message, true);
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    return esc(s).replace(/'/g, "&#039;");
  }

  function toast(msg, err = false) {
    const el = document.getElementById("oe-toast");
    if (!el) return;
    el.textContent = msg;
    el.style.background = err ? "#a32d2d" : "#2c2c2a";
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  return {
    init,
    load,
    reload: load,
    filter
  };
})();

window.OutlookEmailsModule = OutlookEmailsModule;

(function initOutlookEmailsPage() {
  function boot() {
    const host = document.getElementById("outlookEmailsRoot");
    if (!host || host.__oeInit) return;
    host.__oeInit = true;
    OutlookEmailsModule.init(host);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.kbLayout?.getPage?.() === "outlook-emaily") boot();
  });
  document.addEventListener("kb:page-changed", (e) => {
    if (e.detail?.page === "outlook-emaily") boot();
  });
})();
