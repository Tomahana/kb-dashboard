// Supabase persistence — modul Rady a orgány UHK.

(function () {
  const STORAGE_KEY = "kb-dashboard-rady-organy-v1";

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
      organ_id: row.organ_id,
      jmeno: row.jmeno || "",
      tituly: row.tituly || "",
      funkce: row.funkce || "",
      email: row.email || "",
      poznamka: row.poznamka || "",
      fakulta: row.fakulta || "",
      zkr_fak: row.zkr_fak || "",
      katedra: row.katedra || "",
      pusobiste: row.pusobiste || "",
      kmenove_pracoviste: row.kmenove_pracoviste || "",
      sitove_info: row.sitove_info || "",
      kodorg: row.kodorg || "",
      osobni_cislo: row.osobni_cislo || "",
      poradi: Number(row.poradi) || 0,
      aktivni: row.aktivni !== false,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __existing: true
    };
  }

  function mapCheck(row) {
    return {
      id: row.id,
      organ_id: row.organ_id,
      checked_at: row.checked_at,
      source_text: row.source_text || "",
      ai_result: row.ai_result || null,
      status: row.status || "pending",
      created_at: row.created_at
    };
  }

  function mapOrgan(row) {
    const members = (row.kb_organ_members || []).map(mapMember).sort((a, b) => a.poradi - b.poradi || a.jmeno.localeCompare(b.jmeno, "cs"));
    const checks = (row.kb_organ_personnel_checks || []).map(mapCheck).sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));
    return {
      id: row.id,
      slug: row.slug,
      nazev: row.nazev || "",
      url: row.url || "",
      ucel_summary: row.ucel_summary || "",
      jednaci_rad_url: row.jednaci_rad_url || "",
      jednaci_rad_text: row.jednaci_rad_text || "",
      jednaci_rad_stazeno_at: row.jednaci_rad_stazeno_at || null,
      aktuality_url: row.aktuality_url || "",
      aktuality_text: row.aktuality_text || "",
      aktuality_stazeno_at: row.aktuality_stazeno_at || null,
      poznamka: row.poznamka || "",
      members,
      checks,
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase",
      __existing: true
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const { error } = await getClient().from("kb_organs").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error?.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadAll() {
    const { data, error } = await getClient()
      .from("kb_organs")
      .select(`
        *,
        kb_organ_members (*),
        kb_organ_personnel_checks (*)
      `)
      .order("nazev");
    if (error) throw error;
    return (data || []).map(mapOrgan);
  }

  function toOrganPayload(organ) {
    return {
      id: organ.id,
      slug: organ.slug,
      nazev: organ.nazev || "Bez názvu",
      url: organ.url || null,
      ucel_summary: organ.ucel_summary || null,
      jednaci_rad_url: organ.jednaci_rad_url || null,
      jednaci_rad_text: organ.jednaci_rad_text || null,
      jednaci_rad_stazeno_at: organ.jednaci_rad_stazeno_at || null,
      aktuality_url: organ.aktuality_url || null,
      aktuality_text: organ.aktuality_text || null,
      aktuality_stazeno_at: organ.aktuality_stazeno_at || null,
      poznamka: organ.poznamka || null,
      updated_at: new Date().toISOString()
    };
  }

  function toMemberPayload(member) {
    return {
      id: member.id,
      organ_id: member.organ_id,
      jmeno: member.jmeno || "",
      tituly: member.tituly || null,
      funkce: member.funkce || null,
      email: member.email || null,
      poznamka: member.poznamka || null,
      fakulta: member.fakulta || null,
      zkr_fak: member.zkr_fak || null,
      katedra: member.katedra || null,
      pusobiste: member.pusobiste || null,
      kmenove_pracoviste: member.kmenove_pracoviste || null,
      sitove_info: member.sitove_info || null,
      kodorg: member.kodorg || null,
      osobni_cislo: member.osobni_cislo || null,
      poradi: Number(member.poradi) || 0,
      aktivni: member.aktivni !== false,
      updated_at: new Date().toISOString()
    };
  }

  async function upsertOrgan(organ) {
    const payload = toOrganPayload(organ);
    const { data, error } = await getClient()
      .from("kb_organs")
      .upsert(payload, { onConflict: "slug" })
      .select("*")
      .single();
    if (error) throw error;
    const existing = organ.members || [];
    const checks = organ.checks || [];
    return mapOrgan({ ...data, kb_organ_members: existing, kb_organ_personnel_checks: checks });
  }

  async function upsertMember(member) {
    const payload = toMemberPayload(member);
    const { data, error } = await getClient()
      .from("kb_organ_members")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapMember(data);
  }

  async function deleteMember(id) {
    const { error } = await getClient().from("kb_organ_members").delete().eq("id", id);
    if (error) throw error;
  }

  async function saveCheck(check) {
    const payload = {
      id: check.id,
      organ_id: check.organ_id,
      checked_at: check.checked_at || new Date().toISOString(),
      source_text: check.source_text || null,
      ai_result: check.ai_result || null,
      status: check.status || "pending"
    };
    const { data, error } = await getClient()
      .from("kb_organ_personnel_checks")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return mapCheck(data);
  }

  async function updateCheckStatus(id, status) {
    const { data, error } = await getClient()
      .from("kb_organ_personnel_checks")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapCheck(data);
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        organs: Array.isArray(parsed.organs) ? parsed.organs : []
      };
    } catch (_) {
      return { organs: [] };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  window.kbSupabaseRadyOrgany = {
    probeTables,
    loadAll,
    upsertOrgan,
    upsertMember,
    deleteMember,
    saveCheck,
    updateCheckStatus,
    loadLocal,
    saveLocal,
    mapOrgan,
    mapMember
  };
})();
