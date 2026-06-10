// Supabase persistence for PČR research directions (kb_pcr_research_topics).

(function () {
  const STORAGE_KEY = "kb-dashboard-pcr-research-v1";

  const FIELDS = [
    "source_key", "poradi", "fakulta", "zkr_fak", "katedra", "zkr_kat",
    "oblast", "tema", "gestor", "email", "popis", "gestor_osobni_cislo",
    "sheet_id", "sheet_gid", "synced_at"
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
    const item = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
    FIELDS.forEach((field) => {
      item[field] = row[field] ?? "";
    });
    if (!item.oblast) item.oblast = "—";
    if (!item.tema) item.tema = "Bez názvu";
    return item;
  }

  function toPayload(item) {
    const payload = {
      id: item.id,
      oblast: item.oblast || "—",
      tema: item.tema || "Bez názvu",
      source_key: item.source_key,
      updated_at: new Date().toISOString()
    };
    FIELDS.forEach((field) => {
      if (field === "oblast" || field === "tema" || field === "source_key") return;
      const value = item[field];
      payload[field] = value === "" || value == null ? null : value;
    });
    if (payload.gestor_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.gestor_osobni_cislo);
      if (!exists) payload.gestor_osobni_cislo = null;
    }
    return payload;
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_pcr_research_topics").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadAll() {
    const supa = getClient();
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await supa
        .from("kb_pcr_research_topics")
        .select("*")
        .order("poradi", { ascending: true, nullsFirst: false })
        .order("oblast", { ascending: true })
        .order("tema", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all.map(mapRow);
  }

  async function upsertTopic(item) {
    const supa = getClient();
    const payload = toPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_pcr_research_topics")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async function upsertTopicsBatch(items, onProgress) {
    const saved = [];
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((item) => ({
        ...toPayload(item),
        created_at: item.created_at || new Date().toISOString()
      }));
      const supa = getClient();
      const { data, error } = await supa
        .from("kb_pcr_research_topics")
        .upsert(chunk, { onConflict: "source_key" })
        .select("*");
      if (error) throw error;
      saved.push(...(data || []).map(mapRow));
      onProgress?.(Math.min(i + chunk.length, items.length), items.length);
    }
    return saved;
  }

  async function deleteTopic(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_pcr_research_topics").delete().eq("id", id);
    if (error) throw error;
  }

  async function deleteAll() {
    const supa = getClient();
    const { error } = await supa.from("kb_pcr_research_topics").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw error;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocal(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items, null, 2));
  }

  window.kbSupabasePcrResearch = {
    probeTables,
    loadAll,
    upsertTopic,
    upsertTopicsBatch,
    deleteTopic,
    deleteAll,
    loadLocal,
    saveLocal,
    FIELDS
  };
})();
