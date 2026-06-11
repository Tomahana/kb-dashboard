// Supabase persistence for EIZ transformační smlouvy, roční tokeny a publikace.

(function () {
  const STORAGE_KEY = "kb-dashboard-eiz-tokens-v1";

  const CONTRACT_FIELDS = ["nazev", "poskytovatel", "poznamka", "typ_cerpani", "sleva_apc_procent", "aktivni"];
  const YEAR_FIELDS = ["contract_id", "rok", "pocet_tokenu", "neomezene", "poznamka"];
  const PUBLICATION_FIELDS = [
    "contract_id", "source_key", "autor", "autor_osobni_cislo", "fakulta", "zkr_fak",
    "nazev_clanku", "doi", "datum_zadosti", "datum_prijeti", "rok", "usetrena_apc", "imported_at"
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

  function mapContract(row) {
    const years = (row.kb_eiz_contract_years || []).map(mapYear).sort((a, b) => b.rok - a.rok);
    return {
      id: row.id,
      nazev: row.nazev || "",
      poskytovatel: row.poskytovatel || "",
      poznamka: row.poznamka || "",
      typ_cerpani: row.typ_cerpani || "tokeny",
      sleva_apc_procent: row.sleva_apc_procent == null ? null : Number(row.sleva_apc_procent),
      aktivni: row.aktivni !== false,
      years,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
  }

  function mapYear(row) {
    return {
      id: row.id,
      contract_id: row.contract_id,
      rok: Number(row.rok) || 0,
      pocet_tokenu: row.pocet_tokenu == null ? null : Number(row.pocet_tokenu),
      neomezene: !!row.neomezene,
      poznamka: row.poznamka || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      __existing: true
    };
  }

  function mapPublication(row) {
    return {
      id: row.id,
      contract_id: row.contract_id,
      source_key: row.source_key,
      autor: row.autor || "",
      autor_osobni_cislo: row.autor_osobni_cislo || "",
      fakulta: row.fakulta || "",
      zkr_fak: row.zkr_fak || "",
      nazev_clanku: row.nazev_clanku || "",
      doi: row.doi || "",
      datum_zadosti: row.datum_zadosti || "",
      datum_prijeti: row.datum_prijeti || "",
      rok: row.rok == null ? null : Number(row.rok),
      usetrena_apc: row.usetrena_apc == null ? null : Number(row.usetrena_apc),
      imported_at: row.imported_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
  }

  function toContractPayload(item) {
    const payload = {
      id: item.id,
      nazev: item.nazev || "Bez názvu",
      aktivni: item.aktivni !== false,
      updated_at: new Date().toISOString()
    };
    CONTRACT_FIELDS.forEach((field) => {
      if (field === "nazev" || field === "aktivni") return;
      const value = item[field];
      if (field === "sleva_apc_procent") {
        payload[field] = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    if (!payload.typ_cerpani) payload.typ_cerpani = "tokeny";
    return payload;
  }

  function toYearPayload(item) {
    const neomezene = !!item.neomezene;
    return {
      id: item.id,
      contract_id: item.contract_id,
      rok: Number(item.rok),
      neomezene,
      pocet_tokenu: neomezene ? null : (Number(item.pocet_tokenu) || 0),
      poznamka: item.poznamka || null,
      updated_at: new Date().toISOString()
    };
  }

  function toPublicationPayload(item) {
    const payload = {
      id: item.id,
      contract_id: item.contract_id,
      source_key: item.source_key,
      nazev_clanku: item.nazev_clanku || "Bez názvu",
      updated_at: new Date().toISOString()
    };
    PUBLICATION_FIELDS.forEach((field) => {
      if (field === "contract_id" || field === "source_key" || field === "nazev_clanku") return;
      const value = item[field];
      if (field === "usetrena_apc") {
        payload[field] = value === "" || value == null ? null : Number(value);
        return;
      }
      if (field === "datum_zadosti" || field === "datum_prijeti") {
        payload[field] = value || null;
        return;
      }
      if (field === "rok") {
        payload[field] = value === "" || value == null ? null : Number(value);
        return;
      }
      payload[field] = value === "" || value == null ? null : value;
    });
    if (payload.autor_osobni_cislo) {
      const exists = window.kbPersons?.getPersonByOsobniCislo?.(payload.autor_osobni_cislo);
      if (!exists) payload.autor_osobni_cislo = null;
    }
    return payload;
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_eiz_contracts").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadContracts() {
    const supa = getClient();
    const { data, error } = await supa
      .from("kb_eiz_contracts")
      .select("*, kb_eiz_contract_years(*)")
      .order("nazev", { ascending: true });
    if (error) throw error;
    return (data || []).map(mapContract);
  }

  async function loadPublications(contractId) {
    const supa = getClient();
    let query = supa
      .from("kb_eiz_publications")
      .select("*")
      .order("datum_prijeti", { ascending: false, nullsFirst: false })
      .order("datum_zadosti", { ascending: false, nullsFirst: false })
      .order("nazev_clanku", { ascending: true });
    if (contractId) query = query.eq("contract_id", contractId);
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all.map(mapPublication);
  }

  async function upsertContract(item) {
    const supa = getClient();
    const payload = toContractPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_eiz_contracts")
      .upsert(payload)
      .select("*, kb_eiz_contract_years(*)")
      .single();
    if (error) throw error;
    return mapContract(data);
  }

  async function deleteContract(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_eiz_contracts").delete().eq("id", id);
    if (error) throw error;
  }

  async function upsertContractYear(item) {
    const supa = getClient();
    const payload = toYearPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_eiz_contract_years")
      .upsert(payload, { onConflict: "contract_id,rok" })
      .select("*")
      .single();
    if (error) throw error;
    return mapYear(data);
  }

  async function deleteContractYear(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_eiz_contract_years").delete().eq("id", id);
    if (error) throw error;
  }

  async function upsertPublication(item) {
    const supa = getClient();
    const payload = toPublicationPayload(item);
    if (!item.__existing) payload.created_at = item.created_at || new Date().toISOString();
    const { data, error } = await supa
      .from("kb_eiz_publications")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throw error;
    return mapPublication(data);
  }

  async function upsertPublicationsBatch(items, onProgress) {
    const saved = [];
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((item) => ({
        ...toPublicationPayload(item),
        created_at: item.created_at || new Date().toISOString()
      }));
      const supa = getClient();
      const { data, error } = await supa
        .from("kb_eiz_publications")
        .upsert(chunk, { onConflict: "source_key" })
        .select("*");
      if (error) throw error;
      saved.push(...(data || []).map(mapPublication));
      onProgress?.(Math.min(i + chunk.length, items.length), items.length);
    }
    return saved;
  }

  async function deletePublication(id) {
    const supa = getClient();
    const { error } = await supa.from("kb_eiz_publications").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
        publications: Array.isArray(parsed.publications) ? parsed.publications : []
      };
    } catch (_) {
      return { contracts: [], publications: [] };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  window.kbSupabaseEizTokens = {
    probeTables,
    loadContracts,
    loadPublications,
    upsertContract,
    deleteContract,
    upsertContractYear,
    deleteContractYear,
    upsertPublication,
    upsertPublicationsBatch,
    deletePublication,
    loadLocal,
    saveLocal
  };
})();
