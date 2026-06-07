// Navigace mezi podstránkami KB Dashboardu (hash routing).

(function () {
  const PAGES = {
    prehled: { title: "Přehled", subtitle: "Stav znalostní báze a rychlé akce" },
    emaily: { title: "E-maily", subtitle: "Třídění, klasifikace a práce se záznamy" },
    temata: { title: "Témata", subtitle: "Seskupení e-mailů a AI shrnutí" },
    analyza: { title: "Analýza", subtitle: "Přehled agend, rizik a vývoje v čase" },
    nastaveni: { title: "Nastavení", subtitle: "Supabase, AI, import a export" }
  };

  const DEFAULT_PAGE = "emaily";

  function el(id) {
    return document.getElementById(id);
  }

  function normalizePage(hash) {
    const raw = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
    return PAGES[raw] ? raw : DEFAULT_PAGE;
  }

  function getPage() {
    return normalizePage(location.hash);
  }

  function setActivePage(pageId) {
    const page = normalizePage(pageId);
    document.querySelectorAll(".page").forEach(node => {
      node.classList.toggle("active", node.id === `page-${page}`);
    });
    document.querySelectorAll(".navItem").forEach(link => {
      const active = link.dataset.page === page;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const meta = PAGES[page];
    if (el("pageTitle")) el("pageTitle").textContent = meta.title;
    if (el("pageSubtitle")) el("pageSubtitle").textContent = meta.subtitle;
    if (location.hash.replace(/^#\/?/, "") !== page) {
      history.replaceState(null, "", `#${page}`);
    }
    document.dispatchEvent(new CustomEvent("kb:page-changed", { detail: { page } }));
  }

  function updateBadges() {
    let data = [];
    try {
      data = typeof filteredRecords === "function" ? filteredRecords() : (Array.isArray(records) ? records : []);
    } catch (_) {
      data = [];
    }
    const lower = (s) => (s || "").toString().trim().toLowerCase();
    const newCount = data.filter(r => ["nové", "k roztřídění"].includes(lower(r.stav))).length;
    const pendingAi = window.kbAiClassify?.pendingReviewRecords?.().length || 0;

    const setBadge = (id, count) => {
      const b = el(id);
      if (!b) return;
      b.textContent = count > 0 ? String(count) : "";
      b.hidden = count <= 0;
    };

    setBadge("navBadgeNew", newCount);
    setBadge("navBadgeAi", pendingAi);

    if (el("ovTotal")) el("ovTotal").textContent = data.length;
    if (el("ovNewCount")) el("ovNewCount").textContent = newCount;
    if (el("ovAiCount")) el("ovAiCount").textContent = pendingAi;
    if (el("ovRisks")) {
      el("ovRisks").textContent = data.filter(r =>
        ["riziko", "konflikt / problém"].includes(lower(r.typ)) || lower(r.agenda).includes("rizik")
      ).length;
    }
    if (el("ovMeetings")) {
      el("ovMeetings").textContent = data.filter(r => {
        const m = lower(r.kam_patri);
        return m && !["nezařazeno", "archiv"].includes(m);
      }).length;
    }
  }

  function bindNav() {
    document.querySelectorAll(".navItem").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        setActivePage(link.dataset.page);
      });
    });
    window.addEventListener("hashchange", () => setActivePage(getPage()));
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
    document.querySelectorAll("[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => setActivePage(btn.dataset.goto));
    });
  }

  function init() {
    bindNav();
    bindOverviewLinks();
    setActivePage(getPage() || DEFAULT_PAGE);
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

  window.kbLayout = { setActivePage, updateBadges, getPage };

  document.addEventListener("DOMContentLoaded", init);
})();
