/**
 * doc-intelligence.js
 * Document Intelligence modul pro kb-dashboard.
 * Registruje se přes modules.js stejným vzorem jako ostatní moduly.
 *
 * Použití v modules.js — přidej:
 *   { id: 'doc-intelligence', label: '📄 Dokumenty', file: 'doc-intelligence.js', supabase: 'supabase-doc-intelligence.js' }
 *
 * Použití v index.html — přidej do nav:
 *   <a class="nav-item" data-module="doc-intelligence">📄 Dokumenty</a>
 */

const DocIntelligenceModule = (() => {
  // ── Stav modulu ──────────────────────────────────────────────────────────
  let allDocs = [];
  let currentDoc = null;
  let sortCol = "created_at";
  let sortDir = "desc";
  let isLoading = false;
  const activeFilters = { date: "" };

  // ── CSS (injektuje se jednou) ─────────────────────────────────────────────
  const CSS = `
    .di-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:16px; }
    .di-search { position:relative; }
    .di-search input { padding-left:28px; min-width:220px; }
    .di-search-icon { position:absolute; left:8px; top:50%; transform:translateY(-50%); opacity:.45; font-style:normal; }
    .di-stats { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
    .di-stat {
      background:var(--color-bg-secondary, #f8f7f4);
      border:1px solid var(--color-border, rgba(60,60,58,.12));
      border-radius:8px; padding:10px 16px; min-width:100px; flex:1;
      cursor:pointer; transition:all .15s;
    }
    .di-stat:hover {
      border-color:var(--color-accent, #534ab7);
      background:var(--color-bg, #fff);
    }
    .di-stat-val { font-size:22px; font-weight:600; color:var(--color-text-primary, #2c2c2a); }
    .di-stat-lbl { font-size:11px; color:var(--color-text-secondary, #888); margin-top:2px; }
    .di-table-wrap {
      background:var(--color-bg, #fff);
      border:1px solid var(--color-border, rgba(60,60,58,.12));
      border-radius:10px; overflow:hidden;
    }
    .di-table { width:100%; border-collapse:collapse; font-size:13px; }
    .di-table thead { background:var(--color-bg-secondary, #f8f7f4); }
    .di-table th {
      padding:9px 12px; text-align:left; font-weight:500; font-size:11px;
      text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid var(--color-border, rgba(60,60,58,.12));
      cursor:pointer; user-select:none; white-space:nowrap; color:var(--color-text-secondary, #888);
    }
    .di-table th:hover { color:var(--color-text-primary, #2c2c2a); }
    .di-table th.sort-asc::after { content:" ↑"; }
    .di-table th.sort-desc::after { content:" ↓"; }
    .di-table td { padding:9px 12px; border-bottom:1px solid var(--color-border, rgba(60,60,58,.12)); vertical-align:middle; }
    .di-table tr:last-child td { border-bottom:none; }
    .di-table tr:hover td { background:var(--color-bg-secondary, #f8f7f4); }
    .di-doc-name { font-weight:500; cursor:pointer; }
    .di-doc-name:hover { color:var(--color-accent, #534ab7); }
    .di-doc-path { font-size:11px; opacity:.5; margin-top:1px; }
    .di-badge {
      display:inline-block; padding:2px 8px; border-radius:20px;
      font-size:11px; font-weight:500; white-space:nowrap;
    }
    .di-badge-granty  { background:#eeedfe; color:#534ab7; }
    .di-badge-admin   { background:#e6f1fb; color:#185fa5; }
    .di-badge-vyzkum  { background:#e1f5ee; color:#0f6e56; }
    .di-badge-vyuka   { background:#eaf3de; color:#3b6d11; }
    .di-badge-smlouvy { background:#faece7; color:#993c1d; }
    .di-badge-ostatni { background:#f1efe8; color:#888780; }
    .di-badge-novy    { background:#e6f1fb; color:#185fa5; }
    .di-badge-precteno   { background:#faeeda; color:#854f0b; }
    .di-badge-zpracovano { background:#eaf3de; color:#3b6d11; }
    .di-badge-archivovano{ background:#f1efe8; color:#888780; }
    .di-dots { display:flex; gap:2px; align-items:center; }
    .di-dot { width:7px; height:7px; border-radius:50%; background:rgba(60,60,58,.15); }
    .di-dot.p1 { background:#888780; }
    .di-dot.p2 { background:#185fa5; }
    .di-dot.p3 { background:#ba7517; }
    .di-dot.p4 { background:#993c1d; }
    .di-dot.p5 { background:#a32d2d; }
    .di-actions { display:flex; gap:5px; }
    .di-icon-btn {
      width:26px; height:26px; border-radius:6px;
      border:1px solid var(--color-border, rgba(60,60,58,.15));
      background:transparent; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      font-size:12px; color:var(--color-text-secondary, #888);
      transition:all .15s; text-decoration:none;
    }
    .di-icon-btn:hover { background:var(--color-bg-secondary, #f8f7f4); color:var(--color-text-primary, #2c2c2a); }
    .di-icon-btn.ck:hover { background:#eeedfe; color:#534ab7; }

    /* Detail panel */
    .di-panel-overlay {
      display:none; position:fixed; inset:0; z-index:500;
      background:rgba(0,0,0,.28); align-items:flex-start; justify-content:flex-end;
    }
    .di-panel-overlay.open { display:flex; }
    .di-panel {
      background:var(--color-bg, #fff); width:420px; height:100vh;
      overflow-y:auto; box-shadow:-4px 0 28px rgba(0,0,0,.12);
      display:flex; flex-direction:column;
    }
    .di-panel-head {
      padding:18px 20px 14px; border-bottom:1px solid var(--color-border, rgba(60,60,58,.12));
      position:sticky; top:0; background:var(--color-bg, #fff); z-index:10;
    }
    .di-panel-head h3 { font-size:14px; font-weight:600; margin:0; line-height:1.4; padding-right:28px; }
    .di-panel-close {
      position:absolute; top:16px; right:16px; background:none; border:none;
      cursor:pointer; font-size:16px; opacity:.4; line-height:1;
    }
    .di-panel-close:hover { opacity:1; }
    .di-panel-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; flex:1; }
    .di-field { display:flex; flex-direction:column; gap:3px; }
    .di-field-lbl { font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:.05em; opacity:.45; }
    .di-field-val { font-size:13px; line-height:1.5; }
    .di-field-val.muted { opacity:.55; }
    .di-sep { border:none; border-top:1px solid var(--color-border, rgba(60,60,58,.12)); margin:0; }
    .di-stav-row, .di-prio-row { display:flex; gap:6px; flex-wrap:wrap; }
    .di-opt {
      padding:4px 10px; border-radius:20px; font-size:12px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.15)); background:transparent;
      cursor:pointer; transition:all .15s; color:var(--color-text-secondary, #888);
    }
    .di-opt.active { background:#eeedfe; color:#534ab7; border-color:#534ab7; }
    .di-prio-1.active { background:#f1efe8; color:#888780; border-color:#888780; }
    .di-prio-2.active { background:#e6f1fb; color:#185fa5; border-color:#185fa5; }
    .di-prio-3.active { background:#faeeda; color:#ba7517; border-color:#ba7517; }
    .di-prio-4.active { background:#faece7; color:#993c1d; border-color:#993c1d; }
    .di-prio-5.active { background:#fcebeb; color:#a32d2d; border-color:#a32d2d; }
    .di-panel-footer {
      padding:14px 20px; border-top:1px solid var(--color-border, rgba(60,60,58,.12));
      display:flex; gap:8px; flex-wrap:wrap;
      position:sticky; bottom:0; background:var(--color-bg, #fff);
    }
    .di-btn {
      padding:7px 14px; border-radius:7px; font-size:13px; font-weight:500;
      border:1px solid var(--color-border, rgba(60,60,58,.2)); background:transparent;
      cursor:pointer; color:var(--color-text-primary, #2c2c2a); transition:all .15s;
      text-decoration:none; display:inline-flex; align-items:center; gap:5px;
    }
    .di-btn:hover { background:var(--color-bg-secondary, #f8f7f4); }
    .di-btn.primary { background:#534ab7; color:#fff; border-color:#534ab7; }
    .di-btn.primary:hover { background:#3c3489; }
    .di-toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#2c2c2a; color:#fff; padding:8px 18px; border-radius:8px;
      font-size:13px; z-index:9999; opacity:0; transition:opacity .2s; pointer-events:none;
    }
    .di-toast.show { opacity:1; }
    .di-empty { text-align:center; padding:48px 20px; opacity:.4; font-size:14px; }
    @media(max-width:700px){ .di-panel{ width:100vw; } .di-col-path,.di-col-date{ display:none; } }
  `;

  // ── Inicializace ──────────────────────────────────────────────────────────
  function init(container) {
    injectCSS();
    container.innerHTML = buildHTML();
    bindEvents(container);
    load(container);
  }

  function injectCSS() {
    if (document.getElementById("di-styles")) return;
    const s = document.createElement("style");
    s.id = "di-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── HTML šablona ──────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div id="di-summary-box" style="background:var(--color-bg-secondary,#f8f7f4);border-radius:8px;padding:14px 16px;margin-bottom:16px;border:1px solid var(--color-border,rgba(60,60,58,.12));display:none">
        <div id="di-summary-date" style="font-size:11px;opacity:.5;margin-bottom:6px"></div>
        <div id="di-summary" style="font-size:13px;line-height:1.6"></div>
      </div>

      <div class="di-stats">
        <div class="di-stat" data-di-filter="all"><div class="di-stat-val" id="di-s-total">—</div><div class="di-stat-lbl">Celkem dokumentů</div></div>
        <div class="di-stat" data-di-filter="today"><div class="di-stat-val" id="di-s-today">—</div><div class="di-stat-lbl">Přidáno dnes</div></div>
        <div class="di-stat" data-di-filter="new"><div class="di-stat-val" id="di-s-new">—</div><div class="di-stat-lbl">Ke zpracování</div></div>
        <div class="di-stat" data-di-filter="critical"><div class="di-stat-val" id="di-s-critical">—</div><div class="di-stat-lbl">Kritické</div></div>
      </div>

      <div class="di-toolbar">
        <div class="di-search">
          <em class="di-search-icon">🔍</em>
          <input type="text" id="di-search" placeholder="Hledat…" oninput="DocIntelligenceModule.filter()">
        </div>
        <select id="di-f-kat" onchange="DocIntelligenceModule.filter()">
          <option value="">Všechny kategorie</option>
          <option>Granty a projekty</option><option>Administrativa</option>
          <option>Výzkum</option><option>Výuka</option><option>Personalistika</option>
          <option>Smlouvy</option><option>Zprávy a analýzy</option><option>Komunikace</option><option>Ostatní</option>
        </select>
        <select id="di-f-stav" onchange="DocIntelligenceModule.filter()">
          <option value="">Všechny stavy</option>
          <option value="nový">Nové</option><option value="přečteno">Přečteno</option>
          <option value="zpracováno">Zpracováno</option><option value="archivováno">Archivováno</option>
        </select>
        <select id="di-f-prio" onchange="DocIntelligenceModule.filter()">
          <option value="">Všechny priority</option>
          <option value="5">⚡ Kritické</option><option value="4">🔴 Vysoké</option>
          <option value="3">🟡 Střední</option><option value="2">🔵 Nízké</option><option value="1">⚪ Minimální</option>
        </select>
        <button class="di-btn" onclick="DocIntelligenceModule.reload()">↻ Obnovit</button>
      </div>

      <div class="di-table-wrap">
        <table class="di-table">
          <thead>
            <tr>
              <th onclick="DocIntelligenceModule.sort('tema')">Téma / název</th>
              <th onclick="DocIntelligenceModule.sort('kategorie')">Kategorie</th>
              <th onclick="DocIntelligenceModule.sort('dulezitost')">Priorita</th>
              <th onclick="DocIntelligenceModule.sort('stav')">Stav</th>
              <th class="di-col-date" onclick="DocIntelligenceModule.sort('created_at')">Přidáno</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody id="di-tbody">
            <tr><td colspan="6"><div class="di-empty">Načítám…</div></td></tr>
          </tbody>
        </table>
      </div>

      <!-- Detail panel -->
      <div class="di-panel-overlay" id="di-overlay">
        <div class="di-panel" id="di-panel">
          <div class="di-panel-head">
            <h3 id="di-p-title">—</h3>
            <button class="di-panel-close" onclick="DocIntelligenceModule.closePanel()">✕</button>
          </div>
          <div class="di-panel-body">
            <div class="di-field"><div class="di-field-lbl">Shrnutí (AI)</div><div class="di-field-val" id="di-p-souhrn">—</div></div>
            <div class="di-field"><div class="di-field-lbl">Kategorie · soubor · velikost</div><div class="di-field-val" id="di-p-meta">—</div></div>
            <div class="di-field"><div class="di-field-lbl">Klíčová slova</div><div class="di-field-val muted" id="di-p-keywords">—</div></div>
            <div class="di-field"><div class="di-field-lbl">Doporučená akce (AI)</div><div class="di-field-val muted" id="di-p-akce">—</div></div>
            <div class="di-field">
              <div class="di-field-lbl">Cesta k souboru</div>
              <div id="di-p-path"
                style="font-size:12px; font-family:monospace; background:var(--color-bg-secondary,#f8f7f4);
                padding:6px 10px; border-radius:6px; word-break:break-all;
                user-select:all; cursor:text; border:1px solid var(--color-border)"
                title="Označte a zkopírujte cestu"></div>
            </div>
            <hr class="di-sep">
            <div class="di-field">
              <div class="di-field-lbl">Priorita</div>
              <div class="di-prio-row">
                ${[1,2,3,4,5].map(n => `<button class="di-opt di-prio-${n}" onclick="DocIntelligenceModule.setPrio(${n})">${['⚪ Minimální','🔵 Nízká','🟡 Střední','🔴 Vysoká','⚡ Kritická'][n-1]}</button>`).join("")}
              </div>
            </div>
            <div class="di-field">
              <div class="di-field-lbl">Stav</div>
              <div class="di-stav-row">
                ${['nový','přečteno','zpracováno','archivováno'].map(s => `<button class="di-opt di-stav-opt" data-v="${s}" onclick="DocIntelligenceModule.setStav('${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join("")}
              </div>
            </div>
            <div class="di-field">
              <div class="di-field-lbl">Termín</div>
              <input type="date" id="di-p-termin" oninput="DocIntelligenceModule.cur.termin=this.value" style="width:100%;padding:7px 10px;border:1px solid rgba(60,60,58,.2);border-radius:6px;font-size:13px;background:transparent;color:inherit;">
            </div>
            <div class="di-field">
              <div class="di-field-lbl">Moje poznámky</div>
              <textarea id="di-p-notes" rows="4" oninput="DocIntelligenceModule.cur.poznamky=this.value"
                style="width:100%;padding:8px 10px;border:1px solid rgba(60,60,58,.2);border-radius:6px;font-size:13px;resize:vertical;background:transparent;color:inherit;font-family:inherit;"
                placeholder="Přidat poznámky…"></textarea>
            </div>
          </div>
          <div class="di-panel-footer">
            <button class="di-btn primary" onclick="DocIntelligenceModule.save()">💾 Uložit</button>
            <button class="di-btn" id="di-p-ck" onclick="DocIntelligenceModule.createTask()">➕ ClickUp</button>
          </div>
        </div>
      </div>

      <div class="di-toast" id="di-toast"></div>
    `;
  }

  function bindEvents(container) {
    document.getElementById("di-overlay").addEventListener("click", e => {
      if (e.target === document.getElementById("di-overlay")) closePanel();
    });
    bindStatCards();
  }

  function resetListFilters() {
    activeFilters.date = "";
    const search = document.getElementById("di-search");
    const kat = document.getElementById("di-f-kat");
    const stav = document.getElementById("di-f-stav");
    const prio = document.getElementById("di-f-prio");
    if (search) search.value = "";
    if (kat) kat.value = "";
    if (stav) stav.value = "";
    if (prio) prio.value = "";
  }

  function bindStatCards() {
    document.querySelectorAll(".di-stat[data-di-filter]").forEach((card) => {
      card.addEventListener("click", () => {
        resetListFilters();
        const kind = card.dataset.diFilter;
        if (kind === "today") {
          activeFilters.date = new Date().toISOString().slice(0, 10);
        } else if (kind === "new") {
          document.getElementById("di-f-stav").value = "nový";
        } else if (kind === "critical") {
          document.getElementById("di-f-prio").value = "5";
        }
        filter();
      });
    });
  }

  async function loadSummary() {
    try {
      const s = await DocIntelligenceDB.getLatestSummary();
      const box = document.getElementById("di-summary-box");
      if (!s || !box) return;
      document.getElementById("di-summary").textContent = s.summary_text || "";
      document.getElementById("di-summary-date").textContent =
        "Poslední aktualizace: " + (s.created_at || "").slice(0, 10);
      box.style.display = "block";
    } catch (_) {
      /* souhrn je volitelný */
    }
  }

  // ── Načtení dat ───────────────────────────────────────────────────────────
  async function load() {
    try {
      const [docs, stats] = await Promise.all([
        DocIntelligenceDB.getAll(),
        DocIntelligenceDB.getStats()
      ]);
      allDocs = docs;
      updateStats(stats);
      await loadSummary();
      filter();
    } catch(e) {
      document.getElementById("di-tbody").innerHTML =
        `<tr><td colspan="6"><div class="di-empty">Chyba: ${e.message}</div></td></tr>`;
    }
  }

  function updateStats(s) {
    document.getElementById("di-s-total").textContent    = s.total;
    document.getElementById("di-s-today").textContent    = s.today;
    document.getElementById("di-s-new").textContent      = s.new;
    document.getElementById("di-s-critical").textContent = s.critical;
    window.kbDocIntelligence = { stats: s };
    document.dispatchEvent(new CustomEvent("kb:doc-intelligence-loaded", { detail: s }));
  }

  // ── Filtrování a řazení ───────────────────────────────────────────────────
  function filter() {
    const q   = (document.getElementById("di-search")?.value || "").toLowerCase();
    const kat = document.getElementById("di-f-kat")?.value  || "";
    const stv = document.getElementById("di-f-stav")?.value || "";
    const pri = document.getElementById("di-f-prio")?.value || "";

    let docs = allDocs.filter(d => {
      if (q   && !JSON.stringify(d).toLowerCase().includes(q)) return false;
      if (kat && d.kategorie !== kat)                          return false;
      if (stv && d.stav !== stv)                              return false;
      if (pri && String(d.dulezitost) !== pri)                return false;
      if (activeFilters.date && (d.created_at || "").slice(0, 10) !== activeFilters.date) return false;
      return true;
    });

    docs.sort((a, b) => {
      const va = a[sortCol] ?? "", vb = b[sortCol] ?? "";
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    renderTable(docs);
  }

  function sort(col) {
    if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortCol = col; sortDir = "desc"; }
    document.querySelectorAll(".di-table th").forEach(th => th.classList.remove("sort-asc","sort-desc"));
    event.target.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
    filter();
  }

  // ── Render tabulky ────────────────────────────────────────────────────────
  const katBadge = {
    "Granty a projekty":"di-badge-granty","Administrativa":"di-badge-admin",
    "Výzkum":"di-badge-vyzkum","Výuka":"di-badge-vyuka",
    "Smlouvy":"di-badge-smlouvy","Zprávy a analýzy":"di-badge-admin",
  };
  const stavBadge = {
    "nový":"di-badge-novy","přečteno":"di-badge-precteno",
    "zpracováno":"di-badge-zpracovano","archivováno":"di-badge-archivovano",
  };

  function dots(n) {
    return Array.from({length:5},(_,i)=>`<div class="di-dot${i<n?` p${n}`:''}"></div>`).join("");
  }

  function renderTable(docs) {
    const tbody = document.getElementById("di-tbody");
    if (!docs.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="di-empty">Žádné dokumenty</div></td></tr>`;
      return;
    }
    tbody.innerHTML = docs.map(d => `
      <tr>
        <td>
          <div class="di-doc-name" onclick="DocIntelligenceModule.open('${d.id}')">${esc(d.tema||d.file_name)}</div>
          <div class="di-doc-path di-col-path">${esc(d.relative_path||"")}</div>
        </td>
        <td><span class="di-badge ${katBadge[d.kategorie]||'di-badge-ostatni'}">${esc(d.kategorie||"—")}</span></td>
        <td><div class="di-dots">${dots(d.dulezitost||1)}</div></td>
        <td><span class="di-badge ${stavBadge[d.stav]||'di-badge-novy'}">${esc(d.stav||"nový")}</span></td>
        <td class="di-col-date" style="font-size:11px;opacity:.5">${(d.created_at||"").slice(0,10)}</td>
        <td>
          <div class="di-actions">
            <a class="di-icon-btn" href="${esc(d.file_url||'#')}" target="_blank" title="Otevřít soubor">🔗</a>
            <button class="di-icon-btn ck" onclick="DocIntelligenceModule.quickTask('${d.id}')" title="${d.clickup_task_id?'V ClickUp':'Přidat do ClickUp'}">${d.clickup_task_id?'✅':'➕'}</button>
            <button class="di-icon-btn" onclick="DocIntelligenceModule.open('${d.id}')" title="Detail">✏️</button>
          </div>
        </td>
      </tr>`).join("");
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function open(id) {
    const doc = allDocs.find(d => d.id === id);
    if (!doc) return;
    currentDoc = {...doc};
    const M = DocIntelligenceModule;
    M.cur = currentDoc;

    document.getElementById("di-p-title").textContent    = doc.tema || doc.file_name;
    document.getElementById("di-p-souhrn").textContent   = doc.souhrn || "—";
    document.getElementById("di-p-meta").innerHTML       =
      `<span class="di-badge ${katBadge[doc.kategorie]||'di-badge-ostatni'}">${esc(doc.kategorie||"—")}</span> &nbsp;${esc(doc.file_name)} · ${doc.size_kb||0} KB`;
    document.getElementById("di-p-keywords").textContent = (doc.klicova_slova||[]).join(", ") || "—";
    document.getElementById("di-p-akce").textContent     = doc.akce_doporucena || "Žádná doporučená akce";
    document.getElementById("di-p-notes").value          = doc.poznamky || "";
    document.getElementById("di-p-termin").value         = doc.termin || "";
    const path = (doc.file_path || "").replace(/\//g, "\\");
    document.getElementById("di-p-path").textContent     = path || "—";
    document.getElementById("di-p-ck").textContent       = doc.clickup_task_id ? `✅ ClickUp (${doc.clickup_task_id})` : "➕ ClickUp";

    // Priority buttons
    document.querySelectorAll(".di-prio-row .di-opt").forEach(b => {
      const v = parseInt(b.textContent);
      b.classList.toggle("active", parseInt(b.className.match(/di-prio-(\d)/)?.[1]) === doc.dulezitost);
    });
    // Stav buttons
    document.querySelectorAll(".di-stav-opt").forEach(b =>
      b.classList.toggle("active", b.dataset.v === doc.stav));

    document.getElementById("di-overlay").classList.add("open");
  }

  function closePanel() {
    document.getElementById("di-overlay").classList.remove("open");
  }

  function setPrio(v) {
    DocIntelligenceModule.cur.dulezitost = v;
    document.querySelectorAll(".di-prio-row .di-opt").forEach(b => {
      const n = parseInt(b.className.match(/di-prio-(\d)/)?.[1]);
      b.classList.toggle("active", n === v);
    });
  }

  function setStav(v) {
    DocIntelligenceModule.cur.stav = v;
    document.querySelectorAll(".di-stav-opt").forEach(b => b.classList.toggle("active", b.dataset.v === v));
  }

  // ── Uložení ───────────────────────────────────────────────────────────────
  async function save() {
    const c = DocIntelligenceModule.cur;
    try {
      await DocIntelligenceDB.update(c.id, {
        poznamky: c.poznamky, stav: c.stav,
        dulezitost: c.dulezitost, termin: c.termin || null,
      });
      try {
        await DocIntelligenceDB.syncDocToTopics(c);
      } catch (syncErr) {
        console.warn("syncDocToTopics:", syncErr);
      }
      const idx = allDocs.findIndex(d => d.id === c.id);
      if (idx >= 0) Object.assign(allDocs[idx], c);
      filter();
      toast("✓ Uloženo");
      closePanel();
    } catch(e) { toast("Chyba: " + e.message, true); }
  }

  // ── ClickUp ───────────────────────────────────────────────────────────────
  async function createTask() {
    const c = DocIntelligenceModule.cur;
    if (!c) return;
    await doTask(c.id);
  }

  async function quickTask(id) {
    const doc = allDocs.find(d => d.id === id);
    if (!doc) return;
    if (doc.clickup_task_id) { toast("Úkol již existuje: " + doc.clickup_task_id); return; }
    await doTask(id);
  }

  async function doTask(id) {
    const doc = allDocs.find(d => d.id === id);
    if (!doc) return;
    try {
      const taskId = await DocIntelligenceDB.createClickUpTask(doc);
      const idx = allDocs.findIndex(d => d.id === id);
      if (idx >= 0) allDocs[idx].clickup_task_id = taskId;
      if (DocIntelligenceModule.cur?.id === id) {
        DocIntelligenceModule.cur.clickup_task_id = taskId;
        document.getElementById("di-p-ck").textContent = `✅ ClickUp (${taskId})`;
      }
      filter();
      toast("✓ Úkol vytvořen v ClickUp");
    } catch(e) { toast("ClickUp chyba: " + e.message, true); }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function toast(msg, err = false) {
    const el = document.getElementById("di-toast");
    if (!el) return;
    el.textContent = msg;
    el.style.background = err ? "#a32d2d" : "#2c2c2a";
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  // ── Veřejné API ───────────────────────────────────────────────────────────
  return {
    cur: null,
    init, load,
    reload: load,
    filter, sort,
    open, closePanel,
    setPrio, setStav,
    save, createTask, quickTask,
  };
})();

window.DocIntelligenceModule = DocIntelligenceModule;

(function initDocIntelligencePage() {
  function boot() {
    const host = document.getElementById("docIntelligencePageRoot");
    if (!host || host.__diInit) return;
    host.__diInit = true;
    DocIntelligenceModule.init(host);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.kbLayout?.getPage?.() === "doc-intelligence") boot();
  });
  document.addEventListener("kb:page-changed", (e) => {
    if (e.detail?.page === "doc-intelligence") boot();
  });
})();
