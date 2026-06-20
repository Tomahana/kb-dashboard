// Globální modul Osoby – sdílená evidence pro soutěže, DKRVO, PPK a další moduly.
// 15 sloupců; osobni_cislo je obchodní klíč pro napojení dalších tabulek.

(function () {
  const STORAGE_KEY = "kb-dashboard-persons-v1";
  const IMPORT_ALIASES = {
    prijmeni: ["Příjmení", "prijmeni", "Prijmeni"],
    jmeno: ["Jméno", "jmeno", "Jmeno"],
    tituly: ["Tituly", "tituly"],
    osobni_cislo: ["Osobní číslo", "osobni_cislo", "Osobni cislo", "ID"],
    stav_osoby: ["Stav osoby", "stav_osoby"],
    pracoviste: ["Pracoviště", "pracoviste", "Pracoviste"],
    kodorg: ["kodorg", "Kodorg", "Kód org", "kod org"],
    rodne_cislo: ["Rodné číslo", "rodne_cislo", "Rodne cislo"],
    email: ["E-mail", "email", "Email"],
    telefon: ["Telefon", "telefon"],
    datum_narozeni: ["Datum narození", "Datum narozeni", "datum_narozeni"],
    obcanstvi: ["Občanství/Státní příslušnost", "Občanství", "obcanstvi", "Státní příslušnost"],
    pohlavi: ["Pohlaví", "pohlavi"],
    orcid: ["ORCID", "orcid"],
    researcher_id: ["Researcher ID", "researcher_id"],
    scopus_id: ["Scopus ID", "scopus_id"]
  };

  const FILTER_FIELDS = [
    { key: "prijmeni", label: "Příjmení", type: "text" },
    { key: "jmeno", label: "Jméno", type: "text" },
    { key: "osobni_cislo", label: "Osobní číslo", type: "text" },
    { key: "stav_osoby", label: "Stav osoby", type: "select" },
    { key: "pracoviste", label: "Pracoviště", type: "select" }
  ];

  const SORT_FIELDS = [
    { key: "prijmeni", label: "Příjmení" },
    { key: "jmeno", label: "Jméno" },
    { key: "osobni_cislo", label: "Osobní číslo" },
    { key: "stav_osoby", label: "Stav osoby" },
    { key: "pracoviste", label: "Pracoviště" }
  ];

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
    let base;
    if (window.kbSupabasePersons?.normalizePerson) base = window.kbSupabasePersons.normalizePerson(person);
    else {
      const tituly = n(person.tituly) || [person.titul_pred, person.titul_za].map(n).filter(Boolean).join(", ");
      const pracoviste = n(person.pracoviste) || [person.fakulta, person.katedra, person.soucast].map(n).filter(Boolean).join(" · ");
      base = {
        id: person.id,
        prijmeni: n(person.prijmeni),
        jmeno: n(person.jmeno),
        tituly,
        osobni_cislo: n(person.osobni_cislo),
        stav_osoby: n(person.stav_osoby),
        pracoviste,
        kodorg: n(person.kodorg),
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
    if (!base.kodorg && base.pracoviste && window.kbPracoviste?.matchFromText) {
      const match = window.kbPracoviste.matchFromText(base.pracoviste);
      if (match) base.kodorg = match.kodorg;
    }
    if (base.kodorg && window.kbPracoviste?.applyToPerson) {
      return window.kbPracoviste.applyToPerson(base);
    }
    return base;
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

  function normalizeNamePart(s) {
    return n(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  }

  function matchPersonFromRegistry(ref) {
    if (!ref) return null;
    const email = n(ref.email).toLowerCase();
    if (email) {
      const byEmail = persons.find(p => n(p.email).toLowerCase() === email);
      if (byEmail) return byEmail;
    }
    const osobni = n(ref.osobni_cislo);
    if (osobni) {
      const byCislo = getPersonByOsobniCislo(osobni);
      if (byCislo) return byCislo;
    }
    const prijmeni = normalizeNamePart(ref.prijmeni);
    const jmeno = normalizeNamePart(ref.jmeno);
    if (!prijmeni && !jmeno) return null;
    const jmenoFirst = jmeno.split(/\s+/)[0];
    const matches = persons.filter(p => {
      const pP = normalizeNamePart(p.prijmeni);
      const pJ = normalizeNamePart(p.jmeno);
      if (prijmeni && pP !== prijmeni) return false;
      if (!jmeno) return true;
      return pJ === jmeno || pJ.startsWith(jmenoFirst) || jmeno.startsWith(pJ);
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && ref.fakulta) {
      const fac = n(ref.fakulta).toLowerCase();
      const byFac = matches.find(p => n(p.pracoviste).toLowerCase().includes(fac));
      if (byFac) return byFac;
    }
    return matches[0] || null;
  }

  function getPersons() {
    return persons;
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persons, null, 2));
    window.kbSupabasePersons?.saveLocal?.(persons);
  }

  let statusMessage = "";
  let statusIsError = false;

  function setStatus(text, isError) {
    statusMessage = text;
    statusIsError = !!isError;
    updateListSummary();
  }

  function uniqueValues(field) {
    return [...new Set(persons.map(p => n(p[field])).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "cs"));
  }

  function populateFilters() {
    FILTER_FIELDS.filter(f => f.type === "select").forEach(({ key }) => {
      const select = el(`personsFilter_${key}`);
      if (!select) return;
      const current = select.value;
      const options = uniqueValues(key)
        .map(v => `<option value="${html(v)}">${html(v)}</option>`)
        .join("");
      select.innerHTML = `<option value="">Vše</option>${options}`;
      if (current && uniqueValues(key).includes(current)) select.value = current;
    });
  }

  function filteredPersons() {
    const l = (s) => n(s).toLowerCase();
    return persons.filter(p => FILTER_FIELDS.every(({ key, type }) => {
      const raw = el(`personsFilter_${key}`)?.value ?? "";
      if (!n(raw)) return true;
      if (type === "select") return n(p[key]) === n(raw);
      return l(p[key]).includes(l(raw));
    }));
  }

  function sortPersons(list) {
    const sortKey = el("personsSortBy")?.value || "prijmeni";
    const desc = el("personsSortDir")?.value === "desc";
    return [...list].sort((a, b) => {
      const av = n(a[sortKey]);
      const bv = n(b[sortKey]);
      const cmp = av.localeCompare(bv, "cs", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return desc ? -cmp : cmp;
      const tie = n(a.prijmeni).localeCompare(n(b.prijmeni), "cs");
      if (tie !== 0) return tie;
      return n(a.jmeno).localeCompare(n(b.jmeno), "cs");
    });
  }

  function updateListSummary() {
    const node = el("personsListSummary");
    if (!node) return;
    if (loading) {
      node.textContent = statusMessage || "Načítám…";
      node.classList.toggle("personsStatusError", statusIsError);
      return;
    }
    const filtered = filteredPersons();
    const parts = [];
    if (statusMessage) parts.push(statusMessage);
    if (persons.length) {
      parts.push(filtered.length === persons.length
        ? `Zobrazeno ${persons.length} osob`
        : `Zobrazeno ${filtered.length} z ${persons.length} osob`);
    }
    node.textContent = parts.join(" · ") || "Žádné osoby";
    node.classList.toggle("personsStatusError", statusIsError);
  }

  async function loadPersons() {
    loading = true;
    renderList();
    try {
      window.kbSupabasePersons?.migrateLegacyLocal?.();
      if (!window.kbSupabasePersons) {
        useSupabase = false;
        await window.kbPracoviste?.ensureLoaded?.().catch(() => {});
        persons = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(persons)) persons = [];
        persons = persons.map(normalizePerson);
        setStatus("Osoby v prohlížeči. Pro Supabase spusťte supabase/persons-schema.sql.");
        return persons;
      }
      const available = await window.kbSupabasePersons.probeTables();
      if (!available) {
        useSupabase = false;
        await window.kbPracoviste?.ensureLoaded?.().catch(() => {});
        persons = window.kbSupabasePersons.loadLocal().map(normalizePerson);
        setStatus("Tabulka kb_persons zatím neexistuje. Spusťte supabase/persons-schema.sql.");
        return persons;
      }
      useSupabase = true;
      await window.kbPracoviste?.ensureLoaded?.().catch(() => {});
      persons = (await window.kbSupabasePersons.loadAll()).map(normalizePerson);
      setStatus(`${persons.length} osob načteno ze Supabase.`);
    } catch (e) {
      console.error(e);
      useSupabase = false;
      persons = window.kbSupabasePersons?.loadLocal?.() || [];
      setStatus(`Chyba: ${e.message || e}`, true);
    } finally {
      loading = false;
      populateFilters();
      renderList();
      document.dispatchEvent(new CustomEvent("kb:persons-loaded", { detail: { persons } }));
    }
    return persons;
  }

  async function ensureLoaded() {
    if (persons.length) return persons;
    if (loading) {
      await new Promise((resolve) => {
        const done = () => {
          document.removeEventListener("kb:persons-loaded", done);
          resolve();
        };
        document.addEventListener("kb:persons-loaded", done);
      });
      return persons;
    }
    return loadPersons();
  }

  function pracovisteDisplay(person) {
    if (!person) return "";
    if (person.kodorg && window.kbPracoviste?.displayLabel) {
      return window.kbPracoviste.displayLabel(person.kodorg, person.pracoviste) || person.pracoviste;
    }
    return n(person.pracoviste);
  }

  function personOptionLabel(p) {
    if (!p) return "";
    return `${personLabel(p)}${p.osobni_cislo ? ` · ${p.osobni_cislo}` : ""}${pracovisteDisplay(p) ? ` · ${pracovisteDisplay(p)}` : ""}`;
  }

  function setSelectPersonValue(selectEl, personId) {
    if (!selectEl) return;
    const p = personId ? getPerson(personId) : null;
    if (p) {
      selectEl.innerHTML = `<option value=""></option><option value="${html(p.id)}" selected>${html(personOptionLabel(p))}</option>`;
      selectEl.value = p.id;
    } else {
      selectEl.innerHTML = `<option value="">— vyberte osobu —</option>`;
      selectEl.value = "";
    }
  }

  function filterPersonsForPicker(query, limit = 30) {
    const q = n(query).toLowerCase();
    if (q.length < 2) return [];
    return persons.filter(p => {
      const hay = [p.prijmeni, p.jmeno, p.osobni_cislo, p.pracoviste, p.tituly, personLabel(p)].map(n).join(" ").toLowerCase();
      return hay.includes(q);
    }).slice(0, limit);
  }

  function getPersonSearchPicker(selectEl) {
    const row = selectEl?.closest(".personSelectRow");
    return row?.querySelector(".kb-person-search-picker") || null;
  }

  function unwrapKbPicker(selectEl) {
    const wrap = selectEl?.closest(".kb-picker");
    if (!wrap?.parentNode) return;
    wrap.parentNode.insertBefore(selectEl, wrap);
    wrap.remove();
  }

  function bindPersonSearchPicker(selectEl) {
    if (!selectEl || selectEl.dataset.personPickerBound === "1") return;
    unwrapKbPicker(selectEl);
    selectEl.dataset.personPickerBound = "1";
    selectEl.classList.add("kb-person-search-native");
    selectEl.hidden = true;

    const row = selectEl.closest(".personSelectRow") || selectEl.parentElement;
    const picker = document.createElement("div");
    picker.className = "kb-person-search-picker";
    picker.innerHTML = `
      <div class="kb-person-search-selected"></div>
      <input type="search" class="kb-person-search-input" placeholder="Hledat příjmení, jméno, osobní číslo…" autocomplete="off" />
      <p class="kb-person-search-hint hint">Zadejte alespoň 2 znaky (${persons.length || "…"} osob v databázi)</p>
      <ul class="kb-person-search-results" hidden></ul>`;
    row.insertBefore(picker, selectEl);

    const input = picker.querySelector(".kb-person-search-input");
    const results = picker.querySelector(".kb-person-search-results");
    const hint = picker.querySelector(".kb-person-search-hint");
    const selectedBox = picker.querySelector(".kb-person-search-selected");

    function renderSelected() {
      const p = getPerson(selectEl.value);
      if (!p) {
        selectedBox.innerHTML = `<span class="kb-person-search-empty">Žádná osoba vybrána</span>`;
        return;
      }
      selectedBox.innerHTML = `<span class="kb-person-search-chip">${html(personOptionLabel(p))}<button type="button" class="kb-person-search-clear" title="Odebrat">×</button></span>`;
      selectedBox.querySelector(".kb-person-search-clear")?.addEventListener("click", (e) => {
        e.preventDefault();
        setSelectPersonValue(selectEl, "");
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        renderSelected();
        input.value = "";
        results.hidden = true;
      });
    }

    function pickPerson(person) {
      setSelectPersonValue(selectEl, person.id);
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      renderSelected();
      input.value = "";
      results.hidden = true;
    }

    function renderResults() {
      hint.textContent = persons.length
        ? `Zadejte alespoň 2 znaky (${persons.length} osob v databázi)`
        : "Načítám osoby… Spusťte modul Osoby nebo Načíst ze Supabase.";
      const matches = filterPersonsForPicker(input.value);
      if (!n(input.value) || n(input.value).length < 2) {
        results.hidden = true;
        return;
      }
      if (!matches.length) {
        results.innerHTML = `<li class="kb-person-search-none">Žádná shoda</li>`;
        results.hidden = false;
        return;
      }
      results.innerHTML = matches.map(p => `<li><button type="button" class="kb-person-search-option" data-id="${html(p.id)}">${html(personOptionLabel(p))}</button></li>`).join("");
      results.hidden = false;
      results.querySelectorAll(".kb-person-search-option").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const person = getPerson(btn.dataset.id);
          if (person) pickPerson(person);
        });
      });
    }

    input.addEventListener("input", renderResults);
    input.addEventListener("focus", renderResults);
    document.addEventListener("click", (e) => {
      if (!picker.contains(e.target)) results.hidden = true;
    });
    document.addEventListener("kb:persons-loaded", () => {
      renderSelected();
      renderResults();
    });

    picker.__renderSelected = renderSelected;
  }

  async function setupSearchPicker(selectEl, selectedId) {
    if (!selectEl) return;
    await ensureLoaded();
    bindPersonSearchPicker(selectEl);
    setSelectPersonValue(selectEl, selectedId || "");
    const picker = getPersonSearchPicker(selectEl);
    picker?.__renderSelected?.();
    const hint = picker?.querySelector(".kb-person-search-hint");
    if (hint) {
      hint.textContent = persons.length
        ? `Zadejte alespoň 2 znaky (${persons.length} osob v databázi)`
        : "Osoby se nepodařilo načíst — zkuste modul Osoby → Načíst ze Supabase.";
    }
  }

  function renderPersonOptions(selectedId) {
    const sorted = [...persons].sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
    const opts = sorted.map(p => {
      const label = personOptionLabel(p);
      return `<option value="${html(p.id)}" ${p.id === selectedId ? "selected" : ""}>${html(label)}</option>`;
    }).join("");
    return `<option value="">— vyberte osobu —</option>${opts}`;
  }

  function fillSelect(selectEl, selectedId) {
    if (!selectEl) return;
    if (persons.length > 200 || selectEl.dataset.personPickerBound === "1") {
      setupSearchPicker(selectEl, selectedId);
      return;
    }
    selectEl.hidden = false;
    selectEl.innerHTML = renderPersonOptions(selectedId);
  }

  function cellValue(person, key) {
    if (key === "datum_narozeni") return formatDate(person.datum_narozeni);
    if (key === "osobni_cislo") return `<code class="personId">${html(person.osobni_cislo)}</code>`;
    if (key === "pracoviste") {
      const label = pracovisteDisplay(person);
      const kod = person.kodorg ? `<span class="hint"> (${html(person.kodorg)})</span>` : "";
      return `${html(label)}${kod}`;
    }
    return html(person[key] || "");
  }

  function renderList() {
    const box = el("personsList");
    if (!box) return;
    updateListSummary();
    if (loading) {
      box.innerHTML = `<p class="hint">Načítám…</p>`;
      return;
    }
    const list = sortPersons(filteredPersons());
    if (!list.length) {
      box.innerHTML = `<p class="hint">${persons.length ? "Žádná shoda s filtrem." : "Zatím žádné osoby. Přidejte první záznam — osobní číslo slouží jako klíč pro projekty a další moduly."}</p>`;
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
      if (col.key === "pracoviste") continue;
      const input = el(`person_${col.key}`);
      if (!input) continue;
      input.value = col.key === "datum_narozeni"
        ? (existing?.datum_narozeni || "").slice(0, 10)
        : (existing?.[col.key] || "");
    }
    const freePrac = el("person_pracoviste_free");
    if (freePrac) freePrac.value = existing?.kodorg ? "" : (existing?.pracoviste || "");
    void window.kbPracovistePicker?.setupPicker?.(
      el("personDialog")?.querySelector("[data-pracoviste-picker]"),
      existing?.kodorg || ""
    );
    el("personDialogTitle").textContent = existing ? "Upravit osobu" : "Nová osoba";
    el("personDialog").showModal();
  }

  function readDialogPerson(existing) {
    const person = { id: el("personEditId").value || uuid(), created_at: existing?.created_at || new Date().toISOString(), __existing: !!existing };
    for (const col of TABLE_COLUMNS) {
      if (col.key === "pracoviste") continue;
      const input = el(`person_${col.key}`);
      person[col.key] = n(input?.value);
    }
    person.kodorg = n(el("person_kodorg")?.value);
    person.pracoviste = person.kodorg
      ? n(el("person_pracoviste")?.value)
      : n(el("person_pracoviste_free")?.value);
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
      populateFilters();
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

  function normalizeHeaderKey(s) {
    return n(s).replace(/^\uFEFF/, "").replace(/^"|"$/g, "").replace(/\s+/g, " ").toLowerCase();
  }

  function getFieldFromRow(row, field) {
    const aliases = IMPORT_ALIASES[field] || [field];
    for (const key of aliases) {
      if (row[key] != null && n(row[key])) return n(row[key]);
    }
    const byNorm = {};
    Object.entries(row).forEach(([k, v]) => { byNorm[normalizeHeaderKey(k)] = v; });
    for (const key of aliases) {
      const nk = normalizeHeaderKey(key);
      if (byNorm[nk] != null && n(byNorm[nk])) return n(byNorm[nk]);
    }
    for (const [hdr, val] of Object.entries(byNorm)) {
      if (!n(val)) continue;
      for (const key of aliases) {
        const nk = normalizeHeaderKey(key);
        if (hdr === nk || hdr.includes(nk) || nk.includes(hdr)) return n(val);
      }
    }
    return "";
  }

  function parseImportDate(value) {
    const v = n(value).replace(/^"|"$/g, "");
    if (!v || v === "-" || v === "—") return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const cz = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (cz) return `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function parseCsvRecords(text, delimiter) {
    const records = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { row.push(field); field = ""; }
      else if (ch === "\n") {
        row.push(field); field = "";
        if (row.some(cell => n(cell))) records.push(row);
        row = [];
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some(cell => n(cell))) records.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(cell => n(cell))) records.push(row);
    return records;
  }

  function detectDelimiter(sampleLine) {
    const line = sampleLine.replace(/^\uFEFF/, "");
    const counts = [["\t", (line.match(/\t/g) || []).length], [";", (line.match(/;/g) || []).length], [",", (line.match(/,/g) || []).length]];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ";";
  }

  function headerRowScore(cells) {
    const joined = cells.map(normalizeHeaderKey).join(" ");
    const markers = ["prijmen", "jmeno", "osobni", "titul", "pracovi", "rodne"];
    return markers.reduce((score, m) => score + (joined.includes(m) ? 1 : 0), 0);
  }

  function findHeaderRowIndex(records) {
    let bestIdx = 0;
    let bestScore = -1;
    records.slice(0, 8).forEach((row, idx) => {
      const score = headerRowScore(row);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });
    return bestScore >= 2 ? bestIdx : 0;
  }

  function parseDelimitedTable(text) {
    const clean = text.replace(/^\uFEFF/, "").trim();
    if (!clean) return { rows: [], meta: { headers: [], delimiter: ";", headerRow: 0 } };
    const firstLine = clean.split(/\r?\n/).find(line => n(line)) || clean;
    const delimiter = detectDelimiter(firstLine);
    const records = parseCsvRecords(clean, delimiter);
    if (!records.length) return { rows: [], meta: { headers: [], delimiter, headerRow: 0 } };
    const headerIdx = findHeaderRowIndex(records);
    const headers = records[headerIdx].map(h => n(h).replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
    const rows = records.slice(headerIdx + 1).map(cols => {
      const row = {};
      headers.forEach((header, i) => {
        if (header) row[header] = (cols[i] ?? "").replace(/^"|"$/g, "").trim();
      });
      return row;
    }).filter(row => Object.values(row).some(v => n(v)));
    return { rows, meta: { headers, delimiter, headerRow: headerIdx + 1 } };
  }

  async function readImportFileText(file) {
    const buffer = await file.arrayBuffer();
    const encodings = ["utf-8", "windows-1250", "iso-8859-2"];
    let bestText = "";
    let bestScore = -1;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding).decode(buffer);
        const bad = (text.match(/\uFFFD/g) || []).length;
        const czech = (text.match(/[ěščřžýáíéúůďťň]/gi) || []).length;
        const score = czech * 3 - bad * 10;
        if (score > bestScore) { bestScore = score; bestText = text; }
      } catch (_) {}
    }
    return (bestText || new TextDecoder("utf-8").decode(buffer)).replace(/^\uFEFF/, "");
  }

  function normalizeImportRow(row) {
    const item = {
      prijmeni: getFieldFromRow(row, "prijmeni"),
      jmeno: getFieldFromRow(row, "jmeno"),
      tituly: getFieldFromRow(row, "tituly"),
      osobni_cislo: getFieldFromRow(row, "osobni_cislo"),
      stav_osoby: getFieldFromRow(row, "stav_osoby"),
      pracoviste: getFieldFromRow(row, "pracoviste"),
      kodorg: getFieldFromRow(row, "kodorg"),
      rodne_cislo: getFieldFromRow(row, "rodne_cislo"),
      email: getFieldFromRow(row, "email"),
      telefon: getFieldFromRow(row, "telefon"),
      datum_narozeni: parseImportDate(getFieldFromRow(row, "datum_narozeni")),
      obcanstvi: getFieldFromRow(row, "obcanstvi"),
      pohlavi: getFieldFromRow(row, "pohlavi"),
      orcid: getFieldFromRow(row, "orcid"),
      researcher_id: getFieldFromRow(row, "researcher_id"),
      scopus_id: getFieldFromRow(row, "scopus_id")
    };
    if (!item.prijmeni && !item.jmeno && !item.osobni_cislo) return null;
    return normalizePerson(item);
  }

  function parseImportRows(text, fileName) {
    const lower = (fileName || "").toLowerCase();
    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : (parsed.persons || []);
      return { rows, meta: { format: "json" } };
    }
    const parsed = parseDelimitedTable(text);
    return { rows: parsed.rows, meta: { format: "csv", ...parsed.meta } };
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro import do Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function importRows(rows, meta = {}) {
    const normalized = rows.map(normalizeImportRow).filter(Boolean);
    const valid = normalized.filter(p => p.osobni_cislo && p.prijmeni && p.jmeno);
    const skipped = rows.length - normalized.length;
    const incomplete = normalized.length - valid.length;
    if (!valid.length) {
      const headers = meta.headers?.slice(0, 6).join(", ") || "neznámé";
      alert(
        `V souboru nejsou platné řádky (chybí příjmení, jméno nebo osobní číslo).\n` +
        `Rozpoznaná záhlaví: ${headers}\n` +
        `Oddělovač: ${meta.delimiter || "?"}\n\n` +
        `Tip: Uložte z Excelu jako CSV UTF-8 (oddělovač středník) s českými hlavičkami.`
      );
      return;
    }
    if (!confirm(`Importovat ${valid.length} osob?${incomplete ? `\n(${incomplete} řádků přeskočeno – chybí povinné údaje)` : ""}\n\nExistující záznamy se aktualizují podle osobního čísla.`)) return;
    loading = true;
    setStatus(`Importuji 0 / ${valid.length}…`);
    renderList();
    try {
      if (useSupabase && window.kbSupabasePersons && await ensureAuth()) {
        const saved = await window.kbSupabasePersons.upsertPersonsBatch(valid, (done, total) => {
          setStatus(`Importuji ${done} / ${total}…`);
        });
        saved.forEach(p => {
          const idx = persons.findIndex(x => x.osobni_cislo === p.osobni_cislo);
          if (idx === -1) persons.push(p);
          else persons[idx] = p;
        });
        setStatus(`Importováno do Supabase: ${saved.length} osob.${skipped ? ` Přeskočeno ${skipped} prázdných řádků.` : ""}`);
      } else {
        valid.forEach(p => {
          const idx = persons.findIndex(x => x.osobni_cislo === p.osobni_cislo);
          if (idx === -1) persons.push({ ...p, id: uuid(), created_at: new Date().toISOString() });
          else persons[idx] = { ...persons[idx], ...p };
        });
        persistLocal();
        setStatus(`Importováno lokálně: ${valid.length} osob.`);
      }
      populateFilters();
      renderList();
      document.dispatchEvent(new CustomEvent("kb:persons-loaded", { detail: { persons } }));
    } catch (err) {
      console.error(err);
      alert(`Import selhal: ${err.message || err}\n\nAlternativa: použijte supabase/persons-import-staging.sql v SQL Editoru.`);
      setStatus(`Import selhal: ${err.message || err}`, true);
    } finally {
      loading = false;
      renderList();
    }
  }

  async function importFile(file) {
    let text;
    try {
      text = await readImportFileText(file);
    } catch (_) {
      alert("Soubor se nepodařilo přečíst.");
      return;
    }
    let parsed;
    try {
      parsed = parseImportRows(text, file.name);
    } catch (err) {
      alert(`Soubor se nepodařilo zpracovat: ${err.message || err}\n\nPodporované formáty: CSV, TSV, JSON.`);
      return;
    }
    await importRows(parsed.rows, parsed.meta);
  }

  async function deletePerson(id) {
    if (!confirm("Smazat osobu? Moduly si ponechají textový název, ale vazba na osobu se zruší.")) return;
    try {
      if (useSupabase && window.kbSupabasePersons) await window.kbSupabasePersons.deletePerson(id);
      persons = persons.filter(p => p.id !== id);
      if (!useSupabase) persistLocal();
      populateFilters();
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
            <input id="personsImportFile" type="file" accept=".csv,.tsv,.txt,.json,application/json,text/csv" hidden />
            <button type="button" id="personsImportBtn" class="button small secondary">Import CSV</button>
            <button type="button" id="personsReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="newPersonBtn" class="button accent">+ Osoba</button>
          </div>
        </div>
        <p id="personsListSummary" class="personsStatus hint">Načítám…</p>
        <div class="personsFilters">
          ${FILTER_FIELDS.map(f => f.type === "text"
    ? `<label>${html(f.label)}<input id="personsFilter_${f.key}" type="search" placeholder="Vše" /></label>`
    : `<label>${html(f.label)}<select id="personsFilter_${f.key}"><option value="">Vše</option></select></label>`
  ).join("")}
          <label>Řadit podle
            <select id="personsSortBy">${SORT_FIELDS.map(f => `<option value="${f.key}">${html(f.label)}</option>`).join("")}</select>
          </label>
          <label>Směr
            <select id="personsSortDir">
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
          </label>
          <button type="button" id="personsClearFilters" class="button small secondary">Zrušit filtry</button>
        </div>
        <div id="personsList"></div>
      </section>`;
    el("personsImportBtn")?.addEventListener("click", () => el("personsImportFile")?.click());
    el("personsImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importFile(file);
      e.target.value = "";
    });
    el("personsReloadBtn").addEventListener("click", loadPersons);
    el("newPersonBtn").addEventListener("click", () => openDialog());
    FILTER_FIELDS.forEach(({ key }) => {
      el(`personsFilter_${key}`)?.addEventListener("input", renderList);
      el(`personsFilter_${key}`)?.addEventListener("change", renderList);
    });
    el("personsSortBy")?.addEventListener("change", renderList);
    el("personsSortDir")?.addEventListener("change", renderList);
    el("personsClearFilters")?.addEventListener("click", () => {
      FILTER_FIELDS.forEach(({ key }) => {
        const node = el(`personsFilter_${key}`);
        if (node) node.value = "";
      });
      if (el("personsSortBy")) el("personsSortBy").value = "prijmeni";
      if (el("personsSortDir")) el("personsSortDir").value = "asc";
      renderList();
    });
  }

  function injectDialog() {
    if (el("personDialog")) return;
    window.kbPracovistePicker?.injectStyles?.();
    const formFields = TABLE_COLUMNS.filter((col) => col.key !== "pracoviste").map((col) => {
      const type = col.key === "email" ? "email" : col.key === "datum_narozeni" ? "date" : "text";
      return `<label>${html(col.label)}<input id="person_${col.key}" type="${type}" ${col.key === "jmeno" || col.key === "prijmeni" || col.key === "osobni_cislo" ? "required" : ""} /></label>`;
    }).join("");
    const pickerHtml = window.kbPracovistePicker?.createPickerHtml?.({
      kodInputId: "person_kodorg",
      labelInputId: "person_pracoviste",
      labelFieldName: "Kmenové pracoviště (číselník UHK)"
    }) || `<label>Pracoviště<input id="person_pracoviste_free" type="text" /></label>`;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <dialog id="personDialog">
        <form method="dialog" id="personForm">
          <div class="dialogHeader"><h2 id="personDialogTitle">Nová osoba</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="personEditId" />
          <div class="grid2">${formFields}</div>
          ${pickerHtml}
          <label>Pracoviště (volný text, pokud není v číselníku)
            <input id="person_pracoviste_free" type="text" placeholder="Ruční popis pracoviště bez kodorg" />
          </label>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="savePersonBtn" type="button" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>`;
    document.body.appendChild(wrap);
    el("savePersonBtn").addEventListener("click", saveDialog);
    wrap.querySelector("[data-pracoviste-picker]")?.addEventListener("kb:pracoviste-selected", () => {
      const free = el("person_pracoviste_free");
      if (free) free.value = "";
    });
  }

  function injectStyles() {
    if (el("personsStyles")) return;
    const style = document.createElement("style");
    style.id = "personsStyles";
    style.textContent = `
      .personsFilters { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .6rem .75rem; margin: .5rem 0 .75rem; align-items: end; }
      .personsFilters label { display: flex; flex-direction: column; gap: .2rem; font-size: .82rem; margin: 0; }
      .personsFilters input, .personsFilters select { width: 100%; }
      #personsClearFilters { align-self: end; }
      .personsTableWrap { overflow-x: auto; }
      .personsTable { width: 100%; border-collapse: collapse; min-width: 1400px; }
      .personsTable th, .personsTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .82rem; white-space: nowrap; }
      .personsTable th { position: sticky; top: 0; background: var(--panel, #fff); z-index: 1; }
      .personId { font-size: .82rem; background: #f2f4f7; padding: .1rem .35rem; border-radius: 4px; }
      .personsStatus { margin: .35rem 0 .5rem; }
      .personsStatusError { color: #b42318; }
      .kb-person-search-picker { flex: 1; min-width: 0; display: grid; gap: .35rem; }
      .kb-person-search-native { display: none !important; }
      .kb-person-search-input { width: 100%; }
      .kb-person-search-hint { margin: 0; font-size: .78rem; }
      .kb-person-search-results { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      .kb-person-search-results li { margin: 0; }
      .kb-person-search-option { display: block; width: 100%; text-align: left; padding: .45rem .6rem; border: 0; background: transparent; cursor: pointer; font-size: .88rem; }
      .kb-person-search-option:hover { background: #f2f4f7; }
      .kb-person-search-none { padding: .5rem .6rem; color: var(--muted); font-size: .85rem; }
      .kb-person-search-chip { display: inline-flex; align-items: center; gap: .35rem; padding: .25rem .5rem; background: #eff8ff; border: 1px solid #b2ddff; border-radius: 999px; font-size: .85rem; }
      .kb-person-search-clear { border: 0; background: transparent; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 .15rem; color: var(--muted); }
      .kb-person-search-empty { font-size: .85rem; color: var(--muted); }
      @media (max-width: 700px) {
        .personsFilters { grid-template-columns: 1fr 1fr; }
      }
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
    document.addEventListener("kb:pracoviste-loaded", () => {
      if (!persons.length) return;
      persons = persons.map(normalizePerson);
      populateFilters();
      renderList();
    });
  }

  window.kbPersons = {
    loadPersons,
    ensureLoaded,
    getPersons,
    getPerson,
    getPersonByOsobniCislo,
    matchPersonFromRegistry,
    parseDelimitedTable,
    personLabel,
    normalizePerson,
    renderPersonOptions,
    fillSelect,
    setupSearchPicker,
    setSelectPersonValue,
    personOptionLabel,
    openDialog,
    upsertPerson,
    importFile,
    deletePerson
  };

  document.addEventListener("DOMContentLoaded", init);
})();
