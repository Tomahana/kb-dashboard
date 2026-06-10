// Přehled modulů – klikatelné karty a placeholdery pro budoucí oblasti.

(function () {
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
      description: "Seskupení e-mailů do témat, AI shrnutí a práce s kontextem.",
      status: "active",
      icon: "🏷️",
      stats: []
    },
    {
      slug: "analyza",
      title: "Analýza agend",
      description: "Přehled podle agend, rizika, vývoj v čase a mind mapa.",
      status: "active",
      icon: "📊",
      stats: ["emailsRisks"]
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
      description: "UHK Connect, Prestige, Horizon, Rega, Návraty, PhD Seed — alokace, výzvy, přihlášky a podpora.",
      status: "active",
      icon: "🏆",
      stats: ["competitionsTotal", "competitionsActive"]
    },
    {
      slug: "pcr-vyzkum",
      title: "Výzkumné směry PČR",
      description: "Výzkumná témata UHK pro spolupráci s PČR — sync z Google Sheets, analýza podle oblastí a propojení gestorů na Osoby.",
      status: "active",
      icon: "🛡️",
      stats: ["pcrTopicsTotal", "pcrTopicsLinked"]
    },
    {
      slug: "modul-dkrvo",
      title: "DKRVO",
      description: "Roční výkaz výzkumu, sběr dat a odeslání na MŠMT.",
      status: "planned",
      icon: "📋"
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
    }
  ];

  const el = (id) => document.getElementById(id);
  const html = (s) => (s || "").toString().trim().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function getModule(slug) {
    return MODULES.find(m => m.slug === slug) || null;
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
    const activeComps = comps.filter(c => !["uzavřeno", "archiv"].includes(lower(c.stav))).length;
    const personCount = window.kbPersons?.getPersons?.().length || 0;
    const pcrTopics = window.kbPcrResearch?.getTopics?.() || [];
    const pcrLinked = pcrTopics.filter((t) => t.gestor_osobni_cislo || window.kbPersonLinks?.resolvePerson?.(t, "gestor")).length;

    return {
      emailsTotal: data.length,
      emailsNew: newCount,
      emailsAi: pendingAi,
      emailsRisks: risks,
      deadlinesTotal: deadlines.length,
      deadlinesOverdue: overdue,
      competitionsTotal: comps.length,
      competitionsActive: activeComps,
      personsTotal: personCount,
      pcrTopicsTotal: pcrTopics.length,
      pcrTopicsLinked: pcrLinked
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
      personsTotal: `${value} osob`,
      pcrTopicsTotal: `${value} témat PČR`,
      pcrTopicsLinked: `${value} propojených gestorů`
    };
    return labels[key] || String(value);
  }

  function renderModuleCard(mod, stats) {
    const active = mod.status === "active";
    const statHtml = (mod.stats || [])
      .map(key => stats[key] > 0 ? `<span class="moduleStat">${html(statLabel(key, stats[key]))}</span>` : "")
      .filter(Boolean)
      .join("");
    return `
      <article class="moduleCard ${active ? "moduleCardActive" : "moduleCardPlanned"}" data-module-slug="${html(mod.slug)}" tabindex="0" role="button" aria-label="${html(mod.title)}">
        <div class="moduleCardIcon" aria-hidden="true">${mod.icon}</div>
        <div class="moduleCardBody">
          <h3 class="moduleCardTitle">${html(mod.title)}</h3>
          <p class="moduleCardDesc">${html(mod.description)}</p>
          ${statHtml ? `<div class="moduleCardStats">${statHtml}</div>` : ""}
        </div>
        <div class="moduleCardFoot">
          ${active ? `<span class="moduleCardCta">Otevřít modul →</span>` : `<span class="moduleCardBadge">Připravujeme</span>`}
        </div>
      </article>
    `;
  }

  function renderModulesGrid() {
    const root = el("modulesGrid");
    if (!root) return;
    const stats = getStats();
    const active = MODULES.filter(m => m.status === "active");
    const planned = MODULES.filter(m => m.status === "planned");
    root.innerHTML = `
      <div class="modulesSection">
        <h3 class="modulesSectionTitle">Aktivní moduly</h3>
        <div class="modulesGrid">${active.map(m => renderModuleCard(m, stats)).join("")}</div>
      </div>
      <div class="modulesSection">
        <h3 class="modulesSectionTitle">Plánované moduly</h3>
        <p class="hint modulesSectionHint">Tyto oblasti doplníme postupně. Kliknutím zobrazíte náhled.</p>
        <div class="modulesGrid modulesGridPlanned">${planned.map(m => renderModuleCard(m, stats)).join("")}</div>
      </div>
    `;
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

  function injectStyles() {
    if (el("modulesStyles")) return;
    const style = document.createElement("style");
    style.id = "modulesStyles";
    style.textContent = `
      .modulesSection { margin-bottom: 1.5rem; }
      .modulesSectionTitle { margin: 0 0 .65rem; font-size: 1rem; font-weight: 800; color: var(--text); }
      .modulesSectionHint { margin: -.35rem 0 .75rem; }
      .modulesGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .85rem; }
      .moduleCard {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: white;
        padding: 1rem;
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto;
        gap: .5rem .75rem;
        cursor: pointer;
        transition: border-color .15s, box-shadow .15s, transform .15s;
      }
      .moduleCard:hover, .moduleCard:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 4px 14px rgba(0,0,0,.06);
        outline: none;
        transform: translateY(-1px);
      }
      .moduleCardActive { border-left: 4px solid var(--accent); }
      .moduleCardPlanned { opacity: .92; border-left: 4px solid #d0d5dd; }
      .moduleCardIcon { font-size: 1.75rem; line-height: 1; grid-row: 1 / span 2; }
      .moduleCardTitle { margin: 0; font-size: 1.05rem; font-weight: 800; }
      .moduleCardDesc { margin: .2rem 0 0; font-size: .88rem; color: var(--muted); line-height: 1.45; }
      .moduleCardStats { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .45rem; }
      .moduleStat { font-size: .78rem; font-weight: 700; background: #f2f4f7; color: #344054; padding: .2rem .45rem; border-radius: 999px; }
      .moduleCardFoot { grid-column: 1 / -1; display: flex; justify-content: flex-end; padding-top: .25rem; }
      .moduleCardCta { font-size: .85rem; font-weight: 700; color: var(--accent); }
      .moduleCardBadge { font-size: .78rem; font-weight: 700; color: #667085; background: #f2f4f7; padding: .2rem .5rem; border-radius: 999px; }
      .modulePlaceholderPanel { max-width: 720px; }
      .modulePlaceholderHead { display: flex; gap: 1rem; align-items: start; margin-bottom: 1rem; }
      .modulePlaceholderIcon { font-size: 2.5rem; line-height: 1; }
      .modulePlaceholderBox { border: 1px dashed var(--line); border-radius: 12px; padding: 1rem; background: #f8fafc; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
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
    document.addEventListener("input", () => setTimeout(renderModulesGrid, 120));
  }

  window.kbModules = { MODULES, getModule, renderModulesGrid, openModule };

  document.addEventListener("DOMContentLoaded", init);
})();
