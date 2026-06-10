// Modul AI poradce v1 — dotazy nad daty aplikace, zdroje, uložené spojení.

(function () {
  const STORAGE_KEY = "kb-dashboard-ai-advisor-v1";

  const PRESET_QUERIES = [
  { tags: ["PČR", "kyber"], text: "Která témata PČR se týkají kyberbezpečnosti nebo IT infrastruktury?" },
  { tags: ["PČR", "gestor"], text: "Kdo jsou gestoři výzkumných směrů PČR z fakulty FIM?" },
  { tags: ["Termíny"], text: "Jaké termíny sběru dat jsou po lhůtě nebo brzy končí?" },
  { tags: ["Soutěže"], text: "Které projekty Prestige jsou podpořené?" },
  { tags: ["Osoby"], text: "Najdi osoby z katedry nebo fakulty podle e-mailu @uhk.cz" },
  { tags: ["Témata"], text: "Jaká témata v aplikaci mají nejvíc propojených e-mailů?" }
  ];

  let messages = [];
  let savedQueries = [];
  let savedFindings = [];
  let loading = false;
  let useAi = true;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `adv-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadStore() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      savedQueries = Array.isArray(data.savedQueries) ? data.savedQueries : [];
      savedFindings = Array.isArray(data.savedFindings) ? data.savedFindings : [];
    } catch (_) {
      savedQueries = [];
      savedFindings = [];
    }
  }

  function persistStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedQueries, savedFindings }, null, 2));
  }

  function buildAiSystemPrompt() {
    return [
      "Jsi AI poradce KB Dashboardu UHK (Oddělení vědy a výzkumu).",
      "Odpovídej POUZE podle dodaného kontextu z aplikace — nevymýšlej fakta mimo něj.",
      "Pokud kontext nestačí, napiš to otevřeně a navrhni upřesnění dotazu.",
      "Cituj zdroje jako [1], [2] podle čísel v kontextu.",
      "Piš stručně, česky, odborně srozumitelně.",
      "Moduly publikací a aplikovaných výsledků zatím nemusí být naplněné — neuváděj je, pokud v kontextu nejsou."
    ].join(" ");
  }

  function formatContextForAi(chunks) {
    if (!chunks.length) return "Kontext: (žádné relevantní záznamy v aplikaci)";
    return chunks.map((c, i) => `[${i + 1}] ${c.sourceLabel}: ${c.title}\n${c.text}`).join("\n\n");
  }

  async function askAi(query, chunks) {
    if (!window.kbAiClassify?.hasApiKey?.()) {
      throw new Error("Pro AI shrnutí nastavte API klíč v Nastavení → AI klasifikace.");
    }
    const userContent = `Dotaz uživatele:\n${query}\n\n---\nKontext z aplikace:\n${formatContextForAi(chunks)}`;
    return window.kbAiClassify.callChat([
      { role: "system", content: buildAiSystemPrompt() },
      { role: "user", content: userContent }
    ]);
  }

  function fallbackAnswer(query, chunks) {
    if (!chunks.length) {
      return "V aplikaci jsem nenašel relevantní záznamy. Zkuste jiná klíčová slova, ověřte filtry v modulech, nebo doplňte data (Osoby, PČR, Termíny…).";
    }
    const lines = chunks.slice(0, 6).map((c, i) =>
      `[${i + 1}] **${c.title}** (${c.sourceLabel}) — ${c.text.slice(0, 140)}${c.text.length > 140 ? "…" : ""}`
    );
    return `Našel jsem ${chunks.length} záznamů pro „${query}“:\n\n${lines.join("\n\n")}\n\n${window.kbAiClassify?.hasApiKey?.() ? "Zapněte AI shrnutí pro souhrnnou odpověď." : "Nastavte API klíč pro AI shrnutí odpovědi."}`;
  }

  async function runQuery(queryText) {
    const query = n(queryText);
    if (!query) return;

    loading = true;
    render();
    messages.push({ id: uuid(), role: "user", text: query, at: new Date().toISOString() });

    try {
      await Promise.all([
        window.kbPersons?.ensureLoaded?.(),
        window.kbDeadlines?.loadDeadlines?.(),
        window.kbPcrResearch?.loadTopics?.(),
        window.kbEizTokens?.loadData?.(),
        window.kbCompetitions?.loadCompetitions?.(),
        window.kbTopics?.loadTopics?.()
      ].map((p) => Promise.resolve(p).catch(() => {})));

      const chunks = window.kbAdvisorKnowledge?.search?.(query, { limit: 14 }) || [];
      let answer;
      let aiUsed = false;
      if (useAi && window.kbAiClassify?.hasApiKey?.()) {
        try {
          answer = await askAi(query, chunks);
          aiUsed = true;
        } catch (aiErr) {
          answer = `${fallbackAnswer(query, chunks)}\n\n_(AI shrnutí selhalo: ${aiErr.message || aiErr})_`;
        }
      } else {
        answer = fallbackAnswer(query, chunks);
      }

      messages.push({
        id: uuid(),
        role: "assistant",
        text: answer,
        sources: chunks,
        aiUsed,
        query,
        at: new Date().toISOString()
      });
    } catch (err) {
      messages.push({
        id: uuid(),
        role: "assistant",
        text: `Chyba: ${err.message || err}`,
        sources: [],
        at: new Date().toISOString()
      });
    } finally {
      loading = false;
      render();
    }
  }

  function saveQuery(text) {
    const q = n(text);
    if (!q) return;
    if (savedQueries.some((s) => l(s.text) === l(q))) return;
    savedQueries.unshift({ id: uuid(), text: q, tags: [], created_at: new Date().toISOString() });
    savedQueries = savedQueries.slice(0, 40);
    persistStore();
    render();
  }

  function saveFinding(message) {
    if (!message?.sources?.length) return;
    savedFindings.unshift({
      id: uuid(),
      query: message.query || "",
      answer: message.text,
      sources: message.sources.map((s) => ({ id: s.id, title: s.title, sourceLabel: s.sourceLabel, link: s.link })),
      created_at: new Date().toISOString()
    });
    savedFindings = savedFindings.slice(0, 50);
    persistStore();
    render();
  }

  function l(s) {
    return n(s).toLowerCase();
  }

  function renderSourceCards(chunks) {
    if (!chunks?.length) return "";
    return `<div class="advisorSources">${chunks.map((c, i) => `
      <article class="advisorSourceCard">
        <span class="advisorSourceNum">${i + 1}</span>
        <div>
          <strong>${html(c.title)}</strong>
          <div class="hint">${html(c.sourceLabel)}</div>
          <p>${html(c.text.slice(0, 180))}${c.text.length > 180 ? "…" : ""}</p>
          <button type="button" class="button small secondary advisorOpenSource" data-link="${html(c.link)}" data-record="${html(c.meta?.recordId || "")}">Otevřít v modulu</button>
        </div>
      </article>`).join("")}</div>`;
  }

  function renderIndexStats() {
    const { stats } = window.kbAdvisorKnowledge?.buildIndex?.() || { stats: {} };
    return Object.values(stats || {}).map((s) =>
      `<span class="advisorStat ${s.status === "planned" ? "advisorStatPlanned" : ""}" title="${s.status === "planned" ? "Připraveno pro Fázi 2" : ""}">${html(s.label)}: <strong>${s.count}</strong>${s.status === "planned" ? " ⏳" : ""}</span>`
    ).join("");
  }

  function renderMessages() {
    if (!messages.length) {
      return `<div class="advisorEmpty">
        <p><strong>Zeptejte se na data v aplikaci</strong></p>
        <p class="hint">Poradce prohledá Osoby, Termíny, PČR témata, soutěže, témata a e-maily. Odpověď vychází jen z nalezených záznamů.</p>
      </div>`;
    }
    return `<div class="advisorChat">${messages.map((m) => {
      if (m.role === "user") {
        return `<div class="advisorMsg advisorMsgUser"><div class="advisorBubble">${html(m.text)}</div></div>`;
      }
      return `<div class="advisorMsg advisorMsgBot">
        <div class="advisorBubble">${m.aiUsed ? "" : "<span class='advisorBadge'>Vyhledávání</span>"}${m.aiUsed ? "<span class='advisorBadge advisorBadgeAi'>AI</span>" : ""}
          <div class="advisorAnswer">${formatAnswerHtml(m.text)}</div>
          ${renderSourceCards(m.sources)}
          ${m.sources?.length ? `<button type="button" class="button small secondary advisorSaveFinding" data-msg-id="${html(m.id)}">Uložit spojení</button>` : ""}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function formatAnswerHtml(text) {
    return html(text).replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
  }

  function renderSidebar() {
    const presets = PRESET_QUERIES.map((p) =>
      `<button type="button" class="advisorPresetBtn" data-query="${html(p.text)}">${html(p.tags.join(" · "))}<span>${html(p.text)}</span></button>`
    ).join("");
    const saved = savedQueries.map((q) =>
      `<button type="button" class="advisorSavedBtn" data-query="${html(q.text)}" title="Uložený dotaz">${html(q.text)}</button>`
    ).join("");
    const findings = savedFindings.slice(0, 8).map((f) =>
      `<div class="advisorFindingItem"><strong>${html(f.query)}</strong><p class="hint">${html(f.sources?.map((s) => s.title).slice(0, 2).join("; ") || "")}</p></div>`
    ).join("");

    return `
      <aside class="advisorSidebar panel">
        <h3>Šablony dotazů</h3>
        <div class="advisorPresetList">${presets}</div>
        <h3>Uložené dotazy</h3>
        ${saved ? `<div class="advisorSavedList">${saved}</div>` : `<p class="hint">Uložte dotaz tlačítkem u pole níže.</p>`}
        <h3>Uložená spojení</h3>
        ${findings ? `<div class="advisorFindingsList">${findings}</div>` : `<p class="hint">Po odpovědi uložte spojení záznamů.</p>`}
        <h3>Zdroje dat (v1)</h3>
        <div class="advisorStats">${renderIndexStats()}</div>
        <p class="hint advisorPhaseHint">Fáze 2: publikace, aplikované výsledky, hodnotící kritéria, tématizace.</p>
      </aside>`;
  }

  function render() {
    const root = el("aiAdvisorRoot");
    if (!root) return;
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>AI poradce</h2>
            <p class="hint">Dotazy nad daty KB Dashboardu — odpovědi jen z modulů aplikace. ${window.kbAiClassify?.hasApiKey?.() ? "API klíč je nastaven." : "Bez API klíče funguje vyhledávání záznamů; shrnutí nastavte v <a href=\"#nastaveni\" data-goto=\"nastaveni\">Nastavení</a>."}</p>
          </div>
        </div>
        <div class="advisorLayout">
          ${renderSidebar()}
          <div class="advisorMain panel">
            ${renderMessages()}
            <form id="advisorForm" class="advisorForm">
              <label class="advisorAiToggle">
                <input type="checkbox" id="advisorUseAi" ${useAi ? "checked" : ""} ${window.kbAiClassify?.hasApiKey?.() ? "" : "disabled"} />
                AI shrnutí odpovědi (jen z nalezených zdrojů)
              </label>
              <div class="advisorInputRow">
                <input id="advisorInput" type="text" placeholder="Např. Kdo řeší kyberbezpečnost u PČR? Které termíny jsou po lhůtě?" ${loading ? "disabled" : ""} />
                <button type="submit" class="button accent" ${loading ? "disabled" : ""}>Zeptat se</button>
                <button type="button" id="advisorSaveQueryBtn" class="button small secondary" title="Uložit text dotazu">Uložit dotaz</button>
              </div>
            </form>
          </div>
        </div>
      </section>`;

    el("advisorForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = el("advisorInput");
      const q = input?.value;
      if (input) input.value = "";
      runQuery(q);
    });
    el("advisorUseAi")?.addEventListener("change", (e) => {
      useAi = e.target.checked;
    });
    el("advisorSaveQueryBtn")?.addEventListener("click", () => {
      const q = el("advisorInput")?.value;
      if (q) { saveQuery(q); setStatusHint("Dotaz uložen."); }
    });
    root.querySelectorAll("[data-query]").forEach((btn) => {
      btn.addEventListener("click", () => runQuery(btn.dataset.query));
    });
    root.querySelectorAll(".advisorSaveFinding").forEach((btn) => {
      btn.addEventListener("click", () => {
        const msg = messages.find((m) => m.id === btn.dataset.msgId);
        saveFinding(msg);
        setStatusHint("Spojení uloženo.");
      });
    });
    root.querySelectorAll(".advisorOpenSource").forEach((btn) => {
      btn.addEventListener("click", () => {
        const link = btn.dataset.link;
        const recordId = btn.dataset.record;
        if (link) window.kbLayout?.setActivePage?.(link.replace("#", ""));
        if (recordId && typeof window.openRecord === "function") {
          setTimeout(() => window.openRecord(recordId), 200);
        }
      });
    });
    root.querySelectorAll("[data-goto]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.kbLayout?.setActivePage?.(a.dataset.goto);
      });
    });
    const chat = root.querySelector(".advisorChat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function setStatusHint(text) {
    const box = el("advisorStatusHint");
    if (box) box.textContent = text;
  }

  function injectStyles() {
    if (el("advisorStyles")) return;
    const style = document.createElement("style");
    style.id = "advisorStyles";
    style.textContent = `
      .advisorLayout { display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); gap: 1rem; align-items: start; }
      .advisorSidebar { position: sticky; top: 5rem; max-height: calc(100vh - 6rem); overflow: auto; }
      .advisorSidebar h3 { margin: 1rem 0 .45rem; font-size: .92rem; }
      .advisorSidebar h3:first-child { margin-top: 0; }
      .advisorPresetList, .advisorSavedList { display: grid; gap: .4rem; }
      .advisorPresetBtn, .advisorSavedBtn {
        border: 1px solid var(--line); background: white; border-radius: 10px; padding: .5rem .6rem;
        text-align: left; cursor: pointer; font-size: .82rem;
      }
      .advisorPresetBtn span, .advisorSavedBtn { display: block; color: var(--text); margin-top: .15rem; }
      .advisorPresetBtn:hover, .advisorSavedBtn:hover { border-color: var(--accent); background: #f8fafc; }
      .advisorFindingsList { display: grid; gap: .45rem; }
      .advisorFindingItem { padding: .45rem .55rem; border: 1px solid var(--line); border-radius: 8px; background: #f8fafc; font-size: .82rem; }
      .advisorStats { display: flex; flex-wrap: wrap; gap: .35rem; }
      .advisorStat { font-size: .75rem; padding: .2rem .45rem; background: #eef2ff; border-radius: 999px; }
      .advisorStatPlanned { background: #f2f4f7; color: var(--muted); }
      .advisorPhaseHint { margin-top: .75rem; font-size: .78rem; }
      .advisorMain { min-width: 0; display: flex; flex-direction: column; min-height: 420px; }
      .advisorChat { flex: 1; overflow: auto; max-height: 55vh; padding: .25rem 0 1rem; display: grid; gap: .75rem; }
      .advisorMsg { display: flex; }
      .advisorMsgUser { justify-content: flex-end; }
      .advisorBubble { max-width: 92%; padding: .7rem .85rem; border-radius: 12px; font-size: .9rem; line-height: 1.5; }
      .advisorMsgUser .advisorBubble { background: var(--accent); color: white; }
      .advisorMsgBot .advisorBubble { background: #f8fafc; border: 1px solid var(--line); }
      .advisorBadge { display: inline-block; font-size: .7rem; font-weight: 800; padding: .1rem .4rem; border-radius: 999px; background: #e4e7ec; margin-bottom: .35rem; }
      .advisorBadgeAi { background: #dbeafe; color: #1d4ed8; }
      .advisorSources { display: grid; gap: .45rem; margin-top: .65rem; }
      .advisorSourceCard { display: grid; grid-template-columns: auto 1fr; gap: .5rem; padding: .5rem; border: 1px solid var(--line); border-radius: 8px; background: white; font-size: .82rem; }
      .advisorSourceNum { font-weight: 800; color: var(--accent); }
      .advisorSourceCard p { margin: .25rem 0; color: var(--muted); }
      .advisorForm { border-top: 1px solid var(--line); padding-top: .75rem; margin-top: auto; }
      .advisorAiToggle { display: flex; align-items: center; gap: .4rem; font-size: .84rem; margin-bottom: .45rem; }
      .advisorInputRow { display: flex; flex-wrap: wrap; gap: .5rem; }
      .advisorInputRow input { flex: 1; min-width: 200px; }
      .advisorEmpty { padding: 2rem 1rem; text-align: center; color: var(--muted); }
      @media (max-width: 900px) { .advisorLayout { grid-template-columns: 1fr; } .advisorSidebar { position: static; max-height: none; } }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("aiAdvisorPageRoot");
    if (!host || el("aiAdvisorRoot")) return;
    host.innerHTML = `<div id="aiAdvisorRoot"></div><p id="advisorStatusHint" class="hint"></p>`;
  }

  function init() {
    loadStore();
    injectStyles();
    injectPage();
    render();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "ai-poradce") render();
    });
  }

  window.kbAiAdvisor = {
    runQuery,
    search: (q) => window.kbAdvisorKnowledge?.search?.(q),
    getSavedQueries: () => savedQueries.slice(),
    getSavedFindings: () => savedFindings.slice()
  };

  document.addEventListener("DOMContentLoaded", init);
})();
