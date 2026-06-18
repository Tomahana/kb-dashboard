// Modul Výstupy — publikační výstupy (Jimp, JSC, B, C) a aplikované výsledky pro DKRVO, PPK a analýzy.

(function () {
  const PUBL_TYPES = ["Jimp", "JSC", "B", "C"];
  const APPLIED_TYPES = ["D", "F", "G", "H", "I", "J", "N", "O", "P", "R", "T", "U", "V", "Z"];

  const IMPORT_ALIASES = {
    typ_vystupu: ["Typ výstupu", "Typ", "typ_vystupu", "Kód výstupu", "Druh"],
    rok: ["Rok", "rok", "Rok výstupu"],
    nazev: ["Název", "Nazev", "Titul", "nazev", "Název výstupu"],
    autor: ["Autor", "autor", "Autoři"],
    resitel: ["Řešitel", "Resitel", "resitel"],
    fakulta: ["Fakulta", "fakulta", "Součást"],
    zkr_fak: ["Zkr. fak.", "zkr_fak", "Zkratka fakulty"],
    katedra: ["Katedra", "katedra", "Pracoviště"],
    doi: ["DOI", "doi"],
    issn: ["ISSN", "issn"],
    casopis: ["Časopis", "Casopis", "casopis", "Název časopisu"],
    isbn: ["ISBN", "isbn"],
    riv_id: ["RIV ID", "RIV_ID", "riv_id", "ID RIV"],
    cislo_na_riv: ["Číslo na RIV", "Cislo na RIV", "cislo_na_riv"],
    druh_vysledku: ["Druh výsledku", "druh_vysledku"],
    poznamka: ["Poznámka", "Poznamka", "poznamka"]
  };

  const FAKULTA_ZKR = {
    fim: "FIM", ff: "FF", fsv: "FSV", pdf: "PDF", fhk: "FHK",
    "fakulta informatiky": "FIM", "filozofická": "FF", "sociálních": "FSV",
    pedagogická: "PDF", humanitní: "FHK"
  };

  let vystupy = [];
  let useSupabase = false;
  let loading = false;
  let activeView = "evidence";
  let filterTyp = "";
  let filterRok = "";
  let filterSearch = "";
  let editingId = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `vystup-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function isAppliedType(typ) {
    const t = n(typ).toUpperCase();
    return !PUBL_TYPES.includes(t) && (APPLIED_TYPES.includes(t) || t.length <= 2);
  }

  function inferKategorie(typ) {
    return isAppliedType(typ) ? "aplikovany" : "publikacni";
  }

  function normalizeTyp(typ) {
    const t = n(typ);
    const upper = t.toUpperCase();
    if (upper === "JIMP") return "Jimp";
    if (upper === "JSC" || upper === "J") return "JSC";
    if (upper === "B") return "B";
    if (upper === "C") return "C";
    if (APPLIED_TYPES.includes(upper)) return upper;
    return t || "JSC";
  }

  function inferZkrFak(fakulta) {
    const text = l(fakulta);
    if (!text) return "";
    for (const [key, zkr] of Object.entries(FAKULTA_ZKR)) {
      if (text.includes(key)) return zkr;
    }
    if (/^[A-Z]{2,4}$/.test(n(fakulta))) return n(fakulta).toUpperCase();
    return n(fakulta);
  }

  function buildSourceKey(item) {
    const parts = [
      n(item.typ_vystupu),
      n(item.rok),
      n(item.riv_id) || n(item.cislo_na_riv) || n(item.doi) || n(item.isbn),
      l(n(item.autor) || n(item.resitel)),
      l(n(item.nazev)).slice(0, 80)
    ].filter(Boolean);
    return parts.join("|") || `manual-${uuid()}`;
  }

  function persistLocal() {
    window.kbSupabaseVystupy?.saveLocal?.(vystupy);
  }

  function setStatus(text, isError) {
    const node = el("vystupyStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("vystupyStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function loadVystupy() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseVystupy) {
        useSupabase = false;
        vystupy = [];
        setStatus("Data pouze v prohlížeči.");
        return;
      }
      const available = await window.kbSupabaseVystupy.probeTables();
      if (!available) {
        useSupabase = false;
        vystupy = window.kbSupabaseVystupy.loadLocal();
        setStatus("Tabulka kb_vystupy v Supabase zatím neexistuje. Spusťte supabase/vystupy-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        vystupy = await window.kbSupabaseVystupy.loadVystupy();
        setStatus(`Načteno ze Supabase: ${vystupy.length} výstupů.`);
      }
    } catch (error) {
      console.error(error);
      useSupabase = false;
      vystupy = window.kbSupabaseVystupy?.loadLocal?.() || [];
      setStatus(`Chyba načtení: ${error.message || error}`, true);
    } finally {
      loading = false;
      document.dispatchEvent(new CustomEvent("kb:vystupy-loaded"));
      render();
    }
  }

  function parseAuthorName(name) {
    const text = n(name).replace(/\s+/g, " ");
    if (!text) return { jmeno: "", prijmeni: "" };
    const cleaned = text
      .replace(/^(prof\.|doc\.|ing\.|mgr\.|rndr\.|mudr\.|phdr\.|dr\.|bc\.|ph\.d\.|csc\.|mba\.?)/gi, "")
      .replace(/,?\s*(ph\.d\.|csc\.|mba\.?|dipl\.?)/gi, "")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (!parts.length) return { jmeno: "", prijmeni: "" };
    if (parts.length === 1) return { jmeno: "", prijmeni: parts[0] };
    return { jmeno: parts[0], prijmeni: parts[parts.length - 1] };
  }

  function linkPerson(row) {
    let linked = { ...row };
    const isAppl = row.kategorie === "aplikovany";
    const role = isAppl ? "resitel" : "autor";
    const label = isAppl ? row.resitel : row.autor;
    const labelLower = l(label);
    if (labelLower.includes("@")) {
      const byEmail = window.kbPersons?.getPersons?.().find((p) => l(p.email) === labelLower);
      if (byEmail) return window.kbPersonLinks?.applyPersonLink?.(linked, byEmail, role) || linked;
    }
    const name = parseAuthorName(label);
    const matched = window.kbPersons?.matchPersonFromRegistry?.({
      jmeno: name.jmeno,
      prijmeni: name.prijmeni,
      fakulta: row.zkr_fak || row.fakulta
    });
    if (matched) return window.kbPersonLinks?.applyPersonLink?.(linked, matched, role) || linked;
    return linked;
  }

  function personDisplay(item) {
    if (item.kategorie === "aplikovany") {
      return window.kbPersonLinks?.personDisplay?.(item, "resitel") || n(item.resitel) || "—";
    }
    return window.kbPersonLinks?.personDisplay?.(item, "autor") || n(item.autor) || "—";
  }

  function isLinked(item) {
    if (item.kategorie === "aplikovany") {
      return !!(item.resitel_osobni_cislo || window.kbPersonLinks?.resolvePerson?.(item, "resitel"));
    }
    return !!(item.autor_osobni_cislo || window.kbPersonLinks?.resolvePerson?.(item, "autor"));
  }

  function typBadge(item) {
    const typ = n(item.typ_vystupu);
    const cls = item.kategorie === "aplikovany" ? "vystupyTypApl" : `vystupyTyp${typ}`;
    return `<span class="vystupyTypBadge ${cls}">${html(typ || "?")}</span>`;
  }

  function filteredItems() {
    return vystupy.filter((item) => {
      if (filterTyp) {
        if (filterTyp === "aplikovany" && item.kategorie !== "aplikovany") return false;
        if (filterTyp === "B+C" && !["B", "C"].includes(item.typ_vystupu)) return false;
        if (filterTyp !== "aplikovany" && filterTyp !== "B+C" && item.typ_vystupu !== filterTyp) return false;
      }
      if (filterRok && String(item.rok) !== filterRok) return false;
      if (filterSearch) {
        const hay = l([
          item.nazev, item.autor, item.resitel, item.typ_vystupu, item.zkr_fak, item.fakulta,
          item.katedra, item.doi, item.isbn, item.casopis, item.riv_id, item.poznamka
        ].join(" "));
        if (!hay.includes(l(filterSearch))) return false;
      }
      return true;
    });
  }

  function uniqueYears() {
    return [...new Set(vystupy.map((v) => v.rok).filter(Boolean))].sort((a, b) => b - a);
  }

  function countByTyp() {
    const counts = { Jimp: 0, JSC: 0, B: 0, C: 0, aplikovany: 0 };
    for (const v of vystupy) {
      if (v.kategorie === "aplikovany") counts.aplikovany += 1;
      else if (counts[v.typ_vystupu] != null) counts[v.typ_vystupu] += 1;
    }
    return counts;
  }

  function analysisContext(items) {
    return {
      items,
      filterRok,
      personDisplay,
      isLinked,
      uniqueYears,
      countByTyp
    };
  }

  function renderTable(items) {
    if (!items.length) {
      return `<p class="hint">Žádné výstupy${filterTyp || filterRok || filterSearch ? " pro zadané filtry" : ""}. Importujte data z IS VaVaI nebo přidejte záznam ručně.</p>`;
    }
    return `
      <div class="vystupyTableWrap">
        <table class="vystupyTable">
          <thead>
            <tr>
              <th>Typ</th><th>Rok</th><th>Název</th><th>Autor / řešitel</th>
              <th>Fakulta</th><th>RIV / DOI</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr data-vystup-id="${html(item.id)}">
                <td>${typBadge(item)}</td>
                <td>${item.rok || "—"}</td>
                <td class="vystupyNazevCell" title="${html(item.nazev)}">${html(item.nazev)}</td>
                <td>${html(personDisplay(item))}</td>
                <td>${html(item.zkr_fak || item.fakulta || "—")}</td>
                <td class="vystupyMetaCell">${html(item.riv_id || item.doi || item.isbn || "—")}</td>
                <td><button type="button" class="button ghost small" data-edit-vystup="${html(item.id)}">Upravit</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="hint vystupyTableFoot">Zobrazeno ${items.length} z ${vystupy.length} výstupů.</p>`;
  }

  function renderAnalysisView(items) {
    return `<div id="vystupyAnalysisMount"></div>`;
  }

  function renderMain() {
    const items = filteredItems();
    const counts = countByTyp();
    const years = uniqueYears();

    return `
      <section class="panel vystupyPanel">
        <div class="vystupyHead">
          <div>
            <p class="hint vystupyIntro">Evidence výzkumných výstupů UHK — publikace (Jimp, JSC, B, C) a aplikované výsledky. Podklady pro analýzy, DKRVO a PPK.</p>
            <div class="vystupySummaryChips">
              <span class="vystupyChip">Jimp: ${counts.Jimp}</span>
              <span class="vystupyChip">JSC: ${counts.JSC}</span>
              <span class="vystupyChip">B: ${counts.B}</span>
              <span class="vystupyChip">C: ${counts.C}</span>
              <span class="vystupyChip vystupyChipApl">Aplik.: ${counts.aplikovany}</span>
            </div>
          </div>
          <div class="vystupyHeadActions">
            <button type="button" class="button secondary" id="vystupyImportBtn">Import</button>
            <button type="button" class="button" id="vystupyAddBtn">+ Přidat výstup</button>
          </div>
        </div>
        <p id="vystupyStatus" class="hint vystupyStatus"></p>
        <div class="vystupyViewTabs">
          <button type="button" class="vystupyViewTab ${activeView === "evidence" ? "active" : ""}" data-vystupy-view="evidence">Evidence</button>
          <button type="button" class="vystupyViewTab ${activeView === "analysis" ? "active" : ""}" data-vystupy-view="analysis">Analýzy</button>
        </div>
        <div class="vystupyFilters">
          <label>Typ
            <select id="vystupyTypFilter">
              <option value="">Všechny typy</option>
              <option value="Jimp" ${filterTyp === "Jimp" ? "selected" : ""}>Jimp</option>
              <option value="JSC" ${filterTyp === "JSC" ? "selected" : ""}>JSC</option>
              <option value="B+C" ${filterTyp === "B+C" ? "selected" : ""}>B + C</option>
              <option value="aplikovany" ${filterTyp === "aplikovany" ? "selected" : ""}>Aplikované výsledky</option>
            </select>
          </label>
          <label>Rok
            <select id="vystupyRokFilter">
              <option value="">Všechny roky</option>
              ${years.map((y) => `<option value="${y}" ${filterRok === String(y) ? "selected" : ""}>${y}</option>`).join("")}
            </select>
          </label>
          <label class="vystupySearchLabel">Hledat
            <input type="search" id="vystupySearch" placeholder="Název, autor, DOI, RIV…" value="${html(filterSearch)}" />
          </label>
          <button type="button" class="button secondary" id="vystupyReloadBtn">Obnovit</button>
        </div>
        <div id="vystupyContent">${loading ? `<p class="hint">Načítám…</p>` : (activeView === "analysis" ? renderAnalysisView(items) : renderTable(items))}</div>
      </section>`;
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
    return "";
  }

  function rowToVystup(raw) {
    const typ = normalizeTyp(getFieldFromRow(raw, "typ_vystupu"));
    const kategorie = inferKategorie(typ);
    const fakulta = getFieldFromRow(raw, "fakulta");
    const item = {
      id: uuid(),
      typ_vystupu: typ,
      kategorie,
      rok: Number(getFieldFromRow(raw, "rok")) || null,
      nazev: getFieldFromRow(raw, "nazev") || "Bez názvu",
      autor: kategorie === "publikacni" ? getFieldFromRow(raw, "autor") : "",
      resitel: kategorie === "aplikovany" ? (getFieldFromRow(raw, "resitel") || getFieldFromRow(raw, "autor")) : "",
      fakulta,
      zkr_fak: getFieldFromRow(raw, "zkr_fak") || inferZkrFak(fakulta),
      katedra: getFieldFromRow(raw, "katedra"),
      doi: getFieldFromRow(raw, "doi"),
      issn: getFieldFromRow(raw, "issn"),
      casopis: getFieldFromRow(raw, "casopis"),
      isbn: getFieldFromRow(raw, "isbn"),
      riv_id: getFieldFromRow(raw, "riv_id"),
      cislo_na_riv: getFieldFromRow(raw, "cislo_na_riv"),
      druh_vysledku: getFieldFromRow(raw, "druh_vysledku"),
      poznamka: getFieldFromRow(raw, "poznamka"),
      imported_at: new Date().toISOString()
    };
    item.source_key = buildSourceKey(item);
    return linkPerson(item);
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
        if (row.some((cell) => n(cell))) records.push(row);
        row = [];
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((cell) => n(cell))) records.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((cell) => n(cell))) records.push(row);
    return records;
  }

  function detectDelimiter(line) {
    const counts = [["\t", (line.match(/\t/g) || []).length], [";", (line.match(/;/g) || []).length], [",", (line.match(/,/g) || []).length]];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : "\t";
  }

  function parseImportText(text) {
    const sample = text.split(/\r?\n/).find((ln) => n(ln)) || "";
    const delimiter = detectDelimiter(sample);
    const records = parseCsvRecords(text, delimiter);
    if (!records.length) return [];
    const headers = records[0].map((h) => n(h));
    return records.slice(1).map((cells) => {
      const row = {};
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
      return rowToVystup(row);
    }).filter((item) => n(item.nazev));
  }

  async function handleImportFile(file) {
    if (!file) return;
    setStatus(`Importuji ${file.name}…`);
    try {
      let parsed = [];
      if (/\.json$/i.test(file.name)) {
        const data = JSON.parse(await file.text());
        const rows = Array.isArray(data) ? data : (data.vystupy || data.items || []);
        parsed = rows.map((row) => rowToVystup(row));
      } else if (/\.xlsx?$/i.test(file.name) && window.XLSX) {
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
        parsed = rows.map((row) => rowToVystup(row));
      } else {
        parsed = parseImportText(await file.text());
      }
      if (!parsed.length) {
        setStatus("Import neobsahuje platné řádky.", true);
        return;
      }
      if (useSupabase && await ensureAuth()) {
        const saved = await window.kbSupabaseVystupy.upsertVystupyBatch(parsed, (done, total) => {
          setStatus(`Importuji… ${done}/${total}`);
        });
        const map = new Map(vystupy.map((v) => [v.source_key, v]));
        saved.forEach((s) => map.set(s.source_key, s));
        vystupy = [...map.values()];
        persistLocal();
        setStatus(`Import dokončen: ${saved.length} výstupů (upsert).`);
      } else {
        const map = new Map(vystupy.map((v) => [v.source_key, v]));
        parsed.forEach((p) => map.set(p.source_key, p));
        vystupy = [...map.values()];
        persistLocal();
        setStatus(`Import lokálně: ${parsed.length} výstupů.`);
      }
      document.dispatchEvent(new CustomEvent("kb:vystupy-loaded"));
      render();
    } catch (error) {
      console.error(error);
      setStatus(`Chyba importu: ${error.message || error}`, true);
    }
  }

  function injectDialog() {
    if (el("vystupyDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "vystupyDialog";
    dialog.className = "vystupyDialog";
    dialog.innerHTML = `
      <form method="dialog" class="vystupyDialogForm">
        <h3 id="vystupyDialogTitle">Výstup</h3>
        <div class="vystupyDialogGrid">
          <label>Kategorie
            <select id="vystupKategorie" required>
              <option value="publikacni">Publikační výstup</option>
              <option value="aplikovany">Aplikovaný výsledek</option>
            </select>
          </label>
          <label>Typ výstupu
            <select id="vystupTyp" required></select>
          </label>
          <label>Rok<input type="number" id="vystupRok" min="1990" max="2100" /></label>
          <label class="vystupyDialogWide">Název<input id="vystupNazev" required /></label>
          <label id="vystupAutorWrap">Autor<input id="vystupAutor" /></label>
          <label id="vystupResitelWrap" hidden>Řešitel<input id="vystupResitel" /></label>
          <label>Osoba (modul Osoby)<select id="vystupPersonSelect"><option value="">— nepropojeno —</option></select></label>
          <label>Fakulta<input id="vystupFakulta" /></label>
          <label>Zkr. fak.<input id="vystupZkrFak" /></label>
          <label>Katedra<input id="vystupKatedra" /></label>
          <label id="vystupDoiWrap">DOI<input id="vystupDoi" /></label>
          <label id="vystupIssnWrap">ISSN<input id="vystupIssn" /></label>
          <label id="vystupCasopisWrap">Časopis<input id="vystupCasopis" /></label>
          <label id="vystupIsbnWrap">ISBN<input id="vystupIsbn" /></label>
          <label>RIV ID<input id="vystupRivId" /></label>
          <label>Číslo na RIV<input id="vystupCisloRiv" /></label>
          <label class="vystupyDialogWide">Poznámka<textarea id="vystupPoznamka" rows="2"></textarea></label>
        </div>
        <div class="vystupyDialogActions">
          <button type="button" class="button danger" id="vystupDeleteBtn" hidden>Smazat</button>
          <span class="vystupyDialogSpacer"></span>
          <button type="button" class="button secondary" value="cancel">Zrušit</button>
          <button type="submit" class="button" value="save">Uložit</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
  }

  function fillTypSelect(kategorie, selected) {
    const sel = el("vystupTyp");
    if (!sel) return;
    const types = kategorie === "aplikovany" ? APPLIED_TYPES : PUBL_TYPES;
    sel.innerHTML = types.map((t) => `<option value="${t}" ${t === selected ? "selected" : ""}>${t}</option>`).join("");
  }

  function fillPersonSelect(selectedId) {
    const sel = el("vystupPersonSelect");
    if (!sel) return;
    const persons = window.kbPersons?.getPersons?.() || [];
    const label = window.kbPersons?.personLabel?.bind(window.kbPersons) || ((p) => `${p.prijmeni} ${p.jmeno}`);
    sel.innerHTML = `<option value="">— nepropojeno —</option>${persons.map((p) =>
      `<option value="${html(p.id)}" ${p.id === selectedId ? "selected" : ""}>${html(label(p))}${p.osobni_cislo ? ` (${html(p.osobni_cislo)})` : ""}</option>`
    ).join("")}`;
  }

  function toggleDialogFields(kategorie) {
    const isAppl = kategorie === "aplikovany";
    if (el("vystupAutorWrap")) el("vystupAutorWrap").hidden = isAppl;
    if (el("vystupResitelWrap")) el("vystupResitelWrap").hidden = !isAppl;
    ["vystupDoiWrap", "vystupIssnWrap", "vystupCasopisWrap"].forEach((id) => {
      if (el(id)) el(id).hidden = isAppl;
    });
    if (el("vystupIsbnWrap")) el("vystupIsbnWrap").hidden = false;
  }

  function openDialog(item) {
    injectDialog();
    const dialog = el("vystupyDialog");
    editingId = item?.id || null;
    const isEdit = !!item;
    el("vystupyDialogTitle").textContent = isEdit ? "Upravit výstup" : "Nový výstup";
    el("vystupDeleteBtn").hidden = !isEdit;
    const kat = item?.kategorie || "publikacni";
    el("vystupKategorie").value = kat;
    fillTypSelect(kat, item?.typ_vystupu || "JSC");
    toggleDialogFields(kat);
    el("vystupRok").value = item?.rok ?? "";
    el("vystupNazev").value = item?.nazev || "";
    el("vystupAutor").value = item?.autor || "";
    el("vystupResitel").value = item?.resitel || "";
    el("vystupFakulta").value = item?.fakulta || "";
    el("vystupZkrFak").value = item?.zkr_fak || "";
    el("vystupKatedra").value = item?.katedra || "";
    el("vystupDoi").value = item?.doi || "";
    el("vystupIssn").value = item?.issn || "";
    el("vystupCasopis").value = item?.casopis || "";
    el("vystupIsbn").value = item?.isbn || "";
    el("vystupRivId").value = item?.riv_id || "";
    el("vystupCisloRiv").value = item?.cislo_na_riv || "";
    el("vystupPoznamka").value = item?.poznamka || "";
    const role = kat === "aplikovany" ? "resitel" : "autor";
    fillPersonSelect(item ? window.kbPersonLinks?.personSelectId?.(item, role) : "");
    dialog.showModal();
  }

  function readDialogForm() {
    const kat = el("vystupKategorie").value;
    const isAppl = kat === "aplikovany";
    const role = isAppl ? "resitel" : "autor";
    let item = {
      id: editingId || uuid(),
      kategorie: kat,
      typ_vystupu: el("vystupTyp").value,
      rok: el("vystupRok").value ? Number(el("vystupRok").value) : null,
      nazev: el("vystupNazev").value,
      autor: isAppl ? "" : el("vystupAutor").value,
      resitel: isAppl ? el("vystupResitel").value : "",
      fakulta: el("vystupFakulta").value,
      zkr_fak: el("vystupZkrFak").value || inferZkrFak(el("vystupFakulta").value),
      katedra: el("vystupKatedra").value,
      doi: el("vystupDoi").value,
      issn: el("vystupIssn").value,
      casopis: el("vystupCasopis").value,
      isbn: el("vystupIsbn").value,
      riv_id: el("vystupRivId").value,
      cislo_na_riv: el("vystupCisloRiv").value,
      poznamka: el("vystupPoznamka").value
    };
    const personId = el("vystupPersonSelect").value;
    const person = personId ? window.kbPersons?.getPerson?.(personId) : null;
    if (person) item = window.kbPersonLinks?.applyPersonLink?.(item, person, role) || item;
    else item = window.kbPersonLinks?.clearPersonLink?.(item, role) || item;
    item.source_key = buildSourceKey(item);
    return item;
  }

  async function saveItem(item) {
    if (useSupabase && await ensureAuth()) {
      const saved = await window.kbSupabaseVystupy.upsertVystup({ ...item, __existing: !!editingId });
      const idx = vystupy.findIndex((v) => v.id === saved.id || v.source_key === saved.source_key);
      if (idx >= 0) vystupy[idx] = saved;
      else vystupy.push(saved);
    } else {
      const idx = vystupy.findIndex((v) => v.id === item.id);
      if (idx >= 0) vystupy[idx] = item;
      else vystupy.push(item);
    }
    persistLocal();
    document.dispatchEvent(new CustomEvent("kb:vystupy-loaded"));
  }

  async function deleteItem(id) {
    if (useSupabase && await ensureAuth()) {
      await window.kbSupabaseVystupy.deleteVystup(id);
    }
    vystupy = vystupy.filter((v) => v.id !== id);
    persistLocal();
    document.dispatchEvent(new CustomEvent("kb:vystupy-loaded"));
  }

  function bindEvents() {
    const root = el("vystupyPageRoot");
    if (!root || root.__bound) return;

    root.addEventListener("click", (e) => {
      const viewBtn = e.target.closest?.("[data-vystupy-view]");
      if (viewBtn) {
        activeView = viewBtn.dataset.vystupyView;
        render();
        return;
      }
      if (e.target.id === "vystupyAddBtn") { openDialog(null); return; }
      if (e.target.id === "vystupyReloadBtn") { loadVystupy(); return; }
      if (e.target.id === "vystupyImportBtn") {
        el("vystupyImportFile")?.click();
        return;
      }
      const editBtn = e.target.closest?.("[data-edit-vystup]");
      if (editBtn) {
        const item = vystupy.find((v) => v.id === editBtn.dataset.editVystup);
        if (item) openDialog(item);
      }
    });

    root.addEventListener("change", (e) => {
      if (e.target.id === "vystupyTypFilter") { filterTyp = e.target.value; render(); }
      if (e.target.id === "vystupyRokFilter") { filterRok = e.target.value; render(); }
    });

    root.addEventListener("input", (e) => {
      if (e.target.id === "vystupySearch") {
        filterSearch = e.target.value;
        clearTimeout(root.__searchTimer);
        root.__searchTimer = setTimeout(render, 200);
      }
    });

    el("vystupyDialog")?.querySelector("form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const item = readDialogForm();
        await saveItem(item);
        el("vystupyDialog")?.close();
        setStatus("Výstup uložen.");
        render();
      } catch (error) {
        setStatus(`Chyba uložení: ${error.message || error}`, true);
      }
    });

    el("vystupDeleteBtn")?.addEventListener("click", async () => {
      if (!editingId || !confirm("Opravdu smazat tento výstup?")) return;
      try {
        await deleteItem(editingId);
        el("vystupyDialog")?.close();
        setStatus("Výstup smazán.");
        render();
      } catch (error) {
        setStatus(`Chyba mazání: ${error.message || error}`, true);
      }
    });

    el("vystupKategorie")?.addEventListener("change", (e) => {
      fillTypSelect(e.target.value);
      toggleDialogFields(e.target.value);
    });

    root.__bound = true;
  }

  function bindImportInput() {
    if (el("vystupyImportFile")?.__bound) return;
    const input = document.createElement("input");
    input.type = "file";
    input.id = "vystupyImportFile";
    input.accept = ".tsv,.csv,.json,.xlsx,.xls";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      handleImportFile(file);
    });
    document.body.appendChild(input);
    input.__bound = true;
  }

  function render() {
    const root = el("vystupyPageRoot");
    if (!root) return;
    root.innerHTML = renderMain();
    bindEvents();
    if (activeView === "analysis") {
      queueMicrotask(() => {
        window.kbVystupyAnalysis?.mount?.(el("vystupyAnalysisMount"), analysisContext(filteredItems()));
      });
    }
  }

  function injectStyles() {
    if (el("vystupyStyles")) return;
    const style = document.createElement("style");
    style.id = "vystupyStyles";
    style.textContent = `
      .vystupyPanel { display: grid; gap: .75rem; }
      .vystupyHead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; align-items: flex-start; }
      .vystupyIntro { margin: 0 0 .5rem; }
      .vystupySummaryChips { display: flex; flex-wrap: wrap; gap: .35rem; }
      .vystupyChip { font-size: .78rem; font-weight: 700; background: #f2f4f7; padding: .2rem .5rem; border-radius: 999px; }
      .vystupyChipApl { background: #fef3f2; color: #b42318; }
      .vystupyHeadActions { display: flex; gap: .5rem; flex-wrap: wrap; }
      .vystupyStatusError { color: #b42318; font-weight: 650; }
      .vystupyViewTabs { display: flex; gap: .4rem; }
      .vystupyViewTab {
        border: 1px solid var(--line); background: white; border-radius: 10px;
        padding: .45rem .85rem; font-weight: 700; cursor: pointer;
      }
      .vystupyViewTab.active { background: #eff8ff; border-color: var(--accent); color: var(--accent-dark, #2446b5); }
      .vystupyFilters { display: flex; flex-wrap: wrap; gap: .65rem; align-items: end; }
      .vystupyFilters label { display: grid; gap: .2rem; font-size: .82rem; font-weight: 650; }
      .vystupySearchLabel { flex: 1; min-width: 180px; }
      .vystupyTableWrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
      .vystupyTable { width: 100%; border-collapse: collapse; font-size: .88rem; }
      .vystupyTable th, .vystupyTable td { padding: .5rem .65rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      .vystupyTable th { background: #f8fafc; font-size: .8rem; }
      .vystupyNazevCell { max-width: 280px; }
      .vystupyMetaCell { font-size: .82rem; color: var(--muted); max-width: 140px; word-break: break-all; }
      .vystupyTableFoot { margin: .35rem 0 0; }
      .vystupyTypBadge { font-size: .72rem; font-weight: 800; padding: .15rem .45rem; border-radius: 999px; white-space: nowrap; }
      .vystupyTypJimp { background: #eff8ff; color: #175cd3; }
      .vystupyTypJSC { background: #f0f9ff; color: #026aa2; }
      .vystupyTypB { background: #f4f3ff; color: #5925dc; }
      .vystupyTypC { background: #fdf4ff; color: #9f1ab1; }
      .vystupyTypApl { background: #fef3f2; color: #b42318; }
      .vystupyDialog { border: none; border-radius: 14px; padding: 0; max-width: 640px; width: calc(100% - 2rem); }
      .vystupyDialog::backdrop { background: rgba(15, 23, 42, .45); }
      .vystupyDialogForm { padding: 1.1rem; }
      .vystupyDialogGrid { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; margin: .75rem 0; }
      .vystupyDialogWide { grid-column: 1 / -1; }
      .vystupyDialogGrid label { display: grid; gap: .2rem; font-size: .82rem; font-weight: 650; }
      .vystupyDialogActions { display: flex; gap: .5rem; align-items: center; }
      .vystupyDialogSpacer { flex: 1; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("vystupyPageRoot");
    if (!host) return;
    injectStyles();
    injectDialog();
    bindImportInput();
  }

  function init() {
    injectPage();
    loadVystupy();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "vystupy") render();
    });
    document.addEventListener("kb:persons-loaded", () => {
      if (el("vystupyPageRoot")?.innerHTML) render();
    });
  }

  window.kbVystupy = {
    getVystupy: () => vystupy,
    loadVystupy,
    PUBL_TYPES,
    APPLIED_TYPES
  };

  document.addEventListener("DOMContentLoaded", init);
})();
