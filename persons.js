// Globální modul Osoby – sdílená evidence pro soutěže, DKRVO, PPK a další moduly.

(function () {
  const STORAGE_KEY = "kb-dashboard-persons-v1";
  let persons = [];
  let useSupabase = false;
  let loading = false;
  let onSavedCallback = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `person-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function personLabel(p) {
    if (!p) return "";
    return [p.titul_pred, p.jmeno, p.prijmeni, p.titul_za].map(n).filter(Boolean).join(" ").trim();
  }

  function getPerson(id) {
    return persons.find(p => p.id === id) || null;
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
      const label = `${personLabel(p)}${p.fakulta ? ` · ${p.fakulta}` : ""}`;
      return `<option value="${html(p.id)}" ${p.id === selectedId ? "selected" : ""}>${html(label)}</option>`;
    }).join("");
    return `<option value="">— vyberte osobu —</option>${opts}`;
  }

  function fillSelect(selectEl, selectedId) {
    if (!selectEl) return;
    selectEl.innerHTML = renderPersonOptions(selectedId);
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
      list = list.filter(p => [personLabel(p), p.email, p.osobni_cislo, p.fakulta, p.katedra, p.soucast]
        .some(v => n(v).toLowerCase().includes(q)));
    }
    if (!list.length) {
      box.innerHTML = `<p class="hint">${persons.length ? "Žádná shoda s hledáním." : "Zatím žádné osoby. Přidejte první záznam — použijí ho soutěže, DKRVO, PPK a další moduly."}</p>`;
      return;
    }
    box.innerHTML = `<div class="personsTableWrap"><table class="personsTable">
      <thead><tr><th>ID</th><th>Jméno</th><th>E-mail</th><th>Fakulta</th><th>Katedra</th><th>Součást</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td><code class="personId">${html(p.osobni_cislo) || "—"}</code></td>
        <td><strong>${html(personLabel(p))}</strong></td>
        <td>${html(p.email)}</td>
        <td>${html(p.fakulta)}</td>
        <td>${html(p.katedra)}</td>
        <td>${html(p.soucast)}</td>
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
    el("personCislo").value = existing?.osobni_cislo || "";
    el("personTitulPred").value = existing?.titul_pred || "";
    el("personJmeno").value = existing?.jmeno || "";
    el("personPrijmeni").value = existing?.prijmeni || "";
    el("personTitulZa").value = existing?.titul_za || "";
    el("personEmail").value = existing?.email || "";
    el("personTelefon").value = existing?.telefon || "";
    el("personFakulta").value = existing?.fakulta || "";
    el("personKatedra").value = existing?.katedra || "";
    el("personSoucast").value = existing?.soucast || "";
    el("personPoznamka").value = existing?.poznamka || "";
    el("personDialogTitle").textContent = existing ? "Upravit osobu" : "Nová osoba";
    el("personDialog").showModal();
  }

  async function saveDialog(e) {
    e.preventDefault();
    const id = el("personEditId").value || uuid();
    const existing = getPerson(id);
    const person = {
      id,
      osobni_cislo: n(el("personCislo").value),
      titul_pred: n(el("personTitulPred").value),
      jmeno: n(el("personJmeno").value),
      prijmeni: n(el("personPrijmeni").value),
      titul_za: n(el("personTitulZa").value),
      email: n(el("personEmail").value),
      telefon: n(el("personTelefon").value),
      fakulta: n(el("personFakulta").value),
      katedra: n(el("personKatedra").value),
      soucast: n(el("personSoucast").value),
      poznamka: n(el("personPoznamka").value),
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    };
    if (!person.jmeno || !person.prijmeni) {
      alert("Vyplňte jméno a příjmení.");
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
            <p class="hint">Centrální evidence osob UHK — řešitelé, garanti, kontakty. Sdíleno mezi interními soutěžemi, DKRVO, PPK a dalšími moduly.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="personsReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="newPersonBtn" class="button accent">+ Osoba</button>
          </div>
        </div>
        <p id="personsStatus" class="personsStatus hint">Načítám…</p>
        <label class="personsSearchLabel">Hledat
          <input id="personsSearch" type="search" placeholder="Jméno, e-mail, fakulta, katedra, ID…" />
        </label>
        <div id="personsList"></div>
      </section>`;
    el("personsReloadBtn").addEventListener("click", loadPersons);
    el("newPersonBtn").addEventListener("click", () => openDialog());
    el("personsSearch")?.addEventListener("input", renderList);
  }

  function injectDialog() {
    if (el("personDialog")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <dialog id="personDialog">
        <form method="dialog" id="personForm">
          <div class="dialogHeader"><h2 id="personDialogTitle">Nová osoba</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="personEditId" />
          <div class="grid2">
            <label>ID / osobní číslo<input id="personCislo" placeholder="např. OV-001" /></label>
            <label>Titul před<input id="personTitulPred" placeholder="doc., prof." /></label>
            <label>Jméno<input id="personJmeno" required /></label>
            <label>Příjmení<input id="personPrijmeni" required /></label>
            <label>Titul za<input id="personTitulZa" placeholder="Ph.D., CSc." /></label>
            <label>E-mail<input id="personEmail" type="email" /></label>
            <label>Telefon<input id="personTelefon" /></label>
            <label>Fakulta<input id="personFakulta" /></label>
            <label>Katedra<input id="personKatedra" /></label>
            <label>Součást<input id="personSoucast" placeholder="rektorát, ústav…" /></label>
          </div>
          <label>Poznámka<textarea id="personPoznamka" rows="2"></textarea></label>
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
      .personsTable { width: 100%; border-collapse: collapse; }
      .personsTable th, .personsTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .88rem; }
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
    personLabel,
    renderPersonOptions,
    fillSelect,
    openDialog,
    deletePerson
  };

  document.addEventListener("DOMContentLoaded", init);
})();
