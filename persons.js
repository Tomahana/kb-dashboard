// Globální modul Osoby – sdílená evidence pro soutěže, DKRVO, PPK a další moduly.
// 15 sloupců; osobni_cislo je obchodní klíč pro napojení dalších tabulek.

(function () {
  const STORAGE_KEY = "kb-dashboard-persons-v1";
  const TABLE_COLUMNS = [
    { key: "prijmeni", label: "Příjmení" },
    { key: "jmeno", label: "Jméno" },
    { key: "tituly", label: "Tituly" },
    { key: "osobni_cislo", label: "Osobní číslo" },
    { key: "stav_osoby", label: "Stav osoby" },
    { key: "pracoviste", label: "Pracoviště" },
    { key: "rodne_cislo", label: "Rodné číslo" },
    { key: "email", label: "E-mail" },
    { key: "telefon", label: "Telefon" },
    { key: "datum_narozeni", label: "Datum narození" },
    { key: "obcanstvi", label: "Občanství" },
    { key: "pohlavi", label: "Pohlaví" },
    { key: "orcid", label: "ORCID" },
    { key: "researcher_id", label: "Researcher ID" },
    { key: "scopus_id", label: "Scopus ID" }
  ];

  let persons = [];
  let useSupabase = false;
  let loading = false;
  let onSavedCallback = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `person-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function normalizePerson(person) {
    if (window.kbSupabasePersons?.normalizePerson) return window.kbSupabasePersons.normalizePerson(person);
    const tituly = n(person.tituly) || [person.titul_pred, person.titul_za].map(n).filter(Boolean).join(", ");
    const pracoviste = n(person.pracoviste) || [person.fakulta, person.katedra, person.soucast].map(n).filter(Boolean).join(" · ");
    return {
      id: person.id,
      prijmeni: n(person.prijmeni),
      jmeno: n(person.jmeno),
      tituly,
      osobni_cislo: n(person.osobni_cislo),
      stav_osoby: n(person.stav_osoby),
      pracoviste,
      rodne_cislo: n(person.rodne_cislo),
      email: n(person.email),
      telefon: n(person.telefon),
      datum_narozeni: person.datum_narozeni || "",
      obcanstvi: n(person.obcanstvi),
      pohlavi: n(person.pohlavi),
      orcid: n(person.orcid),
      researcher_id: n(person.researcher_id),
      scopus_id: n(person.scopus_id),
      created_at: person.created_at,
      updated_at: person.updated_at
    };
  }

  function personLabel(p) {
    if (!p) return "";
    const name = [p.jmeno, p.prijmeni].map(n).filter(Boolean).join(" ").trim();
    return [p.tituly, name].map(n).filter(Boolean).join(" ").trim();
  }

  function formatDate(value) {
    if (!value) return "";
    const d = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return value;
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  }

  function getPerson(id) {
    return persons.find(p => p.id === id) || null;
  }

  function getPersonByOsobniCislo(cislo) {
    const key = n(cislo);
    if (!key) return null;
    return persons.find(p => p.osobni_cislo === key) || null;
  }

  function getPersons() {
    return persons;
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persons, null, 2));
    window.kbSupabasePersons?.saveLocal?.(persons);
  }

  function setStatus(text, isError) {
    const node = el("personsStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("personsStatusError", !!isError);
  }

  async function loadPersons() {
    loading = true;
    renderList();
    try {
      window.kbSupabasePersons?.migrateLegacyLocal?.();
      if (!window.kbSupabasePersons) {
        useSupabase = false;
        persons = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(persons)) persons = [];
        persons = persons.map(normalizePerson);
        setStatus("Osoby v prohlížeči. Pro Supabase spusťte supabase/persons-schema.sql.");
        return persons;
      }
      const available = await window.kbSupabasePersons.probeTables();
      if (!available) {
        useSupabase = false;
        persons = window.kbSupabasePersons.loadLocal();
        setStatus("Tabulka kb_persons zatím neexistuje. Spusťte supabase/persons-schema.sql.");
        return persons;
      }
      useSupabase = true;
      persons = await window.kbSupabasePersons.loadAll();
      setStatus(`${persons.length} osob načteno ze Supabase.`);
    } catch (e) {
      console.error(e);
      useSupabase = false;
      persons = window.kbSupabasePersons?.loadLocal?.() || [];
      setStatus(`Chyba: ${e.message || e}`, true);
    } finally {
      loading = false;
      renderList();
      document.dispatchEvent(new CustomEvent("kb:persons-loaded", { detail: { persons } }));
    }
    return persons;
  }

  async function ensureLoaded() {
    if (persons.length || loading) return persons;
    return loadPersons();
  }

  function renderPersonOptions(selectedId) {
    const sorted = [...persons].sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
    const opts = sorted.map(p => {
      const label = `${personLabel(p)}${p.osobni_cislo ? ` · ${p.osobni_cislo}` : ""}${p.pracoviste ? ` · ${p.pracoviste}` : ""}`;
      return `<option value="${html(p.id)}" ${p.id === selectedId ? "selected" : ""}>${html(label)}</option>`;
    }).join("");
    return `<option value="">— vyberte osobu —</option>${opts}`;
  }

  function fillSelect(selectEl, selectedId) {
    if (!selectEl) return;
    selectEl.innerHTML = renderPersonOptions(selectedId);
  }

  function cellValue(person, key) {
    if (key === "datum_narozeni") return formatDate(person.datum_narozeni);
    if (key === "osobni_cislo") return `<code class="personId">${html(person.osobni_cislo)}</code>`;
    if (key === "prijmeni") return `<strong>${html(person.prijmeni)}</strong>`;
    return html(person[key]);
  }

  function renderList() {
    const box = el("personsList");
    if (!box) return;
    if (loading) {
      box.innerHTML = `<p class="hint">Načítám…</p>`;
      return;
    }
    const q = n(el("personsSearch")?.value).toLowerCase();
    let list = [...persons].sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
    if (q) {
      list = list.filter(p => TABLE_COLUMNS
        .map(col => col.key === "datum_narozeni" ? formatDate(p.datum_narozeni) : p[col.key])
        .some(v => n(v).toLowerCase().includes(q)));
    }
    if (!list.length) {
      box.innerHTML = `<p class="hint">${persons.length ? "Žádná shoda s hledáním." : "Zatím žádné osoby. Přidejte první záznam — osobní číslo slouží jako klíč pro projekty a další moduly."}</p>`;
      return;
    }
    const headers = TABLE_COLUMNS.map(col => `<th>${html(col.label)}</th>`).join("");
    box.innerHTML = `<div class="personsTableWrap"><table class="personsTable">
      <thead><tr>${headers}<th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        ${TABLE_COLUMNS.map(col => `<td>${cellValue(p, col.key) || "—"}</td>`).join("")}
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-person="${html(p.id)}">Upravit</button>
          <button type="button" class="button small secondary" data-del-person="${html(p.id)}">×</button>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
    box.querySelectorAll("[data-edit-person]").forEach(btn => btn.addEventListener("click", () => openDialog(btn.dataset.editPerson)));
    box.querySelectorAll("[data-del-person]").forEach(btn => btn.addEventListener("click", () => deletePerson(btn.dataset.delPerson)));
  }

  function openDialog(personId, options = {}) {
    onSavedCallback = options.onSaved || null;
    const existing = personId ? getPerson(personId) : null;
    el("personEditId").value = existing?.id || "";
    for (const col of TABLE_COLUMNS) {
      const input = el(`person_${col.key}`);
      if (!input) continue;
      input.value = col.key === "datum_narozeni"
        ? (existing?.datum_narozeni || "").slice(0, 10)
        : (existing?.[col.key] || "");
    }
    el("personDialogTitle").textContent = existing ? "Upravit osobu" : "Nová osoba";
    el("personDialog").showModal();
  }

  function readDialogPerson(existing) {
    const person = { id: el("personEditId").value || uuid(), created_at: existing?.created_at || new Date().toISOString(), __existing: !!existing };
    for (const col of TABLE_COLUMNS) {
      const input = el(`person_${col.key}`);
      person[col.key] = n(input?.value);
    }
    return normalizePerson(person);
  }

  async function saveDialog(e) {
    e.preventDefault();
    const id = el("personEditId").value || uuid();
    const existing = getPerson(id);
    const person = readDialogPerson(existing);
    if (!person.jmeno || !person.prijmeni) {
      alert("Vyplňte jméno a příjmení.");
      return;
    }
    if (!person.osobni_cislo) {
      alert("Vyplňte osobní číslo — slouží jako klíč pro napojení projektů a dalších tabulek.");
      return;
    }
    const duplicate = persons.find(p => p.osobni_cislo === person.osobni_cislo && p.id !== person.id);
    if (duplicate) {
      alert(`Osobní číslo „${person.osobni_cislo}" už používá jiná osoba (${personLabel(duplicate)}).`);
      return;
    }
    try {
      let saved = person;
      if (useSupabase && window.kbSupabasePersons) {
        saved = await window.kbSupabasePersons.savePerson(person);
      }
      const idx = persons.findIndex(p => p.id === saved.id);
      if (idx === -1) persons.push(saved);
      else persons[idx] = saved;
      if (!useSupabase) persistLocal();
      el("personDialog").close();
      setStatus("Osoba uložena.");
      renderList();
      document.dispatchEvent(new CustomEvent("kb:persons-loaded", { detail: { persons } }));
      if (onSavedCallback) onSavedCallback(saved);
      onSavedCallback = null;
    } catch (err) {
      alert("Uložení selhalo: " + (err.message || err));
    }
  }

  async function upsertPerson(person) {
    const normalized = normalizePerson(person);
    const existing = getPerson(normalized.id)
      || (normalized.osobni_cislo ? getPersonByOsobniCislo(normalized.osobni_cislo) : null);
    const record = {
      ...normalized,
      id: existing?.id || normalized.id || uuid(),
      created_at: existing?.created_at || normalized.created_at || new Date().toISOString(),
      __existing: !!existing
    };
    if (!record.osobni_cislo) {
      throw new Error("Osoba musí mít osobní číslo.");
    }
    if (useSupabase && window.kbSupabasePersons) {
      const saved = await window.kbSupabasePersons.savePerson(record);
      const idx = persons.findIndex(p => p.id === saved.id);
      if (idx === -1) persons.push(saved);
      else persons[idx] = saved;
      return saved;
    }
    const idx = persons.findIndex(p => p.id === record.id);
    if (idx === -1) persons.push(record);
    else persons[idx] = record;
    persistLocal();
    return record;
  }

  async function deletePerson(id) {
    if (!confirm("Smazat osobu? Moduly si ponechají textový název, ale vazba na osobu se zruší.")) return;
    try {
      if (useSupabase && window.kbSupabasePersons) await window.kbSupabasePersons.deletePerson(id);
      persons = persons.filter(p => p.id !== id);
      if (!useSupabase) persistLocal();
      renderList();
      document.dispatchEvent(new CustomEvent("kb:persons-loaded", { detail: { persons } }));
    } catch (err) {
      alert("Smazání selhalo: " + (err.message || err));
    }
  }

  function injectPage() {
    const root = el("personsPageRoot");
    if (!root || el("personsList")) return;
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>Osoby</h2>
            <p class="hint">Interní databáze osob UHK (15 sloupců). Osobní číslo je klíčové pro napojení projektů, soutěží a dalších analýz.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="personsReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="newPersonBtn" class="button accent">+ Osoba</button>
          </div>
        </div>
        <p id="personsStatus" class="personsStatus hint">Načítám…</p>
        <label class="personsSearchLabel">Hledat
          <input id="personsSearch" type="search" placeholder="Jméno, osobní číslo, pracoviště, ORCID…" />
        </label>
        <div id="personsList"></div>
      </section>`;
    el("personsReloadBtn").addEventListener("click", loadPersons);
    el("newPersonBtn").addEventListener("click", () => openDialog());
    el("personsSearch")?.addEventListener("input", renderList);
  }

  function injectDialog() {
    if (el("personDialog")) return;
    const formFields = TABLE_COLUMNS.map(col => {
      const type = col.key === "email" ? "email" : col.key === "datum_narozeni" ? "date" : "text";
      return `<label>${html(col.label)}<input id="person_${col.key}" type="${type}" ${col.key === "jmeno" || col.key === "prijmeni" || col.key === "osobni_cislo" ? "required" : ""} /></label>`;
    }).join("");
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <dialog id="personDialog">
        <form method="dialog" id="personForm">
          <div class="dialogHeader"><h2 id="personDialogTitle">Nová osoba</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="personEditId" />
          <div class="grid2">${formFields}</div>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="savePersonBtn" type="button" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>`;
    document.body.appendChild(wrap);
    el("savePersonBtn").addEventListener("click", saveDialog);
  }

  function injectStyles() {
    if (el("personsStyles")) return;
    const style = document.createElement("style");
    style.id = "personsStyles";
    style.textContent = `
      .personsSearchLabel { display: block; margin: .5rem 0 .75rem; max-width: 420px; }
      .personsTableWrap { overflow-x: auto; }
      .personsTable { width: 100%; border-collapse: collapse; min-width: 1400px; }
      .personsTable th, .personsTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .82rem; white-space: nowrap; }
      .personsTable th { position: sticky; top: 0; background: var(--panel, #fff); z-index: 1; }
      .personId { font-size: .82rem; background: #f2f4f7; padding: .1rem .35rem; border-radius: 4px; }
      .personsStatus { margin: .35rem 0 .5rem; }
      .personsStatusError { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    injectPage();
    injectDialog();
    setTimeout(loadPersons, 120);
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "osoby" && !persons.length && !loading) loadPersons();
    });
  }

  window.kbPersons = {
    loadPersons,
    ensureLoaded,
    getPersons,
    getPerson,
    getPersonByOsobniCislo,
    personLabel,
    normalizePerson,
    renderPersonOptions,
    fillSelect,
    openDialog,
    upsertPerson,
    deletePerson
  };

  document.addEventListener("DOMContentLoaded", init);
})();
