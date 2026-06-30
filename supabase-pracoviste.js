// Supabase persistence — modul DKRVO / pracoviště.

(function () {
  const STORAGE_KEY = "kb-dashboard-pracoviste-v1";

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

  function n(s) {
    return (s || "").toString().trim();
  }

  function mapMember(row) {
    return {
      id: row.id,
      workplace_id: row.workplace_id,
      jmeno: row.jmeno || "",
      tituly: row.tituly || "",
      funkce: row.funkce || "",
      email: row.email || "",
      poznamka: row.poznamka || "",
      osobni_cislo: row.osobni_cislo || "",
      poradi: Number(row.poradi) || 0,
      aktivni: row.aktivni !== false,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __existing: true
    };
  }

  function mapWorkplace(row) {
    const members = (row.kb_workplace_members || []).map(mapMember)
      .sort((a, b) => a.poradi - b.poradi || a.jmeno.localeCompare(b.jmeno, "cs"));
    return {
      id: row.id,
      kod: row.kod || "",
      nazev: row.nazev || "",
      typ: row.typ || "katedra",
      zkr_fak: row.zkr_fak || "",
      url: row.url || "",
      web_text: row.web_text || "",
      web_stazeno_at: row.web_stazeno_at || null,
      parent_id: row.parent_id || null,
      poznamka: row.poznamka || "",
      poradi: Number(row.poradi) || 0,
      members,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const { error } = await getClient().from("kb_workplaces").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error?.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadAll() {
    const { data, error } = await getClient()
      .from("kb_workplaces")
      .select(`
        *,
        kb_workplace_members (*)
      `)
      .order("poradi")
      .order("nazev");
    if (error) throw error;
    return (data || []).map(mapWorkplace);
  }

  function toWorkplacePayload(wp) {
    return {
      id: wp.id,
      kod: n(wp.kod).toUpperCase(),
      nazev: wp.nazev || "Bez názvu",
      typ: wp.typ || "katedra",
      zkr_fak: wp.zkr_fak || null,
      url: wp.url || null,
      web_text: wp.web_text || null,
      web_stazeno_at: wp.web_stazeno_at || null,
      parent_id: wp.parent_id || null,
      poznamka: wp.poznamka || null,
      poradi: Number(wp.poradi) || 0,
      updated_at: new Date().toISOString()
    };
  }

  function toMemberPayload(member) {
    return {
      id: member.id,
      workplace_id: member.workplace_id,
      jmeno: member.jmeno || "",
      tituly: member.tituly || null,
      funkce: member.funkce || null,
      email: member.email || null,
      poznamka: member.poznamka || null,
      osobni_cislo: member.osobni_cislo || null,
      poradi: Number(member.poradi) || 0,
      aktivni: member.aktivni !== false,
      updated_at: new Date().toISOString()
    };
  }

  async function upsertWorkplace(wp) {
    const payload = toWorkplacePayload(wp);
    const { data, error } = await getClient()
      .from("kb_workplaces")
      .upsert(payload, { onConflict: "kod" })
      .select("*")
      .single();
    if (error) throw error;
    const existing = wp.members || [];
    return mapWorkplace({ ...data, kb_workplace_members: existing });
  }

  async function upsertMember(member) {
    const payload = toMemberPayload(member);
    const { data, error } = await getClient()
      .from("kb_workplace_members")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapMember(data);
  }

  async function deleteMember(id) {
    const { error } = await getClient().from("kb_workplace_members").delete().eq("id", id);
    if (error) throw error;
  }

  async function deleteWorkplace(id) {
    const { error } = await getClient().from("kb_workplaces").delete().eq("id", id);
    if (error) throw error;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        workplaces: Array.isArray(parsed.workplaces) ? parsed.workplaces : []
      };
    } catch (_) {
      return { workplaces: [] };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  window.kbSupabasePracoviste = {
    probeTables,
    loadAll,
    upsertWorkplace,
    upsertMember,
    deleteMember,
    deleteWorkplace,
    loadLocal,
    saveLocal,
    mapWorkplace,
    mapMember
  };
})();
