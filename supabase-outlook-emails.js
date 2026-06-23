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

  function hasAkce(email) {
    const tasks = email.ukoly || [];
    return tasks.length > 0 || email.kategorie === "akce_required";
  }

  return {
    async getAll({ limit = 500, folder, kategorie, priorita } = {}) {
      let q = `emails?select=*&order=received_at.desc&limit=${limit}`;
      if (folder) q += `&folder=eq.${encodeURIComponent(folder)}`;
      if (kategorie) q += `&kategorie=eq.${encodeURIComponent(kategorie)}`;
      if (priorita) q += `&priorita=eq.${encodeURIComponent(priorita)}`;
      return req(q);
    },

    async getById(id) {
      const r = await req(`emails?id=eq.${id}&select=*`);
      return r[0] || null;
    },

    async getStats() {
      const today = new Date().toISOString().slice(0, 10);
      const [all, todayEmails, highPriority] = await Promise.all([
        req("emails?select=id,ukoly,kategorie"),
        req(`emails?select=id&received_at=gte.${today}T00:00:00`),
        req("emails?select=id&priorita=eq.vysok%C3%A1")
      ]);
      return {
        total: all.length,
        today: todayEmails.length,
        akce: all.filter(hasAkce).length,
        high: highPriority.length
      };
    }
  };
})();

window.OutlookEmailsDB = OutlookEmailsDB;
