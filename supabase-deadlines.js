// Supabase persistence for collection/submission deadlines (kb_deadlines).

(function () {
  const STORAGE_KEY = "kb-dashboard-deadlines-v1";
  const MIGRATED_KEY = "kb-dashboard-deadlines-migrated-v1";
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
      nazev: row.nazev || "Bez názvu",
      urad: row.urad || "",
      agenda: row.agenda || "",
      typ: row.typ || "",
      termin_sberu: row.termin_sberu || "",
      termin_odeslani: row.termin_odeslani || "",
      periodicita: row.periodicita || "",
      stav: row.stav || "Aktivní",
      poznamka: row.poznamka || "",
      odpovedna_osoba: row.odpovedna_osoba || "",
      zdroj: row.zdroj || "",
      kb_id: row.kb_id || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase"
    };
  }

  function toPayload(item) {
    return {
      id: item.id,
      nazev: item.nazev || "Bez názvu",
      urad: item.urad || null,
      agenda: item.agenda || null,
      typ: item.typ || null,
      termin_sberu: item.termin_sberu || null,
      termin_odeslani: item.termin_odeslani || null,
      periodicita: item.periodicita || null,
      stav: item.stav || "Aktivní",
      poznamka: item.poznamka || null,
      odpovedna_osoba: item.odpovedna_osoba || null,
      zdroj: item.zdroj || null,
      kb_id: item.kb_id || null,
      updated_at: new Date().toISOString()
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_deadlines").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadDeadlinesFromSupabase() {
    const supa = getClient();
    const { data, error } = await supa
      .from("kb_deadlines")
      .select("*")
      .order("termin_odeslani", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data || []).map(mapRow);
  }

  async function upsertDeadline(item) {
    const supa = getClient();
    const payload = toPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_deadlines")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async function insertDeadlines(items) {
    const supa = getClient();
    const rows = items.map(item => ({
      ...toPayload(item),
      created_at: item.created_at || new Date().toISOString()
    }));
    const { data, error } = await supa
      .from("kb_deadlines")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return (data || []).map(mapRow);
  }

  async function deleteDeadlineFromSupabase(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_deadlines").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocalDeadlines() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async function migrateLocalDeadlinesIfNeeded() {
    if (localStorage.getItem(MIGRATED_KEY) === "true") return;
    const local = loadLocalDeadlines();
    if (!local.length) {
      localStorage.setItem(MIGRATED_KEY, "true");
      return;
    }
    for (const item of local) {
      await upsertDeadline({ ...item, __existing: !!item.created_at });
    }
    localStorage.setItem(MIGRATED_KEY, "true");
    localStorage.removeItem(STORAGE_KEY);
  }

  window.kbSupabaseDeadlines = {
    probeTables,
    loadDeadlinesFromSupabase,
    upsertDeadline,
    insertDeadlines,
    deleteDeadlineFromSupabase,
    migrateLocalDeadlinesIfNeeded,
    loadLocalDeadlines
  };
})();
