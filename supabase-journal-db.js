// Supabase persistence for journal database (JCR exports).

(function () {
  const STORAGE_KEY = "kb-dashboard-journal-db-v1";

  const FIELDS = [
    "source_key", "journal_key", "journal_name", "jcr_abbreviation", "issn", "eissn",
    "category", "edition", "ais", "ais_quartile", "jif", "jif_year", "jif_quartile",
    "jif_percentile", "total_citations", "source_year", "source_file", "imported_at"
  ];

  let client = null;
  let tablesAvailable = null;

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (client) return client;
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) {
      throw new Error("Chybí supabase-config.js.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS knihovna není načtená.");
    }
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function mapRow(row) {
    return {
      id: row.id,
      source_key: row.source_key || "",
      journal_key: row.journal_key || "",
      journal_name: row.journal_name || "",
      jcr_abbreviation: row.jcr_abbreviation || "",
      issn: row.issn || "",
      eissn: row.eissn || "",
      category: row.category || "",
      edition: row.edition || "",
      ais: row.ais || "",
      ais_quartile: row.ais_quartile || "",
      jif: row.jif || "",
      jif_year: row.jif_year || "",
      jif_quartile: row.jif_quartile || "",
      jif_percentile: row.jif_percentile || "",
      total_citations: row.total_citations || "",
      source_year: row.source_year || "",
      source_file: row.source_file || "",
      imported_at: row.imported_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
  }

  function toPayload(item) {
    const payload = {
      id: item.id,
      source_key: item.source_key,
      updated_at: new Date().toISOString()
    };
    FIELDS.forEach((field) => {
      if (field === "source_key") return;
      const value = item[field];
      payload[field] = value === "" || value == null ? null : value;
    });
    if (!payload.imported_at) payload.imported_at = new Date().toISOString();
    return payload;
  }

  async function probeTables() {
    if (tablesAvailable != null) return tablesAvailable;
    try {
      const sb = getClient();
      const { error } = await sb.from("kb_journal_records").select("id").limit(1);
      tablesAvailable = !error;
      return tablesAvailable;
    } catch (_) {
      tablesAvailable = false;
      return false;
    }
  }

  function loadLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocal(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records, null, 2));
  }

  async function loadAll() {
    const sb = getClient();
    const { data, error } = await sb
      .from("kb_journal_records")
      .select("*")
      .order("category")
      .order("journal_name");
    if (error) throw error;
    const mapped = (data || []).map(mapRow);
    saveLocal(mapped);
    return mapped;
  }

  async function upsertBatch(items, onProgress) {
    const sb = getClient();
    const saved = [];
    const chunkSize = 50;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map(toPayload);
      const { data, error } = await sb
        .from("kb_journal_records")
        .upsert(chunk, { onConflict: "source_key" })
        .select("*");
      if (error) throw error;
      (data || []).forEach((row) => saved.push(mapRow(row)));
      onProgress?.(Math.min(i + chunk.length, items.length), items.length);
    }
    saveLocal(saved.length ? await loadAll() : []);
    return saved.length ? await loadAll() : [];
  }

  window.kbSupabaseJournalDb = {
    probeTables,
    loadLocal,
    saveLocal,
    loadAll,
    upsertBatch
  };
})();
