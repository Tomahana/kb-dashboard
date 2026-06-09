// Globální persistence osob – sdíleno mezi moduly.

(function () {
  const STORAGE_KEY = "kb-dashboard-persons-v1";
  const LEGACY_KEY = "kb-dashboard-competition-persons-v1";
  let client = null;
  let tablesAvailable = null;

  const PERSON_FIELDS = [
    "prijmeni", "jmeno", "tituly", "osobni_cislo", "stav_osoby", "pracoviste",
    "rodne_cislo", "email", "telefon", "datum_narozeni", "obcanstvi", "pohlavi",
    "orcid", "researcher_id", "scopus_id"
  ];

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (client) return client;
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) throw new Error("Chybí supabase-config.js.");
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function n(s) {
    return (s || "").toString().trim();
  }

  function normalizePerson(person) {
    const tituly = n(person.tituly) || [person.titul_pred, person.titul_za].map(n).filter(Boolean).join(", ");
    const pracoviste = n(person.pracoviste) || [person.fakulta, person.katedra, person.soucast].map(n).filter(Boolean).join(" · ");
    return {
      id: person.id,
      prijmeni: n(person.prijmeni),
      jmeno: n(person.jmeno),
      tituly,
      osobni_cislo: n(person.osobni_cislo),
      stav_osoby: n(person.stav_osoby),
      pracoviste,
      rodne_cislo: n(person.rodne_cislo),
      email: n(person.email),
      telefon: n(person.telefon),
      datum_narozeni: person.datum_narozeni || null,
      obcanstvi: n(person.obcanstvi),
      pohlavi: n(person.pohlavi),
      orcid: n(person.orcid),
      researcher_id: n(person.researcher_id),
      scopus_id: n(person.scopus_id),
      created_at: person.created_at,
      updated_at: person.updated_at,
      __source: person.__source
    };
  }

  function mapPerson(row) {
    return normalizePerson({
      ...row,
      __source: "supabase"
    });
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const { error } = await getClient().from("kb_persons").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error?.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadAll() {
    const { data, error } = await getClient()
      .from("kb_persons")
      .select("*")
      .order("prijmeni")
      .order("jmeno");
    if (error) throw error;
    return (data || []).map(mapPerson);
  }

  function toPayload(person, { includeId = true, includeCreated = false } = {}) {
    const normalized = normalizePerson(person);
    const payload = { updated_at: new Date().toISOString() };
    if (includeId && normalized.id) payload.id = normalized.id;
    const required = new Set(["prijmeni", "jmeno", "osobni_cislo"]);
    for (const field of PERSON_FIELDS) {
      const value = normalized[field];
      payload[field] = required.has(field) ? value : (value || null);
    }
    if (includeCreated) payload.created_at = person.created_at || new Date().toISOString();
    return payload;
  }

  async function savePerson(person) {
    const payload = toPayload(person, { includeId: true, includeCreated: !person.__existing });
    const { data, error } = await getClient()
      .from("kb_persons")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapPerson(data);
  }

  async function upsertPersonsBatch(items, onProgress) {
    const CHUNK = 400;
    const results = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK).map(item => toPayload(item, { includeId: false, includeCreated: true }));
      const { data, error } = await getClient()
        .from("kb_persons")
        .upsert(chunk, { onConflict: "osobni_cislo" })
        .select("*");
      if (error) throw error;
      results.push(...(data || []).map(mapPerson));
      onProgress?.(Math.min(i + CHUNK, items.length), items.length);
    }
    return results;
  }

  async function deletePerson(id) {
    const { error } = await getClient().from("kb_persons").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocal() {
    migrateLegacyLocal();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizePerson) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocal(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items, null, 2));
  }

  function migrateLegacyLocal() {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return;
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length) {
        localStorage.setItem(STORAGE_KEY, legacy);
      }
    } catch (_) {}
  }

  window.kbSupabasePersons = {
    probeTables,
    loadAll,
    savePerson,
    upsertPersonsBatch,
    deletePerson,
    loadLocal,
    saveLocal,
    migrateLegacyLocal,
    normalizePerson
  };
})();
