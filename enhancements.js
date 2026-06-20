// Advanced analytical panels for KB Dashboard
// Adds: topic evolution, forgotten items, agenda timeline and Mermaid mind map export.

(function () {
  const PANEL_ID = "advancedAnalytics";

  function n(s) { return (s || "").toString().trim(); }
  function l(s) { return n(s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function d(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function getDate(r) {
    return d(r.datum_pridani || r.datum_emailu || r.created || r.dateAdded);
  }
  function fmt(value) {
    const date = value instanceof Date ? value : d(value);
    return date ? date.toLocaleDateString("cs-CZ") : "";
  }
  function html(s) {
    return n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  }
  function getRecords() {
    return Array.isArray(records) ? records : [];
  }
  function visibleRecords() {
    if (typeof filteredRecords === "function") return filteredRecords({ includeExcluded: false });
    return getRecords();
  }
  function allRecordsForCurrentPeriod() {
    if (typeof filteredRecords === "function") return filteredRecords({ includeExcluded: true, ignoreAgenda: true });
    return getRecords();
  }
  function isClosed(r) {
    return ["uzavřeno", "archiv", "projednáno", "vyřazeno"].includes(l(r.stav));
  }
  function isRisk(r) {
    return ["riziko", "konflikt / problém"].includes(l(r.typ)) || l(r.agenda).includes("rizik");
  }
  function daysAgo(date) {
    if (!date) return 999999;
    return (new Date() - date) / 86400000;
  }

  function injectStyles() {
    if (el("advancedStyles")) return;
    const style = document.createElement("style");
    style.id = "advancedStyles";
    style.textContent = `
      .advancedWrap { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
      .advancedFull { grid-column: 1 / -1; }
      .trendTable { width: 100%; border-collapse: collapse; }
      .trendTable th, .trendTable td { padding: .5rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      .trendUp { color: #027a48; font-weight: 800; }
      .trendDown { color: #b42318; font-weight: 800; }
      .trendFlat { color: #667085; font-weight: 800; }
      .forgottenList { display: grid; gap: .5rem; }
      .forgottenItem { border: 1px solid var(--line); border-radius: 10px; padding: .65rem; background: white; }
      .forgottenItem strong { display: block; margin-bottom: .25rem; }
      .timelineControls { display: flex; gap: .6rem; align-items: end; flex-wrap: wrap; margin-bottom: .75rem; }
      .timelineControls label { min-width: 240px; margin: 0; }
      .timeline { position: relative; padding-left: 1rem; border-left: 3px solid #d0d5dd; }
      .timelineItem { margin: .8rem 0; padding: .65rem .75rem; background: white; border: 1px solid var(--line); border-radius: 10px; position: relative; }
      .timelineItem::before { content: ''; position: absolute; left: -1.36rem; top: .95rem; width: .7rem; height: .7rem; background: var(--accent); border-radius: 999px; }
      .mindMapBox { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .mindTree { background: white; border: 1px solid var(--line); border-radius: 12px; padding: .75rem; overflow: auto; max-height: 380px; }
      .mindTree ul { margin: .25rem 0 .25rem 1.2rem; padding: 0; }
      .mindTree li { margin: .25rem 0; }
      .mermaidText { width: 100%; min-height: 300px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85rem; }
      .smallMuted { color: var(--muted); font-size: .82rem; }
      @media (max-width: 1000px) { .advancedWrap, .mindMapBox { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function injectPanels() {
    if (el(PANEL_ID)) return;
    const root = el("analyticsAdvancedRoot");
    if (!root) return;
    const section = document.createElement("section");
    section.id = PANEL_ID;
    section.className = "advancedWrap";
    section.innerHTML = `
      <section class="panel">
        <div class="sectionHeader"><h2>Vývoj agend v čase</h2><button id="refreshTrend" class="button small secondary">Obnovit</button></div>
        <div id="topicEvolution"></div>
      </section>
      <section class="panel">
        <div class="sectionHeader"><h2>Pozor: může zapadnout</h2><button id="refreshForgotten" class="button small secondary">Obnovit</button></div>
        <div id="forgottenItems"></div>
      </section>
      <section class="panel advancedFull">
        <div class="sectionHeader"><h2>Timeline agendy</h2><button id="copyTimelinePrompt" class="button small secondary">Kopírovat prompt</button></div>
        <div class="timelineControls"><label>Agenda<select id="timelineAgenda"></select></label></div>
        <div id="agendaTimeline"></div>
      </section>
      <section class="panel advancedFull">
        <div class="sectionHeader"><h2>Mind mapa témat</h2><button id="copyMindMap" class="button small secondary">Kopírovat Mermaid</button></div>
        <p class="hint">Mind mapa je generovaná z aktuálně vyfiltrovaných záznamů: agenda → typ záznamu → konkrétní záznam.</p>
        <div class="mindMapBox"><div id="mindTree" class="mindTree"></div><textarea id="mermaidMindmap" class="mermaidText" readonly></textarea></div>
      </section>
    `;
    root.appendChild(section);
    el("refreshTrend").addEventListener("click", renderAdvancedPanels);
    el("refreshForgotten").addEventListener("click", renderAdvancedPanels);
    el("timelineAgenda").addEventListener("change", renderTimeline);
    el("copyMindMap").addEventListener("click", async () => copyText(el("mermaidMindmap").value, "copyMindMap", "Zkopírováno"));
    el("copyTimelinePrompt").addEventListener("click", copyTimelinePrompt);
  }

  function agendasFrom(data) {
    return [...new Set(data.map(r => n(r.agenda) || "Nezařazeno"))].sort((a, b) => a.localeCompare(b, "cs"));
  }

  function renderTopicEvolution() {
    const data = allRecordsForCurrentPeriod();
    const now = new Date();
    const rows = agendasFrom(data).map(agenda => {
      const items = data.filter(r => (n(r.agenda) || "Nezařazeno") === agenda);
      const last7 = items.filter(r => daysAgo(getDate(r)) <= 7).length;
      const prev7 = items.filter(r => { const age = daysAgo(getDate(r)); return age > 7 && age <= 14; }).length;
      const last30 = items.filter(r => daysAgo(getDate(r)) <= 30).length;
      const risks = items.filter(isRisk).length;
      const open = items.filter(r => !isClosed(r)).length;
      const diff = last7 - prev7;
      const trend = diff > 0 ? "roste" : diff < 0 ? "klesá" : "stabilní";
      return { agenda, last7, prev7, last30, risks, open, diff, trend };
    }).sort((a, b) => b.last30 - a.last30 || b.last7 - a.last7 || a.agenda.localeCompare(b.agenda, "cs"));

    const box = el("topicEvolution");
    if (!rows.length) { box.innerHTML = `<p class="hint">Zatím nejsou data pro vývoj agend.</p>`; return; }
    box.innerHTML = `<table class="trendTable"><thead><tr><th>Agenda</th><th>7 dní</th><th>Předchozích 7</th><th>30 dní</th><th>Otevřené</th><th>Rizika</th><th>Trend</th></tr></thead><tbody>${rows.map(r => {
      const cls = r.diff > 0 ? "trendUp" : r.diff < 0 ? "trendDown" : "trendFlat";
      const sign = r.diff > 0 ? "+" : "";
      return `<tr onclick="setAgendaFilter('${escapeJs(r.agenda)}')" title="Filtrovat agendu"><td><strong>${html(r.agenda)}</strong></td><td>${r.last7}</td><td>${r.prev7}</td><td>${r.last30}</td><td>${r.open}</td><td>${r.risks}</td><td class="${cls}">${html(r.trend)} <span class="smallMuted">(${sign}${r.diff})</span></td></tr>`;
    }).join("")}</tbody></table>`;
  }

  function forgottenScore(r) {
    let score = 0;
    const age = daysAgo(getDate(r));
    if (age > 7) score += 2;
    if (["nové", "k roztřídění"].includes(l(r.stav))) score += 3;
    if (!n(r.kam_patri) || l(r.kam_patri) === "nezařazeno") score += 2;
    if (!n(r.shrnuti)) score += 1;
    if (["vysoká", "kritická"].includes(l(r.priorita))) score += 3;
    if (isRisk(r) && !isClosed(r)) score += 3;
    return score;
  }

  function renderForgotten() {
    const items = visibleRecords()
      .map(r => ({ r, score: forgottenScore(r), age: Math.floor(daysAgo(getDate(r))) }))
      .filter(x => x.score >= 4 && !isClosed(x.r))
      .sort((a, b) => b.score - a.score || b.age - a.age)
      .slice(0, 12);
    const box = el("forgottenItems");
    if (!items.length) { box.innerHTML = `<p class="hint">Nic kritického nevypadá jako zapadlé podle aktuálních pravidel.</p>`; return; }
    box.innerHTML = `<div class="forgottenList">${items.map(({ r, score, age }) => `<div class="forgottenItem"><strong>${html(r.title || r.predmet || "Bez názvu")}</strong><span class="smallMuted">${html(r.agenda || "Nezařazeno")} · ${age} dní · skóre ${score} · stav: ${html(r.stav || "")}</span><div>${html(r.shrnuti || firstWordsSafe(r.text, 28) || "Bez shrnutí")}</div></div>`).join("")}</div>`;
  }

  function populateTimelineAgenda() {
    const select = el("timelineAgenda");
    if (!select) return;
    const current = select.value;
    const agendas = agendasFrom(allRecordsForCurrentPeriod());
    select.innerHTML = agendas.map(a => `<option>${html(a)}</option>`).join("");
    select.value = agendas.includes(current) ? current : (agendas[0] || "");
  }

  function renderTimeline() {
    const agenda = el("timelineAgenda")?.value;
    const items = allRecordsForCurrentPeriod()
      .filter(r => !agenda || (n(r.agenda) || "Nezařazeno") === agenda)
      .sort((a, b) => (getDate(a) || 0) - (getDate(b) || 0));
    const box = el("agendaTimeline");
    if (!agenda || !items.length) { box.innerHTML = `<p class="hint">Vyberte agendu s alespoň jedním záznamem.</p>`; return; }
    box.innerHTML = `<div class="timeline">${items.map(r => `<div class="timelineItem"><strong>${fmt(getDate(r))} – ${html(r.title || r.predmet || "Bez názvu")}</strong><div class="smallMuted">${html(r.typ || "")} · ${html(r.stav || "")} · ${html(r.kam_patri || "")}</div><div>${html(r.shrnuti || firstWordsSafe(r.text, 32) || "Bez shrnutí")}</div></div>`).join("")}</div>`;
  }

  function buildMindMapData() {
    const tree = {};
    visibleRecords().forEach(r => {
      const agenda = n(r.agenda) || "Nezařazeno";
      const type = n(r.typ) || "Bez typu";
      tree[agenda] ||= {};
      tree[agenda][type] ||= [];
      tree[agenda][type].push(r);
    });
    return tree;
  }

  function safeMermaidLabel(s) {
    return n(s).replace(/[\[\](){}:]/g, " ").replace(/\s+/g, " ").slice(0, 80) || "bez názvu";
  }

  function renderMindMap() {
    const tree = buildMindMapData();
    const agendas = Object.keys(tree).sort((a, b) => a.localeCompare(b, "cs"));
    const mermaid = ["mindmap", "  root((Agenda))"];
    const htmlParts = [`<ul><li><strong>Agenda</strong><ul>`];
    agendas.forEach(agenda => {
      mermaid.push(`    ${safeMermaidLabel(agenda)}`);
      htmlParts.push(`<li><strong>${html(agenda)}</strong><ul>`);
      Object.keys(tree[agenda]).sort((a, b) => a.localeCompare(b, "cs")).forEach(type => {
        mermaid.push(`      ${safeMermaidLabel(type)}`);
        htmlParts.push(`<li>${html(type)} <span class="smallMuted">(${tree[agenda][type].length})</span><ul>`);
        tree[agenda][type].slice(0, 8).forEach(r => {
          mermaid.push(`        ${safeMermaidLabel(r.title || r.predmet || "Bez názvu")}`);
          htmlParts.push(`<li>${html(r.title || r.predmet || "Bez názvu")}</li>`);
        });
        if (tree[agenda][type].length > 8) htmlParts.push(`<li class="smallMuted">… a další ${tree[agenda][type].length - 8}</li>`);
        htmlParts.push(`</ul></li>`);
      });
      htmlParts.push(`</ul></li>`);
    });
    htmlParts.push(`</ul></li></ul>`);
    el("mindTree").innerHTML = htmlParts.join("");
    el("mermaidMindmap").value = mermaid.join("\n");
  }

  function firstWordsSafe(text, count) {
    const words = n(text).split(/\s+/).filter(Boolean);
    return words.slice(0, count).join(" ") + (words.length > count ? "…" : "");
  }

  function escapeJs(s) {
    return n(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function copyText(text, buttonId, label) {
    await navigator.clipboard.writeText(text || "");
    const b = el(buttonId);
    if (!b) return;
    const original = b.textContent;
    b.textContent = label;
    setTimeout(() => b.textContent = original, 1200);
  }

  function copyTimelinePrompt() {
    const agenda = el("timelineAgenda")?.value || "";
    const items = allRecordsForCurrentPeriod().filter(r => !agenda || (n(r.agenda) || "Nezařazeno") === agenda);
    const text = `Z těchto záznamů vytvoř stručnou evoluci tématu/agendy „${agenda}“: co se nejdříve objevilo, jak se téma vyvíjelo, jaká jsou otevřená rozhodnutí, rizika a další kroky. Drž se pouze záznamů.\n\n` + items.map((r, i) => `[${i + 1}] ${fmt(getDate(r))} – ${r.title || r.predmet || "Bez názvu"}\nAgenda: ${r.agenda || ""}\nTyp: ${r.typ || ""}\nStav: ${r.stav || ""}\nKam patří: ${r.kam_patri || ""}\nShrnutí: ${r.shrnuti || ""}\nText: ${r.text || ""}`).join("\n---\n");
    copyText(text, "copyTimelinePrompt", "Zkopírováno");
  }

  function renderAdvancedPanels() {
    if (!el(PANEL_ID)) return;
    populateTimelineAgenda();
    renderTopicEvolution();
    renderForgotten();
    renderTimeline();
    renderMindMap();
  }

  window.renderAdvancedPanels = renderAdvancedPanels;

  function init() {
    injectStyles();
    injectPanels();
    renderAdvancedPanels();
    // Re-render after the main dashboard finishes async loading and after user interactions.
    setTimeout(renderAdvancedPanels, 300);
    document.addEventListener("click", () => setTimeout(renderAdvancedPanels, 80));
    document.addEventListener("input", () => setTimeout(renderAdvancedPanels, 80));
    document.addEventListener("kb:topics-tab-changed", (e) => {
      if (e.detail?.tab === "analysis") setTimeout(renderAdvancedPanels, 60);
    });
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "temata" && (e.detail?.topicsTab === "analysis" || el("topicsTabAnalysis") && !el("topicsTabAnalysis").hidden)) {
        setTimeout(renderAdvancedPanels, 60);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
