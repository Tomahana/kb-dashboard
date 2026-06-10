// Modul EIZ tokeny — transformační smlouvy, roční alokace tokenů, import publikací.

(function () {
  const PUBLICATION_ALIASES = {
    autor: ["Autor", "autor"],
    fakulta: ["Fakulta", "fakulta"],
    nazev_clanku: ["Název článku", "Nazev clanku", "Název", "Titul", "nazev_clanku"],
    doi: ["DOI", "doi"],
    datum_zadosti: ["Datum žádosti", "Datum zadosti", "Žádost", "datum_zadosti"],
    datum_prijeti: ["Datum přijetí", "Datum prijeti", "Přijetí", "Prijeti", "datum_prijeti"],
    usetrena_apc: ["Ušetřená cena APC (odhad)", "Usetrena cena APC", "APC", "usetrena_apc", "Ušetřená cena APC"]
  };

  const FAKULTA_ZKR = {
    fim: "FIM",
    "fakulta informatiky": "FIM",
    ff: "FF",
    "filozofická": "FF",
    fsv: "FSV",
    "fakulta sociálních": "FSV",
    pdf: "PDF",
    pedagogická: "PDF",
    fhk: "FHK",
    humanitní: "FHK"
  };

  let contracts = [];
  let publications = [];
  let useSupabase = false;
  let loading = false;
  let activeView = "contracts";
  let selectedContractId = "";
  let filterSearch = "";
  let filterRok = "";

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `eiz-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function persistLocal() {
    window.kbSupabaseEizTokens?.saveLocal?.({ contracts, publications });
  }

  function setStatus(text, isError) {
    const node = el("eizTokensStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("eizTokensStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  function parseImportDate(value) {
    const v = n(value).replace(/^"|"$/g, "");
    if (!v || v === "-" || v === "—") return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const cz = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (cz) return `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
    const num = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(num) && num > 1000 && num < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
      return Number.isNaN(utc.getTime()) ? "" : utc.toISOString().slice(0, 10);
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? n(value) : d.toLocaleDateString("cs-CZ");
  }

  function formatMoney(value) {
    if (value == null || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return n(value);
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(num);
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

  function parseAuthorName(autor) {
    const text = n(autor).replace(/\s+/g, " ");
    if (!text) return { jmeno: "", prijmeni: "" };
    const withoutTitles = text
      .replace(/^(prof\.|doc\.|ing\.|mgr\.|rndr\.|mudr\.|phdr\.|dr\.|bc\.|ph\.d\.|csc\.|mba\.?)/gi, "")
      .replace(/,?\s*(ph\.d\.|csc\.|mba\.?|dipl\.?)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const parts = withoutTitles.split(/\s+/).filter(Boolean);
    if (!parts.length) return { jmeno: "", prijmeni: "" };
    if (parts.length === 1) return { jmeno: "", prijmeni: parts[0] };
    return { jmeno: parts[0], prijmeni: parts[parts.length - 1] };
  }

  function sanitizeAutorFk(row) {
    const next = { ...row };
    if (!next.autor_osobni_cislo) return next;
    const exists = window.kbPersons?.getPersonByOsobniCislo?.(next.autor_osobni_cislo);
    if (!exists) next.autor_osobni_cislo = null;
    return next;
  }

  function linkAutorPerson(row) {
    let linked = { ...row };
    const label = l(row.autor);
    if (label.includes("@")) {
      const byEmail = window.kbPersons?.getPersons?.().find((p) => l(p.email) === label);
      if (byEmail) return sanitizeAutorFk(window.kbPersonLinks?.applyPersonLink?.(linked, byEmail, "autor") || linked);
    }
    const name = parseAuthorName(row.autor);
    const matched = window.kbPersons?.matchPersonFromRegistry?.({
      jmeno: name.jmeno,
      prijmeni: name.prijmeni,
      fakulta: row.zkr_fak || row.fakulta
    });
    if (matched) return sanitizeAutorFk(window.kbPersonLinks?.applyPersonLink?.(linked, matched, "autor") || linked);
    return sanitizeAutorFk(linked);
  }

  function autorDisplay(row) {
    return window.kbPersonLinks?.personDisplay?.(row, "autor") || n(row.autor) || "—";
  }

  function publicationYear(pub) {
    const date = pub.datum_prijeti || pub.datum_zadosti;
    if (!date) return null;
    const y = Number(String(date).slice(0, 4));
    return Number.isFinite(y) ? y : null;
  }

  function usedTokensForContract(contractId, rok) {
    return publications.filter((p) => p.contract_id === contractId && publicationYear(p) === rok).length;
  }

  function totalApcForContract(contractId) {
    return publications
      .filter((p) => p.contract_id === contractId)
      .reduce((sum, p) => sum + (Number(p.usetrena_apc) || 0), 0);
  }

  function makePublicationSourceKey(contractId, row) {
    const doi = l(row.doi).replace(/^https?:\/\/doi\.org\//, "");
    if (doi) return `${contractId}|doi|${doi}`;
    return [
      contractId,
      l(row.autor),
      l(row.nazev_clanku),
      row.datum_zadosti || "",
      row.datum_prijeti || ""
    ].join("|");
  }

  function getImportField(raw, field) {
    const aliases = PUBLICATION_ALIASES[field] || [field];
    for (const alias of aliases) {
      if (raw[alias] != null && n(raw[alias])) return n(raw[alias]);
      const hit = Object.keys(raw).find((k) => l(k) === l(alias));
      if (hit && n(raw[hit])) return n(raw[hit]);
    }
    return "";
  }

  function normalizePublicationRow(raw, contractId) {
    const nazev = getImportField(raw, "nazev_clanku");
    const autor = getImportField(raw, "autor");
    if (!nazev && !autor && !getImportField(raw, "doi")) return null;
    const fakulta = getImportField(raw, "fakulta");
    const apcRaw = getImportField(raw, "usetrena_apc").replace(/\s/g, "").replace(",", ".");
    const row = {
      contract_id: contractId,
      autor,
      fakulta,
      zkr_fak: inferZkrFak(fakulta),
      nazev_clanku: nazev || "Bez názvu",
      doi: getImportField(raw, "doi"),
      datum_zadosti: parseImportDate(getImportField(raw, "datum_zadosti")),
      datum_prijeti: parseImportDate(getImportField(raw, "datum_prijeti")),
      usetrena_apc: apcRaw === "" ? null : Number(apcRaw),
      imported_at: new Date().toISOString()
    };
    row.source_key = makePublicationSourceKey(contractId, row);
    return row;
  }

  function contractById(id) {
    return contracts.find((c) => c.id === id) || null;
  }

  function filteredPublications() {
    return publications.filter((p) => {
      if (selectedContractId && p.contract_id !== selectedContractId) return false;
      if (filterRok && publicationYear(p) !== Number(filterRok)) return false;
      if (filterSearch) {
        const hay = l([p.nazev_clanku, p.autor, p.doi, p.fakulta, autorDisplay(p)].join(" "));
        if (!hay.includes(l(filterSearch))) return false;
      }
      return true;
    });
  }

  async function loadData() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseEizTokens) {
        useSupabase = false;
        const local = { contracts: [], publications: [] };
        contracts = local.contracts;
        publications = local.publications;
        setStatus("Data v prohlížeči. Spusťte supabase/eiz-tokens-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseEizTokens.probeTables();
      if (!available) {
        useSupabase = false;
        const local = window.kbSupabaseEizTokens.loadLocal();
        contracts = local.contracts;
        publications = local.publications;
        setStatus("Tabulky kb_eiz_* v Supabase zatím neexistují. Spusťte supabase/eiz-tokens-schema.sql.");
        return;
      }
      useSupabase = true;
      await window.kbPersons?.ensureLoaded?.();
      contracts = await window.kbSupabaseEizTokens.loadContracts();
      publications = await window.kbSupabaseEizTokens.loadPublications();
      if (!selectedContractId && contracts.length) selectedContractId = contracts[0].id;
      setStatus(`Načteno ${contracts.length} smluv · ${publications.length} publikací.`);
    } catch (err) {
      console.error(err);
      useSupabase = false;
      const local = window.kbSupabaseEizTokens?.loadLocal?.() || { contracts: [], publications: [] };
      contracts = local.contracts;
      publications = local.publications;
      setStatus(`Chyba: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:eiz-tokens-loaded"));
    }
  }

  async function saveContract(contract) {
    let saved = contract;
    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return null;
      saved = await window.kbSupabaseEizTokens.upsertContract(contract);
    } else {
      const idx = contracts.findIndex((c) => c.id === contract.id);
      if (idx === -1) contracts.unshift(contract);
      else contracts[idx] = { ...contracts[idx], ...contract };
      persistLocal();
    }
    const idx = contracts.findIndex((c) => c.id === saved.id);
    if (idx === -1) contracts.unshift(saved);
    else contracts[idx] = saved;
    if (!selectedContractId) selectedContractId = saved.id;
    return saved;
  }

  async function saveContractYear(contractId, yearRow) {
    const payload = { ...yearRow, contract_id: contractId };
    let saved = payload;
    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return null;
      saved = await window.kbSupabaseEizTokens.upsertContractYear(payload);
    }
    const contract = contractById(contractId);
    if (!contract) return saved;
    contract.years = contract.years || [];
    const idx = contract.years.findIndex((y) => y.rok === saved.rok);
    if (idx === -1) contract.years.push(saved);
    else contract.years[idx] = saved;
    contract.years.sort((a, b) => b.rok - a.rok);
    if (!useSupabase) persistLocal();
    return saved;
  }

  async function deleteContractById(id) {
    if (!confirm("Smazat smlouvu včetně ročních tokenů a publikací?")) return;
    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return;
      await window.kbSupabaseEizTokens.deleteContract(id);
    }
    contracts = contracts.filter((c) => c.id !== id);
    publications = publications.filter((p) => p.contract_id !== id);
    if (selectedContractId === id) selectedContractId = contracts[0]?.id || "";
    if (!useSupabase) persistLocal();
    setStatus("Smlouva smazána.");
    render();
  }

  async function importPublicationsFromCsv(text, contractId, replace) {
    if (!contractId) throw new Error("Vyberte transformační smlouvu pro import.");
    await window.kbPersons?.ensureLoaded?.();
    const parsed = window.kbPersons?.parseDelimitedTable?.(text) || { rows: [] };
    const normalized = parsed.rows
      .map((row) => normalizePublicationRow(row, contractId))
      .filter(Boolean)
      .map(linkAutorPerson);
    if (!normalized.length) {
      throw new Error("V CSV nejsou rozpoznatelná data (Autor, Fakulta, Název článku, DOI, Datum žádosti, Datum přijetí, Ušetřená cena APC…).");
    }

    const existingForContract = publications.filter((p) => p.contract_id === contractId);
    if (replace && existingForContract.length && !confirm(`Nahradit ${existingForContract.length} publikací u této smlouvy importem ${normalized.length} řádků?`)) {
      return null;
    }

    const withIds = normalized.map((row) => {
      const existing = publications.find((p) => p.source_key === row.source_key);
      return sanitizeAutorFk({
        ...row,
        id: existing?.id || uuid(),
        __existing: !!existing
      });
    });

    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return null;
      setStatus(`Ukládám 0 / ${withIds.length}…`);
      const saved = await window.kbSupabaseEizTokens.upsertPublicationsBatch(withIds, (done, total) => {
        setStatus(`Ukládám ${done} / ${total}…`);
      });
      if (replace) {
        publications = publications.filter((p) => p.contract_id !== contractId).concat(saved);
      } else {
        const others = publications.filter((p) => p.contract_id !== contractId || !saved.some((s) => s.source_key === p.source_key));
        publications = others.concat(saved);
      }
    } else {
      if (replace) publications = publications.filter((p) => p.contract_id !== contractId).concat(withIds);
      else {
        const map = new Map(publications.map((p) => [p.source_key, p]));
        withIds.forEach((p) => map.set(p.source_key, p));
        publications = [...map.values()];
      }
      persistLocal();
    }
    return withIds.length;
  }

  function renderContractCard(contract) {
    const years = (contract.years || []).slice().sort((a, b) => b.rok - a.rok);
    const pubCount = publications.filter((p) => p.contract_id === contract.id).length;
    const apc = totalApcForContract(contract.id);
    const yearRows = years.length
      ? years.map((y) => {
          const used = usedTokensForContract(contract.id, y.rok);
          const left = Math.max(0, (y.pocet_tokenu || 0) - used);
          const warn = used > (y.pocet_tokenu || 0);
          return `<tr>
            <td><strong>${y.rok}</strong></td>
            <td>${y.pocet_tokenu}</td>
            <td>${used}</td>
            <td class="${warn ? "eizWarn" : ""}">${left}</td>
            <td class="rowActions">
              <button type="button" class="button small secondary" data-edit-year="${html(contract.id)}" data-year="${y.rok}">Upravit</button>
            </td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="hint">Zatím bez ročních tokenů — přidejte rok 2025 nebo 2026.</td></tr>`;

    return `<article class="eizContractCard ${contract.aktivni ? "" : "eizContractInactive"}">
      <div class="eizContractHead">
        <div>
          <h3>${html(contract.nazev)}</h3>
          ${contract.poskytovatel ? `<p class="hint">${html(contract.poskytovatel)}</p>` : ""}
        </div>
        <div class="sectionActions">
          <button type="button" class="button small secondary" data-edit-contract="${html(contract.id)}">Upravit</button>
          <button type="button" class="button small secondary" data-add-year="${html(contract.id)}">+ Rok</button>
          <button type="button" class="button small secondary" data-select-contract="${html(contract.id)}">Publikace</button>
          <button type="button" class="button small secondary" data-delete-contract="${html(contract.id)}">Smazat</button>
        </div>
      </div>
      ${contract.poznamka ? `<p class="eizNote">${html(contract.poznamka)}</p>` : ""}
      <div class="eizContractMeta">
        <span>${pubCount} publikací</span>
        <span>APC celkem ${html(formatMoney(apc))}</span>
        ${contract.aktivni ? "" : `<span class="eizInactiveBadge">Neaktivní</span>`}
      </div>
      <table class="eizYearTable">
        <thead><tr><th>Rok</th><th>Tokenů</th><th>Využito</th><th>Zbývá</th><th></th></tr></thead>
        <tbody>${yearRows}</tbody>
      </table>
    </article>`;
  }

  function renderContractsView() {
    if (!contracts.length) {
      return `<div class="eizEmpty">
        <p><strong>Zatím žádná transformační smlouva</strong></p>
        <p class="hint">Přidejte smlouvu (vydavatel / platforma) a ručně zadejte počet tokenů pro roky 2025, 2026 a další.</p>
        <button type="button" id="eizAddContractBtn" class="button accent">Nová smlouva</button>
      </div>`;
    }
    return `
      <div class="sectionActions eizTopActions">
        <button type="button" id="eizAddContractBtn" class="button accent">Nová smlouva</button>
      </div>
      <div class="eizContractGrid">${contracts.map(renderContractCard).join("")}</div>`;
  }

  function renderPublicationsView() {
    const contractOpts = contracts.map((c) =>
      `<option value="${html(c.id)}"${c.id === selectedContractId ? " selected" : ""}>${html(c.nazev)}</option>`
    ).join("");
    const years = [...new Set(publications
      .filter((p) => !selectedContractId || p.contract_id === selectedContractId)
      .map(publicationYear)
      .filter(Boolean))].sort((a, b) => b - a);
    const yearOpts = years.map((y) => `<option value="${y}"${String(y) === filterRok ? " selected" : ""}>${y}</option>`).join("");
    const items = filteredPublications();

    return `
      <div class="eizPubToolbar">
        <label>Smlouva
          <select id="eizContractSelect">${contractOpts || `<option value="">— nejdříve přidejte smlouvu —</option>`}</select>
        </label>
        <label>Rok <select id="eizFilterRok"><option value="">Vše</option>${yearOpts}</select></label>
        <label>Hledat <input id="eizFilterSearch" type="search" value="${html(filterSearch)}" placeholder="Autor, název, DOI…" /></label>
        <label class="button small secondary" for="eizImportFile">Import CSV</label>
        <input type="file" id="eizImportFile" accept=".csv,.txt,.tsv,text/csv" hidden />
        <button type="button" id="eizRelinkBtn" class="button small secondary">Propojit autory</button>
      </div>
      <p class="hint">Importujte tabulku se sloupci: Autor, Fakulta, Název článku, DOI, Datum žádosti, Datum přijetí, Ušetřená cena APC (odhad). Vzor: <code>data/eiz-publications-import.example.tsv</code>.</p>
      ${items.length ? `<div class="eizTableWrap"><table class="eizTable">
        <thead><tr>
          <th>Autor</th><th>Fak.</th><th>Název článku</th><th>DOI</th><th>Žádost</th><th>Přijetí</th><th>APC</th>
        </tr></thead>
        <tbody>${items.map((row) => {
          const person = window.kbPersonLinks?.resolvePerson?.(row, "autor");
          const autorCell = person
            ? `<a href="#osoby" data-goto="osoby">${html(autorDisplay(row))}</a>`
            : html(autorDisplay(row));
          return `<tr>
            <td>${autorCell}</td>
            <td>${html(row.zkr_fak || row.fakulta)}</td>
            <td><strong>${html(row.nazev_clanku)}</strong></td>
            <td>${row.doi ? `<a href="https://doi.org/${html(row.doi.replace(/^https?:\/\/doi\.org\//i, ""))}" target="_blank" rel="noopener">${html(row.doi)}</a>` : "—"}</td>
            <td>${html(formatDate(row.datum_zadosti))}</td>
            <td>${html(formatDate(row.datum_prijeti))}</td>
            <td>${html(formatMoney(row.usetrena_apc))}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<p class="hint">Žádné publikace${selectedContractId ? " u vybrané smlouvy" : ""}. Vyberte smlouvu a importujte CSV.</p>`}`;
  }

  function renderSummary() {
    const totalPubs = publications.length;
    const totalApc = publications.reduce((s, p) => s + (Number(p.usetrena_apc) || 0), 0);
    const totalTokens = contracts.reduce((s, c) => s + (c.years || []).reduce((ySum, y) => ySum + (y.pocet_tokenu || 0), 0), 0);
    const used = publications.length;
    return `
      <div class="eizMetrics">
        <div class="metric"><span>${contracts.length}</span><small>Smluv</small></div>
        <div class="metric"><span>${totalTokens}</span><small>Tokenů (součet roků)</small></div>
        <div class="metric"><span>${used}</span><small>Publikací</small></div>
        <div class="metric"><span>${formatMoney(totalApc)}</span><small>Ušetřené APC</small></div>
      </div>`;
  }

  function render() {
    const root = el("eizTokensRoot");
    if (!root) return;
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>EIZ tokeny — transformační smlouvy</h2>
            <p class="hint">Ruční evidence smluv a ročních tokenů (2025, 2026, další roky). Import publikací z tabulky navázaný na smlouvu. Autory propojíte s modulem <a href="#osoby" data-goto="osoby">Osoby</a>.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="eizReloadBtn" class="button small secondary">Načíst ze Supabase</button>
          </div>
        </div>
        <p id="eizTokensStatus" class="eizTokensStatus hint">${loading ? "Načítám…" : "—"}</p>
        ${renderSummary()}
        <div class="eizViewTabs">
          <button type="button" class="eizViewTab ${activeView === "contracts" ? "active" : ""}" data-eiz-view="contracts">Smlouvy a tokeny</button>
          <button type="button" class="eizViewTab ${activeView === "publications" ? "active" : ""}" data-eiz-view="publications">Publikace (${filteredPublications().length})</button>
        </div>
        <div id="eizContent">${loading ? `<p class="hint">Načítám…</p>` : (activeView === "publications" ? renderPublicationsView() : renderContractsView())}</div>
      </section>`;

    bindEvents(root);
  }

  function bindEvents(root) {
    el("eizReloadBtn")?.addEventListener("click", loadData);
    el("eizAddContractBtn")?.addEventListener("click", () => openContractDialog());
    root.querySelectorAll("[data-eiz-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.eizView;
        render();
      });
    });
    root.querySelectorAll("[data-edit-contract]").forEach((btn) => {
      btn.addEventListener("click", () => openContractDialog(btn.dataset.editContract));
    });
    root.querySelectorAll("[data-add-year]").forEach((btn) => {
      btn.addEventListener("click", () => openYearDialog(btn.dataset.addYear));
    });
    root.querySelectorAll("[data-edit-year]").forEach((btn) => {
      btn.addEventListener("click", () => openYearDialog(btn.dataset.editYear, Number(btn.dataset.year)));
    });
    root.querySelectorAll("[data-select-contract]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedContractId = btn.dataset.selectContract;
        activeView = "publications";
        render();
      });
    });
    root.querySelectorAll("[data-delete-contract]").forEach((btn) => {
      btn.addEventListener("click", () => deleteContractById(btn.dataset.deleteContract));
    });
    root.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.kbLayout?.setActivePage?.(btn.dataset.goto);
      });
    });
    el("eizContractSelect")?.addEventListener("change", (e) => {
      selectedContractId = e.target.value;
      filterRok = "";
      render();
    });
    el("eizFilterRok")?.addEventListener("change", (e) => {
      filterRok = e.target.value;
      render();
    });
    el("eizFilterSearch")?.addEventListener("input", (e) => {
      filterSearch = e.target.value;
      render();
    });
    el("eizImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !selectedContractId) {
        if (!selectedContractId) setStatus("Nejdříve vyberte smlouvu.", true);
        return;
      }
      loading = true;
      render();
      try {
        const count = await importPublicationsFromCsv(await file.text(), selectedContractId, false);
        if (count != null) setStatus(`Importováno ${count} publikací.`);
      } catch (err) {
        setStatus(`Import selhal: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });
    el("eizRelinkBtn")?.addEventListener("click", relinkAuthors);
  }

  async function relinkAuthors() {
    const scope = selectedContractId
      ? publications.filter((p) => p.contract_id === selectedContractId)
      : publications;
    if (!scope.length) return;
    if (!confirm(`Znovu propojit autory u ${scope.length} publikací podle jména a fakulty?`)) return;
    loading = true;
    render();
    try {
      await window.kbPersons?.ensureLoaded?.();
      const updated = scope.map(linkAutorPerson);
      if (useSupabase && window.kbSupabaseEizTokens) {
        if (!(await ensureAuth())) return;
        const saved = await window.kbSupabaseEizTokens.upsertPublicationsBatch(updated);
        const keys = new Set(saved.map((s) => s.source_key));
        publications = publications.filter((p) => !keys.has(p.source_key)).concat(saved);
      } else {
        const map = new Map(publications.map((p) => [p.source_key, p]));
        updated.forEach((p) => map.set(p.source_key, p));
        publications = [...map.values()];
        persistLocal();
      }
      setStatus("Autoři znovu propojeni na Osoby.");
    } catch (err) {
      setStatus(`Propojení selhalo: ${err.message || err}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  function openContractDialog(id) {
    const existing = id ? contractById(id) : null;
    const dlg = el("eizContractDialog");
    if (!dlg) return;
    el("eizContractDialogTitle").textContent = existing ? "Upravit smlouvu" : "Nová transformační smlouva";
    el("eizContractId").value = existing?.id || "";
    el("eizContractNazev").value = existing?.nazev || "";
    el("eizContractPoskytovatel").value = existing?.poskytovatel || "";
    el("eizContractPoznamka").value = existing?.poznamka || "";
    el("eizContractAktivni").checked = existing ? existing.aktivni !== false : true;
    dlg.showModal();
  }

  function openYearDialog(contractId, rok) {
    const contract = contractById(contractId);
    if (!contract) return;
    const existing = (contract.years || []).find((y) => y.rok === rok);
    const dlg = el("eizYearDialog");
    if (!dlg) return;
    el("eizYearContractId").value = contractId;
    el("eizYearId").value = existing?.id || "";
    el("eizYearRok").value = existing?.rok || rok || new Date().getFullYear();
    el("eizYearPocet").value = existing?.pocet_tokenu ?? "";
    el("eizYearPoznamka").value = existing?.poznamka || "";
    dlg.showModal();
  }

  function bindDialogs() {
    el("eizContractForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = n(el("eizContractId").value) || uuid();
      const existing = contractById(id);
      const contract = {
        id,
        nazev: n(el("eizContractNazev").value),
        poskytovatel: n(el("eizContractPoskytovatel").value),
        poznamka: n(el("eizContractPoznamka").value),
        aktivni: el("eizContractAktivni").checked,
        years: existing?.years || [],
        __existing: !!existing
      };
      if (!contract.nazev) {
        setStatus("Název smlouvy je povinný.", true);
        return;
      }
      loading = true;
      render();
      try {
        await saveContract(contract);
        setStatus(existing ? "Smlouva uložena." : "Smlouva vytvořena — přidejte roční tokeny.");
        el("eizContractDialog").close();
      } catch (err) {
        setStatus(`Uložení selhalo: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });

    el("eizYearForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const contractId = n(el("eizYearContractId").value);
      const rok = Number(el("eizYearRok").value);
      const pocet = Number(el("eizYearPocet").value);
      if (!contractId || !Number.isFinite(rok)) {
        setStatus("Vyplňte rok.", true);
        return;
      }
      loading = true;
      render();
      try {
        await saveContractYear(contractId, {
          id: n(el("eizYearId").value) || uuid(),
          rok,
          pocet_tokenu: Number.isFinite(pocet) ? pocet : 0,
          poznamka: n(el("eizYearPoznamka").value),
          __existing: !!n(el("eizYearId").value)
        });
        setStatus(`Tokeny pro rok ${rok} uloženy.`);
        el("eizYearDialog").close();
      } catch (err) {
        setStatus(`Uložení roku selhalo: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });
  }

  function injectStyles() {
    if (el("eizTokensStyles")) return;
    const style = document.createElement("style");
    style.id = "eizTokensStyles";
    style.textContent = `
      .eizMetrics { display: flex; flex-wrap: wrap; gap: .75rem; margin: .75rem 0 1rem; }
      .eizMetrics .metric { min-width: 110px; padding: .55rem .75rem; border: 1px solid var(--line); border-radius: 10px; background: #f8fafc; }
      .eizMetrics .metric span { display: block; font-weight: 800; font-size: 1.1rem; }
      .eizMetrics .metric small { color: var(--muted); font-size: .75rem; }
      .eizViewTabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
      .eizViewTab { border: 1px solid var(--line); background: white; border-radius: 999px; padding: .35rem .85rem; cursor: pointer; }
      .eizViewTab.active { background: var(--accent); color: white; border-color: var(--accent); }
      .eizContractGrid { display: grid; gap: 1rem; }
      .eizContractCard { border: 1px solid var(--line); border-radius: 12px; padding: 1rem; background: white; }
      .eizContractInactive { opacity: .75; }
      .eizContractHead { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
      .eizContractHead h3 { margin: 0; }
      .eizContractMeta { display: flex; flex-wrap: wrap; gap: .75rem; font-size: .84rem; color: var(--muted); margin: .5rem 0 .75rem; }
      .eizInactiveBadge { background: #fee2e2; color: #991b1b; padding: .1rem .45rem; border-radius: 999px; font-size: .72rem; font-weight: 700; }
      .eizYearTable { width: 100%; border-collapse: collapse; font-size: .88rem; }
      .eizYearTable th, .eizYearTable td { border-bottom: 1px solid var(--line); padding: .4rem .35rem; text-align: left; }
      .eizWarn { color: #b45309; font-weight: 700; }
      .eizNote { margin: .35rem 0; font-size: .88rem; }
      .eizTopActions { margin-bottom: .75rem; }
      .eizPubToolbar { display: flex; flex-wrap: wrap; gap: .65rem; align-items: end; margin-bottom: .75rem; }
      .eizPubToolbar label { display: grid; gap: .2rem; font-size: .82rem; }
      .eizTableWrap { overflow: auto; max-width: 100%; }
      .eizTable { width: 100%; border-collapse: collapse; font-size: .86rem; min-width: 880px; }
      .eizTable th, .eizTable td { border-bottom: 1px solid var(--line); padding: .45rem .4rem; vertical-align: top; }
      .eizEmpty { text-align: center; padding: 2rem 1rem; }
      .eizTokensStatusError { color: #b91c1c; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("eizTokensPageRoot");
    if (!host || el("eizTokensRoot")) return;
    host.innerHTML = `<div id="eizTokensRoot"></div>`;
  }

  function init() {
    injectStyles();
    injectPage();
    bindDialogs();
    loadData();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "eiz-tokeny") render();
    });
  }

  window.kbEizTokens = {
    loadData,
    getContracts: () => contracts.slice(),
    getPublications: () => publications.slice()
  };

  document.addEventListener("DOMContentLoaded", init);
})();
