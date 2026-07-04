// Přehled modulů – klikatelné karty a placeholdery pro budoucí oblasti.

(function () {
  const MODULE_SECTORS = [
    {
      id: "operativa",
      title: "Operativa",
      slugs: ["emaily", "kb-items", "terminy", "doc-intelligence", "temata", "odkazy-aplikaci"]
    },
    {
      id: "strategie",
      title: "Strategie",
      slugs: [
        "interni-souteze", "navraty", "pcr-vyzkum", "casopisy", "vystupy",
        "modul-ppk", "modul-spev", "modul-dkrvo", "modul-vyrocni-zpravy",
        "modul-bilancni-zpravy", "modul-doktorska-skola"
      ]
    },
    {
      id: "lide",
      title: "Lidé a orgány",
      slugs: ["osoby", "rady-organy", "eiz-tokeny"]
    },
    {
      id: "ai",
      title: "AI a data",
      slugs: ["ai-poradce", "nastaveni"]
    }
  ];

  const MODULES = [
    {
      slug: "emaily",
      title: "Znalostní báze z e-mailů",
      description: "Třídění, klasifikace a práce s e-maily a podklady. AI návrhy, témata a export.",
      status: "active",
      icon: "📧",
      stats: ["emailsTotal", "emailsNew", "emailsAi"]
    },
    {
      slug: "kb-items",
      title: "KB Notion meeting notes",
      description: "Notion meeting notes z AI agenta — úkoly, znalosti, rozhodnutí, otázky, rizika a reference v Supabase.",
      status: "active",
      icon: "🧠",
      stats: ["kbItemsTotal", "kbItemsOpen"]
    },
    {
      slug: "terminy",
      title: "Termíny sběrů dat",
      description: "Harmonogram sběrů, interní a externí termíny, import tabulky od kolegů.",
      status: "active",
      icon: "📅",
      stats: ["deadlinesTotal", "deadlinesOverdue"]
    },
    {
      slug: "temata",
      title: "Témata",
      description: "Seskupení e-mailů do témat, AI shrnutí, analýza agend, rizika a mind mapa.",
      status: "active",
      icon: "🏷️",
      stats: ["emailsRisks"]
    },
    {
      slug: "odkazy-aplikaci",
      title: "Odkazy na aplikace",
      description: "Rychlý přístup k IRIS, IS VaVaI, systémům UHK a dalším nezbytným nástrojům OVV.",
      status: "active",
      icon: "🔗",
      stats: []
    },
    {
      slug: "modul-ppk",
      title: "PPK",
      description: "Programy podpory kariéry – evidence, termíny a podklady.",
      status: "planned",
      icon: "🎓"
    },
    {
      slug: "modul-spev",
      title: "SPEV",
      description: "Specifický vysokoškolský výzkum – řízení a reporting.",
      status: "planned",
      icon: "🔬"
    },
    {
      slug: "osoby",
      title: "Osoby",
      description: "Centrální databáze osob UHK — řešitelé a kontakty pro soutěže, DKRVO, PPK a další moduly.",
      status: "active",
      icon: "👤",
      stats: ["personsTotal"]
    },
    {
      slug: "interni-souteze",
      title: "Interní soutěže",
      description: "UHK Connect, Prestige, Horizon, Rega a PhD Seed — alokace, výzvy, přihlášky a podpora.",
      status: "active",
      icon: "🏆",
      stats: ["competitionsTotal", "competitionsActive"]
    },
    {
      slug: "navraty",
      title: "OP JAK Návraty",
      description: "Soutěž OP JAK Návraty — alokace, výzvy, přihlášky a podpora.",
      status: "active",
      icon: "🔄",
      stats: ["navratyCompetitionsTotal", "navratyCompetitionsActive"]
    },
    {
      slug: "pcr-vyzkum",
      title: "Výzkumné směry PČR",
      description: "Výzkumná témata UHK pro spolupráci s PČR — sync z Google Sheets, vědecké analýzy (matice, gestoři, klíčová slova, report) a propojení na Osoby.",
      status: "active",
      icon: "🛡️",
      stats: ["pcrTopicsTotal", "pcrTopicsLinked"]
    },
    {
      slug: "ai-poradce",
      title: "AI poradce",
      description: "Dotazy nad daty aplikace — Osoby, Termíny, PČR, soutěže, témata a e-maily. Odpovědi jen z nalezených zdrojů; volitelné AI shrnutí.",
      status: "active",
      icon: "✨",
      stats: []
    },
    {
      slug: "eiz-tokeny",
      title: "EIZ tokeny",
      description: "Transformační smlouvy — ruční evidence tokenů po letech (2025, 2026…) a import publikací (autor, DOI, APC) navázaných na smlouvu.",
      status: "active",
      icon: "🔑",
      stats: ["eizContractsTotal", "eizPublicationsTotal"]
    },
    {
      slug: "casopisy",
      title: "Databáze časopisů",
      description: "Import JCR exportů podle roků a oborů — počet časopisů v oboru a roce, AIS pořadí, kvartily/decily/centily a nejlepší výsledek napříč obory v rámci roku.",
      status: "active",
      icon: "📚",
      stats: ["journalRecordsTotal", "journalCategoriesTotal"]
    },
    {
      slug: "vystupy",
      title: "Výstupy",
      description: "Publikační výstupy Jimp, JSC, B a C — samostatné tabulky, import z IS VaVaI, analýzy pro DKRVO a PPK.",
      status: "active",
      icon: "📈",
      stats: ["vystupyTotal", "vystupyJimp", "vystupyJsc"]
    },
    {
      slug: "rady-organy",
      title: "Rady a orgány",
      description: "Vědecká rada, Správní rada, AS, MPK, Etická komise a Rada pro komercializaci — členové, poznámky, jednací řády, aktuality a AI kontrola personálních změn.",
      status: "active",
      icon: "🏛️",
      stats: ["organsTotal", "organsPendingAi"]
    },
    {
      slug: "doc-intelligence",
      title: "Dokumenty",
      description: "AI analýza dokumentů z OneDrive — třídění, priority, poznámky a export úkolů do ClickUp (list věda).",
      status: "active",
      icon: "📄",
      stats: ["docIntelligenceTotal", "docIntelligenceNew"]
    },
    {
      slug: "modul-dkrvo",
      title: "DKRVO",
      description: "Roční výkaz výzkumu — evidence pracovišť a kódů, členové z webu UHK, sběr dat a odeslání na MŠMT.",
      status: "active",
      icon: "📋",
      stats: ["workplacesTotal", "workplacesWithMembers"]
    },
    {
      slug: "modul-vyrocni-zpravy",
      title: "Výroční zprávy",
      description: "Příprava a kontrola výročních zpráv fakult a univerzity.",
      status: "planned",
      icon: "📑"
    },
    {
      slug: "modul-bilancni-zpravy",
      title: "Bilanční zprávy",
      description: "Bilanční reporting a termíny odevzdání.",
      status: "planned",
      icon: "⚖️"
    },
    {
      slug: "modul-doktorska-skola",
      title: "Indikátory doktorské školy",
      description: "Sledování indikátorů, termínů a odpovědností doktorského studia.",
      status: "planned",
      icon: "🎯"
    },
    {
      slug: "nastaveni",
      title: "Nastavení",
      description: "Konfigurace modulů, připojení a synchronizace dat.",
      status: "active",
      icon: "⚙️",
      stats: []
    }
  ];

  const el = (id) => document.getElementById(id);
  const html = (s) => (s || "").toString().trim().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function getModule(slug) {
    return MODULES.find(m => m.slug === slug) || null;
  }

  function getDashboardKpis() {
    const stats = getStats();
    const deadlines = window.kbDeadlines?.getDeadlines?.() || [];
    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const upcoming = deadlines.filter((d) => {
      const date = new Date(d.termin_odeslani || d.termin_interni || d.termin_sberu || "");
      return date && date >= now && date <= in30;
    }).length;

    let meetings = 0;
    try {
      const data = typeof filteredRecords === "function" ? filteredRecords() : (window.records || []);
      const lower = (s) => (s || "").toString().trim().toLowerCase();
      meetings = data.filter((r) => {
        const k = lower(r.kam_patri);
        return k && !["nezařazeno", "archiv"].includes(k);
      }).length;
    } catch (_) {}

    return {
      newCount: stats.emailsNew,
      riskCount: stats.emailsRisks,
      meetingCount: meetings,
      deadlineCount: upcoming
    };
  }

  function renderCommandKpis() {
    const root = el("commandKpis");
    if (!root) return;
    const k = getDashboardKpis();
    const alertClass = (n) => n > 0 ? "alert" : "ok";
    root.innerHTML = `
      <article class="commandKpi" data-goto="emaily" tabindex="0" role="button" aria-label="Nové k roztřídění">
        <div class="commandKpi-em" aria-hidden="true">✉️</div>
        <div class="commandKpi-body">
          <span class="commandKpiVal ${alertClass(k.newCount)}">${k.newCount}</span>
          <span class="commandKpiLabel">Nové / k třídění</span>
          <span class="commandKpiHint">Otevřít e-maily →</span>
        </div>
      </article>
      <article class="commandKpi" data-goto="emaily" tabindex="0" role="button" aria-label="Rizika a problémy">
        <div class="commandKpi-em" aria-hidden="true">⚠️</div>
        <div class="commandKpi-body">
          <span class="commandKpiVal ${alertClass(k.riskCount)}">${k.riskCount}</span>
          <span class="commandKpiLabel">Rizika / problémy</span>
          <span class="commandKpiHint">Filtrovat →</span>
        </div>
      </article>
      <article class="commandKpi" data-goto="emaily" tabindex="0" role="button" aria-label="K jednání">
        <div class="commandKpi-em" aria-hidden="true">📋</div>
        <div class="commandKpi-body">
          <span class="commandKpiVal ${alertClass(k.meetingCount)}">${k.meetingCount}</span>
          <span class="commandKpiLabel">K jednání</span>
          <span class="commandKpiHint">Záznamy →</span>
        </div>
      </article>
      <article class="commandKpi" data-goto="terminy" tabindex="0" role="button" aria-label="Nadcházející termíny">
        <div class="commandKpi-em" aria-hidden="true">📅</div>
        <div class="commandKpi-body">
          <span class="commandKpiVal ${alertClass(k.deadlineCount)}">${k.deadlineCount}</span>
          <span class="commandKpiLabel">Nadcházející termíny</span>
          <span class="commandKpiHint">Otevřít termíny →</span>
        </div>
      </article>
    `;
    if (root.__kpiBound) return;
    root.addEventListener("click", (e) => {
      const card = e.target.closest?.("[data-goto]");
      if (!card) return;
      window.kbLayout?.setActivePage(card.dataset.goto);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest?.("[data-goto]");
      if (!card) return;
      e.preventDefault();
      window.kbLayout?.setActivePage(card.dataset.goto);
    });
    root.__kpiBound = true;
  }

  function getModuleSector(slug) {
    const sector = MODULE_SECTORS.find((s) => s.slugs.includes(slug));
    return sector?.id || "operativa";
  }

  function getStats() {
    let data = [];
    try {
      data = typeof filteredRecords === "function" ? filteredRecords() : (Array.isArray(window.records) ? window.records : []);
    } catch (_) {
      data = [];
    }
    const lower = (s) => (s || "").toString().trim().toLowerCase();
    const newCount = typeof window.isRecordUnclassified === "function"
      ? data.filter(window.isRecordUnclassified).length
      : data.filter(r => ["nové", "k roztřídění"].includes(lower(r.stav))).length;
    const pendingAi = window.kbAiClassify?.pendingReviewRecords?.().length || 0;
    const risks = data.filter(r =>
      ["riziko", "konflikt / problém"].includes(lower(r.typ)) || lower(r.agenda).includes("rizik")
    ).length;
    const deadlines = window.kbDeadlines?.getDeadlines?.() || [];
    const now = new Date();
    const overdue = deadlines.filter(d => {
      const date = new Date(d.termin_interni || d.termin_odeslani || d.termin_sberu || "");
      return date && date < now && !["odesláno", "uzavřeno", "hotovo", "zrušeno", "archiv"].includes(lower(d.stav));
    }).length;
    const comps = window.kbCompetitions?.getCompetitions?.() || [];
    const internalComps = comps.filter((c) => c.program_slug !== "navraty");
    const navratyComps = comps.filter((c) => c.program_slug === "navraty");
    const activeComps = internalComps.filter(c => !["uzavřeno", "archiv"].includes(lower(c.stav))).length;
    const activeNavratyComps = navratyComps.filter(c => !["uzavřeno", "archiv"].includes(lower(c.stav))).length;
    const personCount = window.kbPersons?.getPersons?.().length || 0;
    const pcrTopics = window.kbPcrResearch?.getTopics?.() || [];
    const pcrLinked = pcrTopics.filter((t) => t.gestor_osobni_cislo || window.kbPersonLinks?.resolvePerson?.(t, "gestor")).length;
    const eizContracts = window.kbEizTokens?.getContracts?.() || [];
    const eizPublications = window.kbEizTokens?.getPublications?.() || [];
    const journalRecords = window.kbJournalDb?.getRecords?.() || [];
    const journalCategories = window.kbJournalDb?.getCategories?.() || [];
    const vystupyItems = window.kbVystupy?.getVystupy?.() || [];
    const organList = window.kbRadyOrgany?.getOrgans?.() || [];
    const workplaceList = window.kbDkrvo?.getWorkplaces?.() || [];
    const kbItems = window.kbItems?.getItems?.() || [];
    const diStats = window.kbDocIntelligence?.stats || {};

    return {
      emailsTotal: data.length,
      emailsNew: newCount,
      emailsAi: pendingAi,
      emailsRisks: risks,
      deadlinesTotal: deadlines.length,
      deadlinesOverdue: overdue,
      competitionsTotal: internalComps.length,
      competitionsActive: activeComps,
      navratyCompetitionsTotal: navratyComps.length,
      navratyCompetitionsActive: activeNavratyComps,
      personsTotal: personCount,
      pcrTopicsTotal: pcrTopics.length,
      pcrTopicsLinked: pcrLinked,
      eizContractsTotal: eizContracts.length,
      eizPublicationsTotal: eizPublications.length,
      journalRecordsTotal: journalRecords.length,
      journalCategoriesTotal: journalCategories.length,
      vystupyTotal: vystupyItems.length,
      vystupyJimp: vystupyItems.filter((v) => v.typ_vystupu === "Jimp").length,
      vystupyJsc: vystupyItems.filter((v) => v.typ_vystupu === "JSC").length,
      organsTotal: organList.length,
      organsPendingAi: window.kbRadyOrgany?.pendingChecksCount?.() || 0,
      workplacesTotal: workplaceList.length,
      workplacesWithMembers: workplaceList.filter((w) => (w.members || []).length > 0).length,
      kbItemsTotal: kbItems.length,
      kbItemsOpen: window.kbItems?.getOpenCount?.() ?? kbItems.filter((i) => !["done", "archived", "closed"].includes((i.status || "").toLowerCase())).length,
      docIntelligenceTotal: diStats.total || 0,
      docIntelligenceNew: diStats.new || 0
    };
  }

  function statLabel(key, value) {
    const labels = {
      emailsTotal: `${value} záznamů`,
      emailsNew: `${value} k třídění`,
      emailsAi: `${value} AI ke kontrole`,
      emailsRisks: `${value} rizik`,
      deadlinesTotal: `${value} termínů`,
      deadlinesOverdue: `${value} po termínu`,
      competitionsTotal: `${value} běhů soutěží`,
      competitionsActive: `${value} aktivních běhů`,
      navratyCompetitionsTotal: `${value} běhů Návraty`,
      navratyCompetitionsActive: `${value} aktivních běhů`,
      personsTotal: `${value} osob`,
      pcrTopicsTotal: `${value} témat PČR`,
      pcrTopicsLinked: `${value} propojených gestorů`,
      eizContractsTotal: `${value} smluv EIZ`,
      eizPublicationsTotal: `${value} publikací EIZ`,
      journalRecordsTotal: `${value} záznamů časopisů`,
      journalCategoriesTotal: `${value} oborů JCR`,
      vystupyTotal: `${value} výstupů`,
      vystupyJimp: `${value} Jimp`,
      vystupyJsc: `${value} JSC`,
      organsTotal: `${value} orgánů`,
      organsPendingAi: `${value} AI ke kontrole`,
      workplacesTotal: `${value} pracovišť`,
      workplacesWithMembers: `${value} s členy`,
      kbItemsTotal: `${value} meeting notes`,
      kbItemsOpen: `${value} otevřených notes`,
      docIntelligenceTotal: `${value} dokumentů`,
      docIntelligenceNew: `${value} ke zpracování`
    };
    return labels[key] || String(value);
  }

  function tagClass(key, value) {
    const warnKeys = ["emailsNew", "emailsAi", "deadlinesOverdue", "organsPendingAi", "docIntelligenceNew", "kbItemsOpen"];
    const purpleKeys = ["competitionsTotal", "navratyCompetitionsTotal", "pcrTopicsTotal", "journalRecordsTotal", "journalCategoriesTotal"];
    const greenKeys = ["personsTotal", "organsTotal", "workplacesTotal", "eizContractsTotal"];
    if (warnKeys.includes(key) && value > 0) return "ty";
    if (purpleKeys.includes(key)) return "tp";
    if (greenKeys.includes(key)) return "tg";
    return "tb";
  }

  function renderModuleCard(mod, stats) {
    const active = mod.status === "active";
    const sector = getModuleSector(mod.slug);
    let tags = (mod.stats || [])
      .map(key => {
        const val = stats[key];
        if (val === undefined || val === null) return "";
        if (val === 0 && !["emailsTotal", "deadlinesTotal", "kbItemsTotal"].includes(key)) return "";
        return `<span class="tag ${tagClass(key, val)}">${html(statLabel(key, val))}</span>`;
      })
      .filter(Boolean)
      .join("");
    if (mod.slug === "ai-poradce") {
      let aiReady = false;
      try {
        const raw = JSON.parse(localStorage.getItem("kb-dashboard-ai-settings-v1") || "{}");
        aiReady = !!(raw.apiKey || "").trim();
      } catch (_) {}
      tags = `<span class="tag ty">${aiReady ? "AI ready" : "AI nenastaveno"}</span>`;
    } else if (mod.slug === "nastaveni") {
      const ver = document.getElementById("topbarVersion")?.textContent?.replace(/^Verze\s+/, "v") || "v3.132";
      tags = `<span class="tag ty">${html(ver)}</span>`;
    }
    const metaHtml = tags
      ? `<div class="moduleCardMeta">${tags}</div>`
      : (active ? `<div class="moduleCardMeta"><span class="tag tg">Aktivní</span></div>` : "");
    return `
      <article class="moduleCard ${active ? "moduleCardActive" : "moduleCardPlanned"}" data-module-slug="${html(mod.slug)}" data-sector="${html(sector)}" tabindex="0" role="button" aria-label="${html(mod.title)}">
        <div class="moduleCardIcon" aria-hidden="true">${mod.icon}</div>
        <h3 class="moduleCardTitle">${html(mod.title)}</h3>
        <p class="moduleCardDesc">${html(mod.description)}</p>
        ${metaHtml}
        ${active ? `<span class="moduleCardCta">Otevřít modul →</span>` : `<span class="moduleCardBadge">Připravujeme</span>`}
      </article>
    `;
  }

  function renderModulesGrid() {
    const root = el("modulesGrid");
    if (!root) return;
    const stats = getStats();
    renderCommandKpis();
    root.innerHTML = MODULE_SECTORS.map((sector) => {
      const mods = sector.slugs.map((slug) => getModule(slug)).filter(Boolean);
      if (!mods.length) return "";
      return `
        <div class="modulesSection">
          <div class="sec-hdr"><span class="sec-eye">${html(sector.title)}</span><div class="sec-line"></div></div>
          <div class="modulesGrid">${mods.map((m) => renderModuleCard(m, stats)).join("")}</div>
        </div>
      `;
    }).join("");
  }

  function renderModulePlaceholder(slug) {
    const root = el("modulePlaceholderRoot");
    if (!root) return;
    const mod = getModule(slug);
    if (!mod) {
      root.innerHTML = `<p class="hint">Modul nenalezen.</p>`;
      return;
    }
    root.innerHTML = `
      <section class="panel modulePlaceholderPanel">
        <div class="modulePlaceholderHead">
          <span class="modulePlaceholderIcon" aria-hidden="true">${mod.icon}</span>
          <div>
            <h2>${html(mod.title)}</h2>
            <p class="hint">${html(mod.description)}</p>
          </div>
        </div>
        ${mod.status === "planned" ? `
          <div class="modulePlaceholderBox">
            <p><strong>Modul je v přípravě.</strong></p>
            <p class="hint">Tato část aplikace bude obsahovat vlastní evidenci, termíny a workflow pro oblast „${html(mod.title)}“.</p>
            <button type="button" class="button secondary" data-goto="prehled">← Zpět na přehled modulů</button>
          </div>
        ` : ""}
      </section>
    `;
    root.querySelector("[data-goto]")?.addEventListener("click", () => {
      window.kbLayout?.setActivePage("prehled");
    });
  }

  function openModule(slug) {
    const mod = getModule(slug);
    if (!mod) return;
    if (mod.status === "active") {
      window.kbLayout?.setActivePage(slug);
    } else {
      window.kbLayout?.setActivePage(slug, { isModule: true });
    }
  }

  function bindModuleCards() {
    const grid = el("modulesGrid");
    if (!grid || grid.__bound) return;
    grid.addEventListener("click", (e) => {
      const card = e.target.closest?.(".moduleCard");
      if (!card) return;
      openModule(card.dataset.moduleSlug);
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest?.(".moduleCard");
      if (!card) return;
      e.preventDefault();
      openModule(card.dataset.moduleSlug);
    });
    grid.__bound = true;
  }

  function init() {
    renderModulesGrid();
    bindModuleCards();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "prehled") renderModulesGrid();
      if (e.detail?.page === "modul" && e.detail?.moduleSlug) {
        renderModulePlaceholder(e.detail.moduleSlug);
      }
    });
    document.addEventListener("kb:records-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:competitions-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:persons-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:pcr-research-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:eiz-tokens-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:journal-db-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:vystupy-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:rady-organy-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:dkrvo-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:kb-items-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("kb:doc-intelligence-loaded", () => setTimeout(renderModulesGrid, 60));
    document.addEventListener("input", () => setTimeout(renderModulesGrid, 120));
  }

  window.kbModules = { MODULES, MODULE_SECTORS, getModule, getStats, getDashboardKpis, renderModulesGrid, renderCommandKpis, openModule };

  document.addEventListener("DOMContentLoaded", init);
})();
