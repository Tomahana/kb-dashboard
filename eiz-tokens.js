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

  const TYP_CERPANI = {
    TOKENY: "tokeny",
    SLEVA_APC: "sleva_apc"
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

  function isSlevaApcContract(contract) {
    return (contract?.typ_cerpani || TYP_CERPANI.TOKENY) === TYP_CERPANI.SLEVA_APC;
  }

  function countsTowardTokens(contract) {
    return !isSlevaApcContract(contract);
  }

  function isYearUnlimited(year) {
    return !!year?.neomezene;
  }

  function formatTokenAllocation(year) {
    if (isYearUnlimited(year)) return "∞";
    if (year?.pocet_tokenu == null) return "—";
    return String(year.pocet_tokenu);
  }

  function contractTypeLabel(contract) {
    if (isSlevaApcContract(contract)) {
      const pct = contract.sleva_apc_procent;
      return Number.isFinite(pct) ? `Sleva ${pct} % na APC` : "Sleva na APC";
    }
    return "Čerpání tokenů";
  }

  function pubsForContractYear(contractId, rok) {
    return publications.filter((p) => p.contract_id === contractId && publicationYear(p) === rok);
  }

  function usedTokensForContract(contractId, rok) {
    const contract = contractById(contractId);
    if (!countsTowardTokens(contract)) return 0;
    return pubsForContractYear(contractId, rok).length;
  }

  function apcForContractYear(contractId, rok) {
    return pubsForContractYear(contractId, rok)
      .reduce((sum, p) => sum + (Number(p.usetrena_apc) || 0), 0);
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

  function publicationById(id) {
    return publications.find((p) => p.id === id) || null;
  }

  function buildPublicationFromForm() {
    const contractId = n(el("eizPubContractId")?.value);
    const apcRaw = n(el("eizPubApc")?.value).replace(/\s/g, "").replace(",", ".");
    const fakulta = n(el("eizPubFakulta").value);
    let row = {
      contract_id: contractId,
      autor: n(el("eizPubAutor").value),
      fakulta,
      zkr_fak: inferZkrFak(fakulta),
      nazev_clanku: n(el("eizPubNazev").value) || "Bez názvu",
      doi: n(el("eizPubDoi").value),
      datum_zadosti: el("eizPubDatumZadosti")?.value || "",
      datum_prijeti: el("eizPubDatumPrijeti")?.value || "",
      usetrena_apc: apcRaw === "" ? null : Number(apcRaw)
    };
    row.source_key = makePublicationSourceKey(contractId, row);
    const personId = n(el("eizPubAutorPersonId")?.value);
    if (personId && window.kbPersons?.getPerson) {
      const person = window.kbPersons.getPerson(personId);
      if (person) row = window.kbPersonLinks?.applyPersonLink?.(row, person, "autor") || row;
    } else {
      row = linkAutorPerson(row);
    }
    return sanitizeAutorFk(row);
  }

  async function savePublication(item) {
    let saved = item;
    const prev = publications.find((p) => p.id === item.id);
    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return null;
      if (prev && prev.source_key !== item.source_key) {
        await window.kbSupabaseEizTokens.deletePublication(prev.id);
      }
      saved = await window.kbSupabaseEizTokens.upsertPublication(item);
    }
    publications = publications.filter((p) => p.id !== prev?.id || p.id === saved.id);
    const idx = publications.findIndex((p) => p.id === saved.id);
    if (idx === -1) publications.unshift(saved);
    else publications[idx] = saved;
    if (!useSupabase) persistLocal();
    document.dispatchEvent(new CustomEvent("kb:eiz-tokens-loaded"));
    return saved;
  }

  async function deletePublicationById(id) {
    if (!confirm("Smazat tuto publikaci?")) return;
    if (useSupabase && window.kbSupabaseEizTokens) {
      if (!(await ensureAuth())) return;
      await window.kbSupabaseEizTokens.deletePublication(id);
    }
    publications = publications.filter((p) => p.id !== id);
    if (!useSupabase) persistLocal();
    setStatus("Publikace smazána.");
    render();
    document.dispatchEvent(new CustomEvent("kb:eiz-tokens-loaded"));
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
    const sleva = isSlevaApcContract(contract);
    const yearRows = years.length
      ? years.map((y) => {
          const pubs = pubsForContractYear(contract.id, y.rok);
          const apcYear = apcForContractYear(contract.id, y.rok);
          if (sleva) {
            return `<tr>
              <td><strong>${y.rok}</strong></td>
              <td>${pubs.length}</td>
              <td>${html(formatMoney(apcYear))}</td>
              <td class="rowActions">
                <button type="button" class="button small secondary" data-edit-year="${html(contract.id)}" data-year="${y.rok}">Upravit</button>
              </td>
            </tr>`;
          }
          const used = usedTokensForContract(contract.id, y.rok);
          const unlimited = isYearUnlimited(y);
          const allocated = unlimited ? null : (y.pocet_tokenu ?? 0);
          const left = unlimited ? null : Math.max(0, allocated - used);
          const warn = !unlimited && used > allocated;
          return `<tr>
            <td><strong>${y.rok}</strong></td>
            <td>${formatTokenAllocation(y)}</td>
            <td>${used}</td>
            <td class="${warn ? "eizWarn" : ""}">${unlimited ? "—" : left}</td>
            <td class="rowActions">
              <button type="button" class="button small secondary" data-edit-year="${html(contract.id)}" data-year="${y.rok}">Upravit</button>
            </td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="${sleva ? 4 : 5}" class="hint">Zatím bez ročních záznamů — přidejte rok 2025 nebo 2026.</td></tr>`;

    const tableHead = sleva
      ? `<thead><tr><th>Rok</th><th>Publikací</th><th>Ušetřené APC</th><th></th></tr></thead>`
      : `<thead><tr><th>Rok</th><th>Tokenů</th><th>Využito</th><th>Zbývá</th><th></th></tr></thead>`;

    return `<article class="eizContractCard ${contract.aktivni ? "" : "eizContractInactive"} ${sleva ? "eizContractSleva" : ""}">
      <div class="eizContractHead">
        <div>
          <h3>${html(contract.nazev)}</h3>
          ${contract.poskytovatel ? `<p class="hint">${html(contract.poskytovatel)}</p>` : ""}
          <span class="eizTypeBadge ${sleva ? "eizTypeBadgeSleva" : ""}">${html(contractTypeLabel(contract))}</span>
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
        ${tableHead}
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
        <button type="button" id="eizAddPublicationBtn" class="button accent small">+ Publikace</button>
        <button type="button" id="eizRelinkBtn" class="button small secondary">Propojit autory</button>
      </div>
      <p class="hint">Přidejte publikaci ručně nebo importujte CSV (Autor, Fakulta, Název článku, DOI, Datum žádosti, Datum přijetí, Ušetřená cena APC). Vzor: <code>data/eiz-publications-import.example.tsv</code>.</p>
      ${items.length ? `<div class="eizTableWrap"><table class="eizTable">
        <thead><tr>
          <th>Autor</th><th>Fak.</th><th>Název článku</th><th>DOI</th><th>Žádost</th><th>Přijetí</th><th>APC</th><th></th>
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
            <td class="rowActions">
              <button type="button" class="button small secondary" data-edit-pub="${html(row.id)}">Upravit</button>
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<p class="hint">Žádné publikace${selectedContractId ? " u vybrané smlouvy" : ""}. Přidejte ručně nebo importujte CSV.</p>`}`;
  }

  function renderSummary() {
    const totalPubs = publications.length;
    const totalApc = publications.reduce((s, p) => s + (Number(p.usetrena_apc) || 0), 0);
    const totalTokens = contracts.reduce((s, c) => {
      if (isSlevaApcContract(c)) return s;
      return s + (c.years || []).reduce((ySum, y) => {
        if (isYearUnlimited(y)) return ySum;
        return ySum + (y.pocet_tokenu || 0);
      }, 0);
    }, 0);
    const tokenPubs = publications.filter((p) => countsTowardTokens(contractById(p.contract_id))).length;
    return `
      <div class="eizMetrics">
        <div class="metric"><span>${contracts.length}</span><small>Smluv</small></div>
        <div class="metric"><span>${totalTokens}</span><small>Alokovaných tokenů</small></div>
        <div class="metric"><span>${tokenPubs}</span><small>Publikací čerpajících token</small></div>
        <div class="metric"><span>${publications.length}</span><small>Publikací celkem</small></div>
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
            <p class="hint">Ruční evidence smluv, tokenů a publikací. Autory propojíte s modulem <a href="#osoby" data-goto="osoby">Osoby</a>.</p>
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
    el("eizAddPublicationBtn")?.addEventListener("click", () => openPublicationDialog());
    root.querySelectorAll("[data-edit-pub]").forEach((btn) => {
      btn.addEventListener("click", () => openPublicationDialog(btn.dataset.editPub));
    });
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

  function toggleContractTypeFields() {
    const typ = el("eizContractTyp")?.value || TYP_CERPANI.TOKENY;
    const slevaWrap = el("eizContractSlevaWrap");
    const slevaInput = el("eizContractSlevaProcent");
    if (slevaWrap) slevaWrap.hidden = typ !== TYP_CERPANI.SLEVA_APC;
    if (slevaInput) slevaInput.required = typ === TYP_CERPANI.SLEVA_APC;
  }

  function toggleYearTokenFields() {
    const contractId = n(el("eizYearContractId")?.value);
    const contract = contractById(contractId);
    const sleva = isSlevaApcContract(contract);
    const tokenFields = el("eizYearTokenFields");
    const neomezene = el("eizYearNeomezene");
    const pocet = el("eizYearPocet");
    if (tokenFields) tokenFields.hidden = sleva;
    if (neomezene) {
      neomezene.disabled = sleva;
      if (sleva) neomezene.checked = false;
    }
    if (pocet) {
      const unlimited = !sleva && neomezene?.checked;
      pocet.disabled = unlimited;
      pocet.required = !sleva && !unlimited;
      if (unlimited) pocet.value = "";
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
    el("eizContractTyp").value = existing?.typ_cerpani || TYP_CERPANI.TOKENY;
    el("eizContractSlevaProcent").value = existing?.sleva_apc_procent ?? "";
    el("eizContractAktivni").checked = existing ? existing.aktivni !== false : true;
    toggleContractTypeFields();
    dlg.showModal();
  }

  async function fillPublicationContractSelect(selectedId) {
    const select = el("eizPubContractId");
    if (!select) return;
    select.innerHTML = contracts.map((c) =>
      `<option value="${html(c.id)}"${c.id === selectedId ? " selected" : ""}>${html(c.nazev)}</option>`
    ).join("");
    if (!select.value && contracts[0]) select.value = contracts[0].id;
  }

  async function openPublicationDialog(id) {
    if (!contracts.length) {
      setStatus("Nejdříve přidejte transformační smlouvu.", true);
      return;
    }
    await window.kbPersons?.ensureLoaded?.();
    const existing = id ? publicationById(id) : null;
    const dlg = el("eizPublicationDialog");
    if (!dlg) return;
    const contractId = existing?.contract_id || selectedContractId || contracts[0]?.id;
    await fillPublicationContractSelect(contractId);
    el("eizPublicationDialogTitle").textContent = existing ? "Upravit publikaci" : "Nová publikace";
    el("eizPublicationId").value = existing?.id || "";
    el("eizPubAutor").value = existing?.autor || "";
    el("eizPubFakulta").value = existing?.fakulta || existing?.zkr_fak || "";
    el("eizPubNazev").value = existing?.nazev_clanku || "";
    el("eizPubDoi").value = existing?.doi || "";
    el("eizPubDatumZadosti").value = existing?.datum_zadosti ? String(existing.datum_zadosti).slice(0, 10) : "";
    el("eizPubDatumPrijeti").value = existing?.datum_prijeti ? String(existing.datum_prijeti).slice(0, 10) : "";
    el("eizPubApc").value = existing?.usetrena_apc ?? "";
    const delBtn = el("eizDeletePublicationBtn");
    if (delBtn) {
      delBtn.hidden = !existing;
      delBtn.onclick = existing ? () => {
        dlg.close();
        deletePublicationById(existing.id);
      } : null;
    }
    window.kbPersons?.fillSelect?.(el("eizPubAutorPersonId"), window.kbPersonLinks?.personSelectId?.(existing, "autor") || "");
    dlg.showModal();
  }

  function openYearDialog(contractId, rok) {
    const contract = contractById(contractId);
    if (!contract) return;
    const existing = (contract.years || []).find((y) => y.rok === rok);
    const dlg = el("eizYearDialog");
    if (!dlg) return;
    el("eizYearDialogTitle").textContent = isSlevaApcContract(contract)
      ? "Rok — sleva na APC"
      : "Tokeny na rok";
    el("eizYearDialogHint").textContent = isSlevaApcContract(contract)
      ? "U smlouvy se slevou na APC se publikace nepočítají do tokenů — evidujte jen rok pro přehled."
      : "Počet tokenů pro danou transformační smlouvu a kalendářní rok.";
    el("eizYearContractId").value = contractId;
    el("eizYearId").value = existing?.id || "";
    el("eizYearRok").value = existing?.rok || rok || new Date().getFullYear();
    el("eizYearNeomezene").checked = !!existing?.neomezene;
    el("eizYearPocet").value = existing?.neomezene ? "" : (existing?.pocet_tokenu ?? "");
    el("eizYearPoznamka").value = existing?.poznamka || "";
    toggleYearTokenFields();
    dlg.showModal();
  }

  function bindDialogs() {
    el("eizContractForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = n(el("eizContractId").value) || uuid();
      const existing = contractById(id);
      const typ = el("eizContractTyp").value || TYP_CERPANI.TOKENY;
      const slevaRaw = n(el("eizContractSlevaProcent").value).replace(",", ".");
      const contract = {
        id,
        nazev: n(el("eizContractNazev").value),
        poskytovatel: n(el("eizContractPoskytovatel").value),
        poznamka: n(el("eizContractPoznamka").value),
        typ_cerpani: typ,
        sleva_apc_procent: typ === TYP_CERPANI.SLEVA_APC ? Number(slevaRaw) : null,
        aktivni: el("eizContractAktivni").checked,
        years: existing?.years || [],
        __existing: !!existing
      };
      if (!contract.nazev) {
        setStatus("Název smlouvy je povinný.", true);
        return;
      }
      if (typ === TYP_CERPANI.SLEVA_APC && !Number.isFinite(contract.sleva_apc_procent)) {
        setStatus("U smlouvy se slevou na APC zadejte výši slevy v procentech (např. 20).", true);
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

    el("eizContractTyp")?.addEventListener("change", toggleContractTypeFields);
    el("eizYearNeomezene")?.addEventListener("change", toggleYearTokenFields);
    el("eizPubAutorPersonId")?.addEventListener("change", () => {
      const person = window.kbPersons?.getPerson?.(el("eizPubAutorPersonId")?.value);
      if (!person) return;
      el("eizPubAutor").value = window.kbPersons?.personLabel?.(person) || "";
      if (!n(el("eizPubFakulta").value) && person.pracoviste) {
        el("eizPubFakulta").value = person.pracoviste;
      }
    });
    el("eizPubNewPersonBtn")?.addEventListener("click", () => {
      window.kbPersons?.openDialog?.();
    });

    el("eizPublicationForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = n(el("eizPublicationId").value) || uuid();
      const existing = publicationById(id);
      const built = buildPublicationFromForm();
      if (!built.contract_id) {
        setStatus("Vyberte smlouvu.", true);
        return;
      }
      if (!n(built.nazev_clanku) || built.nazev_clanku === "Bez názvu") {
        setStatus("Název článku je povinný.", true);
        return;
      }
      const conflict = publications.find((p) => p.source_key === built.source_key && p.id !== id);
      if (conflict) {
        setStatus("Publikace se stejným DOI nebo kombinací autor/název/termín už existuje.", true);
        return;
      }
      loading = true;
      render();
      try {
        await savePublication({
          ...built,
          id,
          imported_at: existing?.imported_at || null,
          __existing: !!existing
        });
        setStatus(existing ? "Publikace uložena." : "Publikace přidána.");
        el("eizPublicationDialog").close();
      } catch (err) {
        setStatus(`Uložení publikace selhalo: ${err.message || err}`, true);
      } finally {
        loading = false;
        render();
      }
    });

    el("eizYearForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const contractId = n(el("eizYearContractId").value);
      const rok = Number(el("eizYearRok").value);
      const contract = contractById(contractId);
      const sleva = isSlevaApcContract(contract);
      const neomezene = !sleva && el("eizYearNeomezene").checked;
      const pocet = Number(el("eizYearPocet").value);
      if (!contractId || !Number.isFinite(rok)) {
        setStatus("Vyplňte rok.", true);
        return;
      }
      if (!sleva && !neomezene && !Number.isFinite(pocet)) {
        setStatus("Zadejte počet tokenů, nebo zaškrtněte neomezeně.", true);
        return;
      }
      loading = true;
      render();
      try {
        await saveContractYear(contractId, {
          id: n(el("eizYearId").value) || uuid(),
          rok,
          neomezene,
          pocet_tokenu: sleva || neomezene ? null : pocet,
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
      .eizTypeBadge { display: inline-block; margin-top: .35rem; font-size: .72rem; font-weight: 700; padding: .15rem .5rem; border-radius: 999px; background: #eef2ff; color: #3730a3; }
      .eizTypeBadgeSleva { background: #ecfdf5; color: #047857; }
      .eizContractSleva { border-color: #a7f3d0; }
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
