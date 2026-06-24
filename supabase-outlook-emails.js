/**
 * supabase-outlook-emails.js
 * Datová vrstva pro Outlook emaily modul v kb-dashboard.
 *
 * ⚠️ TENTO SOUBOR NEPATŘÍ DO SUPABASE SQL EDITORU — je to JavaScript pro prohlížeč.
 * Tabulka: emails (projekt xrgdfghiwjyrdckpjzdj).
 */

const OutlookEmailsDB = (() => {
  const OUTLOOK_SUPABASE_URL =
    window.OUTLOOK_SUPABASE?.url ||
    window.OUTLOOK_SUPABASE_URL ||
    window.KB_SUPABASE?.url ||
    "https://xrgdfghiwjyrdckpjzdj.supabase.co";
  const OUTLOOK_SUPABASE_ANON =
    window.OUTLOOK_SUPABASE?.anonKey ||
    window.OUTLOOK_SUPABASE_ANON ||
    window.KB_SUPABASE?.anonKey ||
    "";

  function getKbClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey || !window.supabase?.createClient) {
      return null;
    }
    return window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
  }

  async function req(path, opts = {}) {
    if (!OUTLOOK_SUPABASE_URL || !OUTLOOK_SUPABASE_ANON) {
      throw new Error("Chybí OUTLOOK_SUPABASE nebo KB_SUPABASE v supabase-config.js.");
    }
    const r = await fetch(OUTLOOK_SUPABASE_URL + "/rest/v1/" + path, {
      headers: {
        apikey: OUTLOOK_SUPABASE_ANON,
        Authorization: "Bearer " + OUTLOOK_SUPABASE_ANON,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(opts.headers || {})
      },
      ...opts
    });
    if (!r.ok) throw new Error(await r.text());
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  }

  async function patchEmail(id, patch) {
    const r = await req(`emails?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    return r[0] || null;
  }

  function hasAkce(email) {
    const tasks = email.ukoly || [];
    const kat = email.kategorie_manual || email.kategorie;
    return tasks.length > 0 || kat === "akce_required";
  }

  function effectivePriorita(email) {
    return email.priorita_manual || email.priorita || "střední";
  }

  return {
    async getAll({ limit = 500, folder, kategorie, priorita, showHidden = false } = {}) {
      let q = `emails?select=*&order=received_at.desc&limit=${limit}`;
      if (!showHidden) q += "&stav=neq.skryto";
      if (folder) q += `&folder=eq.${encodeURIComponent(folder)}`;
      if (kategorie) q += `&kategorie=eq.${encodeURIComponent(kategorie)}`;
      if (priorita) q += `&priorita=eq.${encodeURIComponent(priorita)}`;
      return req(q);
    },

    async getById(id) {
      const r = await req(`emails?id=eq.${id}&select=*`);
      return r[0] || null;
    },

    async getLastUpdated() {
      const r = await req("emails?select=processed_at&order=processed_at.desc.nullslast&limit=1");
      return r[0]?.processed_at || null;
    },

    async getStats({ showHidden = false } = {}) {
      const hiddenFilter = showHidden ? "" : "&stav=neq.skryto";
      const today = new Date().toISOString().slice(0, 10);
      const all = await req(
        `emails?select=id,ukoly,kategorie,kategorie_manual,priorita,priorita_manual,received_at${hiddenFilter}`
      );
      return {
        total: all.length,
        today: all.filter((e) => (e.received_at || "").slice(0, 10) === today).length,
        akce: all.filter(hasAkce).length,
        high: all.filter((e) => effectivePriorita(e) === "vysoká").length
      };
    },

    async getTopics() {
      const supa = getKbClient();
      if (!supa) return [];
      const { data, error } = await supa.from("kb_topics").select("id,name,agenda").order("name");
      if (error) throw error;
      return data || [];
    },

    async updateStav(id, stav) {
      return patchEmail(id, { stav });
    },

    async updatePrioritaManual(id, priorita) {
      return patchEmail(id, { priorita_manual: priorita });
    },

    async updateKategorieManual(id, kategorie) {
      return patchEmail(id, { kategorie_manual: kategorie });
    },

    async updateTopicIds(id, topicIds) {
      return patchEmail(id, { topic_ids: topicIds });
    }
  };
})();

window.OutlookEmailsDB = OutlookEmailsDB;
