// Modul Article Factory — MVP: publikace, témata, časopisy, projekty, pipeline, rukopis, export.

(function () {
  const VIEW_GROUPS = [
    {
      label: "Knihovna",
      items: [
        { id: "publications", label: "Moje publikace", icon: "📚" },
        { id: "topics", label: "Témata článků", icon: "💡" },
        { id: "journals", label: "Cílové časopisy", icon: "🎯" }
      ]
    },
    {
      label: "Projekt a pipeline",
      items: [
        { id: "projects", label: "Projekty", icon: "📁" },
        { id: "pipeline", label: "Pipeline", icon: "⚙️" },
        { id: "manuscript", label: "Rukopis", icon: "📝" },
        { id: "review", label: "Review", icon: "🔍" },
        { id: "export", label: "Export", icon: "📤" }
      ]
    }
  ];

  const VIEWS = VIEW_GROUPS.flatMap((g) => g.items);

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
    title: ["Title", "Název", "Nazev", "Tema", "Téma"],
    working_title: ["Nové téma", "Nove tema", "Short title"],
    description: ["Description", "Popis"],
    research_area: ["Research area", "Oblast", "Obor", "Výzkumná oblast", "Vyzkumna oblast"],
    possible_methodology: ["Methodology", "Metodologie", "Možná metodologie", "Mozna metodologie"],
    target_wos_category: ["WoS Category", "Cílový obor", "Cilovy obor", "Cílový WoS obor"],
    expected_contribution: ["Contribution", "Přínos", "Prinos", "Očekávaný přínos", "Ocekavany prinos"],
    priority: ["Priority", "Priorita", "Priorita (1–5)", "Priorita (1-5)"],
    status: ["Status", "Stav"],
    related_publications_text: ["Související publikace", "Souvisejici publikace", "Related publications"],
    notes: ["Notes", "Poznámka", "Poznamka", "Poznámky", "Poznamky"]
  };

  const TOPIC_STATUS_IMPORT_MAP = {
    idea: "idea",
    napad: "idea",
    selected: "selected",
    vybrano: "selected",
    "in_progress": "in_progress",
    probiha: "in_progress",
    "probíhá": "in_progress",
    drafted: "drafted",
    draft: "drafted",
    koncept: "drafted",
    reviewed: "reviewed",
    zkontrolovano: "reviewed",
    "zkontrolováno": "reviewed",
    submitted: "submitted",
    odeslano: "submitted",
    "odesláno": "submitted",
    rejected: "rejected",
    zamitnuto: "rejected",
    "zamítnuto": "rejected",
    published: "published",
    publikovano: "published",
    "publikováno": "published"
  };

  const JOURNAL_IMPORT_ALIASES = {
    journal_title: ["Journal", "Časopis", "Title", "Název", "Journal name"],
    publisher: ["Publisher", "Vydavatel"],
    issn: ["ISSN"],
    eissn: ["eISSN", "EISSN"],
    wos_category: ["WoS Category", "Category", "Obor"],
    quartile: ["Quartile", "Kvartil", "JIF Quartile"],
    ais_rank_info: ["AIS", "AIS rank", "ais_rank_info"],
    scope: ["Scope", "Zaměření", "Edition"],
    open_access_info: ["Open access", "OA", "% of Citable OA"],
    publication_fee: ["APC", "Publication fee", "Fee"],
    submission_url: ["Submission URL", "Submit"],
    author_guidelines_url: ["Guidelines URL", "Guidelines"],
    notes: ["Notes", "Poznámka"]
  };

  let publications = [];
  let topics = [];
  let journals = [];
  let projects = [];
  let versions = [];
  let reviews = [];
  let pipelineRuns = [];
  let useSupabase = false;
  let loading = false;
  let pipelineLoading = false;
  let activeView = "publications";
  let filterSearch = "";
  let selectedProjectId = "";
  let editingPublication = null;
  let editingTopic = null;
  let editingJournal = null;
  let editingProject = null;
  let pipelineStatus = null;
  let lastPipelineResult = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `af-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    window.kbSupabaseArticleFactory?.saveLocal?.({
      publications, topics, journals, projects, versions, reviews, pipelineRuns
    });
  }

  function getSelectedProject() {
    return projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
  }

  function getProjectVersions(projectId) {
    return versions.filter((v) => v.article_project_id === projectId).sort((a, b) => b.version_number - a.version_number);
  }

  function getProjectReviews(projectId) {
    return reviews.filter((r) => r.article_project_id === projectId);
  }

  function getCurrentVersion(project) {
    if (!project) return null;
    return versions.find((v) => v.id === project.current_version_id)
      || getProjectVersions(project.id)[0]
      || null;
  }

  function topicTitle(id) {
    return topics.find((t) => t.id === id)?.title || "—";
  }

  function projectForTopic(topicId) {
    return projects.find((p) => p.topic_id === topicId) || null;
  }

  function gotoProjectsView() {
    activeView = "projects";
    render();
  }

  function openNewProjectFromTopic(topicId) {
    const topic = topics.find((t) => t.id === topicId);
    editingProject = {
      topic_id: topic?.id || "",
      working_title: topic?.working_title || topic?.title || "",
      revision_checklist: window.kbArticleFactoryTypes?.REVISION_CHECKLIST?.map((c) => ({ ...c, checked: false }))
    };
    activeView = "projects";
    render();
    el("afProjectDialog")?.showModal();
  }

  function journalTitle(id) {
    return journals.find((j) => j.id === id)?.journal_title || "—";
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

  const AF_DIALOG_IDS = ["afPublicationDialog", "afJournalDialog", "afProjectDialog"];

  function isAnyDialogOpen() {
    return AF_DIALOG_IDS.some((id) => el(id)?.open);
  }

  function isInlineEditorOpen() {
    return editingTopic !== null && activeView === "topics";
  }

  function isDataEntryActive() {
    return isAnyDialogOpen() || isInlineEditorOpen();
  }

  function captureOpenDialogDraft() {
    let reopenId = null;

    const pubDlg = el("afPublicationDialog");
    if (pubDlg?.open) {
      reopenId = "afPublicationDialog";
      const fd = new FormData(pubDlg.querySelector("form"));
      const item = { ...(editingPublication || {}), id: editingPublication?.id || uuid() };
      fd.forEach((val, key) => { item[key] = n(val); });
      editingPublication = item;
    }

    const topicForm = el("afTopicInlineForm");
    if (topicForm && editingTopic !== null) {
      reopenId = "topics-inline";
      const fd = new FormData(topicForm);
      const item = {
        ...(editingTopic || {}),
        id: editingTopic?.id || uuid(),
        related_publication_ids: [...topicForm.querySelector("[name=related_publication_ids]")?.selectedOptions || []].map((o) => o.value)
      };
      fd.forEach((val, key) => {
        if (key === "related_publication_ids") return;
        item[key] = n(val);
      });
      editingTopic = item;
    }

    const journalDlg = el("afJournalDialog");
    if (journalDlg?.open) {
      reopenId = "afJournalDialog";
      const fd = new FormData(journalDlg.querySelector("form"));
      const item = { ...(editingJournal || {}), id: editingJournal?.id || uuid() };
      fd.forEach((val, key) => { item[key] = n(val); });
      editingJournal = item;
    }

    const projectDlg = el("afProjectDialog");
    if (projectDlg?.open) {
      reopenId = "afProjectDialog";
      const fd = new FormData(projectDlg.querySelector("form"));
      const item = { ...(editingProject || {}), id: editingProject?.id || uuid() };
      fd.forEach((val, key) => { item[key] = n(val); });
      editingProject = item;
    }

    return reopenId;
  }

  function ensureRenderShell(root) {
    if (!el("articleFactoryMain")) {
      root.innerHTML = `<div id="articleFactoryMain"></div><div id="articleFactoryDialogs"></div>`;
    }
  }

  function armAfDialog(dlg, onCancel) {
    if (!dlg) return;
    dlg.addEventListener("cancel", (e) => {
      if (!dlg.dataset.afAllowClose) {
        e.preventDefault();
        return;
      }
      delete dlg.dataset.afAllowClose;
      onCancel?.();
    });
    dlg.querySelector("[data-af-cancel]")?.addEventListener("click", () => {
      dlg.dataset.afAllowClose = "1";
      onCancel?.();
      dlg.close("cancel");
    });
    dlg.querySelector("form")?.addEventListener("submit", () => {
      dlg.dataset.afAllowClose = "1";
    });
  }

  function cleanJournalIssn(value) {
    const v = n(value);
    return /^n\/a$/i.test(v) ? "" : v;
  }

  function detectJcrJournalExport(text) {
    return /Journal name,.*JIF Quartile/i.test(text);
  }

  function normalizeJournalImportText(text) {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex((ln) => /^"?Journal name"?/i.test(ln.trim()));
    if (idx < 0) return text;
    return lines.slice(idx)
      .filter((ln) => !/Copyright \(c\)/i.test(ln) && !/Terms of Use/i.test(ln))
      .join("\n");
  }

  function journalImportDedupeKey(item) {
    const issn = cleanJournalIssn(item.issn);
    const eissn = cleanJournalIssn(item.eissn);
    return (issn || eissn || l(item.journal_title)).replace(/\s/g, "");
  }

  function mergeJournalImportRows(existing, incoming) {
    const cats = [existing.wos_category, incoming.wos_category]
      .flatMap((v) => n(v).split(";"))
      .map((v) => v.trim())
      .filter(Boolean);
    existing.wos_category = [...new Set(cats)].join("; ");
    if (!n(existing.ais_rank_info) && n(incoming.ais_rank_info)) existing.ais_rank_info = incoming.ais_rank_info;
    if (!n(existing.open_access_info) && n(incoming.open_access_info)) existing.open_access_info = incoming.open_access_info;
    if (!n(existing.scope) && n(incoming.scope)) existing.scope = incoming.scope;
    return existing;
  }

  function dedupeJournalImportRows(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!n(row.journal_title)) return;
      const key = journalImportDedupeKey(row);
      if (!key) return;
      if (map.has(key)) map.set(key, mergeJournalImportRows(map.get(key), row));
      else map.set(key, { ...row });
    });
    return [...map.values()];
  }

  function buildJcrAisRankInfo(raw) {
    const parts = [];
    const jif = n(raw["2025 JIF"]);
    const jifRank = n(raw["JIF Rank"]);
    const fiveJif = n(raw["5 Year JIF"]);
    const aisQ = n(raw["AIS Quartile"]);
    const aisRank = n(raw["AIS Rank"]);
    if (jif) parts.push(`JIF ${jif}`);
    if (jifRank) parts.push(`JIF rank ${jifRank}`);
    if (fiveJif && !/^n\/a$/i.test(fiveJif)) parts.push(`5y JIF ${fiveJif}`);
    if (aisQ && aisRank && !/^n\/a$/i.test(aisRank)) parts.push(`AIS ${aisQ} ${aisRank}`);
    else if (aisQ && !/^n\/a$/i.test(aisQ)) parts.push(`AIS ${aisQ}`);
    return parts.join("; ");
  }

  function buildJcrJournalNotes(raw) {
    const parts = ["JCR 2025 Q1 export"];
    const abbr = n(raw["JCR Abbreviation"]);
    const jci = n(raw["2025 JCI"]);
    if (abbr) parts.push(`Abbrev: ${abbr}`);
    if (jci) parts.push(`JCI ${jci}`);
    return `${parts.join(". ")}.`;
  }

  function rowsFromJcrJournalExport(text) {
    const normalized = normalizeJournalImportText(text);
    const lines = normalized.split(/\r?\n/).filter((ln) => n(ln));
    if (!lines.length) return [];
    const delimiter = detectDelimiter(lines[0]);
    const grid = parseCsvRecords(normalized, delimiter);
    if (grid.length < 2) return [];
    const headers = grid[0].map((h) => n(h).replace(/^\uFEFF/, ""));
    const rows = [];
    for (let i = 1; i < grid.length; i += 1) {
      const raw = {};
      headers.forEach((h, idx) => { raw[h] = grid[i][idx] ?? ""; });
      const title = n(raw["Journal name"]);
      if (!title) continue;
      const issn = cleanJournalIssn(raw.ISSN);
      const eissn = cleanJournalIssn(raw.eISSN);
      const oa = n(raw["% of Citable OA"]);
      const edition = n(raw.Edition);
      rows.push({
        journal_title: title,
        publisher: n(raw.Publisher),
        issn,
        eissn,
        wos_category: n(raw.Category),
        quartile: n(raw["JIF Quartile"]),
        ais_rank_info: buildJcrAisRankInfo(raw),
        scope: edition,
        open_access_info: [oa ? `${oa} citable OA` : "", edition].filter(Boolean).join("; "),
        publication_fee: "",
        submission_url: "",
        author_guidelines_url: "",
        notes: buildJcrJournalNotes(raw)
      });
    }
    return dedupeJournalImportRows(rows);
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

  function normalizeImportHeader(value) {
    return n(value)
      .replace(/^\uFEFF/, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function foldCs(value) {
    return normalizeImportHeader(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getImportField(row, aliases, field) {
    const keys = aliases[field] || [field];
    const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeImportHeader(k), v]);
    for (const key of keys) {
      if (row[key] != null && n(row[key])) return n(row[key]);
      const hit = Object.keys(row).find((k) => l(k) === l(key));
      if (hit && n(row[hit])) return n(row[hit]);
      const norm = normalizeImportHeader(key);
      const normHit = normalizedEntries.find(([k]) => k === norm);
      if (normHit && n(normHit[1])) return n(normHit[1]);
      const prefixHit = normalizedEntries.find(([k]) => k.startsWith(norm) || norm.startsWith(k));
      if (prefixHit && n(prefixHit[1])) return n(prefixHit[1]);
    }
    return "";
  }

  function normalizeTopicImportStatus(raw) {
    const folded = foldCs(raw).replace(/\s+/g, "_");
    if (TOPIC_STATUS_IMPORT_MAP[folded]) return TOPIC_STATUS_IMPORT_MAP[folded];
    if (TOPIC_STATUSES.includes(raw)) return raw;
    return "idea";
  }

  function resolvePublicationIdsFromText(text) {
    if (!n(text)) return [];
    const parts = text.split(/;/).map((part) => n(part)).filter(Boolean);
    const ids = [];
    parts.forEach((part) => {
      const lp = l(part);
      const hit = publications.find((p) => {
        const lt = l(p.title);
        return lt === lp || lt.includes(lp) || lp.includes(lt);
      });
      if (hit && !ids.includes(hit.id)) ids.push(hit.id);
    });
    return ids;
  }

  function finalizeTopicImportRow(row) {
    const item = { ...row };
    if (!n(item.title) && n(item.working_title)) item.title = item.working_title;
    delete item.working_title;
    item.priority = Number(String(item.priority).replace(/[^\d]/g, "")) || 3;
    item.status = normalizeTopicImportStatus(item.status);
    const relatedText = item.related_publications_text;
    delete item.related_publications_text;
    item.related_publication_ids = resolvePublicationIdsFromText(relatedText);
    return item;
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

  async function loadData(options = {}) {
    if (loading) return;
    if (!options.force && isDataEntryActive()) return;
    loading = true;
    try {
      const canProbe = window.kbSupabaseArticleFactory?.probeTables;
      useSupabase = canProbe ? await window.kbSupabaseArticleFactory.probeTables() : false;
      if (useSupabase && await ensureAuth()) {
        const data = await window.kbSupabaseArticleFactory.loadAll();
        publications = data.publications || [];
        topics = data.topics || [];
        journals = data.journals || [];
        projects = data.projects || [];
        versions = data.versions || [];
        reviews = data.reviews || [];
        pipelineRuns = data.pipelineRuns || [];
        if (!selectedProjectId && projects.length) selectedProjectId = projects[0].id;
        persistLocal();
        setStatus(`Načteno: ${publications.length} publ., ${topics.length} témat, ${journals.length} čas., ${projects.length} projektů.`);
      } else {
        const local = window.kbSupabaseArticleFactory?.loadLocal?.() || {};
        publications = local.publications || [];
        topics = local.topics || [];
        journals = local.journals || [];
        projects = local.projects || [];
        versions = local.versions || [];
        reviews = local.reviews || [];
        pipelineRuns = local.pipelineRuns || [];
        if (!selectedProjectId && projects.length) selectedProjectId = projects[0].id;
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

  async function saveTopic(item, options = {}) {
    if (!n(item.title)) {
      if (!options.silent) setStatus("Název tématu je povinný.", true);
      return false;
    }
    item.source_key = item.source_key || makeTopicSourceKey(item);
    item.priority = Number(item.priority) || 3;
    if (!TOPIC_STATUSES.includes(item.status)) item.status = "idea";
    try {
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
      if (!options.silent) {
        setStatus("Téma uloženo.");
        render();
      }
      return true;
    } catch (err) {
      console.error(err);
      if (!options.silent) setStatus(`Uložení tématu selhalo: ${err.message || err}`, true);
      return false;
    }
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

  async function saveProject(item) {
    if (!n(item.working_title) && !item.topic_id) {
      setStatus("Projekt potřebuje název nebo téma.", true);
      return;
    }
    if (!item.working_title && item.topic_id) {
      item.working_title = topicTitle(item.topic_id);
    }
    const checklist = item.revision_checklist?.length
      ? item.revision_checklist
      : (window.kbArticleFactoryTypes?.REVISION_CHECKLIST || []).map((c) => ({ ...c, checked: false }));
    item.revision_checklist = checklist;
    item.is_ai_assisted = true;
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseArticleFactory.upsertProject(item);
      const idx = projects.findIndex((p) => p.id === saved.id);
      if (idx >= 0) projects[idx] = saved;
      else projects.push(saved);
      selectedProjectId = saved.id;
    } else {
      if (!item.id) item.id = uuid();
      item.__existing = true;
      const idx = projects.findIndex((p) => p.id === item.id);
      if (idx >= 0) projects[idx] = item;
      else projects.push(item);
      selectedProjectId = item.id;
    }
    persistLocal();
    setStatus("Projekt uložen.");
    render();
  }

  async function runPipelineForProject(projectId) {
    if (!projectId) {
      setStatus("Vyberte projekt.", true);
      return;
    }
    if (!useSupabase) {
      setStatus("Pipeline vyžaduje Supabase a nasazenou Edge Function.", true);
      return;
    }
    pipelineLoading = true;
    render();
    try {
      setStatus("Spouštím AI pipeline (8 rolí)… může trvat několik minut.");
      const result = await window.kbArticlePipeline.runPipeline(projectId);
      lastPipelineResult = result;
      await loadData();
      setStatus(`Pipeline dokončena. Run ID: ${result.run_id || "—"}. Vyžaduje lidskou revizi.`);
      activeView = "manuscript";
    } catch (err) {
      setStatus(`Pipeline selhala: ${err.message || err}`, true);
    } finally {
      pipelineLoading = false;
      render();
    }
  }

  async function markHumanReviewed() {
    const project = getSelectedProject();
    if (!project) return;
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseArticleFactory.markHumanReviewed(project.id);
      const idx = projects.findIndex((p) => p.id === saved.id);
      if (idx >= 0) projects[idx] = saved;
    } else {
      project.human_reviewed_at = new Date().toISOString();
      project.status = "ready_for_submission";
    }
    persistLocal();
    setStatus("Projekt označen jako lidsky zkontrolován.");
    render();
  }

  async function syncFromVystupy() {
    const vystupy = (window.kbVystupy?.getVystupy?.() || [])
      .filter((v) => v.typ_vystupu === "Jimp" || v.typ_vystupu === "JSC");
    if (!vystupy.length) {
      setStatus("Modul Výstupy nemá žádné články Jimp/JSC k synchronizaci.", true);
      return;
    }
    const existingKeys = new Set(publications.map((p) => l(p.source_key)));
    const existingVystupIds = new Set(publications.filter((p) => p.vystup_id).map((p) => p.vystup_id));
    let added = 0;
    let skipped = 0;
    for (const v of vystupy) {
      if (existingVystupIds.has(v.id)) { skipped += 1; continue; }
      const item = {
        title: v.nazev || "Bez názvu",
        authors: v.autor || "",
        authors_osobni_cislo: v.autor_osobni_cislo || null,
        year: v.rok || null,
        journal_or_publisher: v.casopis || "",
        doi: v.doi || "",
        issn: v.issn || "",
        vystup_id: v.id,
        vystup_type: v.typ_vystupu,
        notes: v.poznamka || "",
        imported_at: new Date().toISOString(),
        source_key: `vystup:${v.typ_vystupu}:${v.id}`
      };
      if (existingKeys.has(l(item.source_key))) { skipped += 1; continue; }
      await savePublication({ ...item, id: uuid(), __existing: false });
      existingKeys.add(l(item.source_key));
      added += 1;
    }
    setStatus(`Sync z Výstupů: ${added} nových, ${skipped} přeskočeno (duplicita).`);
    await loadData();
  }

  function detectTopicFormCsv(text) {
    const sample = text.slice(0, 4000).toLowerCase();
    return sample.includes("nové téma") || sample.includes("nove tema")
      ? sample.includes("popis") && (sample.includes("název") || sample.includes("nazev"))
      : false;
  }

  async function importFile(file, type) {
    const text = await file.text();
    if (type === "publications" && detectTopicFormCsv(text)) {
      setStatus("Tento soubor je pro záložku Témata článků (má sloupce Nové téma / Popis). Přepínám import témat…", true);
      type = "topics";
      activeView = "topics";
    }
    let rows;
    if (type === "journals" && detectJcrJournalExport(text)) {
      rows = rowsFromJcrJournalExport(text);
    } else {
      const importText = type === "journals" ? normalizeJournalImportText(text) : text;
      rows = rowsFromDelimitedText(importText, type === "publications"
        ? PUBLICATION_IMPORT_ALIASES
        : type === "topics" ? TOPIC_IMPORT_ALIASES : JOURNAL_IMPORT_ALIASES);
      if (type === "journals") rows = dedupeJournalImportRows(rows);
    }
    if (!rows.length) {
      setStatus("Import neobsahuje žádné řádky.", true);
      return;
    }
    let count = 0;
    let skipped = 0;
    const errors = [];
    for (const row of rows) {
      try {
      if (type === "publications" && !n(row.title)) { skipped += 1; continue; }
      if (type === "topics") {
        const topicRow = finalizeTopicImportRow(row);
        if (!n(topicRow.title)) { skipped += 1; continue; }
        const item = {
          id: uuid(),
          __existing: false,
          imported_at: new Date().toISOString(),
          ...topicRow
        };
        item.source_key = makeTopicSourceKey(item);
        const saved = await saveTopic(item, { silent: true });
        if (saved) count += 1;
        else {
          skipped += 1;
          errors.push(topicRow.title.slice(0, 80));
        }
        continue;
      }
      if (type === "journals" && !n(row.journal_title)) { skipped += 1; continue; }
      const item = {
        id: uuid(),
        __existing: false,
        imported_at: new Date().toISOString(),
        ...row
      };
      if (type === "publications") {
        item.source_key = makePublicationSourceKey(item);
        await savePublication(item);
      } else {
        item.source_key = makeJournalSourceKey(item);
        await saveJournal(item);
      }
      count += 1;
      } catch (err) {
        skipped += 1;
        errors.push(err.message || String(err));
        console.error("Import row failed:", err);
      }
    }
    if (type === "topics") activeView = "topics";
    const errMsg = errors.length ? ` Chyby: ${errors.slice(0, 2).join(" | ")}` : "";
    const skipMsg = skipped ? `, ${skipped} přeskočeno` : "";
    setStatus(
      count
        ? `Import dokončen: ${count} záznamů${skipMsg}.${type === "topics" ? " Záložka Témata článků." : ""}`
        : `Import selhal: 0 záznamů${skipMsg}.${errMsg || " Zkontrolujte formát souboru a záložku."}`,
      !count
    );
    await loadData({ force: true });
  }

  async function deleteItem(type, id) {
    if (!confirm("Opravdu smazat tento záznam?")) return;
    if (useSupabase && await ensureAuth()) {
      if (type === "publications") await window.kbSupabaseArticleFactory.deletePublication(id);
      else if (type === "topics") await window.kbSupabaseArticleFactory.deleteTopic(id);
      else if (type === "projects") await window.kbSupabaseArticleFactory.deleteProject(id);
      else await window.kbSupabaseArticleFactory.deleteJournal(id);
    }
    if (type === "publications") publications = publications.filter((p) => p.id !== id);
    else if (type === "topics") topics = topics.filter((t) => t.id !== id);
    else if (type === "projects") {
      projects = projects.filter((p) => p.id !== id);
      versions = versions.filter((v) => v.article_project_id !== id);
      reviews = reviews.filter((r) => r.article_project_id !== id);
      if (selectedProjectId === id) selectedProjectId = projects[0]?.id || "";
    } else journals = journals.filter((j) => j.id !== id);
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
      <dialog id="afPublicationDialog" class="afDialog" closedby="none">
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
            <button type="submit" class="btn primary" value="confirm">Uložit</button>
          </div>
        </form>
      </dialog>`;
  }

  function renderTopicInlineForm() {
    if (editingTopic === null) return "";
    const t = editingTopic || {};
    const pubOptions = publications.map((p) =>
      `<option value="${html(p.id)}" ${(t.related_publication_ids || []).includes(p.id) ? "selected" : ""}>${html(p.title)}</option>`
    ).join("");
    const statusOptions = TOPIC_STATUSES.map((s) =>
      `<option value="${s}" ${t.status === s ? "selected" : ""}>${statusLabel(s)}</option>`
    ).join("");
    return `
      <section id="afTopicInlineForm" class="afInlinePanel">
        <h3>${t.id ? "Upravit téma" : "Nové téma"}</h3>
        <form class="afInlineForm">
          <label>Název *<input name="title" value="${html(t.title)}" required></label>
          <label>Popis<textarea name="description" rows="3">${html(t.description)}</textarea></label>
          <label>Výzkumná oblast<input name="research_area" value="${html(t.research_area)}"></label>
          <label>Možná metodologie<textarea name="possible_methodology" rows="2">${html(t.possible_methodology)}</textarea></label>
          <label>Cílový WoS obor<input name="target_wos_category" value="${html(t.target_wos_category)}"></label>
          <label>Očekávaný přínos<textarea name="expected_contribution" rows="2">${html(t.expected_contribution)}</textarea></label>
          <div class="afInlineFormRow">
            <label>Priorita (1–5)<input name="priority" type="number" min="1" max="5" value="${html(t.priority || 3)}"></label>
            <label>Status<select name="status">${statusOptions}</select></label>
          </div>
          <label>Související publikace<select name="related_publication_ids" multiple size="4">${pubOptions}</select></label>
          <label>Poznámky<textarea name="notes" rows="2">${html(t.notes)}</textarea></label>
          <div class="afDialogActions">
            <button type="button" class="btn secondary" data-af-cancel-topic>Zrušit</button>
            <button type="submit" class="btn primary">Uložit téma</button>
          </div>
        </form>
      </section>`;
  }

  function renderJournalDialog() {
    const j = editingJournal || {};
    return `
      <dialog id="afJournalDialog" class="afDialog" closedby="none">
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
            <button type="submit" class="btn primary" value="confirm">Uložit</button>
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
        <button type="button" class="btn" data-af-sync-vystupy>Sync z Výstupů</button>
        <label class="btn">Import TSV/CSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-pub></label>
      </div>
      <p class="hint">Import: TSV nebo CSV se sloupci <code>Název</code>, <code>Autoři</code>, <code>Rok</code>, <code>Časopis</code>, <code>DOI</code>, <code>Metodologie</code>, <code>Hlavní zjištění</code> (volitelně <code>Abstrakt</code>, <code>Klíčová slova</code>, <code>Poznámka</code>). Autoři oddělte středníkem. Vzor: <code>data/article-publications-import.template.tsv</code> nebo prázdná šablona <code>data/article-publications-import.blank.tsv</code>.</p>
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
          ${projectForTopic(t.id)
            ? `<span class="afTag">projekt</span>`
            : `<button type="button" class="btn small primary" data-af-new-project-from-topic="${html(t.id)}">→ Projekt</button>`}
          <button type="button" class="btn small" data-af-edit-topic="${html(t.id)}">Upravit</button>
          <button type="button" class="btn small danger" data-af-del-topic="${html(t.id)}">Smazat</button>
        </td>
      </tr>`).join("");
    return `
      <div class="afToolbar">
        <button type="button" class="btn primary" data-af-new-topic>+ Téma</button>
        <label class="btn">Import TSV/CSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-topic></label>
        <button type="button" class="btn" data-af-goto-projects>→ Projekty</button>
      </div>
      <p class="hint">Formulář tématu je přímo na stránce (ne vyskakovací okno). Projekt vytvoříte v záložce <strong>Projekt a pipeline → Projekty</strong>.</p>
      ${renderTopicInlineForm()}
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
        <label class="btn">Import TSV/CSV<input type="file" accept=".tsv,.csv,.txt" hidden data-af-import-journal></label>
        <a href="#casopisy" class="btn">Databáze časopisů (JCR)</a>
      </div>
      <p class="hint">Import: vlastní TSV/CSV nebo přímo export z JCR (<code>Journal name</code>, <code>ISSN</code>, <code>Category</code>, <code>JIF Quartile</code>). Připravený soubor: <code>data/article-journals-import.jcr-q1-2025.tsv</code> — 183 Q1 časopisů (BUSINESS; IS; LIS), duplicitní kategorie sloučeny.</p>
      <div class="afTableWrap">
        <table class="afTable">
          <thead><tr><th>Časopis</th><th>ISSN</th><th>Obor</th><th>Kvartil</th><th>Ověřeno</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="afEmpty">Zatím žádné cílové časopisy.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderProjectsView() {
    const rows = projects.map((p) => `
      <tr class="${p.id === selectedProjectId ? "afRowSelected" : ""}">
        <td><strong>${html(p.working_title || "Bez názvu")}</strong></td>
        <td>${html(topicTitle(p.topic_id))}</td>
        <td>${html(journalTitle(p.target_journal_id))}</td>
        <td><span class="afStatus">${html(p.status)}</span></td>
        <td class="afActions">
          <button type="button" class="btn small" data-af-select-project="${html(p.id)}">Vybrat</button>
          <button type="button" class="btn small" data-af-edit-project="${html(p.id)}">Upravit</button>
          <button type="button" class="btn small danger" data-af-del-project="${html(p.id)}">Smazat</button>
        </td>
      </tr>`).join("");
    return `
      <div class="afToolbar">
        <button type="button" class="btn primary" data-af-new-project>+ Projekt</button>
      </div>
      <p class="hint">Zde propojíte <strong>téma</strong> s <strong>cílovým časopisem</strong> a spustíte pipeline. Tlačítko Projekty je v řádku záložek <strong>Projekt a pipeline</strong> (hned pod Knihovnou).</p>
      <div class="afTableWrap">
        <table class="afTable">
          <thead><tr><th>Název</th><th>Téma</th><th>Časopis</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="afEmpty">Zatím žádné projekty — vytvořte z tématu.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderProjectDialog() {
    const p = editingProject || {};
    const topicOpts = topics.map((t) => `<option value="${html(t.id)}" ${p.topic_id === t.id ? "selected" : ""}>${html(t.title)}</option>`).join("");
    const journalOpts = journals.map((j) => `<option value="${html(j.id)}" ${p.target_journal_id === j.id ? "selected" : ""}>${html(j.journal_title)}</option>`).join("");
    return `
      <dialog id="afProjectDialog" class="afDialog" closedby="none">
        <form method="dialog" class="afDialogForm">
          <h3>${p.id ? "Upravit projekt" : "Nový publikační projekt"}</h3>
          <label>Téma<select name="topic_id"><option value="">—</option>${topicOpts}</select></label>
          <label>Pracovní název<input name="working_title" value="${html(p.working_title)}"></label>
          <label>Cílový časopis<select name="target_journal_id"><option value="">—</option>${journalOpts}</select></label>
          <label>Výzkumná otázka<textarea name="research_question" rows="2">${html(p.research_question)}</textarea></label>
          <label>Hypotéza / cíl<textarea name="hypothesis_or_objective" rows="2">${html(p.hypothesis_or_objective)}</textarea></label>
          <label>Interní deadline<input name="deadline_internal" type="date" value="${html(p.deadline_internal || "")}"></label>
          <div class="afDialogActions">
            <button type="button" class="btn secondary" data-af-cancel>Zrušit</button>
            <button type="submit" class="btn primary" value="confirm">Uložit</button>
          </div>
        </form>
      </dialog>`;
  }

  function renderPipelineView() {
    const project = getSelectedProject();
    const ps = pipelineStatus || {};
    const runs = pipelineRuns.filter((r) => r.article_project_id === project?.id).slice(-3);
    const noProjects = !projects.length;
    return `
      <div class="afPlaceholder">
        <p><strong>AI publikační pipeline</strong> — 8 rolí, výstup vždy jako draft.</p>
        ${noProjects ? `
          <div class="afCallout">
            <p><strong>Zatím nemáte žádný projekt</strong></p>
            <p class="hint">Projekt propojí <strong>téma</strong> s <strong>cílovým časopisem</strong> (např. ESWA). Vytvořte ho v záložce <strong>Projekty</strong> nebo u tématu tlačítkem <strong>→ Projekt</strong>.</p>
            <button type="button" class="btn primary" data-af-goto-projects>+ Vytvořit projekt</button>
          </div>` : ""}
        ${!noProjects && project ? `<p>Aktivní projekt: <strong>${html(project.working_title)}</strong> (${html(project.status)})</p>` : ""}
        ${!noProjects && !project ? `<p class="afError">Vyberte projekt v seznamu níže nebo v záložce Projekty.</p>` : ""}
        <div class="afToolbar">
          <select data-af-project-select class="afSearch">${projects.map((p) => `<option value="${html(p.id)}" ${p.id === selectedProjectId ? "selected" : ""}>${html(p.working_title)}</option>`).join("")}</select>
          <button type="button" class="btn" data-af-pipeline-ping>Test Edge Function</button>
          <button type="button" class="btn primary" data-af-run-pipeline ${!project || pipelineLoading ? "disabled" : ""}>${pipelineLoading ? "Pipeline běží…" : "Spustit pipeline"}</button>
        </div>
        ${lastPipelineResult ? `<pre class="afPre">${html(JSON.stringify(lastPipelineResult, null, 2).slice(0, 4000))}</pre>` : ""}
        ${runs.length ? `<h4>Poslední běhy</h4><ul>${runs.map((r) => `<li>${html(r.status)} — ${html(r.summary || "")} (${html(r.created_at)})</li>`).join("")}</ul>` : ""}
        ${ps.ok ? `<p class="hint">Edge Function OK (fáze ${ps.phase || "mvp"})</p>` : ""}
        ${ps.error ? `<p class="afError">${html(ps.error)}</p>` : ""}
      </div>`;
  }

  function renderManuscriptView() {
    const project = getSelectedProject();
    if (!project) return `<div class="afEmpty">Vyberte projekt v záložce Projekty nebo Pipeline.</div>`;
    const version = getCurrentVersion(project);
    if (!version) return `<div class="afEmpty">Zatím žádná verze rukopisu — spusťte pipeline.</div>`;
    const sections = window.kbArticleFactoryTypes?.MANUSCRIPT_SECTIONS || [];
    const sectionHtml = sections.map(({ key, label }) => {
      const body = n(version[key]);
      if (!body) return "";
      return `<details class="afSection" open><summary>${html(label)}</summary><div class="afSectionBody">${html(body)}</div></details>`;
    }).join("");
    return `
      <div class="afManuscript">
        <h3>${html(version.title || project.working_title)} <span class="afTag">v${version.version_number} DRAFT</span></h3>
        <p class="hint">Model: ${html(version.model_used || "—")} · Role: ${html(version.created_by_role || "—")}</p>
        ${sectionHtml || `<pre class="afPre">${html(version.full_text_markdown || "")}</pre>`}
        <h4>Factual Basis</h4>
        <pre class="afPre">${html(JSON.stringify(version.factual_basis || {}, null, 2))}</pre>
        <h4>Human Work Needed</h4>
        <pre class="afPre">${html(JSON.stringify(version.human_work_needed || [], null, 2))}</pre>
      </div>`;
  }

  function renderReviewView() {
    const project = getSelectedProject();
    if (!project) return `<div class="afEmpty">Vyberte projekt.</div>`;
    const projectReviews = getProjectReviews(project.id);
    const cards = projectReviews.map((r) => `
      <article class="afReviewCard">
        <h4>${html(r.ai_role)}</h4>
        ${r.strengths ? `<p><strong>Strengths:</strong> ${html(r.strengths)}</p>` : ""}
        ${r.weaknesses ? `<p><strong>Weaknesses:</strong> ${html(r.weaknesses)}</p>` : ""}
        ${r.factual_risks ? `<p><strong>Factual risks:</strong> ${html(r.factual_risks)}</p>` : ""}
        ${r.methodological_risks ? `<p><strong>Methodological risks:</strong> ${html(r.methodological_risks)}</p>` : ""}
        ${r.journal_fit_assessment ? `<p><strong>Journal fit:</strong> ${html(r.journal_fit_assessment)}</p>` : ""}
      </article>`).join("");
    const checklist = project.revision_checklist?.length
      ? project.revision_checklist
      : (window.kbArticleFactoryTypes?.REVISION_CHECKLIST || []).map((c) => ({ ...c, checked: false }));
    const checklistHtml = checklist.map((item, idx) => `
      <label class="afCheckItem"><input type="checkbox" data-af-check-idx="${idx}" ${item.checked ? "checked" : ""}> ${html(item.question)}</label>`).join("");
    return `
      <div class="afReview">
        <h3>AI Review panel</h3>
        ${cards || `<p class="afEmpty">Zatím žádné AI recenze — spusťte pipeline.</p>`}
        <h3>Checklist před lidskou revizí</h3>
        <div class="afChecklist">${checklistHtml}</div>
        <div class="afToolbar">
          <button type="button" class="btn primary" data-af-mark-reviewed>Označit jako lidsky zkontrolováno</button>
        </div>
      </div>`;
  }

  function renderExportView() {
    const project = getSelectedProject();
    if (!project) return `<div class="afEmpty">Vyberte projekt.</div>`;
    const version = getCurrentVersion(project);
    if (!version) return `<div class="afEmpty">Chybí verze rukopisu k exportu.</div>`;
    const canExport = !!project.human_reviewed_at;
    return `
      <div class="afExport">
        <h3>Export Markdown</h3>
        <p class="hint">Doporučeno exportovat až po lidské revizi. DOCX export: TODO.</p>
        <p>Human reviewed: ${project.human_reviewed_at ? new Date(project.human_reviewed_at).toLocaleString("cs-CZ") : "ne"}</p>
        <div class="afToolbar">
          <button type="button" class="btn primary" data-af-export-md ${!canExport ? "" : ""}>Stáhnout Markdown</button>
          ${!canExport ? `<span class="hint">Export je možný i bez revize — obsahuje DRAFT watermark.</span>` : ""}
        </div>
      </div>`;
  }

  function renderTabsHtml() {
    return VIEW_GROUPS.map((group) => `
      <div class="afTabGroup">
        <div class="afTabGroupLabel">${html(group.label)}</div>
        <div class="afTabRow">
          ${group.items.map((v) =>
            `<button type="button" class="afTab ${activeView === v.id ? "active" : ""}" data-af-view="${v.id}">${v.icon} ${html(v.label)}</button>`
          ).join("")}
        </div>
      </div>`).join("");
  }

  function renderPlaceholder(title, desc) {
    return `<div class="afPlaceholder"><h3>${html(title)}</h3><p>${html(desc)}</p><p class="hint">Dostupné od Fáze 2–3.</p></div>`;
  }

  function renderContent() {
    if (activeView === "publications") return renderPublicationsView();
    if (activeView === "topics") return renderTopicsView();
    if (activeView === "journals") return renderJournalsView();
    if (activeView === "projects") return renderProjectsView();
    if (activeView === "pipeline") return renderPipelineView();
    if (activeView === "manuscript") return renderManuscriptView();
    if (activeView === "review") return renderReviewView();
    return renderExportView();
  }

  function bindDialogs() {
    const pubDlg = el("afPublicationDialog");
    if (pubDlg) {
      armAfDialog(pubDlg, () => { editingPublication = null; });
      pubDlg.addEventListener("close", async () => {
        if (pubDlg.returnValue !== "confirm" && pubDlg.returnValue !== "default") return;
        const fd = new FormData(pubDlg.querySelector("form"));
        const item = { ...(editingPublication || {}), id: editingPublication?.id || uuid(), __existing: !!editingPublication?.id };
        fd.forEach((val, key) => { item[key] = n(val); });
        await savePublication(item);
        editingPublication = null;
      });
    }

    const journalDlg = el("afJournalDialog");
    if (journalDlg) {
      armAfDialog(journalDlg, () => { editingJournal = null; });
      journalDlg.addEventListener("close", async () => {
        if (journalDlg.returnValue !== "confirm" && journalDlg.returnValue !== "default") return;
        const fd = new FormData(journalDlg.querySelector("form"));
        const item = { ...(editingJournal || {}), id: editingJournal?.id || uuid(), __existing: !!editingJournal?.id };
        fd.forEach((val, key) => { item[key] = n(val); });
        await saveJournal(item);
        editingJournal = null;
      });
    }

    const projectDlg = el("afProjectDialog");
    if (projectDlg) {
      armAfDialog(projectDlg, () => { editingProject = null; });
      projectDlg.addEventListener("close", async () => {
        if (projectDlg.returnValue !== "confirm" && projectDlg.returnValue !== "default") return;
        const fd = new FormData(projectDlg.querySelector("form"));
        const item = { ...(editingProject || {}), id: editingProject?.id || uuid(), __existing: !!editingProject?.id, status: editingProject?.status || "planning" };
        fd.forEach((val, key) => { item[key] = n(val); });
        await saveProject(item);
        editingProject = null;
      });
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

    root.querySelector("[data-af-reload]")?.addEventListener("click", () => loadData({ force: true }));
    root.querySelector("[data-af-pipeline-ping]")?.addEventListener("click", () => checkPipeline());
    root.querySelector("[data-af-run-pipeline]")?.addEventListener("click", () => runPipelineForProject(selectedProjectId));
    root.querySelector("[data-af-project-select]")?.addEventListener("change", (e) => {
      selectedProjectId = e.target.value;
      render();
    });
    root.querySelector("[data-af-sync-vystupy]")?.addEventListener("click", () => syncFromVystupy());

    root.querySelector("[data-af-new-project]")?.addEventListener("click", () => {
      editingProject = { revision_checklist: window.kbArticleFactoryTypes?.REVISION_CHECKLIST?.map((c) => ({ ...c, checked: false })) };
      render();
      el("afProjectDialog")?.showModal();
    });
    root.querySelectorAll("[data-af-edit-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingProject = projects.find((p) => p.id === btn.dataset.afEditProject) || {};
        render();
        el("afProjectDialog")?.showModal();
      });
    });
    root.querySelectorAll("[data-af-select-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedProjectId = btn.dataset.afSelectProject;
        setStatus("Projekt vybrán.");
        render();
      });
    });
    root.querySelectorAll("[data-af-del-project]").forEach((btn) => {
      btn.addEventListener("click", () => deleteItem("projects", btn.dataset.afDelProject));
    });

    root.querySelector("[data-af-mark-reviewed]")?.addEventListener("click", () => markHumanReviewed());
    root.querySelector("[data-af-export-md]")?.addEventListener("click", () => {
      const project = getSelectedProject();
      const version = getCurrentVersion(project);
      if (!version) return;
      window.kbArticleFactoryExport?.exportVersion?.(version, project, getProjectReviews(project.id));
      setStatus("Markdown export stažen.");
    });

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
      activeView = "topics";
      render();
      el("afTopicInlineForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    root.querySelectorAll("[data-af-edit-topic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingTopic = topics.find((t) => t.id === btn.dataset.afEditTopic) || {};
        activeView = "topics";
        render();
        el("afTopicInlineForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    root.querySelectorAll("[data-af-goto-projects]").forEach((btn) => {
      btn.addEventListener("click", () => gotoProjectsView());
    });
    root.querySelectorAll("[data-af-new-project-from-topic]").forEach((btn) => {
      btn.addEventListener("click", () => openNewProjectFromTopic(btn.dataset.afNewProjectFromTopic));
    });
    root.querySelector("#afTopicInlineForm form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      const item = {
        ...(editingTopic || {}),
        id: editingTopic?.id || uuid(),
        __existing: !!editingTopic?.id,
        related_publication_ids: []
      };
      fd.forEach((val, key) => {
        if (key === "related_publication_ids") return;
        item[key] = n(val);
      });
      item.related_publication_ids = [...form.querySelector("[name=related_publication_ids]")?.selectedOptions || []].map((o) => o.value);
      item.priority = Number(item.priority) || 3;
      item.status = normalizeTopicImportStatus(item.status);
      if (await saveTopic(item, { silent: true })) {
        editingTopic = null;
        setStatus("Téma uloženo.");
        render();
      }
    });
    root.querySelector("[data-af-cancel-topic]")?.addEventListener("click", () => {
      editingTopic = null;
      render();
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
    const existing = el("articleFactoryStyles");
    if (existing?.dataset?.theme === "dark-v4") return;
    if (existing) existing.remove();
    const style = document.createElement("style");
    style.id = "articleFactoryStyles";
    style.dataset.theme = "dark-v4";
    style.textContent = `
      #page-article-factory .afModule {
        padding: 0 0 2rem;
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afModule .hint {
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afTabs {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-bottom: 1rem;
      }
      #page-article-factory .afTabGroup {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      #page-article-factory .afTabGroupLabel {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afTabRow {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      #page-article-factory .afTab {
        border: 1px solid var(--border, #2a3048);
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
        padding: 0.4rem 0.75rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
      }
      #page-article-factory .afTab:hover {
        background: var(--surface-hover, #252b3d);
        border-color: var(--shell-line-strong, #3a4260);
      }
      #page-article-factory .afTab.active {
        background: var(--accent, #4f8ef7);
        color: #fff;
        border-color: var(--accent, #4f8ef7);
      }
      #page-article-factory .afToolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        align-items: center;
      }
      #page-article-factory .afSearch {
        flex: 1;
        min-width: 180px;
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        border: 1px solid var(--border, #2a3048);
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afSearch::placeholder {
        color: var(--muted, #64748b);
      }
      #page-article-factory .afTableWrap {
        overflow-x: auto;
        border: 1px solid var(--border, #2a3048);
        border-radius: 10px;
        background: var(--surface, #181c27);
      }
      #page-article-factory .afTable {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afTable th,
      #page-article-factory .afTable td {
        padding: 0.5rem 0.65rem;
        text-align: left;
        border-bottom: 1px solid var(--border, #2a3048);
        vertical-align: top;
      }
      #page-article-factory .afTable th {
        background: var(--surface2, #1e2335);
        color: var(--muted, #94a3b8);
        font-weight: 600;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      #page-article-factory .afTable tbody tr:hover {
        background: rgba(79, 142, 247, 0.06);
      }
      #page-article-factory .afEmpty {
        color: var(--muted, #94a3b8);
        text-align: center;
        padding: 1.5rem !important;
      }
      #page-article-factory .afActions { white-space: nowrap; }
      #page-article-factory .afTag {
        font-size: 0.7rem;
        background: rgba(79, 142, 247, 0.18);
        color: #93c5fd;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        margin-left: 0.25rem;
      }
      #page-article-factory .afPriority { font-weight: 700; color: #a78bfa; }
      #page-article-factory .afStatus {
        font-size: 0.8rem;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
        border: 1px solid var(--border, #2a3048);
      }
      #page-article-factory .afStatus-selected {
        background: rgba(79, 142, 247, 0.2);
        color: #93c5fd;
        border-color: rgba(79, 142, 247, 0.35);
      }
      #page-article-factory .afStatus-in_progress {
        background: rgba(245, 158, 11, 0.15);
        color: #fcd34d;
        border-color: rgba(245, 158, 11, 0.35);
      }
      #page-article-factory .afPlaceholder {
        padding: 1rem 1.15rem;
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
        border-radius: 10px;
        border: 1px dashed var(--border, #2a3048);
      }
      #page-article-factory .afPlaceholder p,
      #page-article-factory .afPlaceholder h3,
      #page-article-factory .afPlaceholder h4,
      #page-article-factory .afPlaceholder li,
      #page-article-factory .afPlaceholder strong {
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afPlaceholder .hint {
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afCallout {
        margin: 0.75rem 0 1rem;
        padding: 0.85rem 1rem;
        border-radius: 8px;
        background: rgba(79, 142, 247, 0.1);
        border: 1px solid rgba(79, 142, 247, 0.28);
      }
      #page-article-factory .afCallout .hint {
        margin: 0.35rem 0 0.75rem;
      }
      #page-article-factory .afPre {
        font-size: 0.75rem;
        overflow: auto;
        max-height: 280px;
        background: #0f172a;
        color: #e2e8f0;
        padding: 0.75rem;
        border-radius: 8px;
        border: 1px solid var(--border, #2a3048);
      }
      #page-article-factory .afError,
      #page-article-factory .articleFactoryStatusError {
        color: #f87171;
      }
      #page-article-factory .afDialog {
        border: 1px solid var(--border, #2a3048);
        border-radius: 12px;
        padding: 0;
        max-width: 560px;
        width: calc(100% - 2rem);
        background: var(--surface, #181c27);
        color: var(--text, #e2e8f0);
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
      }
      #page-article-factory .afDialog::backdrop {
        background: rgba(0, 0, 0, 0.65);
      }
      #page-article-factory .afDialogForm {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      #page-article-factory .afDialogForm h3 {
        color: var(--text, #e2e8f0);
        margin: 0 0 0.25rem;
      }
      #page-article-factory .afDialogForm label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.85rem;
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afDialogForm input,
      #page-article-factory .afDialogForm textarea,
      #page-article-factory .afDialogForm select {
        padding: 0.4rem 0.5rem;
        border-radius: 6px;
        border: 1px solid var(--border, #2a3048);
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afDialogActions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      #page-article-factory .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.45rem 0.85rem;
        border-radius: 8px;
        border: 1px solid var(--border, #2a3048);
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
        font-size: 0.85rem;
        cursor: pointer;
        text-decoration: none;
        transition: background 0.12s, border-color 0.12s;
      }
      #page-article-factory .btn:hover {
        background: var(--surface-hover, #252b3d);
        border-color: var(--shell-line-strong, #3a4260);
      }
      #page-article-factory .btn.primary {
        background: var(--accent, #4f8ef7);
        border-color: var(--accent, #4f8ef7);
        color: #fff;
      }
      #page-article-factory .btn.primary:hover {
        background: #3d7ae8;
        border-color: #3d7ae8;
      }
      #page-article-factory .btn.secondary {
        background: var(--surface2, #1e2335);
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .btn.small {
        font-size: 0.8rem;
        padding: 0.25rem 0.5rem;
      }
      #page-article-factory .btn.danger {
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.35);
        background: rgba(239, 68, 68, 0.1);
      }
      #page-article-factory .btn.danger:hover {
        background: rgba(239, 68, 68, 0.18);
      }
      #page-article-factory label.btn input[type="file"] {
        display: none;
      }
      #page-article-factory .afRowSelected {
        background: rgba(79, 142, 247, 0.12);
      }
      #page-article-factory .afSection {
        margin: 0.5rem 0;
        border: 1px solid var(--border, #2a3048);
        border-radius: 8px;
        padding: 0.5rem;
        background: var(--surface2, #1e2335);
      }
      #page-article-factory .afSectionBody {
        white-space: pre-wrap;
        font-size: 0.9rem;
        margin-top: 0.5rem;
        color: var(--text, #e2e8f0);
      }
      #page-article-factory .afReviewCard {
        border: 1px solid var(--border, #2a3048);
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
        background: var(--surface2, #1e2335);
      }
      #page-article-factory .afChecklist {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin: 0.75rem 0;
      }
      #page-article-factory .afCheckItem {
        font-size: 0.9rem;
        color: var(--text, #e2e8f0);
      }
      #page-article-factory #articleFactoryStatus {
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afInlinePanel {
        margin: 0.75rem 0 1rem;
        padding: 1rem 1.1rem;
        border: 1px solid var(--accent, #4f8ef7);
        border-radius: 12px;
        background: var(--surface2, #1e2335);
        box-shadow: 0 0 0 1px rgba(79, 142, 247, 0.12);
      }
      #page-article-factory .afInlinePanel h3 {
        margin: 0 0 0.75rem;
        color: var(--text, #e2e8f0);
        font-size: 1rem;
      }
      #page-article-factory .afInlineForm {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem 0.85rem;
      }
      #page-article-factory .afInlineForm label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.85rem;
        color: var(--muted, #94a3b8);
      }
      #page-article-factory .afInlineForm label:has(textarea),
      #page-article-factory .afInlineForm label:has(select[multiple]),
      #page-article-factory .afInlineForm .afDialogActions {
        grid-column: 1 / -1;
      }
      #page-article-factory .afInlineFormRow {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.85rem;
        grid-column: 1 / -1;
      }
      #page-article-factory .afInlineForm input,
      #page-article-factory .afInlineForm textarea,
      #page-article-factory .afInlineForm select {
        padding: 0.4rem 0.5rem;
        border-radius: 6px;
        border: 1px solid var(--border, #2a3048);
        background: var(--surface, #181c27);
        color: var(--text, #e2e8f0);
      }
      @media (max-width: 860px) {
        #page-article-factory .afInlineForm,
        #page-article-factory .afInlineFormRow {
          grid-template-columns: 1fr;
        }
      }
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
    ensureRenderShell(root);

    const reopenDialogId = captureOpenDialogDraft();
    const needsDialogs = reopenDialogId && reopenDialogId !== "topics-inline"
      || editingPublication !== null
      || editingJournal !== null
      || editingProject !== null;

    el("articleFactoryMain").innerHTML = `
      <div class="afModule">
        <p class="hint">Publikační pipeline pro Q1 články — rukopis anglicky, komentáře česky. AI výstupy vyžadují lidskou revizi.</p>
        <div class="afTabs">${renderTabsHtml()}</div>
        <div class="afToolbar">
          <input type="search" class="afSearch" placeholder="Hledat…" data-af-search value="${html(filterSearch)}">
          <button type="button" class="btn" data-af-reload>↻ Načíst</button>
        </div>
        <div id="articleFactoryStatus" class="hint"></div>
        ${renderContent()}
      </div>`;

    const dialogHost = el("articleFactoryDialogs");
    if (needsDialogs) {
      dialogHost.innerHTML = `
        ${renderPublicationDialog()}
        ${renderJournalDialog()}
        ${renderProjectDialog()}
      `;
    } else {
      dialogHost.innerHTML = "";
    }

    const statusNode = el("articleFactoryStatus");
    if (statusNode && statusNode.textContent === "") {
      statusNode.textContent = useSupabase ? "Supabase režim." : "Lokální režim (tabulky nebo přihlášení chybí).";
    }

    bindEvents(root);
    if (reopenDialogId && reopenDialogId !== "topics-inline") el(reopenDialogId)?.showModal();
    if (reopenDialogId === "topics-inline" || (editingTopic !== null && activeView === "topics")) {
      el("afTopicInlineForm")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
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
    getProjects: () => projects,
    getVersions: () => versions,
    getReviews: () => reviews,
    getSelectedProject,
    loadData,
    render
  };

  document.addEventListener("DOMContentLoaded", init);
})();
