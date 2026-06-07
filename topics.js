// Topic management for KB Dashboard
// Groups emails into topics, exports AI prompts, stores synthesized summaries.

(function () {
  const TOPICS_KEY = "kb-dashboard-topics-v1";
  const TOPIC_FILTER_KEY = "kb-dashboard-topic-filter-v1";
  let topics = [];

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `topic-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function getRecords() {
    return Array.isArray(records) ? records : [];
  }

  function getRecordId(r) {
    if (window.kbSelection?.getRecordId) return window.kbSelection.getRecordId(r);
    return r?.id || r?.kb_id || r?.KB_ID || "";
  }

  function getSelectedRecords() {
    if (window.kbSelection?.getSelectedRecords) return window.kbSelection.getSelectedRecords();
    return [];
  }

  let topicsUseSupabase = false;
  let topicsLoading = false;

  function loadTopicsLocal() {
    try {
      topics = JSON.parse(localStorage.getItem(TOPICS_KEY) || "[]");
    } catch (_) {
      topics = [];
    }
    if (!Array.isArray(topics)) topics = [];
  }

  async function loadTopics() {
    if (!window.kbSupabaseTopics) {
      loadTopicsLocal();
      return;
    }
    topicsLoading = true;
    renderTopicsPanel();
    try {
      const available = await window.kbSupabaseTopics.probeTables();
      if (!available) {
        topicsUseSupabase = false;
        loadTopicsLocal();
        return;
      }
      topicsUseSupabase = true;
      await window.kbSupabaseTopics.migrateLocalTopicsIfNeeded();
      topics = await window.kbSupabaseTopics.loadTopicsFromSupabase();
    } catch (error) {
      console.error(error);
      topicsUseSupabase = false;
      loadTopicsLocal();
    } finally {
      topicsLoading = false;
      renderTopicsPanel();
      populateTopicFilter();
    }
  }

  async function persistTopic(topic) {
    if (topicsUseSupabase && window.kbSupabaseTopics) {
      return window.kbSupabaseTopics.saveTopicToSupabase(topic);
    }
    const idx = topics.findIndex(t => t.id === topic.id);
    if (idx === -1) topics.unshift(topic);
    else topics[idx] = { ...topics[idx], ...topic };
    localStorage.setItem(TOPICS_KEY, JSON.stringify(topics, null, 2));
    return idx === -1 ? topics[0] : topics[idx];
  }

  function getTopic(id) {
    return topics.find(t => t.id === id) || null;
  }

  function topicRecordCount(topic) {
    return (topic?.recordIds || []).filter(id => getRecords().some(r => getRecordId(r) === id)).length;
  }

  function recordsForTopic(topicId) {
    const topic = getTopic(topicId);
    if (!topic) return [];
    const ids = new Set(topic.recordIds || []);
    return getRecords().filter(r => ids.has(getRecordId(r)));
  }

  async function addRecordsToTopic(topicId, recordIds) {
    const topic = getTopic(topicId);
    if (!topic) return false;
    const set = new Set(topic.recordIds || []);
    recordIds.forEach(id => { if (id) set.add(id); });
    topic.recordIds = [...set];
    topic.updated_at = new Date().toISOString();
    topic.__existing = true;
    const saved = await persistTopic(topic);
    const idx = topics.findIndex(t => t.id === topicId);
    if (idx >= 0) topics[idx] = { ...topics[idx], ...saved };
    return true;
  }

  async function removeRecordFromTopic(topicId, recordId) {
    const topic = getTopic(topicId);
    if (!topic) return;
    topic.recordIds = (topic.recordIds || []).filter(id => id !== recordId);
    topic.updated_at = new Date().toISOString();
    topic.__existing = true;
    const saved = await persistTopic(topic);
    const idx = topics.findIndex(t => t.id === topicId);
    if (idx >= 0) topics[idx] = { ...topics[idx], ...saved };
  }

  async function saveTopicForm() {
    const id = el("topicEditId").value || uuid();
    const existing = getTopic(id);
    const payload = {
      id,
      name: n(el("topicName").value) || "Bez názvu",
      agenda: n(el("topicAgenda").value),
      description: n(el("topicDescription").value),
      ai_summary: n(el("topicAiSummary").value),
      recordIds: existing?.recordIds || [],
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ai_summary_updated_at: existing?.ai_summary_updated_at || null,
      __existing: !!existing
    };
    if (n(el("topicAiSummary").value) !== n(existing?.ai_summary)) {
      payload.ai_summary_updated_at = new Date().toISOString();
    }
    const btn = el("saveTopicBtn");
    const prev = btn?.textContent;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = topicsUseSupabase ? "Ukládám do Supabase…" : "Ukládám…";
      }
      const saved = await persistTopic(payload);
      const idx = topics.findIndex(t => t.id === id);
      if (idx === -1) topics.unshift(saved);
      else topics[idx] = { ...topics[idx], ...saved };
      el("topicEditId").value = saved.id;
      renderTopicsPanel();
      renderTopicRecordsList(saved.id);
      if (typeof render === "function") render();
    } catch (error) {
      console.error(error);
      alert("Téma se nepodařilo uložit: " + (error.message || error));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "Uložit téma";
      }
    }
  }

  async function deleteTopic() {
    const id = el("topicEditId").value;
    if (!id || !confirm("Opravdu smazat toto téma? E-maily zůstanou v databázi.")) return;
    try {
      if (topicsUseSupabase && window.kbSupabaseTopics) {
        await window.kbSupabaseTopics.deleteTopicFromSupabase(id);
      }
      topics = topics.filter(t => t.id !== id);
      if (!topicsUseSupabase) localStorage.setItem(TOPICS_KEY, JSON.stringify(topics, null, 2));
      if (el("topicFilter")?.value === id) {
        el("topicFilter").value = "";
        localStorage.removeItem(TOPIC_FILTER_KEY);
      }
      el("topicDialog").close();
      renderTopicsPanel();
      if (typeof render === "function") render();
    } catch (error) {
      console.error(error);
      alert("Téma se nepodařilo smazat: " + (error.message || error));
    }
  }

  function openTopicDialog(topicId) {
    const topic = topicId ? getTopic(topicId) : null;
    el("topicEditId").value = topic?.id || "";
    el("topicDialogTitle").textContent = topic ? `Téma: ${topic.name}` : "Nové téma";
    el("topicName").value = topic?.name || "";
    if (typeof setSelectField === "function") setSelectField("topicAgenda", topic?.agenda);
    else el("topicAgenda").value = topic?.agenda || "";
    el("topicDescription").value = topic?.description || "";
    el("topicAiSummary").value = topic?.ai_summary || "";
    renderTopicRecordsList(topic?.id);
    el("topicDialog").showModal();
  }

  function renderTopicRecordsList(topicId) {
    const box = el("topicRecordsList");
    if (!box) return;
    if (!topicId) {
      box.innerHTML = `<p class="hint">Po uložení tématu můžete přiřadit e-maily z výběru.</p>`;
      return;
    }
    const items = recordsForTopic(topicId);
    if (!items.length) {
      box.innerHTML = `<p class="hint">Téma zatím nemá přiřazené e-maily. Vyberte záznamy a použijte „Přidat k tématu“.</p>`;
      return;
    }
    box.innerHTML = `<div class="topicRecords">${items.map(r => {
      const rid = getRecordId(r);
      return `<div class="topicRecordItem">
        <div><strong>${html(r.title || r.predmet || "Bez názvu")}</strong>
        <div class="smallMuted">${html(r.agenda || "")} · ${html(r.stav || "")}</div>
        <div>${html(r.shrnuti || "Bez shrnutí")}</div></div>
        <button type="button" class="button small secondary" data-remove-topic-record="${html(rid)}">Odebrat</button>
      </div>`;
    }).join("")}</div>`;
    box.querySelectorAll("[data-remove-topic-record]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await removeRecordFromTopic(topicId, btn.dataset.removeTopicRecord);
        renderTopicRecordsList(topicId);
        renderTopicsPanel();
        if (typeof render === "function") render();
      });
    });
  }

  function renderTopicsPanel() {
    const list = el("topicsList");
    if (!list) return;
    if (topicsLoading) {
      list.innerHTML = `<p class="hint">Načítám témata${topicsUseSupabase ? " ze Supabase" : ""}…</p>`;
      return;
    }
    if (!topics.length) {
      const setupHint = topicsUseSupabase
        ? "Zatím žádná témata. Vytvořte první téma — uloží se trvale do Supabase."
        : "Zatím žádná témata. Pro trvalé uložení spusťte <code>supabase/topics-schema.sql</code> v Supabase SQL Editoru.";
      list.innerHTML = `<p class="hint">${setupHint}</p>`;
      return;
    }
    list.innerHTML = topics.map(t => {
      const count = topicRecordCount(t);
      const hasSummary = !!n(t.ai_summary);
      return `<button type="button" class="topicChip ${el("topicFilter")?.value === t.id ? "active" : ""}" data-topic-id="${html(t.id)}" title="${html(t.description || "")}">
        <span class="topicChipName">${html(t.name)}</span>
        <span class="topicChipMeta">${count} e-mailů${hasSummary ? " · shrnuto" : ""}</span>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-topic-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.topicId;
        const select = el("topicFilter");
        if (!select) return;
        select.value = select.value === id ? "" : id;
        localStorage.setItem(TOPIC_FILTER_KEY, select.value);
        renderTopicsPanel();
        if (typeof render === "function") render();
      });
      btn.addEventListener("dblclick", () => openTopicDialog(btn.dataset.topicId));
    });
    populateTopicFilter();
  }

  function populateTopicFilter() {
    const select = el("topicFilter");
    if (!select) return;
    const current = select.value || localStorage.getItem(TOPIC_FILTER_KEY) || "";
    select.innerHTML = `<option value="">Vše</option>` + topics.map(t =>
      `<option value="${html(t.id)}">${html(t.name)} (${topicRecordCount(t)})</option>`
    ).join("");
    select.value = topics.some(t => t.id === current) ? current : "";
  }

  function injectTopicsPanel() {
    if (el("topicsPanel")) return;
    const filters = document.querySelector(".filters");
    const reset = el("resetBtn");
    if (!filters || !reset) return;

    const section = document.createElement("section");
    section.id = "topicsPanel";
    section.className = "topicsPanel";
    section.innerHTML = `
      <div class="topicsHeader">
        <h2>Témata</h2>
        <button id="newTopicBtn" type="button" class="button small accent">+ Nové</button>
      </div>
      <p id="topicsStorageHint" class="hint">Seskupujte e-maily do témat, generujte AI shrnutí a ukládejte je k tématu.</p>
      <button id="reloadTopicsBtn" type="button" class="button small secondary full">Obnovit témata</button>
      <label>Téma ve filtru
        <select id="topicFilter"><option value="">Vše</option></select>
      </label>
      <div id="topicsList" class="topicsList"></div>
    `;
    filters.insertBefore(section, reset);
    el("newTopicBtn").addEventListener("click", () => openTopicDialog());
    el("reloadTopicsBtn").addEventListener("click", () => loadTopics());
    el("topicFilter").addEventListener("change", (e) => {
      localStorage.setItem(TOPIC_FILTER_KEY, e.target.value);
      renderTopicsPanel();
      if (typeof render === "function") render();
    });
  }

  function injectTopicDialog() {
    if (el("topicDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "topicDialog";
    dialog.innerHTML = `
      <form method="dialog" id="topicForm">
        <div class="dialogHeader">
          <h2 id="topicDialogTitle">Téma</h2>
          <button class="iconButton" value="cancel">×</button>
        </div>
        <input type="hidden" id="topicEditId" />
        <label>Název tématu
          <input id="topicName" required placeholder="např. Prestige 2026 – komunikace výsledků" />
        </label>
        <label>Navázaná agenda
          <select id="topicAgenda">
            <option value="">— vyberte —</option>
            <option>Nezařazeno</option><option>Věda a výzkum</option><option>Interní granty</option><option>Prestige</option>
            <option>ReGa</option><option>Connect</option><option>Návraty</option><option>DKRVO</option>
            <option>Bezpečnost výzkumu</option><option>Open Science</option><option>Doktorské studium</option>
            <option>Mezinárodní projekty</option><option>Transfer znalostí</option><option>Univerzitní knihovna</option>
            <option>Kolegium / vedení</option><option>Personální agenda</option><option>Projekty OP JAK</option>
            <option>Smlouvy / právní agenda</option><option>Rizika a konflikty</option><option>Ostatní</option>
          </select>
        </label>
        <label>Popis / kontext tématu
          <textarea id="topicDescription" rows="3" placeholder="Krátký kontext pro AI a tým…"></textarea>
        </label>
        <div class="sectionHeader compact">
          <h3>Přiřazené e-maily</h3>
          <button id="assignAllVisibleToTopicBtn" type="button" class="button small secondary">Přidat vše z filtru</button>
        </div>
        <div id="topicRecordsList"></div>
        <label>AI shrnutí tématu
          <textarea id="topicAiSummary" rows="8" placeholder="Sem vložte výstup z AI po zpracování promptu…"></textarea>
        </label>
        <div class="dialogActions">
          <button id="deleteTopicBtn" type="button" class="button danger">Smazat téma</button>
          <button id="topicAiPromptBtn" type="button" class="button secondary">AI prompt tématu</button>
          <button value="cancel" class="button secondary">Zavřít</button>
          <button id="saveTopicBtn" type="button" class="button accent">Uložit téma</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    el("saveTopicBtn").addEventListener("click", async (e) => {
      e.preventDefault();
      await saveTopicForm();
      el("topicDialog").close();
    });
    el("deleteTopicBtn").addEventListener("click", deleteTopic);
    el("topicAiPromptBtn").addEventListener("click", () => {
      const topicId = el("topicEditId").value;
      if (!topicId) {
        alert("Nejdříve uložte téma.");
        return;
      }
      showTopicAiPrompt(topicId);
    });
    el("assignAllVisibleToTopicBtn").addEventListener("click", async () => {
      const topicId = el("topicEditId").value;
      if (!topicId) {
        alert("Nejdříve uložte téma.");
        return;
      }
      const ids = (typeof filteredRecords === "function" ? filteredRecords() : getRecords())
        .map(getRecordId)
        .filter(Boolean);
      await addRecordsToTopic(topicId, ids);
      renderTopicRecordsList(topicId);
      renderTopicsPanel();
      if (typeof render === "function") render();
    });
  }

  function injectAssignDialog() {
    if (el("assignTopicDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "assignTopicDialog";
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialogHeader">
          <h2>Přidat výběr k tématu</h2>
          <button class="iconButton" value="cancel">×</button>
        </div>
        <p id="assignTopicHint" class="hint"></p>
        <label>Téma
          <select id="assignTopicSelect"></select>
        </label>
        <div class="dialogActions">
          <button value="cancel" class="button secondary">Zrušit</button>
          <button id="confirmAssignTopicBtn" type="button" class="button accent">Přiřadit</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    el("confirmAssignTopicBtn").addEventListener("click", async () => {
      const topicId = el("assignTopicSelect").value;
      const selected = getSelectedRecords();
      if (!topicId) return;
      if (!selected.length) {
        alert("Nejdříve vyberte alespoň jeden e-mail.");
        return;
      }
      await addRecordsToTopic(topicId, selected.map(getRecordId));
      el("assignTopicDialog").close();
      renderTopicsPanel();
      if (typeof render === "function") render();
      alert(`Přiřazeno ${selected.length} e-mailů k tématu.`);
    });
  }

  function formatDateValue(r) {
    if (typeof getDateValue === "function") return getDateValue(r);
    return r.datum_pridani || r.datum_emailu || "";
  }

  function buildRecordsPrompt(recordsList, options = {}) {
    const header = options.header || "Zpracuj následující e-maily ze znalostní báze.";
    const tasks = options.tasks || [
      "1. stručné shrnutí nejdůležitějšího",
      "2. hlavní rozhodnutí a otevřené body",
      "3. rizika a termíny",
      "4. doporučené další kroky",
      "5. co je vhodné zařadit na jednání"
    ];
    const lines = recordsList.map((r, i) => `
[${i + 1}] ${r.title || r.predmet || "Bez názvu"}
Datum: ${formatDateValue(r) || ""}
Odesílatel: ${r.odesilatel || ""}
Agenda: ${r.agenda || ""}
Typ: ${r.typ || ""}
Kam patří: ${r.kam_patri || ""}
Stav: ${r.stav || ""}
Priorita: ${r.priorita || ""}
Shrnutí: ${r.shrnuti || ""}
Úkol / další krok: ${r.ukol_dalsi_krok || ""}
Text:
${r.text || "(text načtěte otevřením záznamu)"}
`).join("\n---\n");

    return `${header}

Vytvoř:
${tasks.join("\n")}

U každého bodu uveď čísla záznamů. Nevymýšlej fakta mimo záznamy.

ZÁZNAMY:
${lines}`;
  }

  function buildTopicPrompt(topic) {
    const items = recordsForTopic(topic.id);
    return buildRecordsPrompt(items, {
      header: `Zpracuj e-maily k tématu „${topic.name}“. ${topic.description ? `Kontext: ${topic.description}` : ""}`,
      tasks: [
        "1. syntézu tématu v 5–8 větách",
        "2. chronologii vývoje (pokud jde vyčíst z dat)",
        "3. klíčová rozhodnutí a otevřené body",
        "4. rizika, termíny a odpovědnosti",
        "5. návrh dalších kroků a co zařadit na jednání",
        "6. stručný text vhodný jako „AI shrnutí tématu“ do interní KB"
      ]
    });
  }

  function buildSelectionPrompt(recordsList) {
    return buildRecordsPrompt(recordsList, {
      header: "Zpracuj vybrané e-maily z aktuálního výběru v dashboardu.",
      tasks: [
        "1. co je mezi vybranými e-maily nejdůležitější",
        "2. společná témata a rozdíly",
        "3. priority a rizika",
        "4. doporučené další kroky"
      ]
    });
  }

  function buildSingleRecordPrompt(r) {
    return `Analyzuj a navrhni klasifikaci pro tento e-mail ze znalostní báze.

Vrať:
1. navrženou agendu (z existujících kategorií KB),
2. typ záznamu,
3. kam patří (jednání / řešení),
4. stav a prioritu,
5. shrnutí ve 2–4 větách,
6. úkol / další krok,
7. případný navržený bod jednání.

Drž se pouze textu e-mailu.

E-MAIL:
Předmět: ${r.title || r.predmet || "Bez názvu"}
Datum: ${formatDateValue(r) || ""}
Odesílatel: ${r.odesilatel || ""}
Aktuální metadata:
Agenda: ${r.agenda || ""}
Typ: ${r.typ || ""}
Kam patří: ${r.kam_patri || ""}
Stav: ${r.stav || ""}
Shrnutí: ${r.shrnuti || ""}

Text:
${r.text || "(text zatím nenačten – otevřete záznam pro načtení ze Supabase)"}`;
  }

  function showPromptDialog(title, text) {
    let dialog = el("topicAiDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "topicAiDialog";
      dialog.innerHTML = `
        <form method="dialog">
          <div class="dialogHeader">
            <h2 id="topicAiDialogTitle">AI prompt</h2>
            <button class="iconButton" value="cancel">×</button>
          </div>
          <p class="hint">Zkopírujte do ChatGPT/Claude. Výstup můžete vložit do shrnutí tématu nebo do pole Shrnutí u e-mailu.</p>
          <textarea id="topicAiDialogText" rows="18"></textarea>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="copyTopicAiBtn" type="button" class="button accent">Kopírovat</button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);
      el("copyTopicAiBtn").addEventListener("click", async () => {
        await navigator.clipboard.writeText(el("topicAiDialogText").value);
        el("copyTopicAiBtn").textContent = "Zkopírováno";
        setTimeout(() => el("copyTopicAiBtn").textContent = "Kopírovat", 1200);
      });
    }
    el("topicAiDialogTitle").textContent = title;
    el("topicAiDialogText").value = text;
    dialog.showModal();
  }

  function showTopicAiPrompt(topicId) {
    const topic = getTopic(topicId);
    if (!topic) return;
    const items = recordsForTopic(topicId);
    if (!items.length) {
      alert("Téma nemá přiřazené e-maily.");
      return;
    }
    showPromptDialog(`AI prompt: ${topic.name}`, buildTopicPrompt(topic));
  }

  function showSelectionAiPrompt() {
    const selected = getSelectedRecords();
    if (!selected.length) {
      alert("Vyberte alespoň jeden e-mail.");
      return;
    }
    showPromptDialog(`AI shrnutí výběru (${selected.length})`, buildSelectionPrompt(selected));
  }

  function openAssignDialog() {
    const selected = getSelectedRecords();
    if (!selected.length) {
      alert("Vyberte alespoň jeden e-mail.");
      return;
    }
    if (!topics.length) {
      if (confirm("Zatím nemáte žádné téma. Vytvořit nové?")) openTopicDialog();
      return;
    }
    const select = el("assignTopicSelect");
    select.innerHTML = topics.map(t => `<option value="${html(t.id)}">${html(t.name)} (${topicRecordCount(t)})</option>`).join("");
    el("assignTopicHint").textContent = `Přiřadíte ${selected.length} vybraných e-mailů k tématu.`;
    el("assignTopicDialog").showModal();
  }

  function injectRecordAiButton() {
    const actions = document.querySelector("#recordForm .dialogActions");
    if (!actions || el("singleRecordAiBtn") || el("suggestAiBtn")) return;
    const btn = document.createElement("button");
    btn.id = "singleRecordAiBtn";
    btn.type = "button";
    btn.className = "button accent";
    btn.textContent = "AI klasifikace e-mailu";
    btn.addEventListener("click", () => {
      const id = el("editId")?.value;
      const r = getRecords().find(x => getRecordId(x) === id);
      if (!r) return;
      r.shrnuti = el("editSummary")?.value || r.shrnuti;
      r.text = el("editBody")?.value || r.text;
      showPromptDialog("AI klasifikace e-mailu", buildSingleRecordPrompt(r));
    });
    actions.insertBefore(btn, actions.querySelector("#saveRecordBtn"));
  }

  function patchFilteredRecords() {
    if (typeof filteredRecords !== "function" || filteredRecords.__topicPatched) return;
    const original = filteredRecords;
    filteredRecords = function patchedFilteredRecords(options = {}) {
      const data = original(options);
      const topicId = el("topicFilter")?.value;
      if (!topicId) return data;
      const topic = getTopic(topicId);
      if (!topic) return data;
      const ids = new Set(topic.recordIds || []);
      return data.filter(r => ids.has(getRecordId(r)));
    };
    filteredRecords.__topicPatched = true;
  }

  function bindToolbarButtons() {
    el("addToTopicBtn")?.addEventListener("click", openAssignDialog);
    el("aiSelectionBtn")?.addEventListener("click", showSelectionAiPrompt);
  }

  function updateTopicsStorageHint() {
    const hint = el("topicsStorageHint");
    if (!hint) return;
    hint.textContent = topicsUseSupabase
      ? "Témata se ukládají trvale do Supabase."
      : "Témata jsou zatím jen v prohlížeči. Pro trvalé uložení spusťte supabase/topics-schema.sql.";
  }

  async function init() {
    injectTopicsPanel();
    injectTopicDialog();
    injectAssignDialog();
    injectRecordAiButton();
    patchFilteredRecords();
    bindToolbarButtons();
    await loadTopics();
    updateTopicsStorageHint();
    setTimeout(() => {
      injectRecordAiButton();
      bindToolbarButtons();
      updateTopicsStorageHint();
    }, 200);
  }

  window.kbTopics = {
    get topics() { return topics; },
    getTopic,
    recordsForTopic,
    openTopicDialog,
    buildTopicPrompt,
    showTopicAiPrompt
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("kb:records-loaded", () => {
    renderTopicsPanel();
    populateTopicFilter();
    if (typeof render === "function") render();
  });
})();
