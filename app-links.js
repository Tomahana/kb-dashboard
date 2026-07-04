// Modul Odkazy na aplikace — rychlý přístup k IRIS, IS VaVaI, UHK systémům a dalším nástrojům.

(function () {
  const SEED_URL = "data/app-links-seed.json";
  const STORAGE_KEY = "kb_app_links_custom";

  let kategorie = [];
  let odkazy = [];
  let loading = false;
  let filterSearch = "";
  let filterKategorie = "";
  let filterZakladni = false;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function loadCustomLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomLinks(custom) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  function setStatus(text, isError) {
    const node = el("appLinksStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("appLinksStatusError", !!isError);
  }

  function mergeData(seed) {
    const custom = loadCustomLinks();
    const byId = new Map((seed.odkazy || []).map((item) => [item.id, { ...item }]));
    for (const item of custom) {
      if (item.id && byId.has(item.id)) byId.set(item.id, { ...byId.get(item.id), ...item });
      else if (item.id) byId.set(item.id, item);
    }
    kategorie = [...(seed.kategorie || [])].sort((a, b) => (a.poradi || 0) - (b.poradi || 0));
    odkazy = [...byId.values()].sort((a, b) => {
      const catA = kategorie.find((k) => k.id === a.kategorie)?.poradi || 99;
      const catB = kategorie.find((k) => k.id === b.kategorie)?.poradi || 99;
      if (catA !== catB) return catA - catB;
      return (a.poradi || 0) - (b.poradi || 0) || a.nazev.localeCompare(b.nazev, "cs");
    });
  }

  function populateCategoryFilter() {
    const select = el("appLinksKategorieFilter");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Všechny kategorie</option>${kategorie.map((k) =>
      `<option value="${html(k.id)}">${html(k.nazev)}</option>`
    ).join("")}`;
    if (current && kategorie.some((k) => k.id === current)) select.value = current;
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    setStatus("Načítám odkazy…");
    try {
      let seed = { kategorie: [], odkazy: [] };
      const res = await fetch(`${SEED_URL}?_${Date.now()}`);
      if (res.ok) seed = await res.json();
      mergeData(seed);
      populateCategoryFilter();
      setStatus(`Načteno ${odkazy.length} odkazů.`);
    } catch (error) {
      console.error(error);
      mergeData({ kategorie: [], odkazy: [] });
      setStatus("Chyba načítání odkazů: " + (error.message || error), true);
    } finally {
      loading = false;
      render();
    }
  }

  function filteredLinks() {
    return odkazy.filter((item) => {
      if (filterKategorie && item.kategorie !== filterKategorie) return false;
      if (filterZakladni && !item.zakladni) return false;
      if (filterSearch) {
        const q = l(filterSearch);
        const hay = l([item.nazev, item.popis, item.url, kategorie.find((k) => k.id === item.kategorie)?.nazev].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderLinkCard(item) {
    const cat = kategorie.find((k) => k.id === item.kategorie);
    return `
      <a class="appLinkCard" href="${html(item.url)}" target="_blank" rel="noopener noreferrer" title="${html(item.popis || item.nazev)}">
        <span class="appLinkCardIcon" aria-hidden="true">${html(item.ikona || "🔗")}</span>
        <span class="appLinkCardBody">
          <span class="appLinkCardTitle">${html(item.nazev)}</span>
          ${item.popis ? `<span class="appLinkCardDesc">${html(item.popis)}</span>` : ""}
          <span class="appLinkCardMeta">${html(cat?.nazev || "")}${item.zakladni ? " · základní" : ""}</span>
        </span>
        <span class="appLinkCardCta" aria-hidden="true">↗</span>
      </a>
    `;
  }

  function renderByCategory(items) {
    const grouped = new Map();
    for (const item of items) {
      const key = item.kategorie || "ostatni";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }

    const orderedCats = kategorie.filter((k) => grouped.has(k.id));
    const extra = [...grouped.keys()].filter((id) => !kategorie.find((k) => k.id === id));
    const sections = [...orderedCats, ...extra.map((id) => ({ id, nazev: "Ostatní" }))];

    if (!sections.length) {
      return `<p class="hint appLinksEmpty">Žádné odkazy${filterSearch || filterKategorie || filterZakladni ? " pro zadané filtry" : ""}.</p>`;
    }

    return sections.map((cat) => {
      const links = grouped.get(cat.id) || [];
      if (!links.length) return "";
      return `
        <section class="appLinksSection">
          <h3 class="appLinksSectionTitle">${html(cat.nazev)}</h3>
          <div class="appLinksGrid">${links.map(renderLinkCard).join("")}</div>
        </section>
      `;
    }).join("");
  }

  function render() {
    const root = el("appLinksPageRoot");
    if (!root) return;

    const items = filteredLinks();
    const list = el("appLinksList");
    const count = el("appLinksCount");
    if (list) list.innerHTML = loading ? `<p class="hint">Načítám…</p>` : renderByCategory(items);
    if (count) count.textContent = `${items.length} / ${odkazy.length}`;
  }

  function injectStyles() {
    if (document.getElementById("appLinksStyles")) return;
    const style = document.createElement("style");
    style.id = "appLinksStyles";
    style.textContent = `
      .appLinksToolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 20px;
      }
      .appLinksToolbar input[type="search"],
      .appLinksToolbar select {
        min-width: 200px;
      }
      .appLinksToolbar label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9rem;
        cursor: pointer;
      }
      .appLinksCount {
        margin-left: auto;
        font-size: 0.85rem;
        color: var(--muted, #6b7280);
      }
      .appLinksStatus { font-size: 0.85rem; color: var(--muted, #6b7280); margin-bottom: 12px; }
      .appLinksStatusError { color: var(--danger, #dc2626); }
      .appLinksSection { margin-bottom: 28px; }
      .appLinksSectionTitle {
        font-size: 0.95rem;
        font-weight: 600;
        margin: 0 0 12px;
        color: var(--text-secondary, #4b5563);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .appLinksGrid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
      }
      .appLinkCard {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 10px;
        background: var(--surface, #fff);
        text-decoration: none;
        color: inherit;
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
      }
      .appLinkCard:hover,
      .appLinkCard:focus-visible {
        border-color: var(--accent, #2563eb);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
        outline: none;
      }
      .appLinkCardIcon { font-size: 1.5rem; line-height: 1; flex-shrink: 0; }
      .appLinkCardBody { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
      .appLinkCardTitle { font-weight: 600; font-size: 0.95rem; }
      .appLinkCardDesc {
        font-size: 0.82rem;
        color: var(--muted, #6b7280);
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .appLinkCardMeta { font-size: 0.75rem; color: var(--muted, #9ca3af); }
      .appLinkCardCta {
        font-size: 1rem;
        color: var(--muted, #9ca3af);
        opacity: 0;
        transition: opacity 0.15s;
        flex-shrink: 0;
      }
      .appLinkCard:hover .appLinkCardCta { opacity: 1; }
      .appLinksEmpty { padding: 24px 0; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const root = el("appLinksPageRoot");
    if (!root || root.dataset.injected) return;
    root.dataset.injected = "1";
    injectStyles();

    root.innerHTML = `
      <section class="panel">
        <h2>Odkazy na aplikace</h2>
        <p class="hint">Rychlý přístup k IRIS, IS VaVaI, systémům UHK a dalším nástrojům používaným v OVV. Odkazy se otevírají v novém okně.</p>
        <div id="appLinksStatus" class="appLinksStatus" aria-live="polite"></div>
        <div class="appLinksToolbar">
          <input type="search" id="appLinksSearch" placeholder="Hledat aplikaci…" aria-label="Hledat aplikaci">
          <select id="appLinksKategorieFilter" aria-label="Filtrovat podle kategorie">
            <option value="">Všechny kategorie</option>
          </select>
          <label>
            <input type="checkbox" id="appLinksZakladniFilter">
            Jen základní
          </label>
          <span id="appLinksCount" class="appLinksCount"></span>
        </div>
        <div id="appLinksList"></div>
      </section>
    `;

    el("appLinksSearch")?.addEventListener("input", (e) => {
      filterSearch = n(e.target.value);
      render();
    });
    el("appLinksKategorieFilter")?.addEventListener("change", (e) => {
      filterKategorie = n(e.target.value);
      render();
    });
    el("appLinksZakladniFilter")?.addEventListener("change", (e) => {
      filterZakladni = !!e.target.checked;
      render();
    });
  }

  function init() {
    injectPage();
    loadData();
  }

  document.addEventListener("kb:page-changed", (e) => {
    if (e.detail?.page === "odkazy-aplikaci") init();
  });

  if (document.querySelector("#page-odkazy-aplikaci.active")) init();

  window.kbAppLinks = {
    getLinks: () => [...odkazy],
    getCategories: () => [...kategorie],
    reload: loadData
  };
})();
