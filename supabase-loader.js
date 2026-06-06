// Supabase read-only loader for KB Dashboard
// Loads metadata from kb_records and message bodies from kb_record_bodies by KB_ID.

(function () {
  let client = null;

  function getClient() {
    if (client) return client;
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) {
      throw new Error("Chybí supabase-config.js s Project URL a publishable key.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS knihovna není načtená.");
    }
    client = window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
    return client;
  }

  function normalizeChoice(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return Object.values(value).join(", ");
    const text = String(value).trim();
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.join(", ");
      } catch (_) {}
    }
    return text;
  }

  function firstDefined(row, names) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(row, name) && row[name] != null) return row[name];
    }
    return null;
  }

  function mapRecord(row) {
    const kbId = firstDefined(row, ["KB_ID", "kb_id", "id"]);
    return {
      id: kbId,
      kb_id: kbId,
      title: firstDefined(row, ["Title", "title"]) || "Bez názvu",
      datum_emailu: firstDefined(row, ["Datum e-mailu", "datum_emailu"]),
      datum_pridani: firstDefined(row, ["Datum přidání", "datum_pridani", "created_at"]),
      odesilatel: firstDefined(row, ["Odesílatel", "odesilatel"]),
      agenda: normalizeChoice(firstDefined(row, ["Agenda", "agenda"])),
      typ: normalizeChoice(firstDefined(row, ["Typ záznamu", "typ"])),
      kam_patri: normalizeChoice(firstDefined(row, ["Kam patří", "kam_patri"])),
      priorita: normalizeChoice(firstDefined(row, ["Priorita", "priorita"])),
      stav: normalizeChoice(firstDefined(row, ["Stav", "stav"])),
      shrnuti: firstDefined(row, ["Shrnutí", "shrnuti"]),
      navrzeny_bod: firstDefined(row, ["Navržený bod jednání", "navrzeny_bod"]),
      ukol_dalsi_krok: firstDefined(row, ["Úkol / další krok", "ukol_dalsi_krok"]),
      termin: firstDefined(row, ["Termín", "termin"]),
      odpovedna_osoba: firstDefined(row, ["Odpovědná osoba", "odpovedna_osoba"]),
      odkaz_na_email: firstDefined(row, ["Odkaz na e-mail", "odkaz_na_email"]),
      poznamka: firstDefined(row, ["Poznámka", "poznamka"]),
      kb_sync: firstDefined(row, ["KB_SYNC", "kb_sync"]),
      text: "",
      __source: "supabase"
    };
  }

  async function loadAllRecords() {
    const supa = getClient();
    let all = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supa
        .from("kb_records")
        .select("*")
        .range(from, to);

      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  async function loadFromSupabase() {
    const button = document.getElementById("loadSupabaseBtn");
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Načítám…";
      }
      const data = await loadAllRecords();
      records = data.map(mapRecord).filter(r => r.id);

      if (typeof persist === "function") persist();
      if (typeof populateFilters === "function") populateFilters();
      if (typeof render === "function") render();
      document.dispatchEvent(new Event("input"));

      alert("Načteno ze Supabase: " + records.length + " záznamů.");
    } catch (error) {
      console.error(error);
      alert("Nepodařilo se načíst data ze Supabase: " + (error.message || error));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Načíst Supabase";
      }
    }
  }

  async function loadBody(kbId) {
    if (!kbId) return "";
    const supa = getClient();
    const { data, error } = await supa
      .from("kb_record_bodies")
      .select("body_text")
      .eq("KB_ID", kbId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return "";
    }
    return data?.body_text || "";
  }

  function injectButton() {
    const actions = document.querySelector(".topbar .actions");
    if (!actions || document.getElementById("loadSupabaseBtn")) return;

    const btn = document.createElement("button");
    btn.id = "loadSupabaseBtn";
    btn.className = "button accent";
    btn.type = "button";
    btn.textContent = "Načíst Supabase";
    btn.addEventListener("click", loadFromSupabase);
    actions.insertBefore(btn, actions.firstChild);
  }

  function enhanceOpenRecord() {
    if (!window.openRecord || window.openRecord.__supabaseEnhanced) return;
    const original = window.openRecord;

    window.openRecord = async function (id) {
      original(id);
      const record = records.find(r => r.id === id || r.kb_id === id);
      const kbId = record?.kb_id || record?.id;
      const bodyBox = document.getElementById("editBody");
      if (!kbId || !bodyBox) return;
      if (bodyBox.value && bodyBox.value !== "Načítám text e-mailu ze Supabase…") return;
      bodyBox.value = "Načítám text e-mailu ze Supabase…";
      const body = await loadBody(kbId);
      bodyBox.value = body || "";
      if (record) record.text = body || "";
    };

    window.openRecord.__supabaseEnhanced = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectButton();
    setTimeout(enhanceOpenRecord, 50);
  });
})();
