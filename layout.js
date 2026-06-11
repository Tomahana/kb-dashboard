// Navigace mezi podstránkami KB Dashboardu (hash routing).

(function () {
  const PAGES = {
    prehled: { title: "Přehled", subtitle: "Moduly a oblasti práce OVV" },
    emaily: { title: "Znalostní báze z e-mailů", subtitle: "Třídění, klasifikace a práce se záznamy" },
    temata: { title: "Témata", subtitle: "Seskupení e-mailů a AI shrnutí" },
    analyza: { title: "Analýza", subtitle: "Přehled agend, rizik a vývoje v čase" },
    terminy: { title: "Termíny", subtitle: "Termíny sběrů dat a odesílání na úřady" },
    osoby: { title: "Osoby", subtitle: "Centrální evidence osob pro všechny moduly" },
    "interni-souteze": { title: "Interní soutěže", subtitle: "UHK programy, běhy, přihlášky, hodnocení a finance" },
    "pcr-vyzkum": { title: "Výzkumné směry PČR", subtitle: "Témata pro spolupráci UHK s Policií ČR — sync, analýza a osoby" },
    "ai-poradce": { title: "AI poradce", subtitle: "Dotazy nad daty aplikace — odpovědi jen z modulů KB Dashboardu" },
    "eiz-tokeny": { title: "EIZ tokeny", subtitle: "Transformační smlouvy, roční tokeny a publikace z APC" },
    casopisy: { title: "Databáze časopisů", subtitle: "JCR exporty, AIS pořadí v oborech, decily a nejlepší výsledky" },
    nastaveni: { title: "Nastavení", subtitle: "Supabase, AI, import a export" },
    modul: { title: "Modul", subtitle: "Oblast v přípravě" }
  };

  const DEFAULT_PAGE = "prehled";

  function el(id) {
    return document.getElementById(id);
  }

  function resolveRoute(hash) {
    const raw = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
    if (PAGES[raw]) return { page: raw, moduleSlug: null };
    if (/^modul-/.test(raw)) return { page: "modul", moduleSlug: raw };
    return { page: DEFAULT_PAGE, moduleSlug: null };
  }

  function getPage() {
    return resolveRoute(location.hash).page;
  }

  function setActivePage(pageId, options = {}) {
    const raw = (pageId || "").replace(/^#\/?/, "").trim().toLowerCase();
    const route = options.isModule && /^modul-/.test(raw)
      ? { page: "modul", moduleSlug: raw }
      : resolveRoute(raw);

    document.querySelectorAll(".page").forEach(node => {
      node.classList.toggle("active", node.id === `page-${route.page}`);
    });
    document.querySelectorAll(".navItem").forEach(link => {
      const active = link.dataset.page === route.page;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    let title = PAGES[route.page]?.title || "KB Dashboard";
    let subtitle = PAGES[route.page]?.subtitle || "";

    if (route.page === "modul" && route.moduleSlug && window.kbModules?.getModule) {
      const mod = window.kbModules.getModule(route.moduleSlug);
      if (mod) {
        title = mod.title;
        subtitle = mod.status === "planned" ? "Modul v přípravě" : mod.description;
      }
    }

    if (el("pageTitle")) el("pageTitle").textContent = title;
    if (el("pageSubtitle")) el("pageSubtitle").textContent = subtitle;

    const hashTarget = route.page === "modul" ? route.moduleSlug : route.page;
    if (location.hash.replace(/^#\/?/, "").toLowerCase() !== hashTarget) {
      history.replaceState(null, "", `#${hashTarget}`);
    }

    document.dispatchEvent(new CustomEvent("kb:page-changed", {
      detail: { page: route.page, moduleSlug: route.moduleSlug }
    }));
  }

  function updateBadges() {
    let data = [];
    try {
      data = typeof filteredRecords === "function" ? filteredRecords() : (Array.isArray(records) ? records : []);
    } catch (_) {
      data = [];
    }
    const lower = (s) => (s || "").toString().trim().toLowerCase();
    const newCount = typeof isRecordUnclassified === "function"
      ? data.filter(isRecordUnclassified).length
      : data.filter(r => ["nové", "k roztřídění"].includes(lower(r.stav))).length;
    const pendingAi = window.kbAiClassify?.pendingReviewRecords?.().length || 0;

    const setBadge = (id, count) => {
      const b = el(id);
      if (!b) return;
      b.textContent = count > 0 ? String(count) : "";
      b.hidden = count <= 0;
    };

    setBadge("navBadgeNew", newCount);
    setBadge("navBadgeAi", pendingAi);

    if (window.kbModules?.renderModulesGrid) {
      setTimeout(() => window.kbModules.renderModulesGrid(), 0);
    }
  }

  function bindNav() {
    document.querySelectorAll(".navItem").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        setActivePage(link.dataset.page);
      });
    });
    window.addEventListener("hashchange", () => {
      const route = resolveRoute(location.hash);
      setActivePage(route.page === "modul" ? route.moduleSlug : route.page, {
        isModule: route.page === "modul"
      });
    });
  }

  function mountTopbarActions() {
    const map = {
      loadSupabaseBtn: "actionsData",
      autoClassifyBtn: "actionsInbox",
      reviewAiBtn: "actionsInbox",
      aiSettingsBtn: "actionsSettings",
      exportBtn: "actionsSettings",
      aiPromptBtn: "actionsAnalytics"
    };
    Object.entries(map).forEach(([id, hostId]) => {
      const node = el(id);
      const host = el(hostId);
      if (node && host && !host.contains(node)) host.appendChild(node);
    });
    const importLabel = document.querySelector("label:has(#importFile)");
    if (importLabel && el("actionsSettings") && !el("actionsSettings").contains(importLabel)) {
      el("actionsSettings").appendChild(importLabel);
    }
  }

  function bindOverviewLinks() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-goto]");
      if (!btn) return;
      setActivePage(btn.dataset.goto);
    });
  }

  function loadAppVersion() {
    const box = el("appVersion");
    if (!box) return;
    fetch(`version.json?_${Date.now()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.version) return;
        const date = data.bumpedAt ? ` · ${data.bumpedAt}` : "";
        box.textContent = `Verze ${data.version}${date}`;
      })
      .catch(() => {});
  }

  function init() {
    loadAppVersion();
    bindNav();
    bindOverviewLinks();
    const route = resolveRoute(location.hash);
    setActivePage(
      route.page === "modul" ? route.moduleSlug : (route.page || DEFAULT_PAGE),
      { isModule: route.page === "modul" }
    );
    setTimeout(() => {
      mountTopbarActions();
      updateBadges();
    }, 80);
    document.addEventListener("input", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:records-loaded", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:page-changed", () => {
      if (window.kbPickers?.closeOpenMenu) window.kbPickers.closeOpenMenu();
    });
  }

  window.kbLayout = { setActivePage, updateBadges, getPage, resolveRoute };

  document.addEventListener("DOMContentLoaded", init);
})();
