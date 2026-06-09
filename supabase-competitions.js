// Supabase persistence for Interní soutěže module.

(function () {
  const STORAGE_KEY = "kb-dashboard-competitions-v1";
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

  function mapCompetition(row, applications, supported) {
    return {
      id: row.id,
      program_slug: row.program_slug,
      nazev: row.nazev,
      rok: row.rok,
      beh_cislo: row.beh_cislo ?? 1,
      alokovana_castka: Number(row.alokovana_castka) || 0,
      pokyn: row.pokyn || "",
      vyvza: row.vyvza || "",
      pocet_prihlasek: row.pocet_prihlasek ?? (applications?.length || 0),
      hodnoceni_prodekanu: row.hodnoceni_prodekanu || "",
      rozhodnuti_prorektorky: row.rozhodnuti_prorektorky || "",
      poznamka: row.poznamka || "",
      stav: row.stav || "Aktivní",
      applications: applications || [],
      supported: supported || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      __source: "supabase"
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const { error } = await getClient().from("kb_competitions").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error?.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadAll() {
    const supa = getClient();
    const { data: comps, error: cErr } = await supa.from("kb_competitions").select("*").order("rok", { ascending: false });
    if (cErr) throw cErr;
    const { data: apps, error: aErr } = await supa.from("kb_competition_applications").select("*");
    if (aErr) throw aErr;
    const { data: supp, error: sErr } = await supa.from("kb_competition_supported").select("*");
    if (sErr) throw sErr;
    const appsBy = {};
    (apps || []).forEach(a => { appsBy[a.competition_id] ||= []; appsBy[a.competition_id].push(a); });
    const suppBy = {};
    (supp || []).forEach(s => { suppBy[s.competition_id] ||= []; suppBy[s.competition_id].push(s); });
    return (comps || []).map(c => mapCompetition(c, appsBy[c.id], suppBy[c.id]));
  }

  async function saveCompetition(comp) {
    const supa = getClient();
    const payload = {
      id: comp.id,
      program_slug: comp.program_slug,
      nazev: comp.nazev,
      rok: comp.rok || null,
      beh_cislo: comp.beh_cislo || 1,
      alokovana_castka: comp.alokovana_castka || 0,
      pokyn: comp.pokyn || null,
      vyvza: comp.vyvza || null,
      pocet_prihlasek: (comp.applications || []).length,
      hodnoceni_prodekanu: comp.hodnoceni_prodekanu || null,
      rozhodnuti_prorektorky: comp.rozhodnuti_prorektorky || null,
      poznamka: comp.poznamka || null,
      stav: comp.stav || "Aktivní",
      updated_at: new Date().toISOString()
    };
    if (!comp.__existing) payload.created_at = comp.created_at || new Date().toISOString();
    const { data, error } = await supa.from("kb_competitions").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throw error;
    await syncApplications(data.id, comp.applications || []);
    await syncSupported(data.id, comp.supported || []);
    return mapCompetition(data, comp.applications || [], comp.supported || []);
  }

  async function deleteCompetition(id) {
    const { error } = await getClient().from("kb_competitions").delete().eq("id", id);
    if (error) throw error;
  }

  async function syncApplications(compId, items) {
    const supa = getClient();
    const { data: existing } = await supa.from("kb_competition_applications").select("id").eq("competition_id", compId);
    const existingIds = new Set((existing || []).map(r => r.id));
    const desiredIds = new Set(items.filter(i => i.id).map(i => i.id));
    const toRemove = [...existingIds].filter(id => !desiredIds.has(id));
    if (toRemove.length) await supa.from("kb_competition_applications").delete().in("id", toRemove);
    for (const item of items) {
      const row = {
        id: item.id,
        competition_id: compId,
        nazev_projektu: item.nazev_projektu,
        resitel: item.resitel || null,
        fakulta: item.fakulta || null,
        financni_pozadavek: item.financni_pozadavek || 0,
        hodnoceni: item.hodnoceni || null,
        stav: item.stav || "Přihláška",
        poznamka: item.poznamka || null
      };
      if (!item.__existing) row.created_at = item.created_at || new Date().toISOString();
      await supa.from("kb_competition_applications").upsert(row, { onConflict: "id" });
    }
  }

  async function syncSupported(compId, items) {
    const supa = getClient();
    const { data: existing } = await supa.from("kb_competition_supported").select("id").eq("competition_id", compId);
    const existingIds = new Set((existing || []).map(r => r.id));
    const desiredIds = new Set(items.filter(i => i.id).map(i => i.id));
    const toRemove = [...existingIds].filter(id => !desiredIds.has(id));
    if (toRemove.length) await supa.from("kb_competition_supported").delete().in("id", toRemove);
    for (const item of items) {
      const row = {
        id: item.id,
        competition_id: compId,
        application_id: item.application_id || null,
        nazev_projektu: item.nazev_projektu,
        resitel: item.resitel || null,
        fakulta: item.fakulta || null,
        castka_podpory: item.castka_podpory || 0,
        poznamka: item.poznamka || null
      };
      if (!item.__existing) row.created_at = item.created_at || new Date().toISOString();
      await supa.from("kb_competition_supported").upsert(row, { onConflict: "id" });
    }
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

  window.kbSupabaseCompetitions = {
    probeTables,
    loadAll,
    saveCompetition,
    deleteCompetition,
    loadLocal,
    saveLocal
  };
})();
