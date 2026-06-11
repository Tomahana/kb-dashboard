// Modul Databáze časopisů — import JCR exportů (CSV/TSV/CSC), analýza AIS pořadí v oborech.

(function () {
  const STORAGE_KEY = "kb-dashboard-journal-db-v1";

  const IMPORT_ALIASES = {
    journal_name: [
      "Journal name", "Journal Name", "Journal na", "Journal nam", "Journal Title", "Journal title",
      "Full Journal Title", "Title", "Název časopisu", "Casopis", "Časopis"
    ],
    jcr_abbreviation: [
      "JCR Abbreviation", "JCR Abbre", "JCR Abbrev", "Abbreviation", "Journal Abbreviation", "Abbrev"
    ],
    issn: ["ISSN", "issn", "Print ISSN", "Print ISSN "],
    eissn: ["eISSN", "EISSN", "eissn", "e-ISSN", "E-ISSN", "Electronic ISSN"],
    category: [
      "Category", "Categories", "Kategorie", "Obor", "obor", "WoS Category", "JCR Category", "Edition Category"
    ],
    edition: ["Edition", "Edice", "Collection", "Index"],
    ais: [
      "Article Influence Score", "Article Influence", "Article Infl", "Article influence score",
      "AIS", "Influence Score"
    ],
    ais_quartile: ["AIS Quartile", "AIS Quarti", "AIS Quart", "AIS Quartile Rank"],
    jif: ["JIF", "Impact Factor", "Journal Impact Factor"],
    jif_quartile: ["JIF Quartile", "JIF Quartil", "JIF Quart", "Impact Factor Quartile"],
    jif_percentile: ["JIF Percentile", "JIF Percent", "JIF Percentil", "Average JIF Percentile"],
    total_citations: ["Total Citations", "Total Citat", "Total Citation", "Citations", "Total cites"]
  };

  const VIEWS = [
    { id: "records", label: "Záznamy", icon: "📋" },
    { id: "categories", label: "Obory", icon: "📊" },
    { id: "best", label: "Nejlepší výsledky", icon: "🏆" },
    { id: "analysis", label: "Analýza oboru", icon: "🔬" }
  ];

  const TABLE_PAGE_SIZE = 150;
  const LOCAL_STORAGE_MAX_ROWS = 2500;

  let records = [];
  let analysisCache = { best: [], categories: [] };
  let useSupabase = false;
  let loading = false;
  let activeView = "records";
  let filterCategory = "";
  let filterSourceYear = "";
  let filterSearch = "";
  let analysisCategory = "";
  let recordsPage = 0;

  const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    if (useSupabase && records.length > LOCAL_STORAGE_MAX_ROWS) {
      window.kbSupabaseJournalDb?.saveLocal?.([]);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      window.kbSupabaseJournalDb?.saveLocal?.(records);
    } catch (err) {
      console.warn("Lokální cache časopisů se nevejde do prohlížeče:", err);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  }

  async function recomputeAnalysis() {
    await yieldToMain();
    analysisCache = window.kbJournalDbAnalysis?.runAnalysis?.(records) || { best: [], categories: [] };
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

  function headerMatchesField(hdr, field) {
    if (field === "issn") {
      return (hdr === "issn" || hdr.includes("print issn") || (hdr.includes("issn") && !hdr.includes("eissn") && !hdr.includes("e-issn")));
    }
    if (field === "eissn") {
      return hdr.includes("eissn") || hdr.includes("e-issn") || hdr.includes("electronic issn");
    }
    if (field === "journal_name") {
      return hdr.includes("journal") && (hdr.includes("name") || hdr.includes("title"));
    }
    if (field === "category") {
      return hdr.includes("category") || hdr.includes("kategorie") || hdr === "obor";
    }
    if (field === "ais") {
      return hdr.includes("article influence") || hdr.includes("influence score") || hdr === "ais";
    }
    if (field === "jcr_abbreviation") {
      return hdr.includes("abbrev");
    }
    return false;
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
      if (headerMatchesField(hdr, field)) return n(val);
      for (const key of aliases) {
        const nk = normalizeHeaderKey(key);
        if (hdr === nk || hdr.includes(nk) || nk.includes(hdr)) {
          if (field === "issn" && (hdr.includes("eissn") || hdr.includes("e-issn"))) continue;
          if (field === "eissn" && hdr === "issn") continue;
          return n(val);
        }
      }
    }
    return "";
  }

  function parseCsvRecords(text, delimiter) {
    const records = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { row.push(field); field = ""; }
      else if (ch === "\n") {
        row.push(field); field = "";
        if (row.some((cell) => n(cell))) records.push(row);
        row = [];
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((cell) => n(cell))) records.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((cell) => n(cell))) records.push(row);
    return records;
  }

  function detectDelimiter(sampleLine) {
    const line = sampleLine.replace(/^\uFEFF/, "");
    const counts = [
      ["\t", (line.match(/\t/g) || []).length],
      [";", (line.match(/;/g) || []).length],
      [",", (line.match(/,/g) || []).length]
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ";";
  }

  function journalHeaderRowScore(cells) {
    const joined = cells.map(normalizeHeaderKey).join(" ");
    const markers = ["journal", "issn", "category", "jif", "ais", "abbrev", "influence", "edition", "citation"];
    return markers.reduce((score, marker) => score + (joined.includes(marker) ? 1 : 0), 0);
  }

  function findJournalHeaderRowIndex(records) {
    let bestIdx = 0;
    let bestScore = -1;
    records.slice(0, 20).forEach((row, idx) => {
      const score = journalHeaderRowScore(row);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    return bestScore >= 2 ? bestIdx : 0;
  }

  function parseJournalImportTable(text) {
    const clean = text.replace(/^\uFEFF/, "").trim();
    if (!clean) return { rows: [], meta: { headers: [], delimiter: ";", headerRow: 0 } };

    const firstLine = clean.split(/\r?\n/, 1)[0] || clean;
    let delimiter = detectDelimiter(firstLine);
    let recordsParsed = parseCsvRecords(clean, delimiter);
    let headerIdx = findJournalHeaderRowIndex(recordsParsed);

    if (headerIdx === 0 && journalHeaderRowScore(recordsParsed[0] || []) < 2) {
      for (const candidate of [";", ",", "\t"]) {
        if (candidate === delimiter) continue;
        const attempt = parseCsvRecords(clean, candidate);
        const idx = findJournalHeaderRowIndex(attempt);
        if (journalHeaderRowScore(attempt[idx] || []) > journalHeaderRowScore(recordsParsed[headerIdx] || [])) {
          delimiter = candidate;
          recordsParsed = attempt;
          headerIdx = idx;
        }
      }
    }

    if (!recordsParsed.length) return { rows: [], meta: { headers: [], delimiter, headerRow: 0 } };

    const headers = recordsParsed[headerIdx].map((h) => n(h).replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
    const rows = [];
    for (let i = headerIdx + 1; i < recordsParsed.length; i += 1) {
      const cols = recordsParsed[i];
      const row = {};
      let hasValue = false;
      headers.forEach((header, j) => {
        if (!header) return;
        const val = (cols[j] ?? "").replace(/^"|"$/g, "").trim();
        row[header] = val;
        if (val) hasValue = true;
      });
      if (hasValue) rows.push(row);
    }

    return { rows, meta: { headers, delimiter, headerRow: headerIdx + 1 } };
  }

  function buildImportError(parsed, skippedNoIssn, skippedNoCategory, normalizedCount) {
    const headers = parsed.meta?.headers || [];
    const headerPreview = headers.slice(0, 12).join(", ") || "?";
    return (
      `Import selhal — platných řádků: ${normalizedCount}. ` +
      `Načteno ${parsed.rows.length} řádků, přeskočeno ${skippedNoIssn} bez ISSN/eISSN, ${skippedNoCategory} bez oboru. ` +
      `Oddělovač: „${parsed.meta?.delimiter || "?"}“, záhlaví na řádku ${parsed.meta?.headerRow || "?"}. ` +
      `Sloupce: ${headerPreview}. ` +
      `Každý řádek musí mít ISSN nebo eISSN a Category. Tip: export z JCR jako CSV; u Excelu uložit jako CSV UTF-8 (středník).`
    );
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
    const journalKey = row.journal_key || window.kbJournalDbAnalysis?.makeJournalKey?.(row) || "";
    return [
      l(row.source_year),
      l(row.category),
      l(journalKey),
      l(row.edition)
    ].join("|");
  }

  function normalizeImportRow(raw, index, meta = {}) {
    const jifInfo = detectJifColumn(raw);
    const jifFromAlias = getFieldFromRow(raw, "jif");
    let row = {
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

    row = window.kbJournalDbAnalysis?.applyJournalIdentity?.(row) || row;

    if (!window.kbJournalDbAnalysis?.hasJournalKey?.(row)) {
      return { __skipped: true, reason: "no_issn", row };
    }
    if (!row.category) {
      return { __skipped: true, reason: "no_category", row };
    }

    row.journal_key = window.kbJournalDbAnalysis.makeJournalKey(row);
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

  function refreshRecordKeys(list) {
    return list.map((row) => {
      const next = window.kbJournalDbAnalysis?.applyJournalIdentity?.(row) || row;
      return { ...next, source_key: makeSourceKey(next) };
    });
  }

  async function importFromText(text, meta = {}, options = {}) {
    const replace = !!options.replace;
    const skipSupabase = !!options.skipSupabase;
    const skipRecompute = !!options.skipRecompute;

    const parsed = parseJournalImportTable(text);
    const parsedRows = parsed.rows.map((row, i) => normalizeImportRow(row, i, meta));
    const skippedNoIssn = parsedRows.filter((row) => row?.__skipped?.reason === "no_issn").length;
    const skippedNoCategory = parsedRows.filter((row) => row?.__skipped?.reason === "no_category").length;
    const normalized = parsedRows.filter((row) => row && !row.__skipped);

    if (!normalized.length) {
      throw new Error(buildImportError(parsed, skippedNoIssn, skippedNoCategory, normalized.length));
    }

    if (replace && records.length && !options.skipConfirm && !confirm(`Nahradit ${records.length} stávajících záznamů importem ${normalized.length} řádků?`)) {
      return { imported: 0, skippedNoIssn, skippedNoCategory, total: records.length, upsertRows: [] };
    }

    const existingByKey = new Map(records.map((r) => [r.source_key, r]));
    const withIds = normalized.map((row) => {
      const existing = existingByKey.get(row.source_key);
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
      withIds.forEach((row) => existingByKey.set(row.source_key, row));
      records = Array.from(existingByKey.values());
    }

    if (!skipSupabase && useSupabase && window.kbSupabaseJournalDb) {
      if (!(await ensureAuth())) {
        persistLocal();
        if (!skipRecompute) await recomputeAnalysis();
        setStatus(`Uloženo ${records.length} záznamů lokálně — pro Supabase se přihlaste.`, true);
        return {
          imported: withIds.length,
          skippedNoIssn,
          skippedNoCategory,
          total: records.length,
          upsertRows: withIds
        };
      }
      setStatus(`Ukládám 0 / ${withIds.length}…`);
      records = await window.kbSupabaseJournalDb.upsertBatch(withIds, (done, total) => {
        setStatus(`Ukládám ${done} / ${total}…`);
      }, { fullRecords: records, chunkSize: 100 });
    } else if (!skipSupabase) {
      persistLocal();
    }

    if (!skipRecompute) {
      await recomputeAnalysis();
      document.dispatchEvent(new CustomEvent("kb:journal-db-loaded"));
    }

    return {
      imported: withIds.length,
      skippedNoIssn,
      skippedNoCategory,
      total: records.length,
      upsertRows: withIds
    };
  }

  async function loadRecords() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseJournalDb) {
        useSupabase = false;
        records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(records)) records = [];
        records = refreshRecordKeys(records);
        setStatus("Data v prohlížeči. Spusťte supabase/journal-db-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseJournalDb.probeTables();
      if (!available) {
        useSupabase = false;
        records = refreshRecordKeys(window.kbSupabaseJournalDb.loadLocal());
        setStatus("Tabulka kb_journal_records v Supabase zatím neexistuje. Spusťte supabase/journal-db-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        records = refreshRecordKeys(await window.kbSupabaseJournalDb.loadAll());
        setStatus(`Načteno ${records.length} záznamů časopisů ze Supabase.`);
      }
    } catch (err) {
      console.error(err);
      useSupabase = false;
      records = window.kbSupabaseJournalDb?.loadLocal?.() || [];
      setStatus(`Chyba: ${err.message || err}`, true);
    } finally {
      loading = false;
      await recomputeAnalysis();
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
        const hay = l([
          row.journal_name, row.jcr_abbreviation, row.issn, row.eissn, row.category,
          row.ais, row.jif, row.ais_rank, row.ais_quartile, row.ais_percentile_band
        ].join(" "));
        if (!hay.includes(l(filterSearch))) return false;
      }
      return true;
    });
  }

  function renderPagination(total, page, pageSize, targetId) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(page, pages - 1);
    if (total <= pageSize) return "";
    const from = current * pageSize + 1;
    const to = Math.min(total, (current + 1) * pageSize);
    return `
      <div class="journalDbPagination" data-pagination="${targetId}">
        <span class="hint">${from}–${to} z ${total}</span>
        <button type="button" class="button small secondary" data-page-nav="${targetId}" data-page="${current - 1}" ${current <= 0 ? "disabled" : ""}>← Předchozí</button>
        <span>Strana ${current + 1} / ${pages}</span>
        <button type="button" class="button small secondary" data-page-nav="${targetId}" data-page="${current + 1}" ${current >= pages - 1 ? "disabled" : ""}>Další →</button>
      </div>`;
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
    if (!list.length) return `<p class="hint">Žádné záznamy. Importujte export JCR (CSV/TSV/CSC).</p>`;
    const total = list.length;
    const page = Math.min(recordsPage, Math.max(0, Math.ceil(total / TABLE_PAGE_SIZE) - 1));
    const slice = list.slice(page * TABLE_PAGE_SIZE, (page + 1) * TABLE_PAGE_SIZE);
    return `
      ${renderPagination(total, page, TABLE_PAGE_SIZE, "records")}
      <div class="journalDbTableWrap"><table class="journalDbTable">
      <thead><tr>
        <th>Časopis</th><th>Obor</th><th>AIS</th><th>Pořadí</th><th>Poměr</th><th>P</th><th>Q</th><th>D</th><th>C</th><th>JIF</th><th>Rok</th>
      </tr></thead>
      <tbody>${slice.map((row) => `<tr>
          <td><strong>${html(row.journal_name || row.jcr_abbreviation)}</strong>
            ${row.jcr_abbreviation && row.journal_name ? `<br><span class="hint">${html(row.jcr_abbreviation)}</span>` : ""}
            ${row.issn ? `<br><span class="hint">${html(row.issn)}</span>` : ""}
          </td>
          <td>${html(row.category)}</td>
          <td>${formatNum(row.ais)}</td>
          <td>${row.ais_rank_fraction || (row.ais_rank ? `${row.ais_rank} / ${row.category_journal_count}` : "—")}</td>
          <td>${row.ais_rank_ratio ?? "—"}</td>
          <td>${html(row.ais_percentile_band) || "—"}</td>
          <td>${html(row.ais_quartile) || "—"}</td>
          <td>${html(row.ais_decile) || "—"}</td>
          <td>${html(row.ais_centile) || "—"}</td>
          <td>${formatNum(row.jif, 2)}${row.jif_year ? ` <span class="hint">(${html(row.jif_year)})</span>` : ""}</td>
          <td>${html(row.source_year) || "—"}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function renderCategoriesView() {
    const cats = analysisCache.categories.filter((c) =>
      !filterSourceYear || n(c.source_year) === filterSourceYear
    );
    if (!cats.length) return `<p class="hint">Importujte data pro přehled oborů.</p>`;
    return `<div class="journalDbTableWrap"><table class="journalDbTable">
      <thead><tr>
        <th>Rok</th><th>Obor</th><th>Počet časopisů</th><th>S AIS</th><th>Prům. AIS</th><th>Nejlepší časopis</th><th>AIS</th>
      </tr></thead>
      <tbody>${cats.map((c) => `<tr>
        <td>${html(c.source_year)}</td>
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
    const filtered = list.filter((r) => {
      if (filterCategory && n(r.best_category) !== filterCategory) return false;
      if (filterSourceYear && n(r.best_source_year || r.source_year) !== filterSourceYear) return false;
      return true;
    });
    const shown = filtered.slice(0, 500);
    return `
      <p class="hint journalDbHint">Poměr = pořadí / počet časopisů v oboru daného roku (např. 1/98). Z poměru vychází pásma P1 (top 1&nbsp;%), P5 (top 5&nbsp;%), decil D1–D10, centil C1–C100 a kvartil Q1–Q4 (Q1 = horních 25&nbsp;%).</p>
      <div class="journalDbTableWrap"><table class="journalDbTable">
        <thead><tr>
          <th>Rok</th><th>Časopis</th><th>Nejlepší obor</th><th>AIS</th><th>Pořadí</th><th>Poměr</th><th>P</th><th>Q</th><th>D</th><th>C</th><th>Oborů</th>
        </tr></thead>
        <tbody>${shown.map((row) => `<tr>
          <td>${html(row.best_source_year || row.source_year) || "—"}</td>
          <td><strong>${html(row.journal_name || row.jcr_abbreviation)}</strong>
            ${row.issn ? `<br><span class="hint">${html(row.issn)}</span>` : ""}
          </td>
          <td>${html(row.best_category)}</td>
          <td>${formatNum(row.best_ais)}</td>
          <td>${html(row.best_ais_rank_fraction) || (row.best_ais_rank ? `${row.best_ais_rank} / ${row.category_journal_count}` : "—")}</td>
          <td>${row.best_ais_rank_ratio ?? "—"}</td>
          <td>${html(row.best_ais_percentile_band) || "—"}</td>
          <td>${html(row.best_ais_quartile) || "—"}</td>
          <td>${html(row.best_ais_decile) || "—"}</td>
          <td>${html(row.best_ais_centile) || "—"}</td>
          <td>${row.category_count ?? 1}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      ${filtered.length > 500 ? `<p class="hint">Zobrazeno 500 z ${filtered.length} časopisů — zpřesněte filtr oboru nebo roku.</p>` : ""}`;
  }

  let analysisPage = 0;

  function renderCategoryAnalysisView() {
    const years = uniqueValues("source_year", records.filter((r) => r.ais_rank));
    const categories = uniqueValues("category", records.filter((r) => r.ais_rank));
    if (!categories.length) return `<p class="hint">Importujte data pro analýzu oboru.</p>`;
    const selectedYear = filterSourceYear || years.sort((a, b) => b.localeCompare(a, "cs"))[0] || "";
    const selected = analysisCategory || categories[0];
    const allRows = records
      .filter((r) => n(r.category) === selected && n(r.source_year) === selectedYear && r.ais_rank)
      .sort((a, b) => (a.ais_rank || 9999) - (b.ais_rank || 9999));

    const catSummary = analysisCache.categories.find((c) =>
      c.category === selected && n(c.source_year) === selectedYear
    );
    const opts = categories.map((c) => {
      const count = analysisCache.categories.find((x) =>
        x.category === c && n(x.source_year) === selectedYear
      )?.journal_count || "?";
      return `<option value="${html(c)}"${c === selected ? " selected" : ""}>${html(c)} (${count})</option>`;
    }).join("");

    const page = Math.min(analysisPage, Math.max(0, Math.ceil(allRows.length / TABLE_PAGE_SIZE) - 1));
    const rows = allRows.slice(page * TABLE_PAGE_SIZE, (page + 1) * TABLE_PAGE_SIZE);

    return `
      <div class="journalDbAnalysisHead">
        <label>Analyzovaný obor
          <select id="journalDbAnalysisCategory">${opts}</select>
        </label>
        ${selectedYear ? `<p class="hint">Rok exportu: <strong>${html(selectedYear)}</strong>${filterSourceYear ? "" : " — pro změnu roku použijte filtr „Rok exportu“ výše."}</p>` : ""}
        ${catSummary ? `<p class="hint">V oboru je <strong>${catSummary.journal_count}</strong> časopisů seřazených podle AIS (1 = nejvyšší AIS). Poměr pořadí/počet určuje P1, P5, D1–D10, C1–C100 a Q1–Q4 (Q1 = horních 25&nbsp;%).</p>` : `<p class="hint">Pro zvolený obor a rok nejsou data.</p>`}
      </div>
      ${renderPagination(allRows.length, page, TABLE_PAGE_SIZE, "analysis")}
      <div class="journalDbTableWrap"><table class="journalDbTable journalDbTableCompact">
        <thead><tr>
          <th>#</th><th>Časopis</th><th>AIS</th><th>Pořadí</th><th>Poměr</th><th>P</th><th>Q</th><th>D</th><th>C</th><th>JIF</th>
        </tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td>${row.ais_rank}</td>
          <td>${html(row.journal_name || row.jcr_abbreviation)}</td>
          <td>${formatNum(row.ais)}</td>
          <td>${html(row.ais_rank_fraction) || "—"}</td>
          <td>${row.ais_rank_ratio ?? "—"}</td>
          <td>${html(row.ais_percentile_band) || "—"}</td>
          <td>${html(row.ais_quartile) || "—"}</td>
          <td>${html(row.ais_decile) || "—"}</td>
          <td>${html(row.ais_centile) || "—"}</td>
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
      "source_year", "journal_name", "jcr_abbreviation", "issn", "eissn", "best_category",
      "best_ais", "best_ais_rank", "best_ais_rank_fraction", "best_ais_rank_ratio", "best_ais_percentile_band",
      "best_ais_quartile", "best_ais_decile", "best_ais_centile",
      "best_jif", "best_jif_year", "category_count", "categories_seen"
    ];
    const lines = [headers.join(";")];
    rows.forEach((row) => {
      lines.push(headers.map((h) => {
        if (h === "source_year") {
          const val = row.best_source_year || row.source_year || "";
          const s = n(val);
          return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }
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
    el("journalDbFilterCategory")?.addEventListener("change", (e) => {
      filterCategory = e.target.value;
      recordsPage = 0;
      render();
    });
    el("journalDbFilterYear")?.addEventListener("change", (e) => {
      filterSourceYear = e.target.value;
      recordsPage = 0;
      analysisPage = 0;
      render();
    });
    el("journalDbFilterSearch")?.addEventListener("input", (e) => {
      filterSearch = e.target.value;
      recordsPage = 0;
      render();
    });
    el("journalDbAnalysisCategory")?.addEventListener("change", (e) => {
      analysisCategory = e.target.value;
      analysisPage = 0;
      render();
    });
  }

  function bindPaginationEvents(root) {
    root.querySelectorAll("[data-page-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = Number(btn.dataset.page);
        if (!Number.isFinite(page) || page < 0) return;
        if (btn.dataset.pageNav === "records") recordsPage = page;
        else if (btn.dataset.pageNav === "analysis") analysisPage = page;
        render();
      });
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
            <p class="hint">Import exportů JCR po částech (CSV, TSV, CSC). Klíč časopisu je <strong>ISSN nebo eISSN</strong> — název a zkratka slouží jen pro zobrazení. Nové soubory se <strong>doplňují</strong> k existujícím záznamům (stejný rok+obor+ISSN se aktualizuje).</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="journalDbReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <label class="button small secondary" for="journalDbImportFile">Import (doplnit)</label>
            <input type="file" id="journalDbImportFile" accept=".csv,.tsv,.txt,.csc,text/csv,text/tab-separated-values" hidden multiple />
            <label class="button small secondary" for="journalDbImportReplaceFile">Import (nahradit vše)</label>
            <input type="file" id="journalDbImportReplaceFile" accept=".csv,.tsv,.txt,.csc,text/csv,text/tab-separated-values" hidden multiple />
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

    async function handleImportFiles(files, replace = false) {
      if (!files.length) return;
      loading = true;
      render();
      try {
        let imported = 0;
        let skippedNoIssn = 0;
        let skippedNoCategory = 0;
        const batchRows = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const text = await readImportFileText(file);
          const yearFromName = file.name.match(/(20\d{2})/)?.[1] || "";
          setStatus(`Importuji soubor ${i + 1} / ${files.length}: ${file.name}…`);
          const result = await importFromText(text, { fileName: file.name, sourceYear: yearFromName }, {
            replace: replace && i === 0,
            skipSupabase: true,
            skipRecompute: true,
            skipConfirm: !replace || i > 0
          });
          imported += result.imported;
          skippedNoIssn += result.skippedNoIssn;
          skippedNoCategory += result.skippedNoCategory;
          batchRows.push(...(result.upsertRows || []));
        }

        if (!useSupabase && records.length > LOCAL_STORAGE_MAX_ROWS) {
          setStatus(
            `Import dokončen — ${records.length} záznamů v paměti. localStorage nestačí — spusťte Supabase schéma a přihlaste se.`,
            true
          );
        } else {
          persistLocal();
        }

        if (useSupabase && window.kbSupabaseJournalDb && batchRows.length) {
          if (await ensureAuth()) {
            setStatus(`Ukládám 0 / ${batchRows.length}…`);
            records = await window.kbSupabaseJournalDb.upsertBatch(batchRows, (done, total) => {
              setStatus(`Ukládám ${done} / ${total}…`);
            }, { fullRecords: records, chunkSize: 100 });
          }
        }

        await recomputeAnalysis();
        document.dispatchEvent(new CustomEvent("kb:journal-db-loaded"));
        const skippedParts = [
          skippedNoIssn ? `${skippedNoIssn} bez ISSN/eISSN` : "",
          skippedNoCategory ? `${skippedNoCategory} bez oboru` : ""
        ].filter(Boolean).join(", ");
        setStatus(
          `Import dokončen — ${records.length} záznamů celkem` +
          (imported ? ` (+${imported} nových/aktualizovaných)` : "") +
          (skippedParts ? `. Přeskočeno: ${skippedParts}.` : ".")
        );
      } catch (err) {
        setStatus(`Import selhal: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    }

    el("journalDbImportFile")?.addEventListener("change", async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = "";
      await handleImportFiles(files, false);
    });
    el("journalDbImportReplaceFile")?.addEventListener("change", async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = "";
      await handleImportFiles(files, true);
    });

    root.querySelectorAll("[data-journal-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextView = btn.dataset.journalView;
        if (activeView !== nextView) {
          recordsPage = 0;
          analysisPage = 0;
        }
        activeView = nextView;
        render();
      });
    });

    bindFilterEvents();
    bindPaginationEvents(root);
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
      .journalDbPagination { display: flex; flex-wrap: wrap; gap: .5rem .75rem; align-items: center; margin: .5rem 0 .65rem; }
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
    getAnalyzed: (sourceYear) => {
      const list = records.filter((row) => row.ais_rank);
      const year = n(sourceYear);
      return year ? list.filter((row) => n(row.source_year) === year) : list.slice();
    },
    getBestResults: (sourceYear) => {
      const list = analysisCache.best.slice();
      const year = n(sourceYear);
      return year
        ? list.filter((row) => n(row.best_source_year || row.source_year) === year)
        : list;
    },
    getCategories: (sourceYear) => {
      const list = analysisCache.categories.slice();
      const year = n(sourceYear);
      return year ? list.filter((row) => n(row.source_year) === year) : list;
    },
    lookupBest: (ref, sourceYear) =>
      window.kbJournalDbAnalysis?.lookupBestJournal?.(ref, analysisCache.best, sourceYear),
    loadRecords,
    importFromText,
    parseJournalImportTable,
    recomputeAnalysis
  };

  document.addEventListener("DOMContentLoaded", init);
})();
