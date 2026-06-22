/**
 * supabase-doc-intelligence.js
 * Datová vrstva pro Document Intelligence modul v kb-dashboard.
 * Tabulka doc_intelligence — projekt uhk-analytics (nebo stejný jako KB_SUPABASE).
 */

const DocIntelligenceDB = (() => {
  const DOC_SUPABASE_URL =
    window.DOC_SUPABASE?.url || window.DOC_SUPABASE_URL || window.KB_SUPABASE?.url || "";
  const DOC_SUPABASE_ANON =
    window.DOC_SUPABASE?.anonKey || window.DOC_SUPABASE_ANON || window.KB_SUPABASE?.anonKey || "";

  const CLICKUP_LIST_ID =
    window.clickupConfig?.listId || window.DOC_CLICKUP_LIST_ID || "901514038952";

  function getClickUpToken() {
    return (
      window.clickupConfig?.token ||
      window.kbTaskExport?.loadSettings?.()?.clickup?.apiToken ||
      ""
    );
  }

  function formatClickUpAuth(token) {
    const t = (token || "").toString().trim();
    if (!t) return "";
    if (/^bearer\s+/i.test(t)) return t;
    if (t.startsWith("pk_")) return t;
    return `Bearer ${t}`;
  }

  async function req(path, opts = {}) {
    if (!DOC_SUPABASE_URL || !DOC_SUPABASE_ANON) {
      throw new Error("Chybí DOC_SUPABASE nebo KB_SUPABASE v supabase-config.js.");
    }
    const r = await fetch(DOC_SUPABASE_URL + "/rest/v1/" + path, {
      headers: {
        apikey: DOC_SUPABASE_ANON,
        Authorization: "Bearer " + DOC_SUPABASE_ANON,
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

  return {
    async getAll({ limit = 500, stav, kategorie, dulezitost } = {}) {
      let q = `doc_intelligence?select=*&order=created_at.desc&limit=${limit}`;
      if (stav) q += `&stav=eq.${encodeURIComponent(stav)}`;
      if (kategorie) q += `&kategorie=eq.${encodeURIComponent(kategorie)}`;
      if (dulezitost) q += `&dulezitost=eq.${dulezitost}`;
      return req(q);
    },

    async getById(id) {
      const r = await req(`doc_intelligence?id=eq.${id}&select=*`);
      return r[0] || null;
    },

    async getStats() {
      const today = new Date().toISOString().slice(0, 10);
      const [all, todayDocs, newDocs, critical] = await Promise.all([
        req("doc_intelligence?select=id"),
        req(`doc_intelligence?select=id&created_at=gte.${today}T00:00:00`),
        req("doc_intelligence?select=id&stav=eq.nový"),
        req("doc_intelligence?select=id&dulezitost=eq.5")
      ]);
      return {
        total: all.length,
        today: todayDocs.length,
        new: newDocs.length,
        critical: critical.length
      };
    },

    async update(id, patch) {
      return req(`doc_intelligence?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
      });
    },

    async createClickUpTask(doc) {
      const CLICKUP_TOKEN = getClickUpToken();
      if (!CLICKUP_TOKEN) {
        throw new Error("ClickUp token není nastaven — doplňte v Nastavení (Export úkolů).");
      }
      if (doc.clickup_task_id) {
        throw new Error("Úkol již existuje: " + doc.clickup_task_id);
      }

      const priorityMap = { 1: 4, 2: 3, 3: 3, 4: 2, 5: 1 };
      const body = {
        name: doc.tema || doc.file_name,
        description: [
          doc.souhrn || "",
          "",
          `📁 Soubor: ${doc.file_name}`,
          `📂 Složka: ${doc.folder || "—"}`,
          doc.file_url ? `🔗 ${doc.file_url}` : "",
          doc.akce_doporucena ? `\n💡 Doporučená akce: ${doc.akce_doporucena}` : "",
          doc.poznamky ? `\n📝 Poznámky: ${doc.poznamky}` : ""
        ]
          .filter(Boolean)
          .join("\n")
          .trim(),
        priority: priorityMap[doc.dulezitost] || 3,
        ...(doc.termin ? { due_date: new Date(doc.termin).getTime() } : {}),
        tags: (doc.klicova_slova || []).slice(0, 3)
      };

      const r = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
        method: "POST",
        headers: {
          Authorization: formatClickUpAuth(CLICKUP_TOKEN),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.err || data.ECODE || r.statusText);

      await this.update(doc.id, { clickup_task_id: data.id });
      return data.id;
    }
  };
})();

window.DocIntelligenceDB = DocIntelligenceDB;
