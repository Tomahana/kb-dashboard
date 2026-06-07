// Automatická AI klasifikace e-mailů – návrh kategorie a shrnutí, uživatel jen upraví a potvrdí.

(function () {
  const SETTINGS_KEY = "kb-dashboard-ai-settings-v1";
  const AUTO_ON_OPEN_KEY = "kb-dashboard-ai-auto-on-open-v1";

  const DEFAULTS = {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  };

  const FIELD_IDS = {
    agenda: "editAgenda",
    typ: "editType",
    kam_patri: "editMeeting",
    stav: "editStatus",
    priorita: "editPriority",
    shrnuti: "editSummary",
    ukol_dalsi_krok: "editNextStep"
  };

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function hasApiKey() {
    return !!n(loadSettings().apiKey);
  }

  function getDatalistOptions(listId) {
    const list = el(listId);
    if (!list) return [];
    return [...list.querySelectorAll("option")].map(o => n(o.value)).filter(Boolean);
  }

  function getRecordId(r) {
    if (window.kbSelection?.getRecordId) return window.kbSelection.getRecordId(r);
    return r?.id || r?.kb_id || r?.KB_ID || "";
  }

  function getRecords() {
    return Array.isArray(records) ? records : [];
  }

  function findRecord(id) {
    if (typeof findRecordById === "function") return findRecordById(id);
    return getRecords().find(r => getRecordId(r) === id);
  }

  function needsClassification(r) {
    if (!r || r._aiProposal) return false;
    const unclassifiedAgenda = !n(r.agenda) || l(r.agenda) === "nezařazeno";
    const missingSummary = !n(r.shrnuti);
    const newStatus = ["nové", "k roztřídění", ""].includes(l(r.stav));
    return unclassifiedAgenda || missingSummary || newStatus;
  }

  function hasAiProposal(r) {
    return !!r?._aiProposal && typeof r._aiProposal === "object";
  }

  function pendingReviewRecords() {
    return getRecords().filter(hasAiProposal);
  }

  function unclassifiedRecords(list) {
    return (list || getRecords()).filter(needsClassification);
  }

  async function ensureBody(record) {
    if (n(record.text)) return record.text;
    const kbId = record.kb_id || record.id || record.KB_ID;
    if (kbId && window.kbSupabase?.loadBody) {
      const body = await window.kbSupabase.loadBody(kbId);
      record.text = body || "";
      return record.text;
    }
    return "";
  }

  function buildSystemPrompt() {
    return `Jsi asistent pro klasifikaci pracovních e-mailů univerzitního pracoviště.
Vrať POUZE validní JSON objekt (bez markdown) s těmito klíči:
agenda, typ, kam_patri, stav, priorita, shrnuti, ukol_dalsi_krok

Pravidla:
- agenda, typ, kam_patri, stav, priorita musí být PŘESNĚ jedna z povolených hodnot (viz seznamy)
- shrnuti: 2–4 věty česky, věcně, bez výmyslů
- ukol_dalsi_krok: konkrétní další krok nebo prázdný řetězec
- pokud si nejsi jistý, agenda="Nezařazeno", stav="K roztřídění"
- nevymýšlej fakta, která nejsou v e-mailu

Povolené hodnoty:
agenda: ${getDatalistOptions("agendaList").join(" | ")}
typ: ${getDatalistOptions("typeList").join(" | ")}
kam_patri: ${getDatalistOptions("meetingList").join(" | ")}
stav: ${getDatalistOptions("statusList").join(" | ")}
priorita: ${getDatalistOptions("priorityList").join(" | ")}`;
  }

  function buildUserPrompt(record) {
    const date = typeof getDateValue === "function" ? getDateValue(record) : (record.datum_emailu || "");
    const text = n(record.text).slice(0, 12000);
    return `E-mail k klasifikaci:

Předmět: ${record.title || record.predmet || "Bez názvu"}
Datum: ${date}
Odesílatel: ${record.odesilatel || ""}

Text:
${text || "(prázdný text)"}`;
  }

  function parseJsonResponse(content) {
    const raw = n(content);
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI nevrátila JSON.");
    return JSON.parse(candidate.slice(start, end + 1));
  }

  function normalizeProposal(data) {
    const pick = (value, listId) => {
      const options = getDatalistOptions(listId);
      const text = n(value);
      if (!text) return "";
      const exact = options.find(o => l(o) === l(text));
      if (exact) return exact;
      const partial = options.find(o => l(text).includes(l(o)) || l(o).includes(l(text)));
      return partial || text;
    };
    return {
      agenda: pick(data.agenda, "agendaList") || "Nezařazeno",
      typ: pick(data.typ, "typeList"),
      kam_patri: pick(data.kam_patri, "meetingList") || "Nezařazeno",
      stav: pick(data.stav, "statusList") || "K roztřídění",
      priorita: pick(data.priorita, "priorityList") || "Běžná",
      shrnuti: n(data.shrnuti),
      ukol_dalsi_krok: n(data.ukol_dalsi_krok)
    };
  }

  async function callAiApi(record) {
    const settings = loadSettings();
    if (!n(settings.apiKey)) throw new Error("Chybí API klíč. Nastavte ho v AI nastavení.");

    const body = {
      model: settings.model || DEFAULTS.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(record) }
      ]
    };

    const base = n(settings.baseUrl || DEFAULTS.baseUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI API chyba ${res.status}: ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI nevrátila odpověď.");
    return normalizeProposal(parseJsonResponse(content));
  }

  async function classifyRecord(record, options = {}) {
    const copy = { ...record };
    await ensureBody(copy);
    const proposal = await callAiApi(copy);
    proposal._generated_at = new Date().toISOString();
    proposal._model = loadSettings().model || DEFAULTS.model;

    const idx = getRecords().findIndex(r => getRecordId(r) === getRecordId(record));
    if (idx >= 0) {
      records[idx]._aiProposal = proposal;
      if (typeof persist === "function") persist();
    }
    if (options.applyToForm) applyProposalToForm(proposal);
    if (options.openDialog) {
      if (typeof window.openRecord === "function") window.openRecord(getRecordId(record));
    }
    if (typeof render === "function") render();
    return proposal;
  }

  function applyProposalToForm(proposal) {
    if (!proposal) return;
    Object.entries(FIELD_IDS).forEach(([key, id]) => {
      const input = el(id);
      if (!input) return;
      input.value = proposal[key] || "";
      input.classList.add("ai-filled");
    });
    showProposalBanner(true);
    const saveBtn = el("saveRecordBtn");
    if (saveBtn) saveBtn.textContent = "Potvrdit klasifikaci";
  }

  function clearProposalFormStyles() {
    Object.values(FIELD_IDS).forEach(id => el(id)?.classList.remove("ai-filled"));
    showProposalBanner(false);
    const saveBtn = el("saveRecordBtn");
    if (saveBtn) saveBtn.textContent = "Uložit klasifikaci";
  }

  function showProposalBanner(visible) {
    let banner = el("aiProposalBanner");
    if (!banner && visible) {
      banner = document.createElement("div");
      banner.id = "aiProposalBanner";
      banner.className = "aiProposalBanner";
      banner.innerHTML = `<strong>AI návrh klasifikace</strong> — zkontrolujte pole označená žlutě, upravte a klikněte <em>Potvrdit klasifikaci</em>.`;
      const form = el("recordForm");
      const grid = form?.querySelector(".grid2");
      if (grid) grid.insertAdjacentElement("beforebegin", banner);
    }
    if (banner) banner.style.display = visible ? "block" : "none";
  }

  function injectSettingsDialog() {
    if (el("aiSettingsDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "aiSettingsDialog";
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialogHeader">
          <h2>AI nastavení</h2>
          <button class="iconButton" value="cancel">×</button>
        </div>
        <p class="hint">API klíč zůstává jen ve vašem prohlížeči. Podporováno OpenAI API a kompatibilní služby (OpenRouter, LM Studio…).</p>
        <label>API klíč
          <input id="aiApiKey" type="password" placeholder="sk-…" autocomplete="off" />
        </label>
        <label>Model
          <input id="aiModel" placeholder="gpt-4o-mini" />
        </label>
        <label>API URL (volitelné)
          <input id="aiBaseUrl" placeholder="https://api.openai.com/v1" />
        </label>
        <label class="checkboxLine">
          <input id="aiAutoOnOpen" type="checkbox" />
          Automaticky navrhnout AI při otevření netříděného e-mailu
        </label>
        <div class="dialogActions">
          <button value="cancel" class="button secondary">Zavřít</button>
          <button id="saveAiSettingsBtn" type="button" class="button accent">Uložit</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    el("saveAiSettingsBtn").addEventListener("click", () => {
      saveSettings({
        apiKey: el("aiApiKey").value,
        model: n(el("aiModel").value) || DEFAULTS.model,
        baseUrl: n(el("aiBaseUrl").value) || DEFAULTS.baseUrl
      });
      localStorage.setItem(AUTO_ON_OPEN_KEY, el("aiAutoOnOpen").checked ? "true" : "false");
      dialog.close();
      updateAutoClassifyButton();
    });
  }

  function openSettingsDialog() {
    const s = loadSettings();
    el("aiApiKey").value = s.apiKey || "";
    el("aiModel").value = s.model || DEFAULTS.model;
    el("aiBaseUrl").value = s.baseUrl || DEFAULTS.baseUrl;
    el("aiAutoOnOpen").checked = localStorage.getItem(AUTO_ON_OPEN_KEY) === "true";
    el("aiSettingsDialog").showModal();
  }

  function injectTopbarButtons() {
    const actions = document.querySelector(".topbar .actions");
    if (!actions || el("autoClassifyBtn")) return;

    const settingsBtn = document.createElement("button");
    settingsBtn.id = "aiSettingsBtn";
    settingsBtn.type = "button";
    settingsBtn.className = "button secondary";
    settingsBtn.textContent = "AI nastavení";
    settingsBtn.addEventListener("click", openSettingsDialog);

    const autoBtn = document.createElement("button");
    autoBtn.id = "autoClassifyBtn";
    autoBtn.type = "button";
    autoBtn.className = "button accent";
    autoBtn.title = "AI navrhne kategorii a shrnutí — vy jen upravíte a potvrdíte";
    autoBtn.addEventListener("click", runBatchClassification);

    const reviewBtn = document.createElement("button");
    reviewBtn.id = "reviewAiBtn";
    reviewBtn.type = "button";
    reviewBtn.className = "button secondary";
    reviewBtn.addEventListener("click", openNextReview);

    actions.insertBefore(reviewBtn, el("aiPromptBtn"));
    actions.insertBefore(autoBtn, reviewBtn);
    actions.insertBefore(settingsBtn, autoBtn);
    updateAutoClassifyButton();
  }

  function updateAutoClassifyButton() {
    const btn = el("autoClassifyBtn");
    const reviewBtn = el("reviewAiBtn");
    if (!btn) return;
    const pool = typeof filteredRecords === "function" ? filteredRecords() : getRecords();
    const count = unclassifiedRecords(pool).length;
    const pending = pendingReviewRecords().length;
    btn.textContent = hasApiKey() ? `Auto-klasifikovat (${count})` : "Auto-klasifikovat";
    btn.disabled = !hasApiKey() || count === 0;
    if (reviewBtn) {
      reviewBtn.textContent = `Ke kontrole (${pending})`;
      reviewBtn.disabled = pending === 0;
    }
  }

  function injectRecordButtons() {
    const actions = el("recordForm")?.querySelector(".dialogActions");
    if (!actions || el("suggestAiBtn")) return;

    const suggestBtn = document.createElement("button");
    suggestBtn.id = "suggestAiBtn";
    suggestBtn.type = "button";
    suggestBtn.className = "button accent";
    suggestBtn.textContent = "Navrhnout AI";
    suggestBtn.addEventListener("click", async () => {
      const id = el("editId")?.value;
      const record = findRecord(id);
      if (!record) return;
      record.shrnuti = el("editSummary")?.value || record.shrnuti;
      record.text = el("editBody")?.value || record.text;
      suggestBtn.disabled = true;
      suggestBtn.textContent = "AI analyzuje…";
      try {
        await classifyRecord(record, { applyToForm: true });
      } catch (error) {
        alert("AI klasifikace selhala: " + (error.message || error));
      } finally {
        suggestBtn.disabled = !hasApiKey();
        suggestBtn.textContent = "Navrhnout AI";
      }
    });

    actions.insertBefore(suggestBtn, el("saveRecordBtn"));
  }

  async function runBatchClassification() {
    if (!hasApiKey()) {
      openSettingsDialog();
      return;
    }
    const pool = typeof filteredRecords === "function" ? filteredRecords() : getRecords();
    const targets = unclassifiedRecords(pool);
    if (!targets.length) {
      alert("Ve filtru nejsou netříděné e-maily.");
      return;
    }
    const limit = Math.min(targets.length, 20);
    if (!confirm(`AI navrhne klasifikaci pro ${limit} e-mailů (max. 20 najednou).\nPoté je zkontrolujete a potvrdíte.\n\nPokračovat?`)) return;

    const btn = el("autoClassifyBtn");
    let done = 0;
    let errors = 0;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = `Klasifikuji 0/${limit}…`;
      }
      for (let i = 0; i < limit; i += 1) {
        if (btn) btn.textContent = `Klasifikuji ${i + 1}/${limit}…`;
        try {
          await classifyRecord(targets[i]);
          done += 1;
        } catch (error) {
          console.error(error);
          errors += 1;
        }
        await new Promise(r => setTimeout(r, 400));
      }
      updateAutoClassifyButton();
      if (typeof render === "function") render();
      const msg = `Hotovo: ${done} návrhů AI${errors ? `, ${errors} chyb` : ""}.\nOtevřete „Ke kontrole“ a postupně potvrďte.`;
      alert(msg);
      if (done > 0) openNextReview();
    } finally {
      updateAutoClassifyButton();
    }
  }

  function openNextReview() {
    const pending = pendingReviewRecords();
    if (!pending.length) {
      alert("Žádné AI návrhy ke kontrole.");
      return;
    }
    const next = pending[0];
    if (typeof window.openRecord === "function") {
      window.openRecord(getRecordId(next));
    }
  }

  function enhanceOpenRecord() {
    if (!window.openRecord || window.openRecord.__aiEnhanced) return;
    const original = window.openRecord;
    window.openRecord = async function aiEnhancedOpenRecord(id) {
      clearProposalFormStyles();
      original(id);
      const record = findRecord(id);
      if (!record) return;

      if (hasAiProposal(record)) {
        applyProposalToForm(record._aiProposal);
        return;
      }

      const autoOnOpen = localStorage.getItem(AUTO_ON_OPEN_KEY) === "true";
      if (autoOnOpen && hasApiKey() && needsClassification(record)) {
        const suggestBtn = el("suggestAiBtn");
        if (suggestBtn) {
          suggestBtn.disabled = true;
          suggestBtn.textContent = "AI analyzuje…";
        }
        try {
          await new Promise(r => setTimeout(r, 300));
          const r = findRecord(id);
          if (r) await classifyRecord(r, { applyToForm: true });
        } catch (error) {
          console.error(error);
        } finally {
          if (suggestBtn) {
            suggestBtn.disabled = !hasApiKey();
            suggestBtn.textContent = "Navrhnout AI";
          }
        }
      }
    };
    window.openRecord.__aiEnhanced = true;
  }

  function enhanceSaveRecord() {
    if (!window.saveRecord || window.saveRecord.__aiConfirmed) return;
    const original = window.saveRecord;
    window.saveRecord = function aiConfirmedSaveRecord(e) {
      const id = el("editId")?.value;
      const idx = getRecords().findIndex(r => getRecordId(r) === id);
      if (idx >= 0 && records[idx]._aiProposal) {
        delete records[idx]._aiProposal;
        records[idx].ai_confirmed_at = new Date().toISOString();
        if (typeof persist === "function") persist();
      }
      clearProposalFormStyles();
      original(e);
      updateAutoClassifyButton();
    };
    window.saveRecord.__aiConfirmed = true;
  }

  function injectStyles() {
    if (el("aiClassifyStyles")) return;
    const style = document.createElement("style");
    style.id = "aiClassifyStyles";
    style.textContent = `
      .ai-filled { background: #fffbeb !important; border-color: #f59e0b !important; }
      .aiProposalBanner {
        background: #fffaeb;
        border: 1px solid #f59e0b;
        border-radius: 10px;
        padding: .65rem .75rem;
        margin-bottom: .75rem;
        font-size: .9rem;
        line-height: 1.45;
      }
      .badge.aiProposal { background: #eff8ff; color: #175cd3; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    injectSettingsDialog();
    injectTopbarButtons();
    injectRecordButtons();
    setTimeout(() => {
      enhanceOpenRecord();
      enhanceSaveRecord();
      injectRecordButtons();
      updateAutoClassifyButton();
    }, 120);

    document.addEventListener("input", () => setTimeout(updateAutoClassifyButton, 50));
    document.addEventListener("kb:records-loaded", () => setTimeout(updateAutoClassifyButton, 50));
  }

  window.kbAiClassify = {
    needsClassification,
    hasAiProposal,
    classifyRecord,
    pendingReviewRecords,
    updateAutoClassifyButton
  };

  document.addEventListener("DOMContentLoaded", init);
})();
