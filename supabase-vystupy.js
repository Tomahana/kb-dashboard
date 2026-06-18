// Supabase persistence for výzkumné výstupy — samostatné tabulky Jimp, JSC, B, C.

(function () {
  const STORAGE_KEY = "kb-dashboard-vystupy-v2";

  const TYPES = {
    Jimp: {
      table: "kb_vystupy_jimp",
      fields: [
        "source_key", "rok", "nazev", "autor", "autor_osobni_cislo",
        "fakulta", "zkr_fak", "katedra", "doi", "issn", "casopis",
        "riv_id", "cislo_na_riv", "poznamka", "imported_at"
      ]
    },
    JSC: {
      table: "kb_vystupy_jsc",
      fields: [
        "source_key", "rok", "nazev", "autor", "autor_osobni_cislo",
        "fakulta", "zkr_fak", "katedra", "doi", "issn", "casopis",
        "riv_id", "cislo_na_riv", "poznamka", "imported_at"
      ]
    },
    B: {
      table: "kb_vystupy_b",
      fields: [
        "source_key", "rok", "nazev", "autor", "autor_osobni_cislo",
        "fakulta", "zkr_fak", "katedra", "isbn",
        "riv_id", "cislo_na_riv", "poznamka", "imported_at"
      ]
    },
    C: {
      table: "kb_vystupy_c",
      fields: [
        "source_key", "rok", "nazev", "autor", "autor_osobni_cislo",
        "fakulta", "zkr_fak", "katedra", "isbn",
        "riv_id", "cislo_na_riv", "poznamka", "imported_at"
      ]
    }
  };

  const TABLE_TO_TYPE = Object.fromEntries(
    Object.entries(TYPES).map(([typ, cfg]) => [cfg.table, typ])
  );

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

  function resolveType(item) {
    const typ = (item?.typ_vystupu || "").toString().trim();
    if (TYPES[typ]) return typ;
    if (item?.__table && TABLE_TO_TYPE[item.__table]) return TABLE_TO_TYPE[item.__table];
    return null;
  }

  function getConfig(typ) {
    return TYPES[typ] || null;
  }

  function mapRow(row, typ) {
    const cfg = getConfig(typ);
    const item = {
      id: row.id,
      typ_vystupu: typ,
      __table: cfg.table,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
    (cfg?.fields || []).forEach((field) => {
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
    const typ = resolveType(item);
    const cfg = getConfig(typ);
    if (!cfg) throw new Error(`Neznámý typ výstupu: ${item?.typ_vystupu || "?"}`);
    const payload = {
      id: item.id,
      source_key: item.source_key,
      nazev: item.nazev || "Bez názvu",
      updated_at: new Date().toISOString()
    };
    cfg.fields.forEach((field) => {
      if (field === "source_key" || field === "nazev") return;
      const value = item[field];
      if (field === "rok") {
        payload.rok = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    if (payload.autor_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.autor_osobni_cislo);
      if (!exists) payload.autor_osobni_cislo = null;
    }
    return { table: cfg.table, payload, typ };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const checks = await Promise.all(
        Object.values(TYPES).map((cfg) => supa.from(cfg.table).select("id").limit(1))
      );
      tablesAvailable = checks.every((res) => !res.error || res.error.code !== "PGRST205");
      if (checks.some((res) => res.error?.code === "PGRST205")) tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadTable(typ) {
    const cfg = getConfig(typ);
    if (!cfg) return [];
    const supa = getClient();
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await supa
        .from(cfg.table)
        .select("*")
        .order("rok", { ascending: false, nullsFirst: false })
        .order("nazev", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all.map((row) => mapRow(row, typ));
  }

  async function loadVystupy() {
    const parts = await Promise.all(Object.keys(TYPES).map((typ) => loadTable(typ)));
    return parts.flat();
  }

  async function upsertVystup(item) {
    const { table, payload, typ } = toPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const supa = getClient();
    const { data, error } = await supa
      .from(table)
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data, typ);
  }

  async function upsertVystupyBatch(items, onProgress) {
    const byType = new Map();
    for (const item of items) {
      const typ = resolveType(item);
      if (!typ) continue;
      if (!byType.has(typ)) byType.set(typ, []);
      byType.get(typ).push(item);
    }
    const saved = [];
    let done = 0;
    const total = items.length;
    for (const [typ, group] of byType.entries()) {
      const cfg = getConfig(typ);
      const chunkSize = 100;
      for (let i = 0; i < group.length; i += chunkSize) {
        const chunk = group.slice(i, i + chunkSize).map((item) => ({
          ...toPayload(item).payload,
          created_at: item.created_at || new Date().toISOString()
        }));
        const supa = getClient();
        const { data, error } = await supa
          .from(cfg.table)
          .upsert(chunk, { onConflict: "source_key" })
          .select("*");
        if (error) throw error;
        saved.push(...(data || []).map((row) => mapRow(row, typ)));
        done += chunk.length;
        onProgress?.(done, total);
      }
    }
    return saved;
  }

  async function deleteVystup(id, typ) {
    const cfg = getConfig(typ);
    if (!cfg) throw new Error(`Neznámý typ výstupu: ${typ}`);
    const supa = getClient();
    const { error } = await supa.from(cfg.table).delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => resolveType(item));
      }
      const all = [];
      for (const typ of Object.keys(TYPES)) {
        const rows = Array.isArray(parsed[typ]) ? parsed[typ] : [];
        rows.forEach((row) => all.push({ ...row, typ_vystupu: typ, __table: TYPES[typ].table }));
      }
      return all;
    } catch (_) {
      return [];
    }
  }

  function saveLocal(items) {
    const grouped = {};
    for (const typ of Object.keys(TYPES)) grouped[typ] = [];
    for (const item of items) {
      const typ = resolveType(item);
      if (!typ) continue;
      const copy = { ...item };
      delete copy.__table;
      delete copy.__source;
      delete copy.__existing;
      grouped[typ].push(copy);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grouped, null, 2));
  }

  window.kbSupabaseVystupy = {
    TYPES,
    probeTables,
    loadVystupy,
    upsertVystup,
    upsertVystupyBatch,
    deleteVystup,
    loadLocal,
    saveLocal,
    resolveType
  };
})();
