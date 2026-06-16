// Supabase persistence for Interní soutěže module.

(function () {
  const STORAGE_KEY = "kb-dashboard-competitions-v1";
  const PDF_BUCKET = "kb-competition-docs";
  const PDF_MAX_BYTES = 15 * 1024 * 1024;

  const SPLIT_PROGRAMS = ["connect", "prestige", "rega", "horizon"];
  const LEGACY_PROGRAMS = ["navraty", "phd-seed"];

  let client = null;
  let tablesAvailable = null;
  let splitTablesAvailable = null;
  let storageAvailable = null;

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (client) return client;
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) throw new Error("Chybí supabase-config.js.");
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function tablesForProgram(programSlug) {
    const slug = programSlug || "connect";
    if (SPLIT_PROGRAMS.includes(slug)) {
      return {
        programSlug: slug,
        split: true,
        runs: `kb_competition_${slug}`,
        applications: `kb_competition_${slug}_applications`,
        supported: `kb_competition_${slug}_supported`
      };
    }
    return {
      programSlug: slug,
      split: false,
      runs: "kb_competitions",
      applications: "kb_competition_applications",
      supported: "kb_competition_supported"
    };
  }

  function isPrestigeProgram(programSlug) {
    return programSlug === "prestige";
  }

  function isConnectProgram(programSlug) {
    return programSlug === "connect";
  }

  function mapApplication(row, programSlug) {
    const app = {
      id: row.id,
      competition_id: row.competition_id,
      projekt_id: row.projekt_id || "",
      nazev_projektu: row.nazev_projektu,
      resitel_id: row.resitel_id || null,
      resitel_osobni_cislo: row.resitel_osobni_cislo || "",
      resitel: row.resitel || "",
      fakulta: row.fakulta || "",
      katedra: row.katedra || "",
      financni_pozadavek: Number(row.financni_pozadavek) || 0,
      hodnoceni: row.hodnoceni || "",
      hodnoceni_komise: row.hodnoceni_komise || "",
      stav: row.stav || "Přihláška",
      poznamka: row.poznamka || "",
      created_at: row.created_at
    };
    if (isConnectProgram(programSlug) && row.castka_alokovana != null) {
      app.castka_alokovana = Number(row.castka_alokovana);
    }
    if (isPrestigeProgram(programSlug)) {
      app.cilova_soutez = row.cilova_soutez || "";
      app.termin_podani = row.termin_podani || "";
      app.rozpocet_rok_2 = Number(row.rozpocet_rok_2) || 0;
      app.hodnoceni_prumer = row.hodnoceni_prumer != null ? Number(row.hodnoceni_prumer) : null;
      app.rozhodnuti_poradi = row.rozhodnuti_poradi != null ? Number(row.rozhodnuti_poradi) : null;
      app.hodnoceni_kriteria = row.hodnoceni_kriteria || null;
    }
    return app;
  }

  function mapSupported(row) {
    return {
      id: row.id,
      competition_id: row.competition_id,
      application_id: row.application_id || null,
      projekt_id: row.projekt_id || "",
      nazev_projektu: row.nazev_projektu,
      resitel_id: row.resitel_id || null,
      resitel_osobni_cislo: row.resitel_osobni_cislo || "",
      resitel: row.resitel || "",
      fakulta: row.fakulta || "",
      katedra: row.katedra || "",
      castka_podpory: Number(row.castka_podpory) || 0,
      poznamka: row.poznamka || "",
      created_at: row.created_at
    };
  }

  function mapCompetition(row, programSlug, applications, supported) {
    return {
      id: row.id,
      program_slug: programSlug,
      nazev: row.nazev,
      rok: row.rok,
      beh_cislo: row.beh_cislo ?? 1,
      alokovana_castka: Number(row.alokovana_castka) || 0,
      pokyn: row.pokyn || "",
      pokyn_nazev: row.pokyn_nazev || "",
      vyvza: row.vyvza || "",
      vyvza_nazev: row.vyvza_nazev || "",
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

  function isMissingTableError(error) {
    return error?.code === "PGRST205" || /Could not find the table/i.test(error?.message || "");
  }

  async function probeSplitTables() {
    if (splitTablesAvailable !== null) return splitTablesAvailable;
    try {
      const { error } = await getClient().from("kb_competition_connect").select("id").limit(1);
      splitTablesAvailable = !error || !isMissingTableError(error);
      if (error && isMissingTableError(error)) splitTablesAvailable = false;
    } catch (_) {
      splitTablesAvailable = false;
    }
    return splitTablesAvailable;
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    if (await probeSplitTables()) {
      tablesAvailable = true;
      return true;
    }
    try {
      const { error } = await getClient().from("kb_competitions").select("id").limit(1);
      tablesAvailable = !error || !isMissingTableError(error);
      if (error && isMissingTableError(error)) tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadProgramRuns(tables) {
    const supa = getClient();
    const { data: comps, error: cErr } = await supa.from(tables.runs).select("*").order("rok", { ascending: false });
    if (cErr) throw cErr;
    const { data: apps, error: aErr } = await supa.from(tables.applications).select("*");
    if (aErr) throw aErr;
    const { data: supp, error: sErr } = await supa.from(tables.supported).select("*");
    if (sErr) throw sErr;
    const appsBy = {};
    (apps || []).forEach(a => {
      appsBy[a.competition_id] ||= [];
      appsBy[a.competition_id].push(mapApplication(a, tables.programSlug));
    });
    const suppBy = {};
    (supp || []).forEach(s => { suppBy[s.competition_id] ||= []; suppBy[s.competition_id].push(mapSupported(s)); });
    return (comps || []).map(c => mapCompetition(
      c,
      tables.programSlug,
      appsBy[c.id],
      suppBy[c.id]
    ));
  }

  async function loadLegacyCompetitions() {
    const supa = getClient();
    const { data: comps, error: cErr } = await supa.from("kb_competitions").select("*").order("rok", { ascending: false });
    if (cErr) {
      if (isMissingTableError(cErr)) return [];
      throw cErr;
    }
    const legacyComps = (comps || []).filter(c => {
      if (SPLIT_PROGRAMS.includes(c.program_slug) && splitTablesAvailable) return false;
      return true;
    });
    if (!legacyComps.length) return [];
    const { data: apps, error: aErr } = await supa.from("kb_competition_applications").select("*");
    if (aErr) throw aErr;
    const { data: supp, error: sErr } = await supa.from("kb_competition_supported").select("*");
    if (sErr) throw sErr;
    const legacyIds = new Set(legacyComps.map(c => c.id));
    const slugByCompId = new Map(legacyComps.map(c => [c.id, c.program_slug]));
    const appsBy = {};
    (apps || []).forEach(a => {
      if (!legacyIds.has(a.competition_id)) return;
      appsBy[a.competition_id] ||= [];
      appsBy[a.competition_id].push(mapApplication(a, slugByCompId.get(a.competition_id)));
    });
    const suppBy = {};
    (supp || []).forEach(s => {
      if (!legacyIds.has(s.competition_id)) return;
      suppBy[s.competition_id] ||= [];
      suppBy[s.competition_id].push(mapSupported(s));
    });
    return legacyComps.map(c => mapCompetition(c, c.program_slug, appsBy[c.id], suppBy[c.id]));
  }

  async function loadAll() {
    await probeSplitTables();
    const results = [];
    if (splitTablesAvailable) {
      for (const slug of SPLIT_PROGRAMS) {
        const loaded = await loadProgramRuns(tablesForProgram(slug));
        results.push(...loaded);
      }
    }
    results.push(...await loadLegacyCompetitions());
    return results.sort((a, b) => (b.rok || 0) - (a.rok || 0) || (b.beh_cislo || 0) - (a.beh_cislo || 0));
  }

  function buildRunPayload(comp, tables) {
    const payload = {
      id: comp.id,
      nazev: comp.nazev,
      rok: comp.rok || null,
      beh_cislo: comp.beh_cislo || 1,
      alokovana_castka: comp.alokovana_castka || 0,
      pokyn: comp.pokyn || null,
      pokyn_nazev: comp.pokyn_nazev || null,
      vyvza: comp.vyvza || null,
      vyvza_nazev: comp.vyvza_nazev || null,
      pocet_prihlasek: (comp.applications || []).length,
      hodnoceni_prodekanu: comp.hodnoceni_prodekanu || null,
      rozhodnuti_prorektorky: comp.rozhodnuti_prorektorky || null,
      poznamka: comp.poznamka || null,
      stav: comp.stav || "Aktivní",
      updated_at: new Date().toISOString()
    };
    if (!tables.split) payload.program_slug = comp.program_slug;
    if (!comp.__existing) payload.created_at = comp.created_at || new Date().toISOString();
    return payload;
  }

  async function saveCompetition(comp) {
    const tables = tablesForProgram(comp.program_slug);
    const supa = getClient();
    const payload = buildRunPayload(comp, tables);
    const { data, error } = await supa.from(tables.runs).upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throw error;
    await syncApplications(tables, data.id, comp.applications || []);
    await syncSupported(tables.supported, data.id, comp.supported || []);
    return mapCompetition(data, comp.program_slug, comp.applications || [], comp.supported || []);
  }

  async function deleteCompetition(id, programSlug) {
    await deleteCompetitionDocs(id);
    const tables = tablesForProgram(programSlug);
    const { error } = await getClient().from(tables.runs).delete().eq("id", id);
    if (error) throw error;
  }

  function resolvePdfUrl(path) {
    if (!path) return "";
    if (path.startsWith("data:") || path.startsWith("http")) return path;
    const base = (window.KB_SUPABASE?.url || "").replace(/\/$/, "");
    if (!base) return path;
    return `${base}/storage/v1/object/public/${PDF_BUCKET}/${path}`;
  }

  async function probeStorage() {
    if (storageAvailable !== null) return storageAvailable;
    try {
      const { error } = await getClient().storage.from(PDF_BUCKET).list("", { limit: 1 });
      storageAvailable = !error;
    } catch (_) {
      storageAvailable = false;
    }
    return storageAvailable;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Soubor se nepodařilo přečíst."));
      reader.readAsDataURL(file);
    });
  }

  function assertPdfFile(file) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new Error("Soubor musí být ve formátu PDF.");
    if (file.size > PDF_MAX_BYTES) throw new Error("PDF může mít maximálně 15 MB.");
  }

  async function uploadPdf(compId, kind, file) {
    assertPdfFile(file);
    const nazev = file.name;
    if (await probeTables() && await probeStorage()) {
      const path = `${compId}/${kind}.pdf`;
      const { error } = await getClient().storage.from(PDF_BUCKET).upload(path, file, {
        upsert: true,
        contentType: "application/pdf"
      });
      if (!error) return { path, nazev };
    }
    return { path: await readFileAsDataUrl(file), nazev };
  }

  async function deletePdf(path) {
    if (!path || path.startsWith("data:") || path.startsWith("http")) return;
    if (!(await probeStorage())) return;
    await getClient().storage.from(PDF_BUCKET).remove([path]);
  }

  async function deleteCompetitionDocs(compId) {
    await deletePdf(`${compId}/pokyn.pdf`);
    await deletePdf(`${compId}/vyvza.pdf`);
  }

  function applicationRow(item, compId, programSlug) {
    const row = {
      id: item.id,
      competition_id: compId,
      projekt_id: item.projekt_id || null,
      nazev_projektu: item.nazev_projektu,
      resitel_id: item.resitel_id || null,
      resitel_osobni_cislo: item.resitel_osobni_cislo || null,
      resitel: item.resitel || null,
      fakulta: item.fakulta || null,
      katedra: item.katedra || null,
      financni_pozadavek: item.financni_pozadavek || 0,
      hodnoceni: item.hodnoceni || null,
      hodnoceni_komise: item.hodnoceni_komise || null,
      stav: item.stav || "Přihláška",
      poznamka: item.poznamka || null
    };
    if (isConnectProgram(programSlug)) {
      row.castka_alokovana = item.castka_alokovana ?? null;
    }
    if (isPrestigeProgram(programSlug)) {
      row.cilova_soutez = item.cilova_soutez || null;
      row.termin_podani = item.termin_podani || null;
      row.rozpocet_rok_2 = item.rozpocet_rok_2 || null;
      row.hodnoceni_prumer = item.hodnoceni_prumer ?? null;
      row.rozhodnuti_poradi = item.rozhodnuti_poradi ?? null;
      row.hodnoceni_kriteria = item.hodnoceni_kriteria || null;
    }
    return row;
  }

  async function syncApplications(tables, compId, items) {
    const supa = getClient();
    const tableName = tables.applications;
    const { data: existing } = await supa.from(tableName).select("id").eq("competition_id", compId);
    const existingIds = new Set((existing || []).map(r => r.id));
    const desiredIds = new Set(items.filter(i => i.id).map(i => i.id));
    const toRemove = [...existingIds].filter(id => !desiredIds.has(id));
    if (toRemove.length) await supa.from(tableName).delete().in("id", toRemove);
    for (const item of items) {
      const row = applicationRow(item, compId, tables.programSlug);
      if (!item.__existing) row.created_at = item.created_at || new Date().toISOString();
      await supa.from(tableName).upsert(row, { onConflict: "id" });
    }
  }

  async function syncSupported(tableName, compId, items) {
    const supa = getClient();
    const { data: existing } = await supa.from(tableName).select("id").eq("competition_id", compId);
    const existingIds = new Set((existing || []).map(r => r.id));
    const desiredIds = new Set(items.filter(i => i.id).map(i => i.id));
    const toRemove = [...existingIds].filter(id => !desiredIds.has(id));
    if (toRemove.length) await supa.from(tableName).delete().in("id", toRemove);
    for (const item of items) {
      const row = {
        id: item.id,
        competition_id: compId,
        application_id: item.application_id || null,
        projekt_id: item.projekt_id || null,
        nazev_projektu: item.nazev_projektu,
        resitel_id: item.resitel_id || null,
        resitel_osobni_cislo: item.resitel_osobni_cislo || null,
        resitel: item.resitel || null,
        fakulta: item.fakulta || null,
        katedra: item.katedra || null,
        castka_podpory: item.castka_podpory || 0,
        poznamka: item.poznamka || null
      };
      if (!item.__existing) row.created_at = item.created_at || new Date().toISOString();
      await supa.from(tableName).upsert(row, { onConflict: "id" });
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
    probeSplitTables,
    probeStorage,
    tablesForProgram,
    loadAll,
    saveCompetition,
    deleteCompetition,
    uploadPdf,
    deletePdf,
    deleteCompetitionDocs,
    resolvePdfUrl,
    loadLocal,
    saveLocal,
    SPLIT_PROGRAMS,
    LEGACY_PROGRAMS
  };
})();
