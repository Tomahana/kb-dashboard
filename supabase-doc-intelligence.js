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

  const CLICKUP_TOKEN =
    window.clickupConfig?.token || window.CLICKUP_TOKEN || "";

  function getClickUpToken() {
    return (
      CLICKUP_TOKEN ||
      window.kbTaskExport?.loadSettings?.()?.clickup?.apiToken ||
      ""
    );
  }

  function getKbClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey || !window.supabase?.createClient) {
      return null;
    }
    return window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
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

  function topicNamesFromDoc(doc) {
    const names = new Set();
    const tema = (doc.tema || "").trim();
    if (tema) names.add(tema);
    (doc.klicova_slova || []).forEach((kw) => {
      const name = (kw || "").trim();
      if (name) names.add(name);
    });
    return [...names];
  }

  async function countDocLinks(supa, topicId) {
    const { count, error } = await supa
      .from("kb_topic_records")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topicId)
      .eq("source", "doc-intelligence");
    if (error) throw error;
    return count || 0;
  }

  async function linkDocToTopic(supa, topicId, doc) {
    const { data: existing, error: readError } = await supa
      .from("kb_topic_records")
      .select("id")
      .eq("topic_id", topicId)
      .eq("source", "doc-intelligence")
      .eq("source_id", doc.id)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return false;

    const { error } = await supa.from("kb_topic_records").insert({
      topic_id: topicId,
      kb_id: `doc-intelligence:${doc.id}`,
      source: "doc-intelligence",
      source_id: doc.id
    });
    if (error) throw error;
    return true;
  }

  async function syncDocToTopics(doc) {
    const supa = getKbClient();
    if (!supa) return { linked: 0, skipped: true };

    const names = topicNamesFromDoc(doc);
    if (!names.length) return { linked: 0 };

    const { data: topics, error: topicsError } = await supa.from("kb_topics").select("*");
    if (topicsError) throw topicsError;

    const byName = new Map(
      (topics || []).map((t) => [(t.name || "").trim().toLowerCase(), t])
    );

    let linked = 0;
    for (const name of names) {
      const key = name.toLowerCase();
      let topic = byName.get(key);

      if (!topic) {
        const now = new Date().toISOString();
        const { data: created, error: createError } = await supa
          .from("kb_topics")
          .insert({
            name,
            agenda: doc.kategorie || null,
            description: doc.souhrn || null,
            created_at: now,
            updated_at: now
          })
          .select("*")
          .single();
        if (createError) throw createError;
        topic = created;
        byName.set(key, topic);
      }

      const added = await linkDocToTopic(supa, topic.id, doc);
      if (added) linked += 1;

      const docCount = await countDocLinks(supa, topic.id);
      const baseDesc = (topic.description || doc.souhrn || "").split("\n\n[Document Intelligence:")[0].trim();
      const note = `[Document Intelligence: ${docCount} dokument(ů)]`;
      await supa
        .from("kb_topics")
        .update({
          description: baseDesc ? `${baseDesc}\n\n${note}` : note,
          updated_at: new Date().toISOString()
        })
        .eq("id", topic.id);
    }

    return { linked };
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

    async getLatestSummary() {
      const r = await req("doc_intelligence_summary?select=*&order=created_at.desc&limit=1");
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

    syncDocToTopics,

    async createClickUpTask(doc) {
      const token = getClickUpToken();
      if (!token) {
        throw new Error("ClickUp token není nastaven — doplňte clickupConfig.token nebo Nastavení → Export úkolů.");
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
          Authorization: formatClickUpAuth(token),
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
