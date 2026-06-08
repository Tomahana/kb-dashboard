// Modul Termíny – sběry dat a odesílání na úřady (Supabase + lokální záloha).

(function () {
  const STORAGE_KEY = "kb-dashboard-deadlines-v1";
  const DAYS_UPCOMING = 30;
  const CLOSED_STATUSES = ["odesláno", "uzavřeno", "hotovo", "zrušeno", "archiv"];

  let deadlines = [];
  let useSupabase = false;
  let loading = false;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d ? d.toLocaleDateString("cs-CZ") : "";
  }

  function effectiveDate(item) {
    return parseDate(item.termin_odeslani) || parseDate(item.termin_sberu);
  }

  function isClosed(item) {
    return CLOSED_STATUSES.includes(l(item.stav));
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines, null, 2));
  }

  function setStatus(text, isError) {
    const node = el("deadlinesStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("deadlinesStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function loadDeadlines() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseDeadlines) {
        useSupabase = false;
        try {
          deadlines = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch (_) {
          deadlines = [];
        }
        if (!Array.isArray(deadlines)) deadlines = [];
        setStatus("Data pouze v prohlížeči. Spusťte SQL schéma a načtěte ze Supabase.");
        return;
      }
      const available = await window.kbSupabaseDeadlines.probeTables();
      if (!available) {
        useSupabase = false;
        deadlines = window.kbSupabaseDeadlines.loadLocalDeadlines();
        setStatus("Tabulka kb_deadlines v Supabase zatím neexistuje. Spusťte supabase/deadlines-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        await window.kbSupabaseDeadlines.migrateLocalDeadlinesIfNeeded();
        deadlines = await window.kbSupabaseDeadlines.loadDeadlinesFromSupabase();
        setStatus(`Načteno ze Supabase: ${deadlines.length} termínů.`);
      }
    } catch (error) {
      console.error(error);
      useSupabase = false;
      deadlines = window.kbSupabaseDeadlines?.loadLocalDeadlines?.() || [];
      setStatus(`Chyba načtení: ${error.message || error}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  function filteredDeadlines() {
    const urad = n(el("deadlinesUradFilter")?.value);
    const agenda = n(el("deadlinesAgendaFilter")?.value);
    const stav = n(el("deadlinesStavFilter")?.value);
    const q = l(el("deadlinesSearch")?.value);
    return deadlines.filter(item => {
      if (urad && n(item.urad) !== urad) return false;
      if (agenda && n(item.agenda) !== agenda) return false;
      if (stav && n(item.stav) !== stav) return false;
      if (q) {
        const hay = l([item.nazev, item.urad, item.agenda, item.typ, item.stav, item.poznamka, item.odpovedna_osoba, item.zdroj].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function splitByStatus(items) {
    const now = new Date();
    const upcoming = [];
    const overdue = [];
    items.forEach(item => {
      const deadline = effectiveDate(item);
      if (!deadline) return;
      const diffDays = (deadline - now) / 86400000;
      if (diffDays < 0 && !isClosed(item)) overdue.push({ item, deadline });
      else if (diffDays >= 0 && diffDays <= DAYS_UPCOMING) upcoming.push({ item, deadline });
    });
    upcoming.sort((a, b) => a.deadline - b.deadline);
    overdue.sort((a, b) => a.deadline - b.deadline);
    return { upcoming, overdue };
  }

  function uniqueField(field) {
    return [...new Set(deadlines.map(d => n(d[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  }

  function populateFilters() {
    const fill = (id, values) => {
      const select = el(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">Vše</option>' + values.map(v => `<option>${html(v)}</option>`).join("");
      select.value = current;
    };
    fill("deadlinesUradFilter", uniqueField("urad"));
    fill("deadlinesAgendaFilter", uniqueField("agenda"));
    fill("deadlinesStavFilter", uniqueField("stav"));
  }

  function renderOverview(all, upcoming, overdue) {
    if (el("deadlinesTotal")) el("deadlinesTotal").textContent = String(all.length);
    if (el("deadlinesUpcoming")) el("deadlinesUpcoming").textContent = String(upcoming.length);
    if (el("deadlinesOverdue")) el("deadlinesOverdue").textContent = String(overdue.length);
    if (el("navBadgeDeadlines")) {
      const badge = el("navBadgeDeadlines");
      badge.textContent = overdue.length > 0 ? String(overdue.length) : "";
      badge.hidden = overdue.length <= 0;
    }
  }

  function renderDeadlineCard({ item, deadline }) {
    const dateText = deadline ? formatDate(deadline) : "Bez termínu";
  const sber = item.termin_sberu ? `Sběr: ${formatDate(item.termin_sberu)}` : "";
    const odesl = item.termin_odeslani ? `Odeslání: ${formatDate(item.termin_odeslani)}` : "";
    const dates = [sber, odesl].filter(Boolean).join(" · ");
    return `
      <article class="deadlineItem deadline-clickable" data-deadline-id="${html(item.id)}" tabindex="0" role="button">
        <header class="deadlineHeader">
          <div>
            <strong>${html(dateText)}</strong>
            <span class="deadlineMeta">${html(item.urad || "—")} · ${html(item.agenda || "Nezařazeno")}</span>
            ${dates ? `<span class="deadlineMeta">${html(dates)}</span>` : ""}
          </div>
          <div class="deadlineTags">
            ${item.typ ? `<span class="badge">${html(item.typ)}</span>` : ""}
            ${item.stav ? `<span class="badge">${html(item.stav)}</span>` : ""}
          </div>
        </header>
        <div class="deadlineTitle">${html(item.nazev)}</div>
        ${item.odpovedna_osoba ? `<div class="deadlineMeta">Odpovědný: ${html(item.odpovedna_osoba)}</div>` : ""}
        ${item.poznamka ? `<p class="deadlineSummary">${html(item.poznamka)}</p>` : ""}
      </article>
    `;
  }

  function renderList(targetId, items, emptyText) {
    const box = el(targetId);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<p class="hint">${html(emptyText)}</p>`;
      return;
    }
    box.innerHTML = `<div class="deadlinesList">${items.map(renderDeadlineCard).join("")}</div>`;
  }

  function renderTable(all) {
    const box = el("deadlinesAllList");
    if (!box) return;
    if (!all.length) {
      box.innerHTML = `<p class="hint">Žádné termíny. Přidejte nový záznam nebo importujte JSON od kolegů.</p>`;
      return;
    }
    const sorted = [...all].sort((a, b) => {
      const da = effectiveDate(a);
      const db = effectiveDate(b);
      if (!da && !db) return a.nazev.localeCompare(b.nazev, "cs");
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    box.innerHTML = `
      <div class="deadlinesTableWrap">
        <table class="deadlinesTable">
          <thead>
            <tr>
              <th>Odeslání</th>
              <th>Sběr</th>
              <th>Název</th>
              <th>Úřad</th>
              <th>Agenda</th>
              <th>Typ</th>
              <th>Stav</th>
              <th>Zdroj</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(item => `
              <tr class="deadline-clickable" data-deadline-id="${html(item.id)}" tabindex="0">
                <td>${html(formatDate(item.termin_odeslani))}</td>
                <td>${html(formatDate(item.termin_sberu))}</td>
                <td><strong>${html(item.nazev)}</strong></td>
                <td>${html(item.urad)}</td>
                <td>${html(item.agenda)}</td>
                <td>${html(item.typ)}</td>
                <td>${html(item.stav)}</td>
                <td>${html(item.zdroj)}</td>
                <td><span class="openHint">Upravit →</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render() {
    if (loading) {
      ["deadlinesUpcomingList", "deadlinesOverdueList", "deadlinesAllList"].forEach(id => {
        const node = el(id);
        if (node) node.innerHTML = `<p class="hint">Načítám termíny…</p>`;
      });
      return;
    }
    populateFilters();
    const all = filteredDeadlines();
    const { upcoming, overdue } = splitByStatus(all);
    renderOverview(all, upcoming, overdue);
    renderList("deadlinesUpcomingList", upcoming, "Žádné nadcházející termíny v následujících 30 dnech.");
    renderList("deadlinesOverdueList", overdue, "Žádné zpožděné termíny.");
    renderTable(all);
  }

  function normalizeImportRow(row, index) {
    const get = (...keys) => {
      for (const key of keys) {
        if (row[key] != null && n(row[key])) return n(row[key]);
      }
      return "";
    };
    return {
      id: row.id || uuid(),
      nazev: get("nazev", "Název", "name", "title") || `Import ${index + 1}`,
      urad: get("urad", "Úřad", "authority"),
      agenda: get("agenda", "Agenda"),
      typ: get("typ", "Typ", "type"),
      termin_sberu: get("termin_sberu", "termin_sběru", "Termín sběru", "sber"),
      termin_odeslani: get("termin_odeslani", "termin_odeslání", "Termín odeslání", "odeslani"),
      periodicita: get("periodicita", "Periodicita"),
      stav: get("stav", "Stav") || "Aktivní",
      poznamka: get("poznamka", "Poznámka", "note"),
      odpovedna_osoba: get("odpovedna_osoba", "Odpovědná osoba", "responsible"),
      zdroj: get("zdroj", "Zdroj") || "import",
      kb_id: get("kb_id", "KB_ID"),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async function importJsonFile(file, replace) {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      alert("Soubor není platný JSON.");
      return;
    }
    const rows = Array.isArray(parsed) ? parsed : parsed.deadlines || parsed.items || [];
    if (!rows.length) {
      alert("V souboru nejsou žádné záznamy.");
      return;
    }
    const normalized = rows.map(normalizeImportRow);
    try {
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        if (replace) {
          for (const existing of [...deadlines]) {
            await window.kbSupabaseDeadlines.deleteDeadlineFromSupabase(existing.id);
          }
          deadlines = await window.kbSupabaseDeadlines.insertDeadlines(normalized);
        } else {
          const inserted = await window.kbSupabaseDeadlines.insertDeadlines(normalized);
          deadlines = [...inserted, ...deadlines];
        }
        setStatus(`Importováno do Supabase: ${normalized.length} termínů.`);
      } else {
        if (replace) deadlines = normalized;
        else deadlines = [...normalized, ...deadlines];
        persistLocal();
        setStatus(`Importováno lokálně: ${normalized.length} termínů.`);
      }
      render();
    } catch (error) {
      console.error(error);
      alert("Import se nepodařil: " + (error.message || error));
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(deadlines, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deadlines-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openDialog(item) {
    const existing = item || null;
    el("deadlineEditId").value = existing?.id || "";
    el("deadlineNazev").value = existing?.nazev || "";
    el("deadlineUrad").value = existing?.urad || "";
    el("deadlineAgenda").value = existing?.agenda || "";
    el("deadlineTyp").value = existing?.typ || "";
    el("deadlineSber").value = existing?.termin_sberu || "";
    el("deadlineOdeslani").value = existing?.termin_odeslani || "";
    el("deadlinePeriodicita").value = existing?.periodicita || "";
    el("deadlineStav").value = existing?.stav || "Aktivní";
    el("deadlineOdpovedna").value = existing?.odpovedna_osoba || "";
    el("deadlineZdroj").value = existing?.zdroj || (existing ? "" : "vlastní");
    el("deadlinePoznamka").value = existing?.poznamka || "";
    el("deadlineDialogTitle").textContent = existing ? "Upravit termín" : "Nový termín";
    el("deleteDeadlineBtn").hidden = !existing;
    el("deadlineDialog").showModal();
  }

  function getDeadline(id) {
    return deadlines.find(d => d.id === id) || null;
  }

  async function saveDeadlineForm(e) {
    e.preventDefault();
    const id = el("deadlineEditId").value || uuid();
    const existing = getDeadline(id);
    const payload = {
      id,
      nazev: n(el("deadlineNazev").value) || "Bez názvu",
      urad: n(el("deadlineUrad").value),
      agenda: n(el("deadlineAgenda").value),
      typ: n(el("deadlineTyp").value),
      termin_sberu: el("deadlineSber").value || "",
      termin_odeslani: el("deadlineOdeslani").value || "",
      periodicita: n(el("deadlinePeriodicita").value),
      stav: n(el("deadlineStav").value) || "Aktivní",
      odpovedna_osoba: n(el("deadlineOdpovedna").value),
      zdroj: n(el("deadlineZdroj").value),
      poznamka: n(el("deadlinePoznamka").value),
      kb_id: existing?.kb_id || "",
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      __existing: !!existing
    };
    const btn = el("saveDeadlineBtn");
    const prev = btn?.textContent;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = useSupabase ? "Ukládám do Supabase…" : "Ukládám…";
      }
      let saved;
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        saved = await window.kbSupabaseDeadlines.upsertDeadline(payload);
      } else {
        saved = { ...payload };
        delete saved.__existing;
        const idx = deadlines.findIndex(d => d.id === id);
        if (idx === -1) deadlines.unshift(saved);
        else deadlines[idx] = { ...deadlines[idx], ...saved };
        persistLocal();
      }
      const idx = deadlines.findIndex(d => d.id === saved.id);
      if (idx === -1) deadlines.unshift(saved);
      else deadlines[idx] = { ...deadlines[idx], ...saved };
      el("deadlineDialog").close();
      setStatus(useSupabase ? "Uloženo v Supabase." : "Uloženo lokálně v prohlížeči.");
      render();
    } catch (error) {
      console.error(error);
      alert("Uložení se nepodařilo: " + (error.message || error));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "Uložit";
      }
    }
  }

  async function deleteDeadline() {
    const id = el("deadlineEditId").value;
    if (!id || !confirm("Opravdu smazat tento termín?")) return;
    try {
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        await window.kbSupabaseDeadlines.deleteDeadlineFromSupabase(id);
      }
      deadlines = deadlines.filter(d => d.id !== id);
      if (!useSupabase) persistLocal();
      el("deadlineDialog").close();
      setStatus("Termín smazán.");
      render();
    } catch (error) {
      alert("Smazání se nepodařilo: " + (error.message || error));
    }
  }

  function buildAiPrompt(all) {
    if (!all.length) return "Žádné termíny k analýze.";
    const lines = all.map((item, i) => {
      const eff = effectiveDate(item);
      return `[${i + 1}] ${item.nazev}
Úřad: ${item.urad || ""}
Agenda: ${item.agenda || ""}
Typ: ${item.typ || ""}
Sběr: ${formatDate(item.termin_sberu)}
Odeslání: ${formatDate(item.termin_odeslani)}
Hlavní termín: ${formatDate(eff)}
Stav: ${item.stav || ""}
Odpovědný: ${item.odpovedna_osoba || ""}
Poznámka: ${item.poznamka || ""}`;
    }).join("\n---\n");
    return `Analyzuj termíny sběrů dat a odesílání výkazů na úřady.

Vytvoř:
1. seznam blížících se termínů (do ${DAYS_UPCOMING} dní) s doporučenými kroky,
2. seznam zpožděných termínů a návrh nápravných kroků,
3. přehled podle úřadů a agend,
4. návrh ročního kalendáře hlavních sběrů.

Nevymýšlej nové termíny mimo data níže.

TERMÍNY:
${lines}`;
  }

  async function copyAiPrompt() {
    const prompt = buildAiPrompt(filteredDeadlines());
    try {
      await navigator.clipboard.writeText(prompt);
      const btn = el("deadlinesCopyPromptBtn");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = "Zkopírováno";
      setTimeout(() => { btn.textContent = original; }, 1200);
    } catch (_) {
      alert("Nepodařilo se zkopírovat prompt.");
    }
  }

  function bindClicks() {
    document.addEventListener("click", (e) => {
      const host = e.target.closest?.("[data-deadline-id]");
      if (!host || !host.closest("#page-terminy")) return;
      if (e.target.closest("button, input, a, label")) return;
      const id = host.dataset.deadlineId;
      const item = getDeadline(id);
      if (item) openDialog(item);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const host = e.target.closest?.("[data-deadline-id]");
      if (!host || !host.closest("#page-terminy")) return;
      const id = host.dataset.deadlineId;
      const item = getDeadline(id);
      if (item) {
        e.preventDefault();
        openDialog(item);
      }
    });
  }

  function injectStyles() {
    if (el("deadlinesStyles")) return;
    const style = document.createElement("style");
    style.id = "deadlinesStyles";
    style.textContent = `
      .deadlinesOverview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .9rem; margin-bottom: .6rem; }
      .deadlinesToolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: .75rem; }
      .deadlinesFilters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; margin-bottom: .5rem; }
      .deadlinesStatus { margin: .35rem 0 .75rem; font-size: .88rem; color: var(--muted); }
      .deadlinesStatusError { color: #b42318; }
      .deadlinesList { display: grid; gap: .6rem; }
      .deadlineItem { border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; background: white; cursor: pointer; }
      .deadlineItem:hover { background: #f8fafc; }
      .deadlineHeader { display: flex; justify-content: space-between; gap: .6rem; align-items: baseline; margin-bottom: .2rem; }
      .deadlineMeta { display: block; font-size: .82rem; color: var(--muted); margin-top: .1rem; }
      .deadlineTags { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-end; }
      .deadlineTitle { font-weight: 600; margin-bottom: .2rem; }
      .deadlineSummary { font-size: .9rem; color: var(--muted); margin: .25rem 0 0; }
      .deadlinesTableWrap { overflow-x: auto; }
      .deadlinesTable { width: 100%; border-collapse: collapse; }
      .deadlinesTable th, .deadlinesTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .9rem; }
      .deadlinesTable th { font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
      .deadlinesTable tr.deadline-clickable { cursor: pointer; }
      .deadlinesTable tr.deadline-clickable:hover { background: #f8fafc; }
      .navBadgeDeadline { background: #fef0c7; color: #b54708; }
      @media (max-width: 900px) {
        .deadlinesOverview, .deadlinesFilters { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    el("deadlinesNewBtn")?.addEventListener("click", () => openDialog(null));
    el("deadlinesReloadBtn")?.addEventListener("click", loadDeadlines);
    el("deadlinesExportBtn")?.addEventListener("click", exportJson);
    el("deadlinesCopyPromptBtn")?.addEventListener("click", copyAiPrompt);
    el("saveDeadlineBtn")?.addEventListener("click", saveDeadlineForm);
    el("deleteDeadlineBtn")?.addEventListener("click", deleteDeadline);
    el("deadlinesImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const replace = el("deadlinesImportReplace")?.checked;
      await importJsonFile(file, replace);
      e.target.value = "";
    });
    ["deadlinesUradFilter", "deadlinesAgendaFilter", "deadlinesStavFilter", "deadlinesSearch"].forEach(id => {
      el(id)?.addEventListener("input", render);
    });
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "terminy" && !deadlines.length && !loading) loadDeadlines();
    });
  }

  function init() {
    injectStyles();
    bindClicks();
    bindEvents();
    setTimeout(loadDeadlines, 200);
  }

  window.kbDeadlines = { loadDeadlines, getDeadlines: () => deadlines };

  document.addEventListener("DOMContentLoaded", init);
})();
