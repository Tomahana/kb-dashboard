// Navigace mezi podstránkami KB Dashboardu (hash routing).

(function () {
  const PAGES = {
    prehled: { title: "Command Deck", subtitle: "Operativní přehled" },
    emaily: { title: "Znalostní báze z e-mailů", subtitle: "Zachytávání, třídění, klasifikace a práce se záznamy" },
    "kb-items": { title: "KB Notion meeting notes", subtitle: "Notion meeting notes z AI agenta — úkoly, znalosti, rozhodnutí a reference" },
    temata: { title: "Témata", subtitle: "Seskupení e-mailů, AI shrnutí a analýza agend" },
    terminy: { title: "Termíny", subtitle: "Termíny sběrů dat a odesílání na úřady" },
    podklady: { title: "Podklady k jednáním", subtitle: "Evidence podkladů, bodů a poznámek k jednáním — témata a termíny" },
    osoby: { title: "Osoby", subtitle: "Centrální evidence osob pro všechny moduly" },
    "interni-souteze": { title: "Interní soutěže", subtitle: "UHK programy, běhy, přihlášky, hodnocení a finance" },
    navraty: { title: "OP JAK Návraty", subtitle: "Soutěž OP JAK Návraty — běhy, přihlášky, hodnocení a finance" },
    "pcr-vyzkum": { title: "Výzkumné směry PČR", subtitle: "Témata pro spolupráci UHK s Policií ČR — sync, analýza a osoby" },
    "ai-poradce": { title: "AI poradce", subtitle: "Dotazy nad daty aplikace — odpovědi jen z modulů KB Dashboardu" },
    "eiz-tokeny": { title: "EIZ tokeny", subtitle: "Transformační smlouvy, roční tokeny a publikace z APC" },
    casopisy: { title: "Databáze časopisů", subtitle: "JCR exporty, AIS pořadí v oborech, decily a nejlepší výsledky" },
    vystupy: { title: "Výstupy", subtitle: "Publikační výstupy Jimp, JSC, B a C — samostatné tabulky pro DKRVO, PPK a analýzy" },
    "modul-dkrvo": { title: "DKRVO", subtitle: "Pracoviště, kódy, členové z webu a roční výkaz výzkumu" },
    "rady-organy": { title: "Rady a orgány", subtitle: "Vědecká rada, Správní rada, AS, MPK, Etická komise, Rada pro komercializaci — členové a AI kontrola změn" },
    "doc-intelligence": { title: "Dokumenty", subtitle: "AI analýza dokumentů — filtrování, priority, poznámky a ClickUp" },
    "outlook-emaily": { title: "Outlook emaily", subtitle: "AI analýza e-mailů z Outlooku — složky, priority, úkoly a termíny" },
    nastaveni: { title: "Nastavení", subtitle: "Supabase, AI, import a export" },
    modul: { title: "Modul", subtitle: "Oblast v přípravě" }
  };

  const DEFAULT_PAGE = "prehled";

  const PAGE_GROUP = {
    prehled: null,
    emaily: "g-op",
    "kb-items": "g-op",
    terminy: "g-op",
    podklady: "g-op",
    "doc-intelligence": "g-op",
    "outlook-emaily": "g-op",
    temata: "g-op",
    "interni-souteze": "g-str",
    navraty: "g-str",
    "pcr-vyzkum": "g-str",
    casopisy: "g-str",
    vystupy: "g-str",
    "modul-dkrvo": "g-str",
    osoby: "g-lide",
    "rady-organy": "g-lide",
    "eiz-tokeny": "g-lide",
    "ai-poradce": "g-ai",
    nastaveni: "g-ai"
  };

  function el(id) {
    return document.getElementById(id);
  }

  function resolveRoute(hash) {
    const raw = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
    if (raw === "analyza") return { page: "temata", moduleSlug: null, topicsTab: "analysis" };
    if (raw === "modul-dkrvo") return { page: "modul-dkrvo", moduleSlug: null };
    if (PAGES[raw]) return { page: raw, moduleSlug: null };
    if (/^interni-souteze(\/|$)/.test(raw)) return { page: "interni-souteze", moduleSlug: null };
    if (/^navraty(\/|$)/.test(raw)) return { page: "navraty", moduleSlug: null };
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

    syncNavGroup(route.page, route.moduleSlug);

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
    const subText = el("pageSubtitleText");
    const subVer = el("pageSubtitleVer");
    if (subText) subText.textContent = subtitle;
    if (subVer) subVer.hidden = route.page !== "prehled";
    if (!subText && el("pageSubtitle")) el("pageSubtitle").textContent = subtitle;

    const currentRaw = location.hash.replace(/^#\/?/, "").toLowerCase();
    const hashTarget = route.page === "modul" ? route.moduleSlug : route.page;
    const preserveInterniSubRoute = options.fromHashChange
      && route.page === "interni-souteze"
      && currentRaw.startsWith("interni-souteze/");
    const preserveNavratySubRoute = options.fromHashChange
      && route.page === "navraty"
      && currentRaw.startsWith("navraty/");
    if (!preserveInterniSubRoute && !preserveNavratySubRoute && currentRaw !== hashTarget) {
      history.replaceState(null, "", `#${hashTarget}`);
    }

    const topicsTab = options.topicsTab || route.topicsTab;
    if (route.page === "temata" && topicsTab) {
      window.kbTopics?.setActiveTab?.(topicsTab);
    }

    document.dispatchEvent(new CustomEvent("kb:page-changed", {
      detail: { page: route.page, moduleSlug: route.moduleSlug, topicsTab }
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

    const organPending = window.kbRadyOrgany?.pendingChecksCount?.() || 0;
    setBadge("navBadgeOrgans", organPending);

    if (window.kbModules?.renderModulesGrid) {
      setTimeout(() => window.kbModules.renderModulesGrid(), 0);
    }
    updateMissionHeader();
  }

  function initialsFromEmail(email) {
    const local = (email || "").split("@")[0] || "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase() || "—";
  }

  function updateSidebarUser(user) {
    const emailEl = el("sidebarUserEmail");
    const avatarEl = el("sidebarAvatar");
    if (!emailEl || !avatarEl) return;
    if (!user?.email) {
      emailEl.textContent = "Nepřihlášen";
      avatarEl.textContent = "—";
      return;
    }
    emailEl.textContent = user.email;
    avatarEl.textContent = initialsFromEmail(user.email);
  }

  function setGroupOpen(groupId, open, persist = true) {
    const group = groupId ? el(groupId) : null;
    if (!group) return;
    group.classList.toggle("open", open);
    const head = group.querySelector(".sb-group-head");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
    if (persist) {
      try { localStorage.setItem(`kb-nav-group-${groupId}`, open ? "open" : "closed"); } catch (_) {}
    }
  }

  function syncNavGroup(page, moduleSlug) {
    let groupId = PAGE_GROUP[page] || null;
    if (page === "modul" && moduleSlug && window.kbModules?.getModule) {
      const mod = window.kbModules.getModule(moduleSlug);
      if (mod) {
        const sector = window.kbModules.MODULE_SECTORS?.find((s) => s.slugs.includes(mod.slug));
        const map = { operativa: "g-op", strategie: "g-str", lide: "g-lide", ai: "g-ai" };
        groupId = map[sector?.id] || null;
      }
    }
    if (groupId) setGroupOpen(groupId, true, false);
  }

  function bindAccordionGroups() {
    document.querySelectorAll(".sb-group").forEach((group) => {
      const groupId = group.id;
      const head = group.querySelector(".sb-group-head");
      if (!head) return;

      try {
        const saved = localStorage.getItem(`kb-nav-group-${groupId}`);
        if (saved === "open") setGroupOpen(groupId, true, false);
        else if (saved === "closed") setGroupOpen(groupId, false, false);
      } catch (_) {}

      head.addEventListener("click", () => {
        const willOpen = !group.classList.contains("open");
        setGroupOpen(groupId, willOpen);
      });
    });
  }

  function setPill(node, state, html) {
    if (!node) return;
    node.className = "pill" + (state ? ` ${state}` : "");
    node.innerHTML = html;
  }

  async function updateMissionHeader() {
    try {
      const session = await window.kbAuth?.getSession?.();
      updateSidebarUser(session?.user || null);
      setPill(
        el("missionSupabase"),
        session ? "ok" : "warn",
        `<span class="dot ${session ? "dg" : "dy"}"></span> Supabase ${session ? "online" : "offline"}`
      );
    } catch (_) {
      setPill(el("missionSupabase"), "err", '<span class="dot dr"></span> Supabase chyba');
    }

    let aiReady = false;
    try {
      const raw = JSON.parse(localStorage.getItem("kb-dashboard-ai-settings-v1") || "{}");
      aiReady = !!(raw.apiKey || "").trim();
    } catch (_) {}
    setPill(
      el("missionAi"),
      aiReady ? "ai" : "warn",
      `<span class="dot ${aiReady ? "db" : "dy"}"></span> AI ${aiReady ? "ready" : "nenastaveno"}`
    );

    const dateEl = el("topbarDate");
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toISOString().slice(0, 10);
    }
  }

  function bindNav() {
    document.querySelectorAll(".navItem").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        if (link.dataset.page === "temata") {
          window.kbTopics?.setActiveTab?.("evidence");
        }
        setActivePage(link.dataset.page);
      });
    });
    window.addEventListener("hashchange", () => {
      const route = resolveRoute(location.hash);
      setActivePage(route.page === "modul" ? route.moduleSlug : route.page, {
        isModule: route.page === "modul",
        topicsTab: route.topicsTab,
        fromHashChange: true
      });
    });
  }

  function mountTopbarActions() {
    const map = {
      loadSupabaseBtn: "actionsData",
      captureKnowledgeBtn: "actionsInbox",
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
    const apply = (version) => {
      const box = el("appVersion");
      const top = el("topbarVersion");
      const verText = `Verze ${version}`;
      if (box) box.textContent = verText;
      if (top) top.textContent = verText;
    };
    fetch(`version.json?_${Date.now()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.version) return;
        apply(data.version);
      })
      .catch(() => {});
  }

  function init() {
    loadAppVersion();
    bindNav();
    bindAccordionGroups();
    bindOverviewLinks();
    const route = resolveRoute(location.hash);
    setActivePage(
      route.page === "modul" ? route.moduleSlug : (route.page || DEFAULT_PAGE),
      { isModule: route.page === "modul", topicsTab: route.topicsTab }
    );
    setTimeout(() => {
      mountTopbarActions();
      updateBadges();
      updateMissionHeader();
    }, 80);
    document.addEventListener("input", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:records-loaded", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:rady-organy-loaded", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:deadlines-loaded", () => setTimeout(updateBadges, 60));
    document.addEventListener("kb:page-changed", () => {
      if (window.kbPickers?.closeOpenMenu) window.kbPickers.closeOpenMenu();
    });
    document.addEventListener("kb:ui-ready", () => mountTopbarActions());
    document.addEventListener("kb:auth-ready", (e) => updateSidebarUser(e.detail?.user));
  }

  window.kbLayout = { setActivePage, updateBadges, updateMissionHeader, getPage, resolveRoute, mountTopbarActions, updateSidebarUser };

  document.addEventListener("DOMContentLoaded", init);
})();
