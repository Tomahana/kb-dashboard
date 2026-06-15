// Supabase persistence – zachytávání znalostí (nové záznamy, tělo, přílohy).

(function () {
  const ATTACH_BUCKET = "kb-knowledge-attachments";
  const ATTACH_MAX_BYTES = 15 * 1024 * 1024;
  let storageAvailable = null;

  function getClient() {
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    throw new Error("Supabase klient není k dispozici.");
  }

  function normalizeChoice(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value).trim();
  }

  function toSupabaseArray(value) {
    const text = normalizeChoice(value);
    if (!text) return null;
    if (text.includes(", ")) return text.split(", ").map(s => s.trim()).filter(Boolean);
    return [text];
  }

  function mapAttachment(row) {
    return {
      id: row.id,
      kb_id: row.kb_id,
      filename: row.filename || "",
      storage_path: row.storage_path || "",
      mime_type: row.mime_type || "",
      size_bytes: Number(row.size_bytes) || 0,
      created_at: row.created_at
    };
  }

  function mapRecordToInsert(record) {
    const now = new Date().toISOString();
    return {
      KB_ID: record.kb_id || record.id,
      Title: record.title || "Bez názvu",
      "Datum e-mailu": record.datum_emailu || now,
      "Datum přidání": record.datum_pridani || now,
      "Odesílatel": record.odesilatel || null,
      "Agenda": toSupabaseArray(record.agenda || "Nezařazeno"),
      "Typ záznamu": record.typ || null,
      "Kam patří": record.kam_patri || null,
      "Priorita": record.priorita || null,
      "Stav": record.stav || "K roztřídění",
      "Shrnutí": record.shrnuti || null,
      "Úkol / další krok": record.ukol_dalsi_krok || null,
      "Odkaz na e-mail": record.odkaz_na_email || null,
      "Poznámka": record.poznamka || null,
      source: record.source || "manual",
      message_id: record.message_id || null,
      received_at: record.received_at || now
    };
  }

  async function ensureAuthenticated() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    throw new Error("Pro ukládání se nejdříve přihlaste.");
  }

  async function probeAttachmentsTable() {
    try {
      const { error } = await getClient().from("kb_record_attachments").select("id").limit(1);
      return !error || error.code !== "PGRST205";
    } catch (_) {
      return false;
    }
  }

  async function probeStorage() {
    if (storageAvailable !== null) return storageAvailable;
    try {
      const { error } = await getClient().storage.from(ATTACH_BUCKET).list("", { limit: 1 });
      storageAvailable = !error;
    } catch (_) {
      storageAvailable = false;
    }
    return storageAvailable;
  }

  async function createRecord(record, bodyText) {
    await ensureAuthenticated();
    const supa = getClient();
    const kbId = record.kb_id || record.id;
    if (!kbId) throw new Error("Chybí KB_ID záznamu.");

    const meta = mapRecordToInsert(record);
    const { error: metaErr } = await supa.from("kb_records").insert(meta);
    if (metaErr) {
      if (/duplicate|unique|already exists/i.test(metaErr.message || "") && record.message_id) {
        throw new Error("Tento e-mail už v databázi je (stejné Message-ID).");
      }
      throw metaErr;
    }

    const text = (bodyText || record.text || "").toString();
    if (text.trim()) {
      const { error: bodyErr } = await supa.from("kb_record_bodies").upsert(
        { KB_ID: kbId, body_text: text },
        { onConflict: "KB_ID" }
      );
      if (bodyErr) throw bodyErr;
    }
    return kbId;
  }

  async function saveBody(kbId, bodyText) {
    await ensureAuthenticated();
    const { error } = await getClient().from("kb_record_bodies").upsert(
      { KB_ID: kbId, body_text: bodyText || "" },
      { onConflict: "KB_ID" }
    );
    if (error) throw error;
  }

  async function loadAttachments(kbId) {
    if (!kbId || !(await probeAttachmentsTable())) return [];
    const { data, error } = await getClient()
      .from("kb_record_attachments")
      .select("*")
      .eq("kb_id", kbId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(mapAttachment);
  }

  function resolveAttachmentUrl(path) {
    if (!path) return "";
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const base = (window.KB_SUPABASE?.url || "").replace(/\/$/, "");
    if (!base) return path;
    return `${base}/storage/v1/object/public/${ATTACH_BUCKET}/${path}`;
  }

  async function uploadAttachment(kbId, file) {
    if (!file) throw new Error("Soubor chybí.");
    if (file.size > ATTACH_MAX_BYTES) throw new Error(`Soubor ${file.name} je větší než 15 MB.`);
    await ensureAuthenticated();

    const supa = getClient();
    const attId = crypto.randomUUID?.() || `att-${Date.now()}`;
    let storagePath = "";

    if (await probeStorage()) {
      const safeName = (file.name || "priloha").replace(/[^\w.\-()+ ]/g, "_");
      storagePath = `${kbId}/${attId}-${safeName}`;
      const { error } = await supa.storage.from(ATTACH_BUCKET).upload(storagePath, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream"
      });
      if (error) throw error;
    } else {
      storagePath = await readFileAsDataUrl(file);
    }

    if (!(await probeAttachmentsTable())) {
      return { id: attId, kb_id: kbId, filename: file.name, storage_path: storagePath, mime_type: file.type, size_bytes: file.size };
    }

    const row = {
      id: attId,
      kb_id: kbId,
      filename: file.name || "priloha",
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size || 0
    };
    const { data, error } = await supa.from("kb_record_attachments").insert(row).select("*").single();
    if (error) throw error;
    return mapAttachment(data);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Soubor ${file.name} se nepodařilo přečíst.`));
      reader.readAsDataURL(file);
    });
  }

  window.kbSupabaseCapture = {
    probeAttachmentsTable,
    probeStorage,
    createRecord,
    saveBody,
    loadAttachments,
    uploadAttachment,
    resolveAttachmentUrl,
    mapRecordToInsert
  };
})();
