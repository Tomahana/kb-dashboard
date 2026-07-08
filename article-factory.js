// Modul Article Factory — příprava vědeckých článků (Fáze 1: publikace, témata, časopisy).

(function () {
  const VIEWS = [
    { id: "publications", label: "Moje publikace", icon: "📚" },
    { id: "topics", label: "Témata článků", icon: "💡" },
    { id: "journals", label: "Cílové časopisy", icon: "🎯" },
    { id: "pipeline", label: "Pipeline", icon: "⚙️" },
    { id: "manuscript", label: "Rukopis", icon: "📝" },
    { id: "review", label: "Review panel", icon: "🔍" },
    { id: "export", label: "Export", icon: "📤" }
  ];

  const TOPIC_STATUSES = [
    "idea", "selected", "in_progress", "drafted", "reviewed", "submitted", "rejected", "published"
  ];

  const PUBLICATION_IMPORT_ALIASES = {
    title: ["Title", "Název", "Nazev", "Titul"],
    authors: ["Authors", "Autor", "Autoři", "Autori"],
    year: ["Year", "Rok"],
    journal_or_publisher: ["Journal", "Časopis", "Casopis", "Publisher", "Vydavatel"],
    doi: ["DOI", "doi"],
    issn: ["ISSN", "issn"],
    wos_category: ["WoS Category", "WOS", "Obor", "wos_category"],
    abstract: ["Abstract", "Abstrakt"],
    keywords: ["Keywords", "Klíčová slova", "Klicova slova"],
    methodology: ["Methodology", "Metodologie"],
    main_findings: ["Main findings", "Hlavní zjištění", "Hlavni zjisteni"],
    notes: ["Notes", "Poznámka", "Poznamka"]
  };

  const TOPIC_IMPORT_ALIASES = {
    title: ["Title", "Název", "Tema", "Téma"],
    description: ["Description", "Popis"],
    research_area: ["Research area", "Oblast", "Obor"],
    possible_methodology: ["Methodology", "Metodologie"],
    target_wos_category: ["WoS Category", "Cílový obor"],
    expected_contribution: ["Contribution", "Přínos"],
    priority: ["Priority", "Priorita"],
    status: ["Status", "Stav"],
    notes: ["Notes", "Poznámka"]
  };

  const JOURNAL_IMPORT_ALIASES = {
    journal_title: ["Journal", "Časopis", "Title", "Název"],
    publisher: ["Publisher", "Vydavatel"],
    issn: ["ISSN"],
    eissn: ["eISSN", "EISSN"],
    wos_category: ["WoS Category", "Category", "Obor"],
    quartile: ["Quartile", "Kvartil"],
    ais_rank_info: ["AIS", "AIS rank"],
    scope: ["Scope", "Zaměření"],
    open_access_info: ["Open access", "OA"],
    publication_fee: ["APC", "Publication fee", "Fee"],
    submission_url: ["Submission URL", "Submit"],
    author_guidelines_url: ["Guidelines URL", "Guidelines"],
    notes: ["Notes", "Poznámka"]
  };

  let publications = [];
  let topics = [];
  let journals = [];
  let useSupabase = false;
  let loading = false;
  let activeView = "publications";
  let filterSearch = "";
  let editingPublication = null;
  let editingTopic = null;
  let editingJournal = null;
  let pipelineStatus = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `af-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    window.kbSupabaseArticleFactory?.saveLocal?.({ publications, topics, journals });
  }

  function setStatus(text, isError) {
    const node = el("articleFactoryStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("articleFactoryStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste.", true);
    return false;
  }

  function makePublicationSourceKey(item) {
    return [
      l(item.doi),
      String(item.year || ""),
      l(item.authors).slice(0, 40),
      l(item.title).slice(0, 80)
    ].filter(Boolean).join("|") || `manual-${uuid()}`;
  }

  function makeTopicSourceKey(item) {
    return [l(item.title), l(item.research_area)].filter(Boolean).join("|") || `topic-${uuid()}`;
  }

  function makeJournalSourceKey(item) {
    const issn = n(item.issn) || n(item.eissn);
    if (issn) return `issn:${issn.replace(/\s/g, "")}`;
    return [l(item.journal_title), l(item.wos_category)].filter(Boolean).join("|") || `journal-${uuid()}`;
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
    return counts[0][1] > 0 ? counts[0][0] : "\t";
  }

  function getImportField(row, aliases, field) {
    const keys = aliases[field] || [field];
    for (const key of keys) {
      if (row[key] != null && n(row[key])) return n(row[key]);
      const hit = Object.keys(row).find((k) => l(k) === l(key));
      if (hit && n(row[hit])) return n(row[hit]);
    }
    return "";
  }

  function rowsFromDelimitedText(text, aliases) {
    const lines = text.split(/\r?\n/).filter((ln) => n(ln));
    if (!lines.length) return [];
    const delimiter = detectDelimiter(lines[0]);
    const grid = parseCsvRecords(text, delimiter);
    if (!grid.length) return [];
    const headers = grid[0].map((h) => n(h).replace(/^\uFEFF/, ""));
    const out = [];
    for (let i = 1; i < grid.length; i += 1) {
      const raw = {};
      headers.forEach((h, idx) => { raw[h] = grid[i][idx] ?? ""; });
      const item = {};
      Object.keys(aliases).forEach((field) => {
        item[field] = getImportField(raw, aliases, field);
      });
      out.push(item);
    }
    return out;
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    try {
      const canProbe = window.kbSupabaseArticleFactory?.probeTables;
      useSupabase = canProbe ? await window.kbSupabaseArticleFactory.probeTables() : false;
      if (useSupabase && await ensureAuth()) {
        const data = await window.kbSupabaseArticleFactory.loadAll();
        publications = data.publications || [];
        topics = data.topics || [];
        journals = data.journals || [];
        persistLocal();
        setStatus(`Načteno ze Supabase: ${publications.length} publikací, ${topics.length} témat, ${journals.length} časopisů.`);
      } else {
        const local = window.kbSupabaseArticleFactory?.loadLocal?.() || { publications: [], topics: [], journals: [] };
        publications = local.publications;
        topics = local.topics;
        journals = local.journals;
        setStatus(useSupabase
          ? "Supabase tabulky nejsou k dispozici — používám lokální cache."
          : `Lokální režim: ${publications.length} publikací, ${topics.length} témat, ${journals.length} časopisů.`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Načtení selhalo: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  async function savePublication(item) {
    if (!n(item.title)) {
      setStatus("Název publikace je povinný.", true);
      return;
    }
    item.source_key = item.source_key || makePublicationSourceKey(item);
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseArticleFactory.upsertPublication(item);
      const idx = publications.findIndex((p) => p.id === saved.id);
      if (idx >= 0) publications[idx] = saved;
      else publications.push(saved);
    } else {
      if (!item.id) item.id = uuid();
      item.__existing = true;
      const idx = publications.findIndex((p) => p.id === item.id);
      if (idx >= 0) publications[idx] = item;
      else publications.push(item);
    }
    persistLocal();
    setStatus("Publikace uložena.");
    render();
  }

  async function saveTopic(item) {
    if (!n(item.title)) {
      setStatus("Název tématu je povinný.", true);
      return;
    }
    item.source_key = item.source_key || makeTopicSourceKey(item);
    item.priority = Number(item.priority) || 3;
    if (!TOPIC_STATUSES.includes(item.status)) item.status = "idea";
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseArticleFactory.upsertTopic(item);
      const idx = topics.findIndex((t) => t.id === saved.id);
      if (idx >= 0) topics[idx] = saved;
      else topics.push(saved);
    } else {
      if (!item.id) item.id = uuid();
      item.__existing = true;
      const idx = topics.findIndex((t) => t.id === item.id);
      if (idx >= 0) topics[idx] = item;
      else topics.push(item);
    }
    persistLocal();
    setStatus("Téma uloženo.");
    render();
  }

  async function saveJournal(item) {
    if (!n(item.journal_title)) {
      setStatus("Název časopisu je povinný.", true);
      return;
    }
    item.source_key = item.source_key || makeJournalSourceKey(item);
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseArticleFactory.upsertJournal(item);
      const idx = journals.findIndex((j) => j.id === saved.id);
      if (idx >= 0) journals[idx] = saved;
      else journals.push(saved);
    } else {
      if (!item.id) item.id = uuid();
      item.__existing = true;
      const idx = journals.findIndex((j) => j.id === item.id);
      if (idx >= 0) journals[idx] = item;
      else journals.push(item);
    }
    persistLocal();
    setStatus("Časopis uložen.");
    render();
  }

  async function importFile(file, type) {
    const text = await file.text();
    const rows = rowsFromDelimitedText(text, type === "publications"
      ? PUBLICATION_IMPORT_ALIASES
      : type === "topics" ? TOPIC_IMPORT_ALIASES : JOURNAL_IMPORT_ALIASES);
    if (!rows.length) {
      setStatus("Import neobsahuje žádné řádky.", true);
      return;
    }
    let count = 0;
    for (const row of rows) {
      if (type === "publications" && !n(row.title)) continue;
      if (type === "topics" && !n(row.title)) continue;
      if (type === "journals" && !n(row.journal_title)) continue;
      const item = {
        id: uuid(),
        __existing: false,
        imported_at: new Date().toISOString(),
        ...row
      };
      if (type === "publications") {
        item.source_key = makePublicationSourceKey(item);
        await savePublication(item);
      } else if (type === "topics") {
        item.source_key = makeTopicSourceKey(item);
        item.priority = Number(item.priority) || 3;
        item.status = TOPIC_STATUSES.includes(item.status) ? item.status : "idea";
        item.related_publication_ids = [];
        await saveTopic(item);
      } else {
        item.source_key = makeJournalSourceKey(item);
        await saveJournal(item);
      }
      count += 1;
    }
    setStatus(`Import dokončen: ${count} záznamů.`);
    await loadData();
  }

  async function deleteItem(type, id) {
    if (!confirm("Opravdu smazat tento záznam?")) return;
    if (useSupabase && await ensureAuth()) {
      if (type === "publications") await window.kbSupabaseArticleFactory.deletePublication(id);
      else if (type === "topics") await window.kbSupabaseArticleFactory.deleteTopic(id);
      else await window.kbSupabaseArticleFactory.deleteJournal(id);
    }
    if (type === "publications") publications = publications.filter((p) => p.id !== id);
    else if (type === "topics") topics = topics.filter((t) => t.id !== id);
    else journals = journals.filter((j) => j.id !== id);
    persistLocal();
    setStatus("Záznam smazán.");
    render();
  }

  async function checkPipeline() {
    try {
      pipelineStatus = await window.kbArticlePipeline?.ping?.();
      setStatus(`Pipeline OK — fáze ${pipelineStatus?.phase || "?"}. AI klíče: ${JSON.stringify(pipelineStatus?.ai_keys || {})}`);
    } catch (err) {
      pipelineStatus = { error: err.message };
      setStatus(`Pipeline nedostupná: ${err.message}. Nasazte edge funkci article-pipeline.`, true);
    }
    render();
  }

  function filteredPublications() {
    const q = l(filterSearch);
    if (!q) return publications;
    return publications.filter((p) =>
      [p.title, p.authors, p.doi, p.journal_or_publisher, p.wos_category].some((f) => l(f).includes(q))
    );
  }

  function filteredTopics() {
    const q = l(filterSearch);
    if (!q) return topics;
    return topics.filter((t) =>
      [t.title, t.research_area, t.status, t.description].some((f) => l(f).includes(q))
    );
  }

  function filteredJournals() {
    const q = l(filterSearch);
    if (!q) return journals;
    return journals.filter((j) =>
      [j.journal_title, j.issn, j.wos_category, j.quartile].some((f) => l(f).includes(q))
    );
  }

  function statusLabel(status) {
    const labels = {
      idea: "Nápad", selected: "Vybráno", in_progress: "Probíhá", drafted: "Draft",
      reviewed: "Zkontrolováno", submitted: "Odesláno", rejected: "Zamítnuto", published: "Publikováno"
    };
    return labels[status] || status;
  }

  function renderPublicationDialog() {
    const p = editingPublication || {};
    return `
      <dialog id="afPublicationDialog" class="afDialog">
        <form method="dialog" class="afDialogForm">
          <h3>${p.id ? "Upravit publikaci" : "Nová publikace"}</h3>
          <label>Název *<input name="title" value="${html(p.title)}" required></label>
          <label>Autoři<input name="authors" value="${html(p.authors)}"></label>
          <label>Rok<input name="year" type="number" min="1990" max="2100" value="${html(p.year)}"></label>
          <label>Časopis / vydavatel<input name="journal_or_publisher" value="${html(p.journal_or_publisher)}"></label>
          <label>DOI<input name="doi" value="${html(p.doi)}"></label>
          <label>ISSN<input name="issn" value="${html(p.issn)}"></label>
          <label>WoS obor<input name="wos_category" value="${html(p.wos_category)}"></label>
          <label>Abstrakt<textarea name="abstract" rows="3">${html(p.abstract)}</textarea></label>
          <label>Klíčová slova<input name="keywords" value="${html(p.keywords)}"></label>
          <label>Metodologie<textarea name="methodology" rows="2">${html(p.methodology)}</textarea></label>
          <label>Hlavní zjištění<textarea name="main_findings" rows="2">${html(p.main_findings)}</textarea></label>
          <label>Poznámky<textarea name="notes" rows="2">${html(p.notes)}</textarea></label>
          <div class="afDialogActions">
            <button type="button" class="btn secondary" data-af-cancel>Zrušit</button>
            <button type="submit" class="btn primary">Uložit</button>
          </div>
        </form>
      </dialog>`;
  }

  function renderTopicDialog() {
    const t = editingTopic || {};
    const pubOptions = publications.map((p) =>
      `<option value="${html(p.id)}" ${(t.related_publication_ids || []).includes(p.id) ? "selected" : ""}>${html(p.title)}</option>`
    ).join("");
    const statusOptions = TOPIC_STATUSES.map((s) =>
      `<option value="${s}" ${t.status === s ? "selected" : ""}>${statusLabel(s)}</option>`
    ).join("");
    return `
      <dialog id="afTopicDialog" class="afDialog">
        <form method="dialog" class="afDialogForm">
          <h3>${t.id ? "Upravit téma" : "Nové téma"}</h3>
          <label>Název *<input name="title" value="${html(t.title)}" required></label>
          <label>Popis<textarea name="description" rows="3">${html(t.description)}</textarea></label>
          <label>Výzkumná oblast<input name="research_area" value="${html(t.research_area)}"></label>
          <label>Možná metodologie<textarea name="possible_methodology" rows="2">${html(t.possible_methodology)}</textarea></label>
          <label>Cílový WoS obor<input name="target_wos_category" value="${html(t.target_wos_category)}"></label>
          <label>Očekávaný přínos<textarea name="expected_contribution" rows="2">${html(t.expected_contribution)}</textarea></label>
          <label>Priorita (1–5)<input name="priority" type="number" min="1" max="5" value="${html(t.priority || 3)}"></label>
          <label>Status<select name="status">${statusOptions}</select></label>
          <label>Související publikace<select name="related_publication_ids" multiple size="4">${pubOptions}</select></label>
          <label>Poznámky<textarea name="notes" rows="2">${html(t.notes)}</textarea></label>
          <div class="afDialogActions">
            <button type="button" class="btn secondary" data-af-cancel>Zrušit</button>
            <button type="submit" class="btn primary">Uložit</button>
          </div>
        </form>
      </dialog>`;
  }

  function renderJournalDialog() {
    const j = editingJournal || {};
    return `
      <dialog id="afJournalDialog" class="afDialog">
        <form method="dialog" class="afDialogForm">
          <h3>${j.id ? "Upravit časopis" : "Nový cílový časopis"}</h3>
          <label>Název časopisu *<input name="journal_title" value="${html(j.journal_title)}" required></label>
          <label>Vydavatel<input name="publisher" value="${html(j.publisher)}"></label>
          <label>ISSN<input name="issn" value="${html(j.issn)}"></label>
          <label>eISSN<input name="eissn" value="${html(j.eissn)}"></label>
          <label>WoS obor<input name="wos_category" value="${html(j.wos_category)}"></label>
          <label>Kvartil<select name="quartile">
            <option value="">—</option>
            ${["Q1", "Q2", "Q3", "Q4"].map((q) => `<option value="${q}" ${j.quartile === q ? "selected" : ""}>${q}</option>`).join("")}
          </select></label>
          <label>AIS info<input name="ais_rank_info" value="${html(j.ais_rank_info)}"></label>
          <label>Scope<textarea name="scope" rows="2">${html(j.scope)}</textarea></label>
          <label>OA info<input name="open_access_info" value="${html(j.open_access_info)}"></label>
          <label>APC (fee)<input name="publication_fee" type="number" step="0.01" value="${html(j.publication_fee)}"></label>
          <label>Submission URL<input name="submission_url" value="${html(j.submission_url)}"></label>
          <label>Author guidelines URL<input name="author_guidelines_url" value="${html(j.author_guidelines_url)}"></label>
          <label>Poznámky<textarea name="notes" rows="2">${html(j.notes)}</textarea></label>
          <div class="afDialogActions">
            <button type="button" class="btn secondary" data-af-cancel>Zrušit</button>
            <button type="submit" class="btn primary">Uložit</button>
          </div>
        </form>
      </dialog>`;
  }

  function renderPublicationsView() {
    const rows = filteredPublications().map((p) => `
      <tr>
        <td>${html(p.year) || "—"}</td>
        <td><strong>${html(p.title)}</strong>${p.vystup_id ? ` <span class="afTag">Výstupy</span>` : ""}</td>
        <td>${html(p.authors) || "—"}</td>
        <td>${html(p.journal_or_publisher) || "—"}</td>
        <td>${html(p.doi) || "—"}</td>
        <td class="afActions">
          <button type="button" class="btn small" data-af-edit-pub="${html(p.id)}">Upravit</button>
          <button type="button" class="btn small danger" data-af-del-pub="${html(p.id)}">Smazat</button>
        </td>
      </tr>`).join("");
    return `
      <div class="afToolbar">
        <button type="button" class="btn primary" data-af-new-pub>+ Publikace</button>
        <label class="btn">Import TSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-pub></label>
      </div>
      <div class="afTableWrap">
        <table class="afTable">
          <thead><tr><th>Rok</th><th>Název</th><th>Autoři</th><th>Časopis</th><th>DOI</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="afEmpty">Zatím žádné publikace.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderTopicsView() {
    const rows = filteredTopics()
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
      .map((t) => `
      <tr>
        <td><span class="afPriority">P${html(t.priority)}</span></td>
        <td><strong>${html(t.title)}</strong></td>
        <td>${html(t.research_area) || "—"}</td>
        <td><span class="afStatus afStatus-${html(t.status)}">${statusLabel(t.status)}</span></td>
        <td>${(t.related_publication_ids || []).length}</td>
        <td class="afActions">
          <button type="button" class="btn small" data-af-edit-topic="${html(t.id)}">Upravit</button>
          <button type="button" class="btn small danger" data-af-del-topic="${html(t.id)}">Smazat</button>
        </td>
      </tr>`).join("");
    return `
      <div class="afToolbar">
        <button type="button" class="btn primary" data-af-new-topic>+ Téma</button>
        <label class="btn">Import TSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-topic></label>
      </div>
      <div class="afTableWrap">
        <table class="afTable">
          <thead><tr><th>P</th><th>Téma</th><th>Oblast</th><th>Status</th><th>Publ.</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="afEmpty">Zatím žádná témata.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderJournalsView() {
    const rows = filteredJournals().map((j) => `
      <tr>
        <td><strong>${html(j.journal_title)}</strong></td>
        <td>${html(j.issn) || "—"}</td>
        <td>${html(j.wos_category) || "—"}</td>
        <td>${html(j.quartile) || "—"}</td>
        <td>${j.last_verified_at ? new Date(j.last_verified_at).toLocaleDateString("cs-CZ") : "—"}</td>
        <td class="afActions">
          <button type="button" class="btn small" data-af-edit-journal="${html(j.id)}">Upravit</button>
          <button type="button" class="btn small danger" data-af-del-journal="${html(j.id)}">Smazat</button>
        </td>
      </tr>`).join("");
    return `
      <div class="afToolbar">
        <button type="button" class="btn primary" data-af-new-journal>+ Časopis</button>
        <label class="btn">Import TSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-journal></label>
      </div>
      <div class="afTableWrap">
        <table class="afTable">
          <thead><tr><th>Časopis</th><th>ISSN</th><th>Obor</th><th>Kvartil</th><th>Ověřeno</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="afEmpty">Zatím žádné cílové časopisy.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderPipelineView() {
    const ps = pipelineStatus || {};
    return `
      <div class="afPlaceholder">
        <p><strong>Publikační pipeline</strong> — měsíční příprava článku s lidskou kontrolou.</p>
        <p class="hint">Fáze 1: evidence dat + Edge Function. AI kroky (8 rolí) přijdou ve Fázi 3.</p>
        <div class="afToolbar">
          <button type="button" class="btn primary" data-af-pipeline-ping>Otestovat Edge Function</button>
          <button type="button" class="btn" data-af-reload>Načíst Supabase</button>
        </div>
        ${ps.ok ? `<pre class="afPre">${html(JSON.stringify(ps, null, 2))}</pre>` : ""}
        ${ps.error ? `<p class="afError">${html(ps.error)}</p>` : ""}
        <p class="hint">SQL: <code>supabase/article-factory-schema.sql</code> → <code>article-factory-storage.sql</code> → <code>article-factory-rls.sql</code><br>
        Deploy: <code>supabase functions deploy article-pipeline</code></p>
      </div>`;
  }

  function renderPlaceholder(title, desc) {
    return `<div class="afPlaceholder"><h3>${html(title)}</h3><p>${html(desc)}</p><p class="hint">Dostupné od Fáze 2–3.</p></div>`;
  }

  function renderContent() {
    if (activeView === "publications") return renderPublicationsView();
    if (activeView === "topics") return renderTopicsView();
    if (activeView === "journals") return renderJournalsView();
    if (activeView === "pipeline") return renderPipelineView();
    if (activeView === "manuscript") return renderPlaceholder("Rukopis", "Editor verzí, Factual Basis a Human Work Needed.");
    if (activeView === "review") return renderPlaceholder("Review panel", "AI recenze od 8 rolí.");
    return renderPlaceholder("Export", "Markdown export po lidské revizi (human_reviewed_at).");
  }

  function bindDialogs() {
    const pubDlg = el("afPublicationDialog");
    if (pubDlg && !pubDlg.__bound) {
      pubDlg.querySelector("[data-af-cancel]")?.addEventListener("click", () => pubDlg.close());
      pubDlg.addEventListener("close", async () => {
        if (pubDlg.returnValue !== "confirm" && pubDlg.returnValue !== "default") return;
        const fd = new FormData(pubDlg.querySelector("form"));
        const item = { ...(editingPublication || {}), id: editingPublication?.id || uuid(), __existing: !!editingPublication?.id };
        fd.forEach((val, key) => { item[key] = n(val); });
        await savePublication(item);
        editingPublication = null;
      });
      pubDlg.__bound = true;
    }

    const topicDlg = el("afTopicDialog");
    if (topicDlg && !topicDlg.__bound) {
      topicDlg.querySelector("[data-af-cancel]")?.addEventListener("click", () => topicDlg.close());
      topicDlg.addEventListener("close", async () => {
        if (topicDlg.returnValue !== "confirm" && topicDlg.returnValue !== "default") return;
        const fd = new FormData(topicDlg.querySelector("form"));
        const item = { ...(editingTopic || {}), id: editingTopic?.id || uuid(), __existing: !!editingTopic?.id, related_publication_ids: [] };
        fd.forEach((val, key) => {
          if (key === "related_publication_ids") return;
          item[key] = n(val);
        });
        item.related_publication_ids = [...topicDlg.querySelector("[name=related_publication_ids]")?.selectedOptions || []].map((o) => o.value);
        await saveTopic(item);
        editingTopic = null;
      });
      topicDlg.__bound = true;
    }

    const journalDlg = el("afJournalDialog");
    if (journalDlg && !journalDlg.__bound) {
      journalDlg.querySelector("[data-af-cancel]")?.addEventListener("click", () => journalDlg.close());
      journalDlg.addEventListener("close", async () => {
        if (journalDlg.returnValue !== "confirm" && journalDlg.returnValue !== "default") return;
        const fd = new FormData(journalDlg.querySelector("form"));
        const item = { ...(editingJournal || {}), id: editingJournal?.id || uuid(), __existing: !!editingJournal?.id };
        fd.forEach((val, key) => { item[key] = n(val); });
        await saveJournal(item);
        editingJournal = null;
      });
      journalDlg.__bound = true;
    }
  }

  function bindEvents(root) {
    root.querySelectorAll("[data-af-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.afView;
        render();
      });
    });

    root.querySelector("[data-af-search]")?.addEventListener("input", (e) => {
      filterSearch = e.target.value;
      render();
    });

    root.querySelector("[data-af-reload]")?.addEventListener("click", () => loadData());
    root.querySelector("[data-af-pipeline-ping]")?.addEventListener("click", () => checkPipeline());
    root.querySelector("[data-af-new-pub]")?.addEventListener("click", () => {
      editingPublication = {};
      render();
      el("afPublicationDialog")?.showModal();
    });
    root.querySelectorAll("[data-af-edit-pub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingPublication = publications.find((p) => p.id === btn.dataset.afEditPub) || {};
        render();
        el("afPublicationDialog")?.showModal();
      });
    });
    root.querySelectorAll("[data-af-del-pub]").forEach((btn) => {
      btn.addEventListener("click", () => deleteItem("publications", btn.dataset.afDelPub));
    });
    root.querySelector("[data-af-import-pub]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await importFile(file, "publications");
      e.target.value = "";
    });

    root.querySelector("[data-af-new-topic]")?.addEventListener("click", () => {
      editingTopic = { priority: 3, status: "idea", related_publication_ids: [] };
      render();
      el("afTopicDialog")?.showModal();
    });
    root.querySelectorAll("[data-af-edit-topic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingTopic = topics.find((t) => t.id === btn.dataset.afEditTopic) || {};
        render();
        el("afTopicDialog")?.showModal();
      });
    });
    root.querySelectorAll("[data-af-del-topic]").forEach((btn) => {
      btn.addEventListener("click", () => deleteItem("topics", btn.dataset.afDelTopic));
    });
    root.querySelector("[data-af-import-topic]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await importFile(file, "topics");
      e.target.value = "";
    });

    root.querySelector("[data-af-new-journal]")?.addEventListener("click", () => {
      editingJournal = {};
      render();
      el("afJournalDialog")?.showModal();
    });
    root.querySelectorAll("[data-af-edit-journal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingJournal = journals.find((j) => j.id === btn.dataset.afEditJournal) || {};
        render();
        el("afJournalDialog")?.showModal();
      });
    });
    root.querySelectorAll("[data-af-del-journal]").forEach((btn) => {
      btn.addEventListener("click", () => deleteItem("journals", btn.dataset.afDelJournal));
    });
    root.querySelector("[data-af-import-journal]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await importFile(file, "journals");
      e.target.value = "";
    });

    bindDialogs();
  }

  function injectStyles() {
    if (el("articleFactoryStyles")) return;
    const style = document.createElement("style");
    style.id = "articleFactoryStyles";
    style.textContent = `
      .afModule { padding: 0 0 2rem; }
      .afTabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem; }
      .afTab { border: 1px solid var(--border, #ddd); background: var(--surface, #fff); padding: 0.4rem 0.75rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; }
      .afTab.active { background: var(--accent, #2563eb); color: #fff; border-color: var(--accent, #2563eb); }
      .afToolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; align-items: center; }
      .afSearch { flex: 1; min-width: 180px; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--border, #ddd); }
      .afTableWrap { overflow-x: auto; border: 1px solid var(--border, #ddd); border-radius: 10px; }
      .afTable { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .afTable th, .afTable td { padding: 0.5rem 0.65rem; text-align: left; border-bottom: 1px solid var(--border, #eee); vertical-align: top; }
      .afTable th { background: var(--surface-2, #f8fafc); font-weight: 600; }
      .afEmpty { color: #64748b; text-align: center; padding: 1.5rem !important; }
      .afActions { white-space: nowrap; }
      .afTag { font-size: 0.7rem; background: #e0e7ff; color: #3730a3; padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.25rem; }
      .afPriority { font-weight: 700; color: #7c3aed; }
      .afStatus { font-size: 0.8rem; padding: 0.15rem 0.45rem; border-radius: 999px; background: #f1f5f9; }
      .afStatus-selected { background: #dbeafe; color: #1d4ed8; }
      .afStatus-in_progress { background: #fef3c7; color: #b45309; }
      .afPlaceholder { padding: 1rem; background: var(--surface-2, #f8fafc); border-radius: 10px; border: 1px dashed var(--border, #cbd5e1); }
      .afPre { font-size: 0.75rem; overflow: auto; max-height: 280px; background: #0f172a; color: #e2e8f0; padding: 0.75rem; border-radius: 8px; }
      .afError { color: #b91c1c; }
      .articleFactoryStatusError { color: #b91c1c; }
      .afDialog { border: none; border-radius: 12px; padding: 0; max-width: 560px; width: calc(100% - 2rem); }
      .afDialogForm { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.55rem; }
      .afDialogForm label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
      .afDialogForm input, .afDialogForm textarea, .afDialogForm select { padding: 0.4rem 0.5rem; border-radius: 6px; border: 1px solid #cbd5e1; }
      .afDialogActions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
      .btn.small { font-size: 0.8rem; padding: 0.25rem 0.5rem; }
      .btn.danger { color: #b91c1c; border-color: #fecaca; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const root = el("articleFactoryPageRoot");
    if (!root || root.dataset.injected) return;
    root.dataset.injected = "1";
    injectStyles();
  }

  function render() {
    const root = el("articleFactoryPageRoot");
    if (!root) return;
    injectPage();

    const tabHtml = VIEWS.map((v) =>
      `<button type="button" class="afTab ${activeView === v.id ? "active" : ""}" data-af-view="${v.id}">${v.icon} ${html(v.label)}</button>`
    ).join("");

    root.innerHTML = `
      <div class="afModule">
        <p class="hint">Publikační pipeline pro Q1 články — rukopis anglicky, komentáře česky. AI výstupy vyžadují lidskou revizi.</p>
        <div class="afTabs">${tabHtml}</div>
        <div class="afToolbar">
          <input type="search" class="afSearch" placeholder="Hledat…" data-af-search value="${html(filterSearch)}">
          <button type="button" class="btn" data-af-reload>↻ Načíst</button>
        </div>
        <div id="articleFactoryStatus" class="hint"></div>
        ${renderContent()}
      </div>
      ${renderPublicationDialog()}
      ${renderTopicDialog()}
      ${renderJournalDialog()}
    `;

    const statusNode = el("articleFactoryStatus");
    if (statusNode && statusNode.textContent === "") {
      statusNode.textContent = useSupabase ? "Supabase režim." : "Lokální režim (tabulky nebo přihlášení chybí).";
    }

    bindEvents(root);
  }

  function init() {
    injectPage();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "article-factory") {
        loadData();
      }
    });
    document.addEventListener("kb:auth-ready", () => loadData());
    if (window.kbLayout?.getPage?.() === "article-factory") loadData();
  }

  window.kbArticleFactory = {
    getPublications: () => publications,
    getTopics: () => topics,
    getJournals: () => journals,
    loadData,
    render
  };

  document.addEventListener("DOMContentLoaded", init);
})();
