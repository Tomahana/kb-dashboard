// Supabase persistence for výzkumné výstupy (kb_vystupy).

(function () {
  const STORAGE_KEY = "kb-dashboard-vystupy-v1";

  const FIELDS = [
    "source_key", "kategorie", "typ_vystupu", "rok", "nazev",
    "autor", "autor_osobni_cislo", "resitel", "resitel_osobni_cislo",
    "fakulta", "zkr_fak", "katedra",
    "doi", "issn", "casopis", "isbn",
    "riv_id", "cislo_na_riv", "druh_vysledku", "poznamka", "imported_at"
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
      if (field === "rok") {
        item.rok = row.rok == null ? null : Number(row.rok);
        return;
      }
      item[field] = row[field] ?? "";
    });
    if (!item.nazev) item.nazev = "Bez názvu";
    return item;
  }

  function toPayload(item) {
    const payload = {
      id: item.id,
      source_key: item.source_key,
      nazev: item.nazev || "Bez názvu",
      updated_at: new Date().toISOString()
    };
    FIELDS.forEach((field) => {
      if (field === "source_key" || field === "nazev") return;
      const value = item[field];
      if (field === "rok") {
        payload.rok = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    if (!payload.kategorie) payload.kategorie = "publikacni";
    if (!payload.typ_vystupu) payload.typ_vystupu = "JSC";
    if (payload.autor_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.autor_osobni_cislo);
      if (!exists) payload.autor_osobni_cislo = null;
    }
    if (payload.resitel_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.resitel_osobni_cislo);
      if (!exists) payload.resitel_osobni_cislo = null;
    }
    return payload;
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_vystupy").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadVystupy() {
    const supa = getClient();
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await supa
        .from("kb_vystupy")
        .select("*")
        .order("rok", { ascending: false, nullsFirst: false })
        .order("nazev", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all.map(mapRow);
  }

  async function upsertVystup(item) {
    const supa = getClient();
    const payload = toPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_vystupy")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async function upsertVystupyBatch(items, onProgress) {
    const saved = [];
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((item) => ({
        ...toPayload(item),
        created_at: item.created_at || new Date().toISOString()
      }));
      const supa = getClient();
      const { data, error } = await supa
        .from("kb_vystupy")
        .upsert(chunk, { onConflict: "source_key" })
        .select("*");
      if (error) throw error;
      saved.push(...(data || []).map(mapRow));
      onProgress?.(Math.min(i + chunk.length, items.length), items.length);
    }
    return saved;
  }

  async function deleteVystup(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_vystupy").delete().eq("id", id);
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

  window.kbSupabaseVystupy = {
    probeTables,
    loadVystupy,
    upsertVystup,
    upsertVystupyBatch,
    deleteVystup,
    loadLocal,
    saveLocal
  };
})();
