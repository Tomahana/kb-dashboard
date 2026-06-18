// Supabase read-only loader for KB Dashboard
// Loads metadata from kb_records and message bodies from kb_record_bodies by KB_ID.

(function () {
  let client = null;

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
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

  function toSupabaseArray(value) {
    const text = normalizeChoice(value);
    if (!text) return null;
    if (text.includes(", ")) return text.split(", ").map(s => s.trim()).filter(Boolean);
    return [text];
  }

  function parseNotionLink(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object") return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function mapRecordToSupabase(record) {
    return {
      "Agenda": toSupabaseArray(record.agenda),
      "Typ záznamu": record.typ || null,
      "Kam patří": record.kam_patri || null,
      "Priorita": record.priorita || null,
      "Stav": record.stav || null,
      "Shrnutí": record.shrnuti || null,
      "Navržený bod jednání": record.navrzeny_bod || null,
      "Úkol / další krok": record.ukol_dalsi_krok || null,
      "Termín": record.termin || null,
      "Odpovědná osoba": record.odpovedna_osoba || null,
      odesilatel_osobni_cislo: record.odesilatel_osobni_cislo || null,
      odpovedna_osoba_osobni_cislo: record.odpovedna_osoba_osobni_cislo || null,
      "Poznámka": record.poznamka || null,
      notion_link: record.notion_link || null,
      "KB_SYNC": new Date().toISOString()
    };
  }

  async function saveRecordToSupabase(record) {
    if (!(await ensureAuthenticated())) throw new Error("Nejste přihlášeni.");
    const kbId = record?.kb_id || record?.id || record?.KB_ID;
    if (!kbId) throw new Error("Záznam nemá KB_ID.");
    const supa = getClient();
    const payload = mapRecordToSupabase(record);
    const { error } = await supa
      .from("kb_records")
      .update(payload)
      .eq("KB_ID", kbId);
    if (error) throw error;
    return true;
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
      odesilatel_osobni_cislo: firstDefined(row, ["odesilatel_osobni_cislo"]),
      odpovedna_osoba_osobni_cislo: firstDefined(row, ["odpovedna_osoba_osobni_cislo"]),
      odkaz_na_email: firstDefined(row, ["Odkaz na e-mail", "odkaz_na_email"]),
      poznamka: firstDefined(row, ["Poznámka", "poznamka"]),
      notion_link: parseNotionLink(firstDefined(row, ["notion_link", "Notion link"])),
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

  async function ensureAuthenticated() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    alert("Pro přístup ke Supabase se nejdříve přihlaste.");
    return false;
  }

  function shouldAutoLoad() {
    return window.KB_SUPABASE?.autoLoadOnLogin !== false;
  }

  let autoLoadStarted = false;

  async function tryAutoLoadFromSupabase() {
    if (autoLoadStarted || !shouldAutoLoad()) return;
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) return;
    autoLoadStarted = true;
    try {
      if (!(await ensureAuthenticated())) {
        autoLoadStarted = false;
        return;
      }
      const data = await loadAllRecords();
      if (!data.length) return;
      records = data.map(mapRecord).filter(r => r.id);
      if (typeof persist === "function") persist();
      if (typeof populateFilters === "function") populateFilters();
      if (typeof render === "function") render();
      document.dispatchEvent(new Event("input"));
      document.dispatchEvent(new CustomEvent("kb:records-loaded"));
      console.info(`Supabase: automaticky načteno ${records.length} záznamů.`);
    } catch (error) {
      console.warn("Automatické načtení ze Supabase selhalo:", error);
      autoLoadStarted = false;
    }
  }

  async function loadFromSupabase() {
    const button = document.getElementById("loadSupabaseBtn");
    try {
      if (!(await ensureAuthenticated())) return;
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

      document.dispatchEvent(new CustomEvent("kb:records-loaded"));
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
    if (window.kbAuth?.requireAuth?.()) {
      const session = await window.kbAuth.getSession();
      if (!session) return "";
    }
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

  function enhanceSaveRecord() {
    if (!window.saveRecord || window.saveRecord.__supabaseEnhanced) return;
    const original = window.saveRecord;
    window.saveRecord = async function enhancedSaveRecord(e) {
      const id = document.getElementById("editId")?.value;
      const idx = Array.isArray(records) ? records.findIndex(x => x.id === id || x.kb_id === id) : -1;
      const before = idx >= 0 ? { ...records[idx] } : null;
      await original(e);
      const after = idx >= 0 ? records[idx] : null;
      if (!after || after.__source !== "supabase") return;
      const btn = document.getElementById("saveRecordBtn");
      const prevText = btn?.textContent;
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Ukládám do Supabase…";
        }
        await saveRecordToSupabase(after);
        if (btn) btn.textContent = "Uloženo v Supabase";
      } catch (error) {
        console.error(error);
        if (before && idx >= 0) records[idx] = before;
        if (typeof persist === "function") persist();
        alert("Lokální změny zůstaly, ale Supabase se nepodařilo uložit: " + (error.message || error));
        if (btn) btn.textContent = prevText || "Uložit v prohlížeči";
      } finally {
        if (btn) {
          btn.disabled = false;
          setTimeout(() => { btn.textContent = prevText || "Uložit v prohlížeči"; }, 1500);
        }
      }
    };
    window.saveRecord.__supabaseEnhanced = true;
  }

  function enhanceOpenRecord() {
    if (!window.openRecord || window.openRecord.__supabaseEnhanced) return;
    const original = window.openRecord;

    window.openRecord = async function (id) {
      original(id);
      const record = typeof findRecordById === "function"
        ? findRecordById(id)
        : records.find(r => r.id === id || r.kb_id === id || r.KB_ID === id);
      const kbId = record?.kb_id || record?.id || record?.KB_ID;
      const bodyBox = document.getElementById("editBody");
      if (!kbId || !bodyBox) return;

      const cached = (record?.text || "").toString().trim();
      if (cached && cached !== "Načítám text e-mailu ze Supabase…") {
        bodyBox.value = cached;
        return;
      }

      bodyBox.value = "Načítám text e-mailu ze Supabase…";
      const body = await loadBody(kbId);
      bodyBox.value = body || "";
      if (record) record.text = body || "";
      document.dispatchEvent(new CustomEvent("kb:body-loaded", { detail: { id: kbId, recordId: id } }));
    };

    window.openRecord.__supabaseEnhanced = true;
  }

  window.kbSupabase = {
    getClient,
    loadBody,
    saveRecordToSupabase,
    mapRecordToSupabase,
    loadFromSupabase
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectButton();
    setTimeout(() => {
      enhanceOpenRecord();
      enhanceSaveRecord();
    }, 50);
  });

  document.addEventListener("kb:auth-ready", () => {
    tryAutoLoadFromSupabase();
  });
})();
