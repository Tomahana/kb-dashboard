// Supabase persistence for KB topics, topic-record, topic-deadline and outlook-email links.

(function () {
  const TOPICS_KEY = "kb-dashboard-topics-v1";
  const GROUPS_KEY = "kb-dashboard-topic-groups-v1";
  const MIGRATED_KEY = "kb-dashboard-topics-migrated-v1";
  const OUTLOOK_SOURCE = "outlook-email";

  let client = null;
  let tablesAvailable = null;
  let deadlineLinksAvailable = null;
  let groupsAvailable = null;

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

  function outlookKbId(emailId) {
    return `${OUTLOOK_SOURCE}:${emailId}`;
  }

  function mapTopicRow(row, recordIds, deadlineIds, outlookEmailIds) {
    return {
      id: row.id,
      name: row.name || "Bez názvu",
      agenda: row.agenda || "",
      description: row.description || "",
      ai_summary: row.ai_summary || "",
      group_id: row.group_id || null,
      recordIds: recordIds || [],
      deadlineIds: deadlineIds || [],
      outlookEmailIds: outlookEmailIds || [],
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

  async function probeDeadlineLinks() {
    if (deadlineLinksAvailable !== null) return deadlineLinksAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_topic_deadlines").select("id").limit(1);
      deadlineLinksAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") deadlineLinksAvailable = false;
    } catch (_) {
      deadlineLinksAvailable = false;
    }
    return deadlineLinksAvailable;
  }

  async function probeGroups() {
    if (groupsAvailable !== null) return groupsAvailable;
    try {
      const supa = getClient();
      const { error } = await supa.from("kb_topic_groups").select("id").limit(1);
      groupsAvailable = !error || error.code !== "PGRST205";
      if (error && error.code === "PGRST205") groupsAvailable = false;
    } catch (_) {
      groupsAvailable = false;
    }
    return groupsAvailable;
  }

  async function loadTopicGroupsFromSupabase() {
    if (!(await probeGroups())) return [];
    const supa = getClient();
    const { data, error } = await supa.from("kb_topic_groups").select("*").order("name");
    if (error) throw error;
    return data || [];
  }

  async function saveTopicGroup(group) {
    if (!(await probeGroups())) throw new Error("Tabulka kb_topic_groups neexistuje — spusťte supabase/topics-groups-migrate.sql");
    const supa = getClient();
    const now = new Date().toISOString();
    const payload = {
      id: group.id,
      name: group.name,
      description: group.description || null,
      updated_at: now
    };
    if (!group.__existing) payload.created_at = group.created_at || now;
    const { data, error } = await supa.from("kb_topic_groups").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throw error;
    return data;
  }

  async function deleteTopicGroupFromSupabase(groupId) {
    if (!(await probeGroups())) return;
    const supa = getClient();
    const { error } = await supa.from("kb_topic_groups").delete().eq("id", groupId);
    if (error) throw error;
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
      .select("topic_id, kb_id, source, source_id");
    if (linkError) throw linkError;

    const recordsByTopic = {};
    const outlookByTopic = {};
    (linkRows || []).forEach((row) => {
      if (row.source === OUTLOOK_SOURCE) {
        outlookByTopic[row.topic_id] ||= [];
        outlookByTopic[row.topic_id].push(String(row.source_id || row.kb_id?.replace(/^outlook-email:/, "")));
      } else {
        recordsByTopic[row.topic_id] ||= [];
        recordsByTopic[row.topic_id].push(row.kb_id);
      }
    });

    const deadlinesByTopic = {};
    if (await probeDeadlineLinks()) {
      const { data: dlRows, error: dlError } = await supa
        .from("kb_topic_deadlines")
        .select("topic_id, deadline_id");
      if (!dlError) {
        (dlRows || []).forEach((row) => {
          deadlinesByTopic[row.topic_id] ||= [];
          deadlinesByTopic[row.topic_id].push(row.deadline_id);
        });
      }
    }

    return (topicRows || []).map((row) =>
      mapTopicRow(
        row,
        recordsByTopic[row.id] || [],
        deadlinesByTopic[row.id] || [],
        outlookByTopic[row.id] || []
      )
    );
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
    if (await probeGroups()) payload.group_id = topic.group_id || null;
    if (!topic.__existing) payload.created_at = topic.created_at || now;

    const { data, error } = await supa
      .from("kb_topics")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapTopicRow(
      data,
      topic.recordIds || [],
      topic.deadlineIds || [],
      topic.outlookEmailIds || []
    );
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
      .eq("topic_id", topicId)
      .or(`source.is.null,source.eq.kb_records`);
    if (readError) throw readError;

    const existingSet = new Set((existing || []).map((r) => r.kb_id));
    const desiredSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !desiredSet.has(id));

    if (toRemove.length) {
      const { error } = await supa
        .from("kb_topic_records")
        .delete()
        .eq("topic_id", topicId)
        .in("kb_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length) {
      const { error } = await supa.from("kb_topic_records").insert(
        toAdd.map((kb_id) => ({ topic_id: topicId, kb_id, source: "kb_records", source_id: kb_id }))
      );
      if (error) throw error;
    }
  }

  async function syncTopicOutlookEmails(topicId, emailIds) {
    const supa = getClient();
    const uniqueIds = [...new Set((emailIds || []).map(String).filter(Boolean))];

    const { data: existing, error: readError } = await supa
      .from("kb_topic_records")
      .select("source_id, kb_id")
      .eq("topic_id", topicId)
      .eq("source", OUTLOOK_SOURCE);
    if (readError) throw readError;

    const existingSet = new Set(
      (existing || []).map((r) => String(r.source_id || r.kb_id?.replace(/^outlook-email:/, "")))
    );
    const desiredSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !desiredSet.has(id));

    if (toRemove.length) {
      const { error } = await supa
        .from("kb_topic_records")
        .delete()
        .eq("topic_id", topicId)
        .eq("source", OUTLOOK_SOURCE)
        .in("source_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length) {
      const { error } = await supa.from("kb_topic_records").insert(
        toAdd.map((emailId) => ({
          topic_id: topicId,
          kb_id: outlookKbId(emailId),
          source: OUTLOOK_SOURCE,
          source_id: String(emailId)
        }))
      );
      if (error) throw error;
    }
  }

  async function syncTopicDeadlines(topicId, deadlineIds) {
    if (!(await probeDeadlineLinks())) return;
    const supa = getClient();
    const uniqueIds = [...new Set((deadlineIds || []).filter(Boolean))];

    const { data: existing, error: readError } = await supa
      .from("kb_topic_deadlines")
      .select("deadline_id")
      .eq("topic_id", topicId);
    if (readError) throw readError;

    const existingSet = new Set((existing || []).map((r) => r.deadline_id));
    const desiredSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !desiredSet.has(id));

    if (toRemove.length) {
      const { error } = await supa
        .from("kb_topic_deadlines")
        .delete()
        .eq("topic_id", topicId)
        .in("deadline_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length) {
      const { error } = await supa
        .from("kb_topic_deadlines")
        .insert(toAdd.map((deadline_id) => ({ topic_id: topicId, deadline_id })));
      if (error) throw error;
    }
  }

  async function saveTopicToSupabase(topic) {
    const saved = await upsertTopic(topic);
    await syncTopicRecords(saved.id, topic.recordIds || []);
    await syncTopicOutlookEmails(saved.id, topic.outlookEmailIds || []);
    await syncTopicDeadlines(saved.id, topic.deadlineIds || []);
    return {
      ...saved,
      recordIds: topic.recordIds || [],
      outlookEmailIds: topic.outlookEmailIds || [],
      deadlineIds: topic.deadlineIds || []
    };
  }

  async function mergeTopics(targetId, sourceIds) {
    const sources = (sourceIds || []).filter((id) => id && id !== targetId);
    if (!sources.length) return null;
    const topics = await loadTopicsFromSupabase();
    const target = topics.find((t) => t.id === targetId);
    if (!target) throw new Error("Cílové téma neexistuje.");
    const merged = {
      ...target,
      recordIds: [...new Set(target.recordIds || [])],
      outlookEmailIds: [...new Set(target.outlookEmailIds || [])],
      deadlineIds: [...new Set(target.deadlineIds || [])],
      __existing: true
    };
    sources.forEach((sid) => {
      const src = topics.find((t) => t.id === sid);
      if (!src) return;
      (src.recordIds || []).forEach((id) => merged.recordIds.push(id));
      (src.outlookEmailIds || []).forEach((id) => merged.outlookEmailIds.push(id));
      (src.deadlineIds || []).forEach((id) => merged.deadlineIds.push(id));
    });
    merged.recordIds = [...new Set(merged.recordIds)];
    merged.outlookEmailIds = [...new Set(merged.outlookEmailIds)];
    merged.deadlineIds = [...new Set(merged.deadlineIds)];
    const saved = await saveTopicToSupabase(merged);
    for (const sid of sources) await deleteTopicFromSupabase(sid);
    return saved;
  }

  async function duplicateTopicToGroup(topicId, groupId, { nameSuffix = " (kopie)" } = {}) {
    const topics = await loadTopicsFromSupabase();
    const source = topics.find((t) => t.id === topicId);
    if (!source) throw new Error("Téma neexistuje.");
    const copy = {
      id: crypto.randomUUID?.() || `topic-${Date.now()}`,
      name: `${source.name}${nameSuffix}`,
      agenda: source.agenda,
      description: source.description,
      ai_summary: source.ai_summary,
      ai_summary_updated_at: source.ai_summary_updated_at,
      group_id: groupId || null,
      recordIds: [...(source.recordIds || [])],
      outlookEmailIds: [...(source.outlookEmailIds || [])],
      deadlineIds: [...(source.deadlineIds || [])],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      __existing: false
    };
    return saveTopicToSupabase(copy);
  }

  function loadLocalTopics() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOPICS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function loadLocalGroups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
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
      await saveTopicToSupabase({ ...topic, outlookEmailIds: topic.outlookEmailIds || [], __existing: !!topic.created_at });
    }
    localStorage.setItem(MIGRATED_KEY, "true");
    localStorage.removeItem(TOPICS_KEY);
  }

  window.kbSupabaseTopics = {
    OUTLOOK_SOURCE,
    outlookKbId,
    probeTables,
    probeDeadlineLinks,
    probeGroups,
    loadTopicsFromSupabase,
    loadTopicGroupsFromSupabase,
    saveTopicGroup,
    deleteTopicGroupFromSupabase,
    saveTopicToSupabase,
    deleteTopicFromSupabase,
    syncTopicRecords,
    syncTopicOutlookEmails,
    syncTopicDeadlines,
    mergeTopics,
    duplicateTopicToGroup,
    migrateLocalTopicsIfNeeded,
    loadLocalGroups
  };
})();
