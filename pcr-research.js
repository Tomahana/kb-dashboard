// Modul Výzkumné směry PČR — sync z Google Sheets, evidence v Supabase, analýza a propojení na Osoby.

(function () {
  const STORAGE_KEY = "kb-dashboard-pcr-research-v1";
  const DEFAULT_SHEET_ID = "1iHbmMsSAMFFuo1euzeT5JEknD2XDFASPGXgSwZgaGrM";
  const DEFAULT_SHEET_GID = "0";
  const DEFAULT_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SHEET_ID}/edit?gid=${DEFAULT_SHEET_GID}`;

  const IMPORT_ALIASES = {
    fakulta: ["Fakulta", "fakulta"],
    zkr_fak: ["Zkr_Fak", "Zkr. fak.", "zkr_fak"],
    katedra: ["Katedra", "katedra"],
    zkr_kat: ["Zkr_kat", "Zkr. kat.", "zkr_kat"],
    oblast: ["Oblast", "oblast"],
    tema: ["Téma", "Tema", "téma", "tema"],
    gestor: ["Gestor", "gestor"],
    email: ["email", "E-mail", "Email"],
    popis: ["Popis", "popis"]
  };

  let topics = [];
  let useSupabase = false;
  let loading = false;
  let activeView = "table";
  let filterFakulta = "";
  let filterOblast = "";
  let filterKatedra = "";
  let filterSearch = "";
  let filterLinked = "";

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `pcr-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(topics, null, 2));
    window.kbSupabasePcrResearch?.saveLocal?.(topics);
  }

  function setStatus(text, isError) {
    const node = el("pcrResearchStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("pcrResearchStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  function makeSourceKey(row) {
    return [
      l(row.zkr_fak),
      l(row.zkr_kat),
      l(row.oblast),
      l(row.tema),
      l(row.email)
    ].join("|");
  }

  function normalizeImportRow(raw, index) {
    const get = (field) => {
      const aliases = IMPORT_ALIASES[field] || [field];
      for (const alias of aliases) {
        if (raw[alias] != null && n(raw[alias])) return n(raw[alias]);
        const hit = Object.keys(raw).find((k) => l(k) === l(alias));
        if (hit && n(raw[hit])) return n(raw[hit]);
      }
      return "";
    };
    const tema = get("tema");
    const oblast = get("oblast");
    if (!tema && !oblast) return null;
    const row = {
      poradi: index + 1,
      fakulta: get("fakulta"),
      zkr_fak: get("zkr_fak"),
      katedra: get("katedra"),
      zkr_kat: get("zkr_kat"),
      oblast: oblast || "—",
      tema: tema || "Bez názvu",
      gestor: get("gestor"),
      email: get("email"),
      popis: get("popis"),
      sheet_id: DEFAULT_SHEET_ID,
      sheet_gid: DEFAULT_SHEET_GID,
      synced_at: new Date().toISOString()
    };
    row.source_key = makeSourceKey(row);
    return row;
  }

  function parseGestorName(gestor) {
    const text = n(gestor).replace(/\s+/g, " ");
    if (!text) return { jmeno: "", prijmeni: "" };
    const withoutTitles = text
      .replace(/^(prof\.|doc\.|ing\.|mgr\.|rndr\.|mudr\.|phdr\.|dr\.|bc\.|ph\.d\.|csc\.|mba\.?)/gi, "")
      .replace(/,?\s*(ph\.d\.|csc\.|mba\.?|dipl\.?)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const parts = withoutTitles.split(/\s+/).filter(Boolean);
    if (!parts.length) return { jmeno: "", prijmeni: "" };
    if (parts.length === 1) return { jmeno: "", prijmeni: parts[0] };
    return { jmeno: parts[0], prijmeni: parts[parts.length - 1] };
  }

  function linkGestorPerson(row) {
    let linked = { ...row };
    const email = l(row.email);
    if (email) {
      const byEmail = window.kbPersons?.getPersons?.().find((p) => l(p.email) === email);
      if (byEmail) return window.kbPersonLinks?.applyPersonLink?.(linked, byEmail, "gestor") || linked;
    }
    const name = parseGestorName(row.gestor);
    const matched = window.kbPersons?.matchPersonFromRegistry?.({
      email: row.email,
      jmeno: name.jmeno,
      prijmeni: name.prijmeni,
      fakulta: row.zkr_fak || row.fakulta
    });
    if (matched) return window.kbPersonLinks?.applyPersonLink?.(linked, matched, "gestor") || linked;
    return linked;
  }

  function gestorDisplay(row) {
    return window.kbPersonLinks?.personDisplay?.(row, "gestor") || n(row.gestor) || "—";
  }

  function isLinked(row) {
    return !!(row.gestor_osobni_cislo || window.kbPersonLinks?.resolvePerson?.(row, "gestor"));
  }

  function filteredTopics() {
    return topics.filter((row) => {
      if (filterFakulta && row.zkr_fak !== filterFakulta) return false;
      if (filterOblast && row.oblast !== filterOblast) return false;
      if (filterKatedra && row.zkr_kat !== filterKatedra) return false;
      if (filterLinked === "yes" && !isLinked(row)) return false;
      if (filterLinked === "no" && isLinked(row)) return false;
      if (filterSearch) {
        const hay = l([row.tema, row.oblast, row.gestor, row.email, row.katedra, row.popis, gestorDisplay(row)].join(" "));
        if (!hay.includes(l(filterSearch))) return false;
      }
      return true;
    });
  }

  function uniqueValues(field) {
    return [...new Set(topics.map((t) => n(t[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  }

  function groupCount(items, field) {
    const map = new Map();
    for (const item of items) {
      const key = n(item[field]) || "—";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
  }

  async function fetchSheetCsv() {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${DEFAULT_SHEET_ID}/export?format=csv&gid=${DEFAULT_SHEET_GID}`;
    try {
      const res = await fetch(exportUrl);
      if (res.ok) return await res.text();
    } catch (_) { /* CORS — fallback na edge function */ }

    const session = await window.kbAuth?.getSession?.();
    if (!session?.access_token) {
      throw new Error("Nelze načíst tabulku přímo ani přes proxy — přihlaste se v Nastavení.");
    }
    const fnUrl = `${window.KB_SUPABASE.url.replace(/\/$/, "")}/functions/v1/google-sheets-fetch`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: window.KB_SUPABASE.anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sheetId: DEFAULT_SHEET_ID, gid: DEFAULT_SHEET_GID })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Proxy selhalo (HTTP ${res.status}).`);
    if (!data.csv) throw new Error("Proxy nevrátila CSV data.");
    return data.csv;
  }

  async function importFromCsvText(text, replace = true) {
    await window.kbPersons?.ensureLoaded?.();
    const parsed = window.kbPersons?.parseDelimitedTable?.(text) || { rows: [] };
    const normalized = parsed.rows
      .map((row, i) => normalizeImportRow(row, i))
      .filter(Boolean)
      .map(linkGestorPerson);
    if (!normalized.length) throw new Error("V CSV nejsou rozpoznatelná data (očekáváme sloupce Fakulta, Oblast, Téma, Gestor, email…).");

    if (replace && topics.length && !confirm(`Nahradit ${topics.length} stávajících záznamů importem ${normalized.length} témat ze tabulky?`)) {
      return null;
    }

    const withIds = normalized.map((row) => {
      const existing = topics.find((t) => t.source_key === row.source_key);
      return {
        ...row,
        id: existing?.id || uuid(),
        __existing: !!existing
      };
    });

    if (useSupabase && window.kbSupabasePcrResearch) {
      if (!(await ensureAuth())) return null;
      if (replace) await window.kbSupabasePcrResearch.deleteAll();
      setStatus(`Ukládám 0 / ${withIds.length}…`);
      const saved = await window.kbSupabasePcrResearch.upsertTopicsBatch(withIds, (done, total) => {
        setStatus(`Ukládám ${done} / ${total}…`);
      });
      topics = saved;
    } else {
      topics = withIds;
      persistLocal();
    }
    return withIds.length;
  }

  async function syncFromGoogleSheets() {
    setStatus("Načítám tabulku z Google Sheets…");
    loading = true;
    render();
    try {
      const csv = await fetchSheetCsv();
      const count = await importFromCsvText(csv, true);
      if (count != null) {
        setStatus(`Synchronizováno ${count} výzkumných směrů z Google Sheets.`);
        document.dispatchEvent(new CustomEvent("kb:pcr-research-loaded"));
      }
    } catch (err) {
      console.error(err);
      setStatus(`Synchronizace selhala: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  async function loadTopics() {
    loading = true;
    render();
    try {
      if (!window.kbSupabasePcrResearch) {
        useSupabase = false;
        topics = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(topics)) topics = [];
        setStatus("Data v prohlížeči. Spusťte supabase/pcr-research-schema.sql.");
        return;
      }
      const available = await window.kbSupabasePcrResearch.probeTables();
      if (!available) {
        useSupabase = false;
        topics = window.kbSupabasePcrResearch.loadLocal();
        setStatus("Tabulka kb_pcr_research_topics v Supabase zatím neexistuje. Spusťte supabase/pcr-research-schema.sql.");
        return;
      }
      useSupabase = true;
      await window.kbPersons?.ensureLoaded?.();
      topics = await window.kbSupabasePcrResearch.loadAll();
      const linked = topics.filter(isLinked).length;
      setStatus(`Načteno ${topics.length} výzkumných směrů · ${linked} propojeno na Osoby.`);
    } catch (err) {
      console.error(err);
      useSupabase = false;
      topics = window.kbSupabasePcrResearch?.loadLocal?.() || [];
      setStatus(`Chyba: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:pcr-research-loaded"));
    }
  }

  async function saveTopic(item) {
    let saved = item;
    if (useSupabase && window.kbSupabasePcrResearch) {
      if (!(await ensureAuth())) return;
      saved = await window.kbSupabasePcrResearch.upsertTopic(item);
    }
    const idx = topics.findIndex((t) => t.id === saved.id || t.source_key === saved.source_key);
    if (idx === -1) topics.unshift(saved);
    else topics[idx] = saved;
    if (!useSupabase) persistLocal();
    render();
  }

  async function relinkAllPersons() {
    if (!topics.length) return;
    if (!confirm(`Znovu propojit gestory u ${topics.length} témat podle e-mailu a jména v Osobách?`)) return;
    loading = true;
    render();
    try {
      await window.kbPersons?.ensureLoaded?.();
      const updated = topics.map(linkGestorPerson);
      if (useSupabase && window.kbSupabasePcrResearch) {
        if (!(await ensureAuth())) return;
        topics = await window.kbSupabasePcrResearch.upsertTopicsBatch(updated);
      } else {
        topics = updated;
        persistLocal();
      }
      const linked = topics.filter(isLinked).length;
      setStatus(`Propojeno ${linked} / ${topics.length} gestorů na Osoby.`);
    } catch (err) {
      setStatus(`Propojení selhalo: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  function renderFilters() {
    const fakOpts = uniqueValues("zkr_fak").map((v) => `<option value="${html(v)}"${v === filterFakulta ? " selected" : ""}>${html(v)}</option>`).join("");
    const oblOpts = uniqueValues("oblast").map((v) => `<option value="${html(v)}"${v === filterOblast ? " selected" : ""}>${html(v)}</option>`).join("");
    const katOpts = uniqueValues("zkr_kat").map((v) => `<option value="${html(v)}"${v === filterKatedra ? " selected" : ""}>${html(v)}</option>`).join("");
    return `
      <div class="pcrResearchFilters">
        <label>Fakulta <select id="pcrFilterFakulta"><option value="">Vše</option>${fakOpts}</select></label>
        <label>Oblast <select id="pcrFilterOblast"><option value="">Vše</option>${oblOpts}</select></label>
        <label>Katedra <select id="pcrFilterKatedra"><option value="">Vše</option>${katOpts}</select></label>
        <label>Propojení
          <select id="pcrFilterLinked">
            <option value="">Vše</option>
            <option value="yes"${filterLinked === "yes" ? " selected" : ""}>Propojeno na Osobu</option>
            <option value="no"${filterLinked === "no" ? " selected" : ""}>Nepropojeno</option>
          </select>
        </label>
        <label>Hledat <input id="pcrFilterSearch" type="search" value="${html(filterSearch)}" placeholder="Téma, gestor, popis…" /></label>
      </div>`;
  }

  function renderSummary(items) {
    const linked = items.filter(isLinked).length;
    const gestors = new Set(items.map((t) => l(t.email) || l(t.gestor)).filter(Boolean)).size;
    return `
      <div class="pcrResearchMetrics">
        <div class="metric"><span>${items.length}</span><small>Témat</small></div>
        <div class="metric"><span>${uniqueValues("oblast").length}</span><small>Oblastí</small></div>
        <div class="metric"><span>${gestors}</span><small>Gestorů</small></div>
        <div class="metric"><span>${linked}</span><small>Propojeno na Osoby</small></div>
      </div>`;
  }

  function renderBarChart(groups, maxBars = 12) {
    const top = groups.slice(0, maxBars);
    const max = top[0]?.[1] || 1;
    return `<div class="pcrBarChart">${top.map(([label, count]) => `
      <div class="pcrBarRow">
        <div class="pcrBarLabel" title="${html(label)}">${html(label)}</div>
        <div class="pcrBarTrack"><div class="pcrBarFill" style="width:${Math.round((count / max) * 100)}%"></div></div>
        <div class="pcrBarCount">${count}</div>
      </div>`).join("")}</div>`;
  }

  function renderAnalysis(items) {
    const byOblast = groupCount(items, "oblast");
    const byFakulta = groupCount(items, "zkr_fak");
    const byKatedra = groupCount(items, "zkr_kat");
    const gestorGroups = new Map();
    for (const item of items) {
      const key = gestorDisplay(item) || n(item.gestor) || "—";
      gestorGroups.set(key, (gestorGroups.get(key) || 0) + 1);
    }
    const byGestor = [...gestorGroups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
    const unlinked = items.filter((t) => !isLinked(t));

    return `
      <div class="pcrAnalysisGrid">
        <section class="pcrAnalysisCard">
          <h3>Podle oblasti</h3>
          ${renderBarChart(byOblast)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Podle fakulty</h3>
          ${renderBarChart(byFakulta, 8)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Podle katedry</h3>
          ${renderBarChart(byKatedra, 10)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Gestoři (počet témat)</h3>
          ${renderBarChart(byGestor, 12)}
        </section>
        <section class="pcrAnalysisCard pcrAnalysisWide">
          <h3>Nepropojení gestoři (${unlinked.length})</h3>
          ${unlinked.length
            ? `<ul class="pcrUnlinkedList">${unlinked.slice(0, 20).map((t) =>
              `<li><strong>${html(t.tema)}</strong> — ${html(t.gestor)}${t.email ? ` · <a href="mailto:${html(t.email)}">${html(t.email)}</a>` : ""}</li>`
            ).join("")}${unlinked.length > 20 ? `<li class="hint">… a dalších ${unlinked.length - 20}</li>` : ""}</ul>`
            : `<p class="hint">Všechna témata mají gestora propojeného na modul Osoby.</p>`}
        </section>
      </div>`;
  }

  function renderTable(items) {
    if (!items.length) return `<p class="hint">Žádná témata nevyhovují filtru. Zkuste synchronizaci z Google Sheets.</p>`;
    return `<div class="pcrTableWrap"><table class="pcrTable">
      <thead><tr>
        <th>#</th><th>Fak.</th><th>Katedra</th><th>Oblast</th><th>Téma</th><th>Gestor</th><th>Popis</th><th></th>
      </tr></thead>
      <tbody>${items.map((row) => {
        const person = window.kbPersonLinks?.resolvePerson?.(row, "gestor");
        const gestorCell = person
          ? `<a href="#osoby" data-goto="osoby" class="pcrPersonLink" title="Osoba v evidenci">${html(gestorDisplay(row))}</a>`
          : html(gestorDisplay(row));
        return `<tr data-topic-id="${html(row.id)}">
          <td>${row.poradi ?? "—"}</td>
          <td>${html(row.zkr_fak)}</td>
          <td title="${html(row.katedra)}">${html(row.zkr_kat)}</td>
          <td>${html(row.oblast)}</td>
          <td><strong>${html(row.tema)}</strong></td>
          <td>${gestorCell}${row.email ? `<br><span class="hint">${html(row.email)}</span>` : ""}</td>
          <td class="pcrPopis">${html(row.popis)}</td>
          <td class="rowActions"><button type="button" class="button small secondary" data-edit-pcr="${html(row.id)}">Upravit</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function render() {
    const root = el("pcrResearchRoot");
    if (!root) return;
    const items = filteredTopics();
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>Výzkumné směry PČR</h2>
            <p class="hint">Evidence výzkumných směrů UHK pro spolupráci s Policií ČR. Data se synchronizují z <a href="${DEFAULT_SHEET_URL}" target="_blank" rel="noopener">Google Sheets</a> do Supabase a gestoři se propojují na modul <a href="#osoby" data-goto="osoby">Osoby</a>.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="pcrReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="pcrSyncBtn" class="button accent">Sync z Google Sheets</button>
            <button type="button" id="pcrRelinkBtn" class="button small secondary">Propojit gestory</button>
            <label class="button small secondary" for="pcrImportFile">Import CSV</label>
            <input type="file" id="pcrImportFile" accept=".csv,.txt,text/csv" hidden />
          </div>
        </div>
        <p id="pcrResearchStatus" class="pcrResearchStatus hint">${loading ? "Načítám…" : "—"}</p>
        ${renderSummary(topics)}
        ${renderFilters()}
        <div class="pcrViewTabs">
          <button type="button" class="pcrViewTab ${activeView === "table" ? "active" : ""}" data-pcr-view="table">Tabulka (${items.length})</button>
          <button type="button" class="pcrViewTab ${activeView === "analysis" ? "active" : ""}" data-pcr-view="analysis">Analýza</button>
        </div>
        <div id="pcrResearchContent">${loading ? `<p class="hint">Načítám…</p>` : (activeView === "analysis" ? renderAnalysis(items) : renderTable(items))}</div>
      </section>`;

    el("pcrReloadBtn")?.addEventListener("click", loadTopics);
    el("pcrSyncBtn")?.addEventListener("click", syncFromGoogleSheets);
    el("pcrRelinkBtn")?.addEventListener("click", relinkAllPersons);
    el("pcrImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const text = await file.text();
      loading = true;
      render();
      try {
        const count = await importFromCsvText(text, true);
        if (count != null) setStatus(`Importováno ${count} témat z CSV.`);
      } catch (err) {
        setStatus(`Import selhal: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });
    el("pcrFilterFakulta")?.addEventListener("change", (e) => { filterFakulta = e.target.value; render(); });
    el("pcrFilterOblast")?.addEventListener("change", (e) => { filterOblast = e.target.value; render(); });
    el("pcrFilterKatedra")?.addEventListener("change", (e) => { filterKatedra = e.target.value; render(); });
    el("pcrFilterLinked")?.addEventListener("change", (e) => { filterLinked = e.target.value; render(); });
    el("pcrFilterSearch")?.addEventListener("input", (e) => { filterSearch = e.target.value; render(); });
    root.querySelectorAll("[data-pcr-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.pcrView;
        render();
      });
    });
    root.querySelectorAll("[data-edit-pcr]").forEach((btn) => {
      btn.addEventListener("click", () => openTopicDialog(btn.dataset.editPcr));
    });
    root.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.kbLayout?.setActivePage?.(btn.dataset.goto);
      });
    });
  }

  function openTopicDialog(id) {
    const row = topics.find((t) => t.id === id);
    if (!row || !el("pcrTopicDialog")) return;
    el("pcrTopicEditId").value = row.id;
    el("pcrTopicTema").value = row.tema || "";
    el("pcrTopicOblast").value = row.oblast || "";
    el("pcrTopicFakulta").value = row.fakulta || "";
    el("pcrTopicZkrFak").value = row.zkr_fak || "";
    el("pcrTopicKatedra").value = row.katedra || "";
    el("pcrTopicZkrKat").value = row.zkr_kat || "";
    el("pcrTopicGestor").value = row.gestor || "";
    el("pcrTopicEmail").value = row.email || "";
    el("pcrTopicPopis").value = row.popis || "";
    window.kbPersons?.fillSelect?.(el("pcrTopicGestorPersonId"), window.kbPersonLinks?.personSelectId?.(row, "gestor"));
    window.kbPersons?.setupSearchPicker?.(el("pcrTopicGestorPersonId"), window.kbPersonLinks?.personSelectId?.(row, "gestor"));
    el("pcrTopicDialog").showModal();
  }

  async function saveTopicDialog() {
    const id = el("pcrTopicEditId")?.value;
    const existing = topics.find((t) => t.id === id);
    if (!existing) return;
    let row = {
      ...existing,
      tema: n(el("pcrTopicTema").value),
      oblast: n(el("pcrTopicOblast").value),
      fakulta: n(el("pcrTopicFakulta").value),
      zkr_fak: n(el("pcrTopicZkrFak").value),
      katedra: n(el("pcrTopicKatedra").value),
      zkr_kat: n(el("pcrTopicZkrKat").value),
      gestor: n(el("pcrTopicGestor").value),
      email: n(el("pcrTopicEmail").value),
      popis: n(el("pcrTopicPopis").value),
      __existing: true
    };
    row.source_key = makeSourceKey(row);
    const personId = el("pcrTopicGestorPersonId")?.value;
    const person = personId ? window.kbPersons?.getPerson?.(personId) : null;
    row = person
      ? window.kbPersonLinks.applyPersonLink(row, person, "gestor")
      : window.kbPersonLinks.clearPersonLink(row, "gestor");
    try {
      await saveTopic(row);
      el("pcrTopicDialog").close();
    } catch (err) {
      alert("Uložení selhalo: " + (err.message || err));
    }
  }

  function injectDialogs() {
    if (el("pcrTopicDialog")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <dialog id="pcrTopicDialog">
        <form method="dialog" id="pcrTopicForm">
          <div class="dialogHeader"><h2>Upravit výzkumné téma</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="pcrTopicEditId" />
          <label>Téma<input id="pcrTopicTema" required /></label>
          <label>Oblast<input id="pcrTopicOblast" /></label>
          <div class="grid2">
            <label>Fakulta<input id="pcrTopicFakulta" /></label>
            <label>Zkr. fakulty<input id="pcrTopicZkrFak" /></label>
            <label>Katedra<input id="pcrTopicKatedra" /></label>
            <label>Zkr. katedry<input id="pcrTopicZkrKat" /></label>
          </div>
          <label>Gestor (text v tabulce)<input id="pcrTopicGestor" /></label>
          <label>E-mail gestora<input id="pcrTopicEmail" type="email" /></label>
          <label>Osoba z evidence
            <div class="personSelectRow">
              <select id="pcrTopicGestorPersonId"></select>
            </div>
          </label>
          <label>Popis<textarea id="pcrTopicPopis" rows="4"></textarea></label>
          <div class="dialogActions">
            <button type="button" class="button secondary" value="cancel">Zrušit</button>
            <button type="button" id="pcrTopicSaveBtn" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>`;
    document.body.appendChild(wrap);
    el("pcrTopicSaveBtn")?.addEventListener("click", saveTopicDialog);
  }

  function injectStyles() {
    if (el("pcrResearchStyles")) return;
    const style = document.createElement("style");
    style.id = "pcrResearchStyles";
    style.textContent = `
      .pcrResearchStatus { margin: .35rem 0 .75rem; }
      .pcrResearchStatusError { color: #b42318; }
      .pcrResearchMetrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1rem; }
      .pcrResearchFilters { display: flex; flex-wrap: wrap; gap: .75rem 1rem; margin-bottom: 1rem; }
      .pcrResearchFilters label { min-width: 140px; margin: 0; }
      .pcrViewTabs { display: flex; gap: .4rem; margin-bottom: .75rem; }
      .pcrViewTab { border: 1px solid var(--line); background: white; border-radius: 999px; padding: .35rem .75rem; cursor: pointer; }
      .pcrViewTab.active { background: var(--accent); color: white; border-color: var(--accent); }
      .pcrTableWrap { overflow-x: auto; max-width: 100%; }
      .pcrTable { width: 100%; border-collapse: collapse; min-width: 960px; }
      .pcrTable th, .pcrTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .88rem; vertical-align: top; }
      .pcrPopis { max-width: 280px; white-space: normal; color: var(--muted); font-size: .84rem; }
      .pcrPersonLink { font-weight: 700; color: var(--accent); text-decoration: none; }
      .pcrPersonLink:hover { text-decoration: underline; }
      .pcrAnalysisGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      .pcrAnalysisCard { border: 1px solid var(--line); border-radius: 12px; padding: .85rem; background: #f8fafc; min-width: 0; }
      .pcrAnalysisCard h3 { margin: 0 0 .65rem; font-size: .95rem; }
      .pcrAnalysisWide { grid-column: 1 / -1; }
      .pcrBarChart { display: grid; gap: .45rem; }
      .pcrBarRow { display: grid; grid-template-columns: minmax(0, 1fr) 1fr auto; gap: .5rem; align-items: center; font-size: .84rem; }
      .pcrBarLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pcrBarTrack { height: 8px; background: #e4e7ec; border-radius: 999px; overflow: hidden; }
      .pcrBarFill { height: 100%; background: linear-gradient(90deg, var(--accent), #3b82f6); border-radius: 999px; }
      .pcrBarCount { font-weight: 700; font-variant-numeric: tabular-nums; }
      .pcrUnlinkedList { margin: 0; padding-left: 1.1rem; line-height: 1.5; }
      @media (max-width: 900px) {
        .pcrResearchMetrics, .pcrAnalysisGrid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("pcrResearchPageRoot");
    if (!host || el("pcrResearchRoot")) return;
    host.innerHTML = `<div id="pcrResearchRoot"></div>`;
  }

  function init() {
    injectStyles();
    injectPage();
    injectDialogs();
    loadTopics();
  }

  window.kbPcrResearch = {
    getTopics: () => topics.slice(),
    loadTopics,
    syncFromGoogleSheets
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("kb:persons-loaded", () => {
    if (topics.length) render();
  });
})();
