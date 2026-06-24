// Navigace mezi podstránkami KB Dashboardu (hash routing).

(function () {
  const PAGES = {
    prehled: { title: "Command Deck", subtitle: "Operativní přehled a moduly OVV" },
    emaily: { title: "Znalostní báze z e-mailů", subtitle: "Zachytávání, třídění, klasifikace a práce se záznamy" },
    "kb-items": { title: "KB záznamy", subtitle: "Záznamy z AI agenta — úkoly, znalosti, rozhodnutí a reference" },
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
    "rady-organy": { title: "Rady a orgány", subtitle: "Vědecká rada, Správní rada, AS, MPK, Etická komise, Rada pro komercializaci — členové a AI kontrola změn" },
    "doc-intelligence": { title: "Dokumenty", subtitle: "AI analýza dokumentů — filtrování, priority, poznámky a ClickUp" },
    "outlook-emaily": { title: "Outlook emaily", subtitle: "AI analýza e-mailů z Outlooku — složky, priority, úkoly a termíny" },
    nastaveni: { title: "Nastavení", subtitle: "Supabase, AI, import a export" },
    modul: { title: "Modul", subtitle: "Oblast v přípravě" }
  };

  const DEFAULT_PAGE = "prehled";

  function el(id) {
    return document.getElementById(id);
  }

  function resolveRoute(hash) {
    const raw = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
    if (raw === "analyza") return { page: "temata", moduleSlug: null, topicsTab: "analysis" };
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

  function setPill(el, state, html) {
    if (!el) return;
    el.className = "statusPill" + (state ? ` ${state}` : "");
    el.innerHTML = html;
  }

  async function updateMissionHeader() {
    const kpis = window.kbModules?.getDashboardKpis?.() || {};
    const newEl = el("missionNewCount");
    const riskEl = el("missionRiskCount");
    const deadlineEl = el("missionDeadlineCount");
    if (newEl) newEl.textContent = String(kpis.newCount ?? 0);
    if (riskEl) riskEl.textContent = String(kpis.riskCount ?? 0);
    if (deadlineEl) deadlineEl.textContent = String(kpis.deadlineCount ?? 0);

    const newPill = el("missionNew");
    const riskPill = el("missionRisks");
    const deadlinePill = el("missionDeadlines");
    if (newPill) newPill.classList.toggle("warn", (kpis.newCount || 0) > 0);
    if (riskPill) riskPill.classList.toggle("err", (kpis.riskCount || 0) > 0);
    if (deadlinePill) deadlinePill.classList.toggle("warn", (kpis.deadlineCount || 0) > 0);

    try {
      const session = await window.kbAuth?.getSession?.();
      setPill(
        el("missionSupabase"),
        session ? "ok" : "warn",
        `<span class="dot"></span> Supabase · ${session ? "online" : "offline"}`
      );
    } catch (_) {
      setPill(el("missionSupabase"), "err", '<span class="dot"></span> Supabase · chyba');
    }

    let aiReady = false;
    try {
      const raw = JSON.parse(localStorage.getItem("kb-dashboard-ai-settings-v1") || "{}");
      aiReady = !!(raw.apiKey || "").trim();
    } catch (_) {}
    setPill(
      el("missionAi"),
      aiReady ? "ai ok" : "warn",
      `<span class="dot"></span> AI · ${aiReady ? "ready" : "nenastaveno"}`
    );
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
    const apply = (text) => {
      const box = el("appVersion");
      const top = el("topbarVersion");
      const mission = el("missionVersion");
      if (box) box.textContent = text;
      if (top) top.textContent = text;
      if (mission) mission.textContent = text;
    };
    fetch(`version.json?_${Date.now()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.version) return;
        const date = data.bumpedAt ? ` · ${data.bumpedAt}` : "";
        apply(`Verze ${data.version}${date}`);
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
  }

  window.kbLayout = { setActivePage, updateBadges, updateMissionHeader, getPage, resolveRoute, mountTopbarActions };

  document.addEventListener("DOMContentLoaded", init);
})();
