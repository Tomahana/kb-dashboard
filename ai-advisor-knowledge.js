// Index znalostí KB Dashboardu pro AI poradce — rozšiřitelný o další moduly (publikace, výsledky…).

(function () {
  const STOP_WORDS = new Set([
    "a", "aby", "ale", "ani", "co", "do", "ho", "i", "jako", "je", "k", "na", "ne", "o", "od", "po", "pro",
    "při", "s", "se", "si", "ta", "to", "u", "v", "ve", "za", "že", "kdo", "kde", "jak", "jaké", "které", "který"
  ]);

  const SOURCE_REGISTRY = [
    { id: "osoby", label: "Osoby", page: "osoby", status: "active" },
    { id: "terminy", label: "Termíny", page: "terminy", status: "active" },
    { id: "pcr-vyzkum", label: "Výzkumné směry PČR", page: "pcr-vyzkum", status: "active" },
    { id: "interni-souteze", label: "Interní soutěže", page: "interni-souteze", status: "active" },
    { id: "temata", label: "Témata", page: "temata", status: "active" },
    { id: "emaily", label: "E-maily / znalostní báze", page: "emaily", status: "active" },
    { id: "kb-items", label: "KB záznamy (AI agent)", page: "kb-items", status: "active" },
    { id: "eiz-tokeny", label: "EIZ tokeny / publikace", page: "eiz-tokeny", status: "active" },
    { id: "casopisy", label: "Databáze časopisů / JCR", page: "casopisy", status: "active" },
    { id: "vystupy", label: "Výstupy (Jimp, JSC, B, C)", page: "vystupy", status: "active" },
    { id: "rady-organy", label: "Rady a orgány UHK", page: "rady-organy", status: "active" }
  ];

  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function tokenizeQuery(query) {
    return l(query)
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9áčďéěíňóřšťúůýž\s@.-]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  }

  function chunk(id, source, sourceLabel, title, text, link, meta = {}) {
    return {
      id,
      source,
      sourceLabel,
      title: n(title) || "Bez názvu",
      text: n(text),
      link: link || `#${source}`,
      meta
    };
  }

  function buildPersonChunks() {
    const persons = window.kbPersons?.getPersons?.() || [];
    const label = window.kbPersons?.personLabel?.bind(window.kbPersons) || ((p) => `${p.jmeno} ${p.prijmeni}`);
    return persons.map((p) => chunk(
      `person:${p.id}`,
      "osoby",
      "Osoby",
      label(p),
      [
        label(p),
        p.tituly,
        p.osobni_cislo,
        p.pracoviste,
        p.email,
        p.telefon,
        p.orcid,
        p.researcher_id,
        p.scopus_id,
        p.stav_osoby
      ].filter(Boolean).join(" · "),
      "#osoby",
      { osobni_cislo: p.osobni_cislo, email: p.email }
    ));
  }

  function buildDeadlineChunks() {
    const items = window.kbDeadlines?.getDeadlines?.() || [];
    return items.map((d) => chunk(
      `deadline:${d.id}`,
      "terminy",
      "Termíny",
      d.nazev || d.id_polozky || "Termín",
      [
        d.oblast,
        d.popis,
        d.odpovedna_osoba,
        d.dodavatel_fakulta,
        d.termin_sberu,
        d.termin_interni,
        d.termin_odeslani,
        d.stav,
        d.ucel,
        d.riziko
      ].filter(Boolean).join(" · "),
      "#terminy",
      { stav: d.stav, oblast: d.oblast }
    ));
  }

  function buildPcrChunks() {
    const items = window.kbPcrResearch?.getTopics?.() || [];
    return items.map((t) => chunk(
      `pcr:${t.id}`,
      "pcr-vyzkum",
      "Výzkumné směry PČR",
      t.tema,
      [
        t.oblast,
        t.fakulta,
        t.zkr_fak,
        t.katedra,
        t.gestor,
        t.email,
        t.popis
      ].filter(Boolean).join(" · "),
      "#pcr-vyzkum",
      { oblast: t.oblast, zkr_fak: t.zkr_fak, gestor: t.gestor }
    ));
  }

  function buildCompetitionChunks() {
    const comps = window.kbCompetitions?.getCompetitions?.() || [];
    const out = [];
    for (const c of comps) {
      const prog = c.program_slug || "";
      out.push(chunk(
        `comp:${c.id}`,
        "interni-souteze",
        "Interní soutěže",
        `${c.nazev || prog} (${c.rok || "—"}, běh ${c.beh_cislo || 1})`,
        [prog, c.stav, c.poznamka, `přihlášek: ${(c.applications || []).length}`, `podpořeno: ${(c.supported || []).length}`].join(" · "),
        "#interni-souteze",
        { program: prog, rok: c.rok }
      ));
      for (const a of c.applications || []) {
        out.push(chunk(
          `comp-app:${a.id}`,
          "interni-souteze",
          "Interní soutěže · přihláška",
          a.nazev_projektu || a.projekt_id,
          [a.fakulta, a.katedra, a.stav, a.resitel, a.resitel_osobni_cislo, a.financni_pozadavek, a.poznamka].filter(Boolean).join(" · "),
          "#interni-souteze",
          { competition_id: c.id, stav: a.stav }
        ));
      }
      for (const s of c.supported || []) {
        out.push(chunk(
          `comp-sup:${s.id}`,
          "interni-souteze",
          "Interní soutěže · podpořeno",
          s.nazev_projektu || s.projekt_id,
          [s.fakulta, s.resitel, s.castka_podpory, s.poznamka].filter(Boolean).join(" · "),
          "#interni-souteze",
          { competition_id: c.id }
        ));
      }
    }
    return out;
  }

  function buildTopicChunks() {
    const topics = window.kbTopics?.topics || [];
    return topics.map((t) => chunk(
      `topic:${t.id}`,
      "temata",
      "Témata",
      t.name,
      [t.description, t.aiSummary, `e-mailů: ${(t.recordIds || []).length}`, `termínů: ${(t.deadlineIds || []).length}`].filter(Boolean).join(" · "),
      "#temata",
      { recordCount: (t.recordIds || []).length }
    ));
  }

  function getRecordId(r) {
    return r?.id || r?.kb_id || r?.KB_ID || "";
  }

  function buildEizChunks() {
    const contracts = window.kbEizTokens?.getContracts?.() || [];
    const publications = window.kbEizTokens?.getPublications?.() || [];
    const contractMap = new Map(contracts.map((c) => [c.id, c.nazev]));
    const out = [];
    for (const c of contracts) {
      const years = (c.years || []).map((y) => {
        if (c.typ_cerpani === "sleva_apc") return `${y.rok}: sleva APC`;
        if (y.neomezene) return `${y.rok}: neomezeně`;
        return `${y.rok}: ${y.pocet_tokenu ?? 0} tokenů`;
      }).join(", ");
      out.push(chunk(
        `eiz-contract:${c.id}`,
        "eiz-tokeny",
        "EIZ tokeny · smlouva",
        c.nazev,
        [
          c.typ_cerpani === "sleva_apc"
            ? `sleva APC ${c.sleva_apc_procent ?? "?"} %`
            : "čerpání tokenů",
          c.poskytovatel,
          years,
          c.poznamka,
          c.aktivni ? "aktivní" : "neaktivní"
        ].filter(Boolean).join(" · "),
        "#eiz-tokeny",
        { contract_id: c.id }
      ));
    }
    for (const p of publications) {
      out.push(chunk(
        `eiz-pub:${p.id}`,
        "eiz-tokeny",
        "EIZ tokeny · publikace",
        p.nazev_clanku,
        [
          contractMap.get(p.contract_id),
          p.rok ? `rok ${p.rok}` : "",
          p.autor,
          p.fakulta,
          p.doi,
          p.datum_zadosti,
          p.datum_prijeti,
          p.usetrena_apc != null ? `APC ${p.usetrena_apc}` : ""
        ].filter(Boolean).join(" · "),
        "#eiz-tokeny",
        { contract_id: p.contract_id, doi: p.doi }
      ));
    }
    return out;
  }

  function buildJournalChunks() {
    const best = window.kbJournalDb?.getBestResults?.() || [];
    return best.slice(0, 300).map((row) => chunk(
      `journal:${row.journal_key || row.id}:${row.best_source_year || row.source_year || ""}`,
      "casopisy",
      "Databáze časopisů",
      row.journal_name || row.jcr_abbreviation || "Časopis",
      [
        row.best_source_year || row.source_year ? `rok ${row.best_source_year || row.source_year}` : "",
        row.best_category,
        row.best_ais != null ? `AIS ${row.best_ais}` : "",
        row.best_ais_rank ? `pořadí ${row.best_ais_rank_fraction || row.best_ais_rank}` : "",
        row.best_ais_percentile_band ? row.best_ais_percentile_band : "",
        row.best_ais_quartile ? row.best_ais_quartile : "",
        row.issn,
        row.jif ? `JIF ${row.jif}` : ""
      ].filter(Boolean).join(" · "),
      "#casopisy",
      { journal_key: row.journal_key, issn: row.issn, source_year: row.best_source_year || row.source_year }
    ));
  }

  function buildVystupyChunks() {
    const items = window.kbVystupy?.getVystupy?.() || [];
    return items.map((v) => chunk(
      `vystup:${v.typ_vystupu}:${v.id}`,
      "vystupy",
      `Výstupy · ${v.typ_vystupu}`,
      v.nazev,
      [
        v.typ_vystupu,
        v.rok ? `rok ${v.rok}` : "",
        v.autor,
        v.zkr_fak || v.fakulta,
        v.katedra,
        v.doi,
        v.isbn,
        v.casopis,
        v.riv_id,
        v.cislo_na_riv,
        v.poznamka
      ].filter(Boolean).join(" · "),
      "#vystupy",
      { typ_vystupu: v.typ_vystupu, rok: v.rok, riv_id: v.riv_id }
    ));
  }

  function buildOrganChunks() {
    const items = window.kbRadyOrgany?.getOrgans?.() || [];
    const out = [];
    for (const o of items) {
      out.push(chunk(
        `organ:${o.id}`,
        "rady-organy",
        "Rady a orgány",
        o.nazev,
        [o.ucel_summary, o.poznamka, o.url].filter(Boolean).join(" · "),
        "#rady-organy",
        { slug: o.slug }
      ));
      for (const m of o.members || []) {
        out.push(chunk(
          `organ-member:${m.id}`,
          "rady-organy",
          `Rady a orgány · ${o.nazev}`,
          [m.tituly, m.jmeno].filter(Boolean).join(" "),
          [m.funkce, m.email, m.poznamka, o.nazev].filter(Boolean).join(" · "),
          "#rady-organy",
          { organ: o.slug, funkce: m.funkce }
        ));
      }
    }
    return out;
  }

  function buildKbItemChunks() {
    const items = window.kbItems?.getItems?.() || [];
    return items.map((item) => chunk(
      `kb-item:${item.id}`,
      "kb-items",
      "KB záznamy",
      item.title || "(bez názvu)",
      [
        item.item_type,
        item.status,
        item.priority,
        item.content,
        item.evidence,
        Array.isArray(item.topics) ? item.topics.join(", ") : item.topics,
        item.owner,
        item.deadline
      ].filter(Boolean).join(" · "),
      "#kb-items",
      { item_type: item.item_type, status: item.status, priority: item.priority }
    ));
  }

  function buildEmailChunks(limit = 400) {
    let data = [];
    try {
      data = typeof filteredRecords === "function" ? filteredRecords() : (Array.isArray(window.records) ? window.records : []);
    } catch (_) {
      data = [];
    }
    return data.slice(0, limit).map((r) => {
      const id = getRecordId(r);
      return chunk(
        `email:${id}`,
        "emaily",
        "E-maily",
        r.title || r.predmet || "E-mail",
        [r.odesilatel, r.agenda, r.typ, r.stav, r.kam_patri, r.shrnuti, r.ukol_dalsi_krok].filter(Boolean).join(" · "),
        "#emaily",
        { recordId: id, openRecord: true }
      );
    });
  }

  const BUILDERS = {
    osoby: buildPersonChunks,
    terminy: buildDeadlineChunks,
    "pcr-vyzkum": buildPcrChunks,
    "interni-souteze": buildCompetitionChunks,
    temata: buildTopicChunks,
    emaily: buildEmailChunks,
    "kb-items": buildKbItemChunks,
    "eiz-tokeny": buildEizChunks,
    casopisy: buildJournalChunks,
    vystupy: buildVystupyChunks,
    "rady-organy": buildOrganChunks
  };

  function buildIndex() {
    const chunks = [];
    const stats = {};
    for (const src of SOURCE_REGISTRY) {
      if (src.status !== "active" || !BUILDERS[src.id]) {
        stats[src.id] = { label: src.label, count: 0, status: src.status };
        continue;
      }
      const built = BUILDERS[src.id]() || [];
      chunks.push(...built);
      stats[src.id] = { label: src.label, count: built.length, status: src.status };
    }
    return { chunks, stats, builtAt: new Date().toISOString() };
  }

  function scoreChunk(chunkItem, terms) {
    if (!terms.length) return 0;
    const hay = l(`${chunkItem.title} ${chunkItem.text} ${chunkItem.sourceLabel}`);
    let score = 0;
    for (const term of terms) {
      if (l(chunkItem.title).includes(term)) score += 8;
      if (hay.includes(term)) score += 3;
      if (term.includes("@") && hay.includes(term)) score += 10;
    }
    return score;
  }

  function search(query, options = {}) {
    const { chunks } = buildIndex();
    const terms = tokenizeQuery(query);
    const limit = options.limit || 12;
    if (!terms.length) return [];
    return chunks
      .map((c) => ({ chunk: c, score: scoreChunk(c, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.chunk);
  }

  window.kbAdvisorKnowledge = {
    SOURCE_REGISTRY,
    buildIndex,
    search,
    tokenizeQuery
  };
})();
