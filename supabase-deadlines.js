// Supabase persistence for collection/submission deadlines (kb_deadlines).

(function () {
  const STORAGE_KEY = "kb-dashboard-deadlines-v1";
  const MIGRATED_KEY = "kb-dashboard-deadlines-migrated-v1";
  let client = null;
  let tablesAvailable = null;

  const FIELDS = [
    "id_polozky", "oblast", "nazev", "popis", "odpovedna_osoba", "odpovedna_osoba_osobni_cislo", "potrebujeme_od",
    "dodavatel_fakulta", "kam_vyplnit", "system_zdroj", "termin_sberu", "termin_interni",
    "termin_odeslani", "periodicita", "ucel", "navazny_proces", "riziko", "stav",
    "poznamka", "zdroj", "urad", "agenda", "typ", "kb_id"
  ];

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
      __source: "supabase"
    };
    FIELDS.forEach(field => {
      item[field] = row[field] ?? "";
    });
    if (!item.nazev) item.nazev = "Bez názvu";
    if (!item.stav) item.stav = "Aktivní";
    return item;
  }

  function toPayload(item) {
    const payload = {
      id: item.id,
      nazev: item.nazev || "Bez názvu",
      stav: item.stav || "Aktivní",
      updated_at: new Date().toISOString()
    };
    FIELDS.forEach(field => {
      if (field === "nazev" || field === "stav") return;
      const value = item[field];
      payload[field] = value ? value : null;
    });
    return payload;
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
      .order("termin_interni", { ascending: true, nullsFirst: false });
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
