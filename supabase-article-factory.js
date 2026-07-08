// Supabase persistence for Article Factory (kb_article_*).

(function () {
  const STORAGE_KEY = "kb-dashboard-article-factory-v1";

  const PUBLICATION_FIELDS = [
    "source_key", "title", "authors", "authors_osobni_cislo", "year",
    "journal_or_publisher", "doi", "issn", "wos_category", "abstract", "keywords",
    "methodology", "main_findings", "file_url", "vystup_id", "vystup_type", "notes", "imported_at"
  ];

  const TOPIC_FIELDS = [
    "source_key", "title", "description", "research_area", "possible_methodology",
    "target_wos_category", "expected_contribution", "priority", "status", "notes"
  ];

  const JOURNAL_FIELDS = [
    "source_key", "journal_title", "publisher", "issn", "eissn", "wos_category",
    "quartile", "ais_rank_info", "scope", "article_types", "open_access_info",
    "publication_fee", "submission_url", "author_guidelines_url", "notes",
    "last_verified_at", "journal_record_id"
  ];

  const TABLES = [
    "kb_article_publications",
    "kb_article_topics",
    "kb_article_target_journals"
  ];

  let client = null;
  let tablesAvailable = null;

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (client) return client;
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) {
      throw new Error("Chybí supabase-config.js.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS knihovna není načtená.");
    }
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function n(s) {
    return (s || "").toString().trim();
  }

  function mapPublication(row) {
    const item = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
    PUBLICATION_FIELDS.forEach((field) => {
      if (field === "year") {
        item.year = row.year == null ? null : Number(row.year);
        return;
      }
      item[field] = row[field] ?? "";
    });
    if (!item.title) item.title = "Bez názvu";
    return item;
  }

  function mapTopic(row) {
    const item = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      related_publication_ids: [],
      __source: "supabase",
      __existing: true
    };
    TOPIC_FIELDS.forEach((field) => {
      if (field === "priority") {
        item.priority = row.priority == null ? 3 : Number(row.priority);
        return;
      }
      item[field] = row[field] ?? "";
    });
    if (!item.title) item.title = "Bez názvu";
    if (!item.status) item.status = "idea";
    return item;
  }

  function mapJournal(row) {
    const item = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
    JOURNAL_FIELDS.forEach((field) => {
      if (field === "article_types") {
        item.article_types = Array.isArray(row.article_types) ? row.article_types : [];
        return;
      }
      if (field === "publication_fee") {
        item.publication_fee = row.publication_fee == null ? null : Number(row.publication_fee);
        return;
      }
      item[field] = row[field] ?? "";
    });
    if (!item.journal_title) item.journal_title = "Bez názvu";
    return item;
  }

  function toPublicationPayload(item) {
    const payload = {
      id: item.id,
      source_key: item.source_key,
      title: item.title || "Bez názvu",
      updated_at: new Date().toISOString()
    };
    PUBLICATION_FIELDS.forEach((field) => {
      if (field === "source_key" || field === "title") return;
      const value = item[field];
      if (field === "year") {
        payload.year = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    if (payload.authors_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.authors_osobni_cislo);
      if (!exists) payload.authors_osobni_cislo = null;
    }
    return payload;
  }

  function toTopicPayload(item) {
    const payload = {
      id: item.id,
      source_key: item.source_key,
      title: item.title || "Bez názvu",
      status: item.status || "idea",
      priority: item.priority == null ? 3 : Number(item.priority),
      updated_at: new Date().toISOString()
    };
    TOPIC_FIELDS.forEach((field) => {
      if (["source_key", "title", "status", "priority"].includes(field)) return;
      const value = item[field];
      payload[field] = value === "" || value == null ? null : value;
    });
    return payload;
  }

  function toJournalPayload(item) {
    const payload = {
      id: item.id,
      source_key: item.source_key,
      journal_title: item.journal_title || "Bez názvu",
      updated_at: new Date().toISOString()
    };
    JOURNAL_FIELDS.forEach((field) => {
      if (field === "source_key" || field === "journal_title") return;
      const value = item[field];
      if (field === "article_types") {
        payload.article_types = Array.isArray(value) ? value : (n(value) ? n(value).split(/[,;]/).map((x) => n(x)).filter(Boolean) : []);
        return;
      }
      if (field === "publication_fee") {
        payload.publication_fee = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    return payload;
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_article_publications").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadTablePaged(table, orderCol) {
    const supa = getClient();
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await supa
        .from(table)
        .select("*")
        .order(orderCol, { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function loadTopicPublicationLinks() {
    const supa = getClient();
    const { data, error } = await supa.from("kb_article_topic_publications").select("topic_id, publication_id");
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.topic_id]) map[row.topic_id] = [];
      map[row.topic_id].push(row.publication_id);
    });
    return map;
  }

  async function loadAll() {
    const [pubRows, topicRows, journalRows, linkMap] = await Promise.all([
      loadTablePaged("kb_article_publications", "year"),
      loadTablePaged("kb_article_topics", "priority"),
      loadTablePaged("kb_article_target_journals", "journal_title"),
      loadTopicPublicationLinks()
    ]);
    const publications = pubRows.map(mapPublication);
    const topics = topicRows.map((row) => {
      const t = mapTopic(row);
      t.related_publication_ids = linkMap[t.id] || [];
      return t;
    });
    const journals = journalRows.map(mapJournal);
    return { publications, topics, journals };
  }

  async function upsertPublication(item) {
    const supa = getClient();
    const payload = toPublicationPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_article_publications")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapPublication(data);
  }

  async function upsertPublicationsBatch(items, onProgress) {
    const saved = [];
    for (let i = 0; i < items.length; i += 1) {
      saved.push(await upsertPublication(items[i]));
      onProgress?.(i + 1, items.length);
    }
    return saved;
  }

  async function deletePublication(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_article_publications").delete().eq("id", id);
    if (error) throw error;
  }

  async function upsertTopic(item) {
    const supa = getClient();
    const payload = toTopicPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_article_topics")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    const saved = mapTopic(data);
    const pubIds = item.related_publication_ids || [];
    await supa.from("kb_article_topic_publications").delete().eq("topic_id", saved.id);
    if (pubIds.length) {
      const links = pubIds.map((publication_id) => ({ topic_id: saved.id, publication_id }));
      const { error: linkErr } = await supa.from("kb_article_topic_publications").insert(links);
      if (linkErr) throw linkErr;
    }
    saved.related_publication_ids = pubIds;
    return saved;
  }

  async function deleteTopic(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_article_topics").delete().eq("id", id);
    if (error) throw error;
  }

  async function upsertJournal(item) {
    const supa = getClient();
    const payload = toJournalPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_article_target_journals")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapJournal(data);
  }

  async function upsertJournalsBatch(items, onProgress) {
    const saved = [];
    for (let i = 0; i < items.length; i += 1) {
      saved.push(await upsertJournal(items[i]));
      onProgress?.(i + 1, items.length);
    }
    return saved;
  }

  async function deleteJournal(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_article_target_journals").delete().eq("id", id);
    if (error) throw error;
  }

  async function uploadAttachment(file, publicationId) {
    const supa = getClient();
    const safeName = (file.name || "attachment").replace(/[^\w.\-]+/g, "_");
    const path = `publications/${publicationId}/${Date.now()}-${safeName}`;
    const { error } = await supa.storage.from("kb-article-attachments").upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        publications: Array.isArray(parsed.publications) ? parsed.publications : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        journals: Array.isArray(parsed.journals) ? parsed.journals : []
      };
    } catch (_) {
      return { publications: [], topics: [], journals: [] };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  window.kbSupabaseArticleFactory = {
    TABLES,
    probeTables,
    loadAll,
    upsertPublication,
    upsertPublicationsBatch,
    deletePublication,
    upsertTopic,
    deleteTopic,
    upsertJournal,
    upsertJournalsBatch,
    deleteJournal,
    uploadAttachment,
    loadLocal,
    saveLocal,
    PUBLICATION_FIELDS,
    TOPIC_FIELDS,
    JOURNAL_FIELDS
  };
})();
