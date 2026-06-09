// Globální persistence osob – sdíleno mezi moduly.

(function () {
  const STORAGE_KEY = "kb-dashboard-persons-v1";
  const LEGACY_KEY = "kb-dashboard-competition-persons-v1";
  let client = null;
  let tablesAvailable = null;

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (client) return client;
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) throw new Error("Chybí supabase-config.js.");
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function mapPerson(row) {
    return {
      id: row.id,
      osobni_cislo: row.osobni_cislo || "",
      titul_pred: row.titul_pred || "",
      jmeno: row.jmeno || "",
      prijmeni: row.prijmeni || "",
      titul_za: row.titul_za || "",
      email: row.email || "",
      telefon: row.telefon || "",
      fakulta: row.fakulta || "",
      katedra: row.katedra || "",
      soucast: row.soucast || "",
      poznamka: row.poznamka || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase"
    };
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

  async function savePerson(person) {
    const payload = {
      id: person.id,
      osobni_cislo: person.osobni_cislo || null,
      titul_pred: person.titul_pred || null,
      jmeno: person.jmeno,
      prijmeni: person.prijmeni,
      titul_za: person.titul_za || null,
      email: person.email || null,
      telefon: person.telefon || null,
      fakulta: person.fakulta || null,
      katedra: person.katedra || null,
      soucast: person.soucast || null,
      poznamka: person.poznamka || null,
      updated_at: new Date().toISOString()
    };
    if (!person.__existing) payload.created_at = person.created_at || new Date().toISOString();
    const { data, error } = await getClient()
      .from("kb_persons")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapPerson(data);
  }

  async function deletePerson(id) {
    const { error } = await getClient().from("kb_persons").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocal() {
    migrateLegacyLocal();
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
    deletePerson,
    loadLocal,
    saveLocal,
    migrateLegacyLocal
  };
})();
