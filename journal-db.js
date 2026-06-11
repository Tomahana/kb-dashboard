// Modul Databáze časopisů — import JCR exportů (CSV/TSV/CSC), analýza AIS pořadí v oborech.

(function () {
  const STORAGE_KEY = "kb-dashboard-journal-db-v1";

  const IMPORT_ALIASES = {
    journal_name: ["Journal name", "Journal na", "Journal nam", "Název časopisu", "Casopis", "Časopis"],
    jcr_abbreviation: ["JCR Abbreviation", "JCR Abbre", "JCR Abbrev", "Abbreviation"],
    issn: ["ISSN", "issn"],
    eissn: ["eISSN", "EISSN", "eissn"],
    category: ["Category", "Kategorie", "Obor", "obor"],
    edition: ["Edition", "Edice"],
    ais: ["Article Influence Score", "Article Infl", "AIS", "Article Influence"],
    ais_quartile: ["AIS Quartile", "AIS Quarti", "AIS Quart"],
    jif: ["JIF", "Impact Factor"],
    jif_quartile: ["JIF Quartile", "JIF Quartil", "JIF Quart"],
    jif_percentile: ["JIF Percentile", "JIF Percent", "JIF Percentil"],
    total_citations: ["Total Citations", "Total Citat", "Total Citation", "Citations"]
  };

  const VIEWS = [
    { id: "records", label: "Záznamy", icon: "📋" },
    { id: "categories", label: "Obory", icon: "📊" },
    { id: "best", label: "Nejlepší výsledky", icon: "🏆" },
    { id: "analysis", label: "Analýza oboru", icon: "🔬" }
  ];

  let records = [];
  let analysisCache = { analyzed: [], best: [], categories: [] };
  let useSupabase = false;
  let loading = false;
  let activeView = "records";
  let filterCategory = "";
  let filterSourceYear = "";
  let filterSearch = "";
  let analysisCategory = "";

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records, null, 2));
    window.kbSupabaseJournalDb?.saveLocal?.(records);
  }

  function recomputeAnalysis() {
    analysisCache = window.kbJournalDbAnalysis?.runAnalysis?.(records) || { analyzed: [], best: [], categories: [] };
  }

  function setStatus(text, isError) {
    const node = el("journalDbStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("journalDbStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  function normalizeHeaderKey(s) {
    return n(s).replace(/^\uFEFF/, "").replace(/^"|"$/g, "").replace(/\s+/g, " ").toLowerCase();
  }

  function getFieldFromRow(row, field) {
    const aliases = IMPORT_ALIASES[field] || [field];
    for (const key of aliases) {
      if (row[key] != null && n(row[key])) return n(row[key]);
    }
    const byNorm = {};
    Object.entries(row).forEach(([k, v]) => {
      byNorm[normalizeHeaderKey(k)] = v;
    });
    for (const key of aliases) {
      const nk = normalizeHeaderKey(key);
      if (byNorm[nk] != null && n(byNorm[nk])) return n(byNorm[nk]);
    }
    for (const [hdr, val] of Object.entries(byNorm)) {
      if (!n(val)) continue;
      for (const key of aliases) {
        const nk = normalizeHeaderKey(key);
        if (hdr === nk || hdr.includes(nk) || nk.includes(hdr)) return n(val);
      }
    }
    return "";
  }

  function detectJifColumn(row) {
    for (const key of Object.keys(row)) {
      const nk = normalizeHeaderKey(key);
      if (/^\d{4}\s*jif/.test(nk) || /jif\s*\d{4}/.test(nk)) {
        const year = key.match(/(\d{4})/)?.[1] || "";
        return { column: key, year };
      }
    }
    for (const key of Object.keys(row)) {
      const nk = normalizeHeaderKey(key);
      if (nk === "jif" || nk.endsWith(" jif") || nk.startsWith("jif ")) {
        return { column: key, year: "" };
      }
    }
    return { column: "", year: "" };
  }

  function inferSourceYear(fileName, row) {
    const fromFile = n(fileName).match(/(20\d{2})/)?.[1];
    if (fromFile) return fromFile;
    const jif = detectJifColumn(row);
    if (jif.year) return jif.year;
    return "";
  }

  function makeSourceKey(row) {
    return [
      l(row.source_year),
      l(row.category),
      l(row.journal_key || window.kbJournalDbAnalysis?.makeJournalKey?.(row)),
      l(row.edition)
    ].join("|");
  }

  function normalizeImportRow(raw, index, meta = {}) {
    const jifInfo = detectJifColumn(raw);
    const jifFromAlias = getFieldFromRow(raw, "jif");
    const row = {
      journal_name: getFieldFromRow(raw, "journal_name"),
      jcr_abbreviation: getFieldFromRow(raw, "jcr_abbreviation"),
      issn: getFieldFromRow(raw, "issn"),
      eissn: getFieldFromRow(raw, "eissn"),
      category: getFieldFromRow(raw, "category"),
      edition: getFieldFromRow(raw, "edition"),
      ais: getFieldFromRow(raw, "ais"),
      ais_quartile: getFieldFromRow(raw, "ais_quartile"),
      jif: jifFromAlias || (jifInfo.column ? n(raw[jifInfo.column]) : ""),
      jif_year: jifInfo.year || meta.defaultYear || "",
      jif_quartile: getFieldFromRow(raw, "jif_quartile"),
      jif_percentile: getFieldFromRow(raw, "jif_percentile"),
      total_citations: getFieldFromRow(raw, "total_citations"),
      source_year: meta.sourceYear || meta.defaultYear || inferSourceYear(meta.fileName || "", raw),
      source_file: meta.fileName || "",
      import_index: index + 1
    };

    if (!row.journal_name && !row.jcr_abbreviation && !row.issn && !row.eissn) return null;
    if (!row.category) return null;

    row.journal_key = window.kbJournalDbAnalysis?.makeJournalKey?.(row) || "";
    row.source_key = makeSourceKey(row);
    return row;
  }

  async function readImportFileText(file) {
    if (window.kbPersons?.readImportFileText) {
      return window.kbPersons.readImportFileText(file);
    }
    const buffer = await file.arrayBuffer();
    return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  }

  async function importFromText(text, meta = {}, replace = false) {
    const parsed = window.kbPersons?.parseDelimitedTable?.(text) || { rows: [] };
    const normalized = parsed.rows
      .map((row, i) => normalizeImportRow(row, i, meta))
      .filter(Boolean);

    if (!normalized.length) {
      throw new Error(
        "V souboru nejsou rozpoznatelná data. Očekáváme sloupce Journal name, Category, AIS, ISSN… " +
        `(záhlaví: ${parsed.meta?.headers?.slice(0, 8).join(", ") || "?"})`
      );
    }

    if (replace && records.length && !confirm(`Nahradit ${records.length} stávajících záznamů importem ${normalized.length} řádků?`)) {
      return null;
    }

    const withIds = normalized.map((row) => {
      const existing = records.find((r) => r.source_key === row.source_key);
      return {
        ...row,
        id: existing?.id || uuid(),
        imported_at: new Date().toISOString(),
        __existing: !!existing
      };
    });

    if (replace) {
      records = withIds;
    } else {
      const map = new Map(records.map((r) => [r.source_key, r]));
      withIds.forEach((row) => map.set(row.source_key, row));
      records = [...map.values()];
    }

    if (useSupabase && window.kbSupabaseJournalDb) {
      if (!(await ensureAuth())) {
        persistLocal();
        recomputeAnalysis();
        setStatus(`Uloženo ${records.length} záznamů lokálně — pro Supabase se přihlaste.`, true);
        return withIds.length;
      }
      setStatus(`Ukládám 0 / ${withIds.length}…`);
      records = await window.kbSupabaseJournalDb.upsertBatch(withIds, (done, total) => {
        setStatus(`Ukládám ${done} / ${total}…`);
      });
    } else {
      persistLocal();
    }

    recomputeAnalysis();
    document.dispatchEvent(new CustomEvent("kb:journal-db-loaded"));
    return withIds.length;
  }

  async function loadRecords() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseJournalDb) {
        useSupabase = false;
        records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(records)) records = [];
        setStatus("Data v prohlížeči. Spusťte supabase/journal-db-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseJournalDb.probeTables();
      if (!available) {
        useSupabase = false;
        records = window.kbSupabaseJournalDb.loadLocal();
        setStatus("Tabulka kb_journal_records v Supabase zatím neexistuje. Spusťte supabase/journal-db-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        records = await window.kbSupabaseJournalDb.loadAll();
        setStatus(`Načteno ${records.length} záznamů časopisů ze Supabase.`);
      }
    } catch (err) {
      console.error(err);
      useSupabase = false;
      records = window.kbSupabaseJournalDb?.loadLocal?.() || [];
      setStatus(`Chyba: ${err.message || err}`, true);
    } finally {
      loading = false;
      recomputeAnalysis();
      render();
      document.dispatchEvent(new CustomEvent("kb:journal-db-loaded"));
    }
  }

  function uniqueValues(field, list = records) {
    return [...new Set(list.map((r) => n(r[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  }

  function filteredRecords() {
    return records.filter((row) => {
      if (filterCategory && n(row.category) !== filterCategory) return false;
      if (filterSourceYear && n(row.source_year) !== filterSourceYear) return false;
      if (filterSearch) {
        const analyzed = analysisCache.analyzed.find((a) => a.id === row.id);
        const hay = l([
          row.journal_name, row.jcr_abbreviation, row.issn, row.eissn, row.category,
          row.ais, row.jif, analyzed?.ais_rank, analyzed?.ais_quartile_rank
        ].join(" "));
        if (!hay.includes(l(filterSearch))) return false;
      }
      return true;
    });
  }

  function getAnalyzedForRecords(list) {
    const ids = new Set(list.map((r) => r.id));
    return analysisCache.analyzed.filter((r) => ids.has(r.id));
  }

  function formatNum(value, digits = 3) {
    const num = window.kbJournalDbAnalysis?.parseNumber?.(value);
    if (num == null) return "—";
    return Number.isInteger(num) ? String(num) : num.toFixed(digits).replace(/\.?0+$/, "");
  }

  function renderSummary() {
    const cats = analysisCache.categories.length;
    const best = analysisCache.best.length;
    const years = uniqueValues("source_year");
    return `
      <div class="journalDbMetrics">
        <div class="metric"><span>${records.length}</span><small>Záznamů</small></div>
        <div class="metric"><span>${cats}</span><small>Oborů</small></div>
        <div class="metric"><span>${best}</span><small>Unikátních časopisů</small></div>
        <div class="metric"><span>${years.length}</span><small>Roků exportu</small></div>
      </div>`;
  }

  function renderFilters() {
    const catOpts = uniqueValues("category").map((v) =>
      `<option value="${html(v)}"${v === filterCategory ? " selected" : ""}>${html(v)}</option>`
    ).join("");
    const yearOpts = uniqueValues("source_year").map((v) =>
      `<option value="${html(v)}"${v === filterSourceYear ? " selected" : ""}>${html(v)}</option>`
    ).join("");
    return `
      <div class="journalDbFilters">
        <label>Obor <select id="journalDbFilterCategory"><option value="">Vše</option>${catOpts}</select></label>
        <label>Rok exportu <select id="journalDbFilterYear"><option value="">Vše</option>${yearOpts}</select></label>
        <label>Hledat <input id="journalDbFilterSearch" type="search" value="${html(filterSearch)}" placeholder="Název, ISSN, obor…" /></label>
      </div>`;
  }

  function renderRecordsTable(list) {
    const analyzedMap = new Map(analysisCache.analyzed.map((r) => [r.id, r]));
    if (!list.length) return `<p class="hint">Žádné záznamy. Importujte export JCR (CSV/TSV/CSC).</p>`;
    return `<div class="journalDbTableWrap"><table class="journalDbTable">
      <thead><tr>
        <th>Časopis</th><th>Obor</th><th>AIS</th><th>Pořadí</th><th>Kvartil</th><th>Decil</th><th>Centil</th><th>JIF</th><th>Rok</th>
      </tr></thead>
      <tbody>${list.map((row) => {
        const a = analyzedMap.get(row.id) || {};
        return `<tr>
          <td><strong>${html(row.journal_name || row.jcr_abbreviation)}</strong>
            ${row.jcr_abbreviation && row.journal_name ? `<br><span class="hint">${html(row.jcr_abbreviation)}</span>` : ""}
            ${row.issn ? `<br><span class="hint">${html(row.issn)}</span>` : ""}
          </td>
          <td>${html(row.category)}</td>
          <td>${formatNum(row.ais)}</td>
          <td>${a.ais_rank ? `${a.ais_rank} / ${a.category_journal_count}` : "—"}</td>
          <td>${a.ais_quartile_rank ?? "—"}</td>
          <td>${a.ais_decile_rank ?? "—"}</td>
          <td>${a.ais_centile_rank ?? "—"}</td>
          <td>${formatNum(row.jif, 2)}${row.jif_year ? ` <span class="hint">(${html(row.jif_year)})</span>` : ""}</td>
          <td>${html(row.source_year) || "—"}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function renderCategoriesView() {
    const cats = analysisCache.categories;
    if (!cats.length) return `<p class="hint">Importujte data pro přehled oborů.</p>`;
    return `<div class="journalDbTableWrap"><table class="journalDbTable">
      <thead><tr>
        <th>Obor</th><th>Počet časopisů</th><th>S AIS</th><th>Prům. AIS</th><th>Nejlepší časopis</th><th>AIS</th>
      </tr></thead>
      <tbody>${cats.map((c) => `<tr>
        <td><strong>${html(c.category)}</strong></td>
        <td>${c.journal_count}</td>
        <td>${c.with_ais}</td>
        <td>${formatNum(c.avg_ais)}</td>
        <td>${html(c.top_journal)}</td>
        <td>${formatNum(c.top_ais)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function renderBestView() {
    const list = analysisCache.best;
    if (!list.length) return `<p class="hint">Nejlepší výsledky se vypočítají po importu.</p>`;
    const filtered = filterCategory
      ? list.filter((r) => n(r.best_category) === filterCategory)
      : list;
    const shown = filtered.slice(0, 500);
    return `
      <p class="hint journalDbHint">Pro každý časopis napříč všemi výskyty (obory, roky) je vybrán řádek s nejvyšším AIS. Tyto hodnoty (<code>best_*</code>) slouží pro navazující moduly.</p>
      <div class="journalDbTableWrap"><table class="journalDbTable">
        <thead><tr>
          <th>Časopis</th><th>Nejlepší obor</th><th>AIS</th><th>Pořadí</th><th>Kvartil</th><th>Decil</th><th>Centil</th><th>Výskytů</th><th>Obory</th>
        </tr></thead>
        <tbody>${shown.map((row) => `<tr>
          <td><strong>${html(row.journal_name || row.jcr_abbreviation)}</strong>
            ${row.issn ? `<br><span class="hint">${html(row.issn)}</span>` : ""}
          </td>
          <td>${html(row.best_category)}</td>
          <td>${formatNum(row.best_ais)}</td>
          <td>${row.best_ais_rank ? `${row.best_ais_rank} / ${row.category_journal_count}` : "—"}</td>
          <td>${row.best_ais_quartile ?? "—"}</td>
          <td>${row.best_ais_decile ?? "—"}</td>
          <td>${row.best_ais_centile ?? "—"}</td>
          <td>${row.occurrence_count ?? 1}</td>
          <td class="journalDbSmall">${html((row.categories_seen || []).slice(0, 3).join(", "))}${(row.categories_seen || []).length > 3 ? "…" : ""}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      ${filtered.length > 500 ? `<p class="hint">Zobrazeno 500 z ${filtered.length} časopisů — zpřesněte filtr oboru nebo hledání.</p>` : ""}`;
  }

  function renderCategoryAnalysisView() {
    const categories = uniqueValues("category", analysisCache.analyzed);
    if (!categories.length) return `<p class="hint">Importujte data pro analýzu oboru.</p>`;
    const selected = analysisCategory || categories[0];
    const rows = analysisCache.analyzed
      .filter((r) => n(r.category) === selected)
      .sort((a, b) => (a.ais_rank || 9999) - (b.ais_rank || 9999));

    const catSummary = analysisCache.categories.find((c) => c.category === selected);
    const opts = categories.map((c) =>
      `<option value="${html(c)}"${c === selected ? " selected" : ""}>${html(c)} (${analysisCache.categories.find((x) => x.category === c)?.journal_count || "?"})</option>`
    ).join("");

    return `
      <div class="journalDbAnalysisHead">
        <label>Analyzovaný obor
          <select id="journalDbAnalysisCategory">${opts}</select>
        </label>
        ${catSummary ? `<p class="hint">V oboru je <strong>${catSummary.journal_count}</strong> časopisů seřazených podle AIS (1 = nejvyšší AIS). Kvartil/decil/centil vychází z pořadí v oboru.</p>` : ""}
      </div>
      <div class="journalDbTableWrap"><table class="journalDbTable journalDbTableCompact">
        <thead><tr>
          <th>#</th><th>Časopis</th><th>AIS</th><th>Poměr</th><th>% shora</th><th>Q</th><th>D</th><th>C</th><th>JIF</th>
        </tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td>${row.ais_rank}</td>
          <td>${html(row.journal_name || row.jcr_abbreviation)}</td>
          <td>${formatNum(row.ais)}</td>
          <td>${row.ais_rank_ratio ?? "—"}</td>
          <td>${row.ais_percentile_top ?? "—"}</td>
          <td>${row.ais_quartile_rank ?? "—"}</td>
          <td>${row.ais_decile_rank ?? "—"}</td>
          <td>${row.ais_centile_rank ?? "—"}</td>
          <td>${formatNum(row.jif, 2)}</td>
        </tr>`).join("")}</tbody>
      </table></div>`;
  }

  function renderContent() {
    const list = filteredRecords();
    switch (activeView) {
      case "categories": return renderCategoriesView();
      case "best": return renderBestView();
      case "analysis": return renderCategoryAnalysisView();
      default: return renderRecordsTable(list);
    }
  }

  function exportJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      records,
      analysis: analysisCache
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-db-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBestCsv() {
    const rows = analysisCache.best;
    if (!rows.length) {
      alert("Nejsou data k exportu.");
      return;
    }
    const headers = [
      "journal_name", "jcr_abbreviation", "issn", "eissn", "best_category",
      "best_ais", "best_ais_rank", "best_ais_rank_ratio", "best_ais_percentile_top",
      "best_ais_quartile", "best_ais_decile", "best_ais_centile",
      "best_jif", "best_jif_year", "occurrence_count", "categories_seen"
    ];
    const lines = [headers.join(";")];
    rows.forEach((row) => {
      lines.push(headers.map((h) => {
        const val = h === "categories_seen" ? (row.categories_seen || []).join(", ") : (row[h] ?? "");
        const s = n(val);
        return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-db-best-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bindFilterEvents() {
    el("journalDbFilterCategory")?.addEventListener("change", (e) => { filterCategory = e.target.value; render(); });
    el("journalDbFilterYear")?.addEventListener("change", (e) => { filterSourceYear = e.target.value; render(); });
    el("journalDbFilterSearch")?.addEventListener("input", (e) => { filterSearch = e.target.value; render(); });
    el("journalDbAnalysisCategory")?.addEventListener("change", (e) => {
      analysisCategory = e.target.value;
      render();
    });
  }

  function render() {
    const root = el("journalDbRoot");
    if (!root) return;

    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>Databáze časopisů</h2>
            <p class="hint">Import exportů JCR podle roků a oborů (CSV, TSV, CSC). Sloupce se rozpoznají flexibilně. V každém oboru se spočítá počet časopisů, seřadí podle AIS a vypočítají kvartily, decily a centily. Napříč výskyty se vybere <strong>nejlepší výsledek</strong> pro další kroky.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="journalDbReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <label class="button small secondary" for="journalDbImportFile">Import souboru</label>
            <input type="file" id="journalDbImportFile" accept=".csv,.tsv,.txt,.csc,text/csv,text/tab-separated-values" hidden multiple />
            <button type="button" id="journalDbExportBestBtn" class="button small secondary">Export nejlepších (CSV)</button>
            <button type="button" id="journalDbExportJsonBtn" class="button small secondary">Export JSON</button>
          </div>
        </div>
        <p id="journalDbStatus" class="journalDbStatus hint">${loading ? "Načítám…" : "—"}</p>
        ${renderSummary()}
        ${renderFilters()}
        <div class="journalDbViewTabs">
          ${VIEWS.map((v) =>
            `<button type="button" class="journalDbViewTab ${activeView === v.id ? "active" : ""}" data-journal-view="${v.id}">${v.icon} ${v.label}</button>`
          ).join("")}
        </div>
        <div id="journalDbContent">${loading ? `<p class="hint">Načítám…</p>` : renderContent()}</div>
      </section>`;

    el("journalDbReloadBtn")?.addEventListener("click", loadRecords);
    el("journalDbExportJsonBtn")?.addEventListener("click", exportJson);
    el("journalDbExportBestBtn")?.addEventListener("click", exportBestCsv);
    el("journalDbImportFile")?.addEventListener("change", async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = "";
      if (!files.length) return;
      loading = true;
      render();
      try {
        let total = 0;
        for (const file of files) {
          const text = await readImportFileText(file);
          const yearFromName = file.name.match(/(20\d{2})/)?.[1] || "";
          const count = await importFromText(text, { fileName: file.name, sourceYear: yearFromName }, files.length === 1 && !records.length);
          if (count != null) total += count;
        }
        setStatus(`Import dokončen — ${records.length} záznamů celkem (${analysisCache.best.length} unikátních časopisů).`);
      } catch (err) {
        setStatus(`Import selhal: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });

    root.querySelectorAll("[data-journal-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.journalView;
        render();
      });
    });

    bindFilterEvents();
  }

  function injectStyles() {
    if (el("journalDbStyles")) return;
    const style = document.createElement("style");
    style.id = "journalDbStyles";
    style.textContent = `
      .journalDbMetrics { display: flex; flex-wrap: wrap; gap: .75rem; margin: .75rem 0 1rem; }
      .journalDbMetrics .metric { min-width: 88px; padding: .55rem .75rem; border: 1px solid var(--line); border-radius: 10px; background: #fafbfc; }
      .journalDbMetrics .metric span { display: block; font-size: 1.35rem; font-weight: 800; line-height: 1.1; }
      .journalDbMetrics .metric small { color: var(--muted); font-size: .78rem; font-weight: 650; }
      .journalDbFilters { display: flex; flex-wrap: wrap; gap: .65rem 1rem; margin-bottom: .85rem; align-items: end; }
      .journalDbFilters label { display: grid; gap: .25rem; font-size: .82rem; font-weight: 650; }
      .journalDbFilters select, .journalDbFilters input { min-width: 160px; }
      .journalDbViewTabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .85rem; }
      .journalDbViewTab {
        border: 1px solid var(--line); background: white; border-radius: 10px;
        padding: .4rem .7rem; font-size: .82rem; cursor: pointer; font-weight: 650;
      }
      .journalDbViewTab.active { background: #eff8ff; border-color: var(--accent); color: var(--accent-dark, #2446b5); }
      .journalDbTableWrap { overflow: auto; max-width: 100%; border: 1px solid var(--line); border-radius: 12px; }
      .journalDbTable { width: 100%; border-collapse: collapse; font-size: .84rem; }
      .journalDbTable th, .journalDbTable td { border-bottom: 1px solid var(--line); padding: .45rem .55rem; text-align: left; vertical-align: top; }
      .journalDbTable th { background: #f8fafc; font-weight: 800; position: sticky; top: 0; }
      .journalDbTableCompact th, .journalDbTableCompact td { font-size: .8rem; }
      .journalDbSmall { font-size: .78rem; color: var(--muted); max-width: 220px; }
      .journalDbHint { margin: 0 0 .75rem; }
      .journalDbAnalysisHead { margin-bottom: .75rem; display: grid; gap: .5rem; }
      .journalDbStatusError { color: #b42318; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("journalDbPageRoot");
    if (!host || el("journalDbRoot")) return;
    host.innerHTML = `<div id="journalDbRoot"></div>`;
  }

  function init() {
    injectStyles();
    injectPage();
    loadRecords();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "casopisy") render();
    });
  }

  window.kbJournalDb = {
    getRecords: () => records.slice(),
    getAnalyzed: () => analysisCache.analyzed.slice(),
    getBestResults: () => analysisCache.best.slice(),
    getCategories: () => analysisCache.categories.slice(),
    lookupBest: (ref) => window.kbJournalDbAnalysis?.lookupBestJournal?.(ref, analysisCache.best),
    loadRecords,
    importFromText,
    recomputeAnalysis
  };

  document.addEventListener("DOMContentLoaded", init);
})();
