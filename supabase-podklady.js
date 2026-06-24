// Supabase persistence for meeting materials (podklady_jednani).

(function () {
  const STORAGE_KEY = "kb-dashboard-podklady-v1";

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
    const topic = row.kb_topics || null;
    return {
      id: row.id,
      nazev: row.nazev || "Bez názvu",
      obsah: row.obsah || "",
      stav: row.stav || "K projednání",
      termin_jednani: row.termin_jednani || "",
      topic_id: row.topic_id || null,
      tema_nazev: topic?.name || "",
      tagy: row.tagy || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase"
    };
  }

  function toPayload(data) {
    return {
      nazev: (data.nazev || "").trim() || "Bez názvu",
      obsah: data.obsah ? String(data.obsah) : null,
      stav: data.stav || "K projednání",
      termin_jednani: data.termin_jednani || null,
      topic_id: data.topic_id || null,
      tagy: data.tagy ? String(data.tagy).trim() : null,
      updated_at: new Date().toISOString()
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("podklady_jednani").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function getAll(filters = {}) {
    const supa = getClient();
    let query = supa
      .from("podklady_jednani")
      .select("*, kb_topics(id, name)")
      .order("termin_jednani", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (filters.stav) query = query.eq("stav", filters.stav);
    if (filters.tema) query = query.eq("topic_id", filters.tema);
    const { data, error } = await query;
    if (error) throw error;
    let items = (data || []).map(mapRow);
    if (filters.fulltext) {
      const q = String(filters.fulltext).trim().toLowerCase();
      if (q) {
        items = items.filter((item) => {
          const hay = [item.nazev, item.obsah, item.tagy, item.tema_nazev].join(" ").toLowerCase();
          return hay.includes(q);
        });
      }
    }
    return items;
  }

  async function getById(id) {
    const supa = getClient();
    const { data, error } = await supa
      .from("podklady_jednani")
      .select("*, kb_topics(id, name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async function create(data) {
    const supa = getClient();
    const payload = {
      ...toPayload(data),
      created_at: new Date().toISOString()
    };
    const { data: row, error } = await supa
      .from("podklady_jednani")
      .insert(payload)
      .select("*, kb_topics(id, name)")
      .single();
    if (error) throw error;
    return mapRow(row);
  }

  async function update(id, data) {
    const supa = getClient();
    const { data: row, error } = await supa
      .from("podklady_jednani")
      .update(toPayload(data))
      .eq("id", id)
      .select("*, kb_topics(id, name)")
      .single();
    if (error) throw error;
    return mapRow(row);
  }

  async function deletePodklad(id) {
    const supa = getClient();
    const { error } = await supa.from("podklady_jednani").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocalPodklady() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalPodklady(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items, null, 2));
  }

  window.kbSupabasePodklady = {
    probeTables,
    getAll,
    getById,
    create,
    update,
    delete: deletePodklad,
    loadLocalPodklady,
    saveLocalPodklady
  };
})();
