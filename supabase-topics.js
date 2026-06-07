// Supabase persistence for KB topics and topic-record links.

(function () {
  const TOPICS_KEY = "kb-dashboard-topics-v1";
  const MIGRATED_KEY = "kb-dashboard-topics-migrated-v1";
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

  function mapTopicRow(row, recordIds) {
    return {
      id: row.id,
      name: row.name || "Bez názvu",
      agenda: row.agenda || "",
      description: row.description || "",
      ai_summary: row.ai_summary || "",
      recordIds: recordIds || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      ai_summary_updated_at: row.ai_summary_updated_at || null,
      __source: "supabase"
    };
  }

  async function probeTables() {
    if (tablesAvailable !== null) return tablesAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_topics").select("id").limit(1);
      tablesAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") tablesAvailable = false;
    } catch (_) {
      tablesAvailable = false;
    }
    return tablesAvailable;
  }

  async function loadTopicsFromSupabase() {
    const supa = getClient();
    const { data: topicRows, error: topicError } = await supa
      .from("kb_topics")
      .select("*")
      .order("updated_at", { ascending: false });
    if (topicError) throw topicError;

    const { data: linkRows, error: linkError } = await supa
      .from("kb_topic_records")
      .select("topic_id, kb_id");
    if (linkError) throw linkError;

    const linksByTopic = {};
    (linkRows || []).forEach(row => {
      linksByTopic[row.topic_id] ||= [];
      linksByTopic[row.topic_id].push(row.kb_id);
    });

    return (topicRows || []).map(row => mapTopicRow(row, linksByTopic[row.id] || []));
  }

  async function upsertTopic(topic) {
    const supa = getClient();
    const now = new Date().toISOString();
    const payload = {
      id: topic.id,
      name: topic.name,
      agenda: topic.agenda || null,
      description: topic.description || null,
      ai_summary: topic.ai_summary || null,
      ai_summary_updated_at: topic.ai_summary_updated_at || null,
      updated_at: now
    };
    if (!topic.__existing) payload.created_at = topic.created_at || now;

    const { data, error } = await supa
      .from("kb_topics")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapTopicRow(data, topic.recordIds || []);
  }

  async function deleteTopicFromSupabase(topicId) {
    const supa = getClient();
    const { error } = await supa.from("kb_topics").delete().eq("id", topicId);
    if (error) throw error;
  }

  async function syncTopicRecords(topicId, recordIds) {
    const supa = getClient();
    const uniqueIds = [...new Set((recordIds || []).filter(Boolean))];

    const { data: existing, error: readError } = await supa
      .from("kb_topic_records")
      .select("kb_id")
      .eq("topic_id", topicId);
    if (readError) throw readError;

    const existingSet = new Set((existing || []).map(r => r.kb_id));
    const desiredSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter(id => !existingSet.has(id));
    const toRemove = [...existingSet].filter(id => !desiredSet.has(id));

    if (toRemove.length) {
      const { error } = await supa
        .from("kb_topic_records")
        .delete()
        .eq("topic_id", topicId)
        .in("kb_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length) {
      const { error } = await supa
        .from("kb_topic_records")
        .insert(toAdd.map(kb_id => ({ topic_id: topicId, kb_id })));
      if (error) throw error;
    }
  }

  async function saveTopicToSupabase(topic) {
    const saved = await upsertTopic(topic);
    await syncTopicRecords(saved.id, topic.recordIds || []);
    return { ...saved, recordIds: topic.recordIds || [] };
  }

  function loadLocalTopics() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOPICS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async function migrateLocalTopicsIfNeeded() {
    if (localStorage.getItem(MIGRATED_KEY) === "true") return;
    const local = loadLocalTopics();
    if (!local.length) {
      localStorage.setItem(MIGRATED_KEY, "true");
      return;
    }
    for (const topic of local) {
      await saveTopicToSupabase({ ...topic, __existing: !!topic.created_at });
    }
    localStorage.setItem(MIGRATED_KEY, "true");
    localStorage.removeItem(TOPICS_KEY);
  }

  window.kbSupabaseTopics = {
    probeTables,
    loadTopicsFromSupabase,
    saveTopicToSupabase,
    deleteTopicFromSupabase,
    syncTopicRecords,
    migrateLocalTopicsIfNeeded
  };
})();
