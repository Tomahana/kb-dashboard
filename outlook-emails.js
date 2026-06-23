/**
 * outlook-emails.js
 * Outlook emaily modul pro kb-dashboard.
 */

const OutlookEmailsModule = (() => {
  let allEmails = [];
  let activeFolder = "";
  const activeFilters = { date: "", akce: false, high: false };

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
    .oe-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
    .oe-tab {
      padding:6px 12px; border-radius:20px; font-size:12px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.15)); background:transparent;
      cursor:pointer; transition:all .15s; color:var(--color-text-secondary, #888);
    }
    .oe-tab:hover { border-color:var(--color-accent, #534ab7); color:var(--color-text-primary, #2c2c2a); }
    .oe-tab.active { background:#eeedfe; color:#534ab7; border-color:#534ab7; }
    .oe-list { display:flex; flex-direction:column; gap:8px; }
    .oe-card {
      background:var(--color-bg, #fff);
      border:1px solid var(--color-border, rgba(60,60,58,.12));
      border-radius:10px; overflow:hidden;
    }
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
    .oe-card-meta { font-size:11px; color:var(--color-text-secondary, #888); display:flex; gap:10px; flex-wrap:wrap; }
    .oe-card-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start; }
    .oe-badge {
      display:inline-block; padding:2px 8px; border-radius:20px;
      font-size:11px; font-weight:500; white-space:nowrap;
    }
    .oe-badge-admin { background:#e6f1fb; color:#185fa5; }
    .oe-badge-projekt { background:#eeedfe; color:#534ab7; }
    .oe-badge-info { background:#eaf3de; color:#3b6d11; }
    .oe-badge-akce { background:#faece7; color:#993c1d; }
    .oe-badge-ostatni { background:#f1efe8; color:#888780; }
    .oe-badge-prio-nizka { background:#f1efe8; color:#888780; }
    .oe-badge-prio-stredni { background:#faeeda; color:#ba7517; }
    .oe-badge-prio-vysoka { background:#fcebeb; color:#a32d2d; }
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
    .oe-btn {
      padding:7px 14px; border-radius:7px; font-size:13px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.2)); background:transparent;
      cursor:pointer; color:var(--color-text-primary, #2c2c2a); transition:all .15s;
    }
    .oe-btn:hover { background:var(--color-bg-secondary, #f8f7f4); }
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
          <input type="text" id="oe-search" placeholder="Fulltext hledání…" oninput="OutlookEmailsModule.filter()">
        </div>
        <select id="oe-f-kat" onchange="OutlookEmailsModule.filter()">
          <option value="">Všechny kategorie</option>
          <option value="administrativa">Administrativa</option>
          <option value="akce_required">Akce required</option>
          <option value="informace">Informace</option>
          <option value="projekt">Projekt</option>
          <option value="ostatní">Ostatní</option>
        </select>
        <select id="oe-f-prio" onchange="OutlookEmailsModule.filter()">
          <option value="">Všechny priority</option>
          <option value="vysoká">Vysoká</option>
          <option value="střední">Střední</option>
          <option value="nízká">Nízká</option>
        </select>
        <button class="oe-btn" onclick="OutlookEmailsModule.reload()">↻ Obnovit</button>
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

  async function load() {
    try {
      const [emails, stats] = await Promise.all([
        OutlookEmailsDB.getAll({ limit: 500 }),
        OutlookEmailsDB.getStats()
      ]);
      allEmails = emails;
      updateStats(stats);
      filter();
    } catch (e) {
      document.getElementById("oe-list").innerHTML =
        `<div class="oe-empty">Chyba: ${esc(e.message)}</div>`;
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
    return tasks.length > 0 || email.kategorie === "akce_required";
  }

  function filter() {
    const q = (document.getElementById("oe-search")?.value || "").toLowerCase();
    const kat = document.getElementById("oe-f-kat")?.value || "";
    const pri = document.getElementById("oe-f-prio")?.value || "";

    let emails = allEmails.filter((email) => {
      if (activeFolder && email.folder !== activeFolder) return false;
      if (q && !JSON.stringify(email).toLowerCase().includes(q)) return false;
      if (kat && email.kategorie !== kat) return false;
      if (pri && email.priorita !== pri) return false;
      if (activeFilters.date && (email.received_at || "").slice(0, 10) !== activeFilters.date) return false;
      if (activeFilters.akce && !hasAkce(email)) return false;
      return true;
    });

    renderList(emails);
  }

  const katBadge = {
    administrativa: "oe-badge-admin",
    projekt: "oe-badge-projekt",
    informace: "oe-badge-info",
    akce_required: "oe-badge-akce",
    ostatní: "oe-badge-ostatni"
  };

  const prioBadge = {
    nízká: "oe-badge-prio-nizka",
    střední: "oe-badge-prio-stredni",
    vysoká: "oe-badge-prio-vysoka"
  };

  function renderList(emails) {
    const list = document.getElementById("oe-list");
    if (!emails.length) {
      list.innerHTML = `<div class="oe-empty">Žádné emaily</div>`;
      return;
    }

    list.innerHTML = emails.map((email) => {
      const title = email.tema || email.subject || "—";
      const sender = email.sender_name || email.sender_email || "—";
      const date = (email.received_at || "").slice(0, 16).replace("T", " ");
      const kat = email.kategorie || "ostatní";
      const prio = email.priorita || "střední";
      const tasks = email.ukoly || [];
      const deadlines = email.terminy || [];
      const keywords = email.klicova_slova || [];

      return `
        <article class="oe-card" data-id="${email.id}">
          <div class="oe-card-head" onclick="OutlookEmailsModule.toggle(${email.id})">
            <div class="oe-card-toggle">▶</div>
            <div class="oe-card-main">
              <h3 class="oe-card-title">${esc(title)}</h3>
              <div class="oe-card-meta">
                <span>${esc(sender)}</span>
                <span>${esc(date)}</span>
                ${email.folder ? `<span>${esc(email.folder)}</span>` : ""}
                ${email.has_attachments ? "<span>📎</span>" : ""}
              </div>
            </div>
            <div class="oe-card-badges">
              <span class="oe-badge ${katBadge[kat] || "oe-badge-ostatni"}">${esc(kat)}</span>
              <span class="oe-badge ${prioBadge[prio] || "oe-badge-prio-stredni"}">${esc(prio)}</span>
            </div>
          </div>
          <div class="oe-card-body">
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
          </div>
        </article>`;
    }).join("");
  }

  function toggle(id) {
    const card = document.querySelector(`.oe-card[data-id="${id}"]`);
    if (card) card.classList.toggle("open");
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

  function toast(msg) {
    const el = document.getElementById("oe-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  return {
    init,
    load,
    reload: load,
    filter,
    toggle
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
