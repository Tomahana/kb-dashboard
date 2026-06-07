// Export úkolů z KB Dashboardu do ClickUp, Microsoft To Do / Planner (webhook) nebo vlastního webhooku.

(function () {
  const SETTINGS_KEY = "kb-dashboard-task-export-v1";

  const PROVIDERS = [
    { id: "clickup", label: "ClickUp" },
    { id: "microsoft_todo", label: "Microsoft To Do" },
    { id: "microsoft_planner", label: "Microsoft Planner" },
    { id: "webhook", label: "Webhook (Zapier / Make)" },
    { id: "clipboard", label: "Schránka (ruční vložení)" }
  ];

  const DEFAULTS = {
    defaultProvider: "clickup",
    autoExportOnSave: false,
    clickup: { apiToken: "", listId: "" },
    microsoftTodo: { webhookUrl: "", openUrl: "https://to-do.office.com/tasks/inbox" },
    microsoftPlanner: { webhookUrl: "", openUrl: "https://tasks.office.com/" },
    webhook: { url: "", label: "Vlastní webhook" }
  };

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        ...DEFAULTS,
        ...raw,
        clickup: { ...DEFAULTS.clickup, ...(raw.clickup || {}) },
        microsoftTodo: { ...DEFAULTS.microsoftTodo, ...(raw.microsoftTodo || {}) },
        microsoftPlanner: { ...DEFAULTS.microsoftPlanner, ...(raw.microsoftPlanner || {}) },
        webhook: { ...DEFAULTS.webhook, ...(raw.webhook || {}) }
      };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateTaskExportStatus();
  }

  function maskSecret(value) {
    const v = n(value);
    if (!v) return "";
    if (v.length <= 8) return "••••••••";
    return `${v.slice(0, 4)}…${v.slice(-4)}`;
  }

  function isTaskRecord(record) {
    if (!record) return false;
    if (l(record.typ) === "úkol") return true;
    return !!n(record.ukol_dalsi_krok);
  }

  function isTaskFromForm() {
    const typ = l(el("editType")?.value);
    const step = n(el("editNextStep")?.value);
    return typ === "úkol" || !!step;
  }

  function getRecordIdSafe(record) {
    if (typeof getRecordId === "function") return getRecordId(record);
    return record?.kb_id || record?.KB_ID || record?.id || "";
  }

  function mapPriority(priority) {
    const p = l(priority);
    if (p === "kritická") return { clickup: 1, label: "Kritická" };
    if (p === "vysoká") return { clickup: 2, label: "Vysoká" };
    if (p === "nízká") return { clickup: 4, label: "Nízká" };
    return { clickup: 3, label: "Běžná" };
  }

  function dueDateToMs(dateStr) {
    const d = n(dateStr);
    if (!d) return null;
    const parsed = new Date(`${d}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  function buildTaskFromRecord(record) {
    const kbId = getRecordIdSafe(record);
    const title = n(record.ukol_dalsi_krok) || n(record.shrnuti).split(/\n/)[0] || n(record.title || record.predmet) || "Úkol z KB Dashboardu";
    const description = [
      n(record.shrnuti) && `**Shrnutí:** ${record.shrnuti}`,
      n(record.ukol_dalsi_krok) && `**Úkol / další krok:** ${record.ukol_dalsi_krok}`,
      `**Agenda:** ${record.agenda || "—"}`,
      `**Kam patří:** ${record.kam_patri || "—"}`,
      `**Stav:** ${record.stav || "—"}`,
      `**Priorita:** ${record.priorita || "—"}`,
      `**Termín:** ${record.termin || "—"}`,
      `**Odesílatel:** ${record.odesilatel || "—"}`,
      `**KB ID:** ${kbId || "—"}`,
      `**Zdroj:** KB Dashboard`,
      n(record.text) && `\n---\n${record.text.slice(0, 4000)}`
    ].filter(Boolean).join("\n");

    return {
      title,
      description,
      dueDate: n(record.termin) || null,
      dueDateMs: dueDateToMs(record.termin),
      priority: mapPriority(record.priorita),
      tags: [n(record.agenda), n(record.kam_patri)].filter(Boolean),
      source: {
        kbId,
        title: record.title || record.predmet || "",
        odesilatel: record.odesilatel || "",
        agenda: record.agenda || "",
        typ: record.typ || "",
        shrnuti: record.shrnuti || "",
        ukol_dalsi_krok: record.ukol_dalsi_krok || "",
        termin: record.termin || "",
        priorita: record.priorita || "",
        stav: record.stav || "",
        kam_patri: record.kam_patri || "",
        dashboardUrl: `${location.origin}${location.pathname}#emaily`
      }
    };
  }

  function buildTaskFromForm() {
    const id = el("editId")?.value;
    const existing = typeof findRecordById === "function" ? findRecordById(id) : null;
    return buildTaskFromRecord({
      ...(existing || {}),
      id,
      kb_id: id,
      title: el("dialogTitle")?.textContent,
      predmet: el("dialogTitle")?.textContent,
      agenda: el("editAgenda")?.value,
      typ: el("editType")?.value,
      kam_patri: el("editMeeting")?.value,
      stav: el("editStatus")?.value,
      priorita: el("editPriority")?.value,
      termin: el("editDeadline")?.value,
      shrnuti: el("editSummary")?.value,
      ukol_dalsi_krok: el("editNextStep")?.value,
      text: el("editBody")?.value,
      odesilatel: existing?.odesilatel || ""
    });
  }

  function buildClipboardText(task) {
    return [
      task.title,
      "",
      task.description.replace(/\*\*/g, "")
    ].join("\n");
  }

  function buildWebhookPayload(task, provider) {
    return {
      provider: "kb-dashboard",
      destination: provider,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      priority: task.priority.label,
      tags: task.tags,
      source: task.source,
      exportedAt: new Date().toISOString()
    };
  }

  async function copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
  }

  function formatClickUpAuth(token) {
    const t = n(token);
    if (!t) return "";
    if (/^bearer\s+/i.test(t)) return t;
    if (t.startsWith("pk_")) return t;
    return `Bearer ${t}`;
  }

  function parseClickUpListId(raw) {
    const input = n(raw);
    if (!input) return "";

    const fromPath = input.match(/\/v\/l[i]?\/(\d+)/i);
    if (fromPath) return fromPath[1];

    const customList = input.match(/\d+-(\d+)-\d+/);
    if (customList && /clickup\.com/i.test(input)) return customList[1];

    if (/^\d+$/.test(input)) return input;

    const trailingDigits = input.match(/(\d{6,})\s*$/);
    if (trailingDigits) return trailingDigits[1];

    return input.replace(/[^\d]/g, "") || "";
  }

  function clickUpHeaders(token) {
    return {
      "Content-Type": "application/json",
      Authorization: formatClickUpAuth(token)
    };
  }

  async function parseClickUpError(res) {
    const data = await res.json().catch(() => ({}));
    const code = data.ECODE || data.err || "";
    const msg = data.err || data.message || `HTTP ${res.status}`;
    return { code, msg, data };
  }

  function clickUp404Help(listId, rawInput) {
    const parsed = parseClickUpListId(rawInput || listId);
    const teamFromUrl = n(rawInput).match(/clickup\.com\/(\d+)/i)?.[1];
    const maybeTeamConfusion = teamFromUrl && parsed === teamFromUrl;
    return [
      "ClickUp vrátil 404 — seznam (list) nebyl nalezen.",
      maybeTeamConfusion
        ? "Zadané ID vypadá jako Team/Workspace ID (první číslo v URL), ne List ID."
        : "Zkontrolujte, že používáte List ID ze segmentu /li/ v URL seznamu.",
      "",
      "Postup:",
      "1. Otevřete konkrétní seznam v ClickUp (ne space, ne folder).",
      "2. Z URL https://app.clickup.com/TEAM/v/li/LIST_ID zkopírujte LIST_ID (za /li/).",
      "3. Nebo vložte celý odkaz seznamu — aplikace ID doparsuje.",
      parsed ? `\nPoužité List ID: ${parsed}` : ""
    ].filter(Boolean).join("\n");
  }

  async function verifyClickUpList(token, listId) {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}`, {
      method: "GET",
      headers: clickUpHeaders(token)
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, name: data.name || "", id: String(data.id || listId) };
    }
    const err = await parseClickUpError(res);
    if (res.status === 401) {
      throw new Error("ClickUp: neplatný API token. Zkontrolujte token v Settings → Apps (formát pk_…).");
    }
    if (res.status === 404) {
      throw new Error(clickUp404Help(listId));
    }
    throw new Error(`ClickUp: ${err.msg}${err.code ? ` (${err.code})` : ""}`);
  }

  async function postWebhook(url, payload) {
    const body = JSON.stringify(payload);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      if (res.ok) return { ok: true, message: "Odesláno na webhook." };
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `HTTP ${res.status}`);
    } catch (error) {
      if (error.message && !/failed to fetch|network|cors/i.test(error.message)) throw error;
      await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body });
      return { ok: true, message: "Odesláno na webhook (bez potvrzení odpovědi – typické u Zapier/Make)." };
    }
  }

  async function exportToClickUp(task, settings) {
    const token = n(settings.clickup?.apiToken);
    const rawListId = n(settings.clickup?.listId);
    const listId = parseClickUpListId(rawListId);
    if (!token || !listId) {
      throw new Error("V Nastavení doplňte ClickUp API token a ID seznamu (list) nebo celý odkaz na seznam.");
    }

    const body = {
      name: task.title.slice(0, 500),
      markdown_description: task.description
    };
    if (task.dueDateMs) body.due_date = task.dueDateMs;
    if (task.priority?.clickup) body.priority = task.priority.clickup;

    try {
      const listInfo = await verifyClickUpList(token, listId);
      const res = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listInfo.id || listId)}/task`, {
        method: "POST",
        headers: clickUpHeaders(token),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await parseClickUpError(res);
        if (res.status === 404) throw new Error(clickUp404Help(listId, rawListId));
        if (res.status === 401) throw new Error("ClickUp: neplatný API token.");
        throw new Error(`ClickUp: ${err.msg}${err.code ? ` (${err.code})` : ""}`);
      }
      const data = await res.json();
      return {
        ok: true,
        message: `Úkol vytvořen v ClickUp${listInfo.name ? ` (seznam „${listInfo.name}“)` : ""}.`,
        externalId: data.id,
        url: data.url || `https://app.clickup.com/t/${data.id}`
      };
    } catch (error) {
      if (/failed to fetch|network|cors/i.test(error.message || "")) {
        await copyToClipboard(buildClipboardText(task));
        return {
          ok: true,
          partial: true,
          message: "ClickUp API nelze volat přímo z prohlížeče (CORS). Text úkolu je ve schránce — vložte ho do ClickUp ručně.",
          provider: "clickup"
        };
      }
      throw error;
    }
  }

  async function testClickUpConnection(settings) {
    const token = n(settings?.clickup?.apiToken);
    const rawListId = n(settings?.clickup?.listId);
    const listId = parseClickUpListId(rawListId);
    if (!token || !listId) {
      throw new Error("Vyplňte API token a List ID (nebo celý odkaz na seznam).");
    }
    const info = await verifyClickUpList(token, listId);
    return `ClickUp OK — seznam „${info.name || listId}“ (ID ${info.id}) je dostupný.`;
  }

  async function exportToMicrosoft(task, settings, providerId) {
    const isPlanner = providerId === "microsoft_planner";
    const cfg = isPlanner ? settings.microsoftPlanner : settings.microsoftTodo;
    const webhookUrl = n(cfg?.webhookUrl);
    const openUrl = n(cfg?.openUrl) || (isPlanner ? DEFAULTS.microsoftPlanner.openUrl : DEFAULTS.microsoftTodo.openUrl);
    const label = isPlanner ? "Microsoft Planner" : "Microsoft To Do";

    if (webhookUrl) {
      const result = await postWebhook(webhookUrl, buildWebhookPayload(task, providerId));
      return { ...result, message: `Úkol odeslán do ${label} (webhook).`, provider: providerId, url: openUrl };
    }

    await copyToClipboard(buildClipboardText(task));
    if (openUrl) window.open(openUrl, "_blank", "noopener");
    return {
      ok: true,
      partial: true,
      message: `Text úkolu zkopírován. Otevřen ${label} — vložte úkol ručně, nebo nastavte Power Automate webhook v Nastavení.`,
      provider: providerId,
      url: openUrl
    };
  }

  async function exportToWebhook(task, settings) {
    const url = n(settings.webhook?.url);
    if (!url) throw new Error("V Nastavení doplňte URL webhooku (Zapier, Make, Power Automate…).");
    const result = await postWebhook(url, buildWebhookPayload(task, "webhook"));
    return { ...result, provider: "webhook" };
  }

  async function exportToClipboard(task) {
    await copyToClipboard(buildClipboardText(task));
    return { ok: true, message: "Úkol zkopírován do schránky.", provider: "clipboard" };
  }

  async function exportTask(task, providerId, options = {}) {
    const settings = options.settings || loadSettings();
    const provider = providerId || settings.defaultProvider || "clipboard";
    let result;

    switch (provider) {
      case "clickup":
        result = await exportToClickUp(task, settings);
        break;
      case "microsoft_todo":
        result = await exportToMicrosoft(task, settings, "microsoft_todo");
        break;
      case "microsoft_planner":
        result = await exportToMicrosoft(task, settings, "microsoft_planner");
        break;
      case "webhook":
        result = await exportToWebhook(task, settings);
        break;
      case "clipboard":
      default:
        result = await exportToClipboard(task);
        break;
    }

    if (options.record && !result.partial && typeof persist === "function") {
      stampRecordExport(options.record, result, provider);
      persist();
      if (typeof render === "function") render();
    }

    return result;
  }

  function stampRecordExport(record, result, provider) {
    const entry = {
      provider,
      externalId: result.externalId || null,
      url: result.url || null,
      exportedAt: new Date().toISOString(),
      title: result.title || null
    };
    record.task_exports = Array.isArray(record.task_exports) ? record.task_exports : [];
    record.task_exports.push(entry);
    record.task_export = entry;
  }

  function providerLabel(id) {
    return PROVIDERS.find(p => p.id === id)?.label || id;
  }

  function hasTaskExport(record) {
    return !!record?.task_export?.exportedAt;
  }

  function getExportBadge(record) {
    if (!hasTaskExport(record)) return "";
    const p = providerLabel(record.task_export.provider);
    return `<span class="badge taskExported" title="Exportováno ${record.task_export.exportedAt || ""}">${p} ✓</span>`;
  }

  function updateTaskExportPanel() {
    const panel = el("taskExportPanel");
    if (!panel) return;
    const visible = isTaskFromForm();
    panel.hidden = !visible;
    if (!visible) return;

    const id = el("editId")?.value;
    const record = typeof findRecordById === "function" ? findRecordById(id) : null;
    const status = el("taskExportStatus");
    if (status) {
      if (record?.task_export) {
        status.textContent = `Naposledy exportováno: ${providerLabel(record.task_export.provider)} (${new Date(record.task_export.exportedAt).toLocaleString("cs-CZ")})`;
        status.className = "taskExportStatus ok";
      } else {
        status.textContent = "Úkol lze odeslat do ClickUp, To Do, Planner nebo webhooku.";
        status.className = "taskExportStatus hint";
      }
    }
  }

  function updateTaskExportStatus() {
    const box = el("taskExportKeyStatus");
    if (!box) return;
    const s = loadSettings();
    const parts = [];
    if (n(s.clickup.apiToken) && n(s.clickup.listId)) parts.push(`ClickUp (${maskSecret(s.clickup.apiToken)})`);
    if (n(s.microsoftTodo.webhookUrl)) parts.push("To Do webhook");
    if (n(s.microsoftPlanner.webhookUrl)) parts.push("Planner webhook");
    if (n(s.webhook.url)) parts.push("vlastní webhook");
    box.textContent = parts.length
      ? `Nakonfigurováno: ${parts.join(", ")}`
      : "Zatím bez API/webhooku — funguje export do schránky a otevření To Do / Planner.";
    box.className = parts.length ? "taskExportKeyStatus ok" : "taskExportKeyStatus hint";
  }

  function injectRecordPanel() {
    if (el("taskExportPanel")) return;
    const form = el("recordForm");
    const actions = form?.querySelector(".dialogActions");
    if (!actions) return;

    const panel = document.createElement("section");
    panel.id = "taskExportPanel";
    panel.className = "taskExportPanel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="taskExportHead">
        <h3>Export úkolu</h3>
        <p id="taskExportStatus" class="taskExportStatus hint">Úkol lze odeslat do externího nástroje.</p>
      </div>
      <div class="taskExportRow">
        <label class="taskExportProviderLabel">Cíl
          <select id="taskExportProvider"></select>
        </label>
        <label class="checkboxLine taskExportAuto">
          <input id="taskExportAutoOnSave" type="checkbox" />
          Po potvrzení klasifikace také exportovat
        </label>
      </div>
      <div class="taskExportActions">
        <button id="taskExportBtn" type="button" class="button secondary">Odeslat úkol</button>
        <button id="taskExportSettingsBtn" type="button" class="button secondary">Nastavení exportu</button>
      </div>
    `;
    actions.parentNode.insertBefore(panel, actions);

    const select = el("taskExportProvider");
    select.innerHTML = PROVIDERS.map(p => `<option value="${p.id}">${p.label}</option>`).join("");

    const settings = loadSettings();
    select.value = settings.defaultProvider || "clickup";
    el("taskExportAutoOnSave").checked = !!settings.autoExportOnSave;

    ["editType", "editNextStep"].forEach(id => {
      el(id)?.addEventListener("input", updateTaskExportPanel);
      el(id)?.addEventListener("change", updateTaskExportPanel);
    });

    el("taskExportBtn").addEventListener("click", async () => {
      const btn = el("taskExportBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Odesílám…";
      try {
        const id = el("editId")?.value;
        const record = typeof findRecordById === "function" ? findRecordById(id) : null;
        const task = buildTaskFromForm();
        const provider = el("taskExportProvider").value;
        const result = await exportTask(task, provider, { record });
        alert(result.message);
        updateTaskExportPanel();
      } catch (error) {
        alert("Export úkolu selhal: " + (error.message || error));
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("taskExportSettingsBtn").addEventListener("click", openSettingsDialog);
    el("taskExportAutoOnSave").addEventListener("change", (e) => {
      const s = loadSettings();
      s.autoExportOnSave = e.target.checked;
      saveSettings(s);
    });
    el("taskExportProvider").addEventListener("change", (e) => {
      const s = loadSettings();
      s.defaultProvider = e.target.value;
      saveSettings(s);
    });

    if (window.kbPickers?.enhanceAll) window.kbPickers.enhanceAll(panel);
  }

  function injectSettingsDialog() {
    if (el("taskExportSettingsDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "taskExportSettingsDialog";
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialogHeader">
          <h2>Export úkolů — nastavení</h2>
          <button class="iconButton" value="cancel">×</button>
        </div>
        <p class="hint">Údaje zůstávají jen v tomto prohlížeči. Pro Microsoft To Do / Planner doporučujeme Power Automate webhook (HTTP trigger).</p>

        <details class="taskExportDetails" open>
          <summary>ClickUp</summary>
          <label>API token
            <input id="teClickupToken" type="password" placeholder="pk_…" autocomplete="off" />
          </label>
          <label>List ID nebo odkaz na seznam
            <input id="teClickupListId" placeholder="https://app.clickup.com/…/v/li/123456789" />
          </label>
          <p id="teClickupHint" class="hint">Z URL <code>…/v/li/LIST_ID</code> použijte číslo za <code>/li/</code> (ne první číslo za clickup.com — to je Team ID). Token: Settings → Apps → API Token (<code>pk_…</code>).</p>
          <button id="teClickupTestBtn" type="button" class="button secondary">Otestovat ClickUp</button>
        </details>

        <details class="taskExportDetails">
          <summary>Microsoft To Do</summary>
          <label>Power Automate / webhook URL
            <input id="teTodoWebhook" placeholder="https://…" />
          </label>
          <label>Otevřít web (bez webhooku)
            <input id="teTodoOpenUrl" placeholder="https://to-do.office.com/tasks/inbox" />
          </label>
        </details>

        <details class="taskExportDetails">
          <summary>Microsoft Planner</summary>
          <label>Power Automate / webhook URL
            <input id="tePlannerWebhook" placeholder="https://…" />
          </label>
          <label>Otevřít web (bez webhooku)
            <input id="tePlannerOpenUrl" placeholder="https://tasks.office.com/" />
          </label>
        </details>

        <details class="taskExportDetails">
          <summary>Webhook (Zapier / Make / jiný)</summary>
          <label>URL webhooku
            <input id="teWebhookUrl" placeholder="https://hooks.zapier.com/…" />
          </label>
          <label>Název (volitelné)
            <input id="teWebhookLabel" placeholder="Zapier → ClickUp" />
          </label>
        </details>

        <label>Výchozí cíl exportu
          <select id="teDefaultProvider"></select>
        </label>

        <div class="dialogActions">
          <button value="cancel" class="button secondary">Zavřít</button>
          <button id="saveTaskExportSettingsBtn" type="button" class="button accent">Uložit</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    el("teDefaultProvider").innerHTML = PROVIDERS.map(p => `<option value="${p.id}">${p.label}</option>`).join("");

    el("teClickupTestBtn").addEventListener("click", async () => {
      const btn = el("teClickupTestBtn");
      const hint = el("teClickupHint");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Testuji…";
      try {
        const msg = await testClickUpConnection({
          clickup: {
            apiToken: el("teClickupToken").value,
            listId: el("teClickupListId").value
          }
        });
        if (hint) {
          hint.textContent = msg;
          hint.className = "hint ok";
        } else {
          alert(msg);
        }
      } catch (error) {
        const message = error.message || String(error);
        if (hint) {
          hint.textContent = message;
          hint.className = "hint danger";
        } else {
          alert(message);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("saveTaskExportSettingsBtn").addEventListener("click", () => {
      const s = loadSettings();
      s.clickup.apiToken = el("teClickupToken").value;
      s.clickup.listId = parseClickUpListId(el("teClickupListId").value) || el("teClickupListId").value;
      s.microsoftTodo.webhookUrl = el("teTodoWebhook").value;
      s.microsoftTodo.openUrl = n(el("teTodoOpenUrl").value) || DEFAULTS.microsoftTodo.openUrl;
      s.microsoftPlanner.webhookUrl = el("tePlannerWebhook").value;
      s.microsoftPlanner.openUrl = n(el("tePlannerOpenUrl").value) || DEFAULTS.microsoftPlanner.openUrl;
      s.webhook.url = el("teWebhookUrl").value;
      s.webhook.label = el("teWebhookLabel").value;
      s.defaultProvider = el("teDefaultProvider").value;
      saveSettings(s);
      const providerSelect = el("taskExportProvider");
      if (providerSelect) {
        providerSelect.value = s.defaultProvider;
        if (window.kbPickers?.syncPicker) window.kbPickers.syncPicker(providerSelect);
      }
      if (window.kbPickers?.refresh) window.kbPickers.refresh("teDefaultProvider");
      dialog.close();
    });
  }

  function openSettingsDialog() {
    injectSettingsDialog();
    const s = loadSettings();
    el("teClickupToken").value = s.clickup.apiToken || "";
    el("teClickupListId").value = s.clickup.listId || "";
    el("teTodoWebhook").value = s.microsoftTodo.webhookUrl || "";
    el("teTodoOpenUrl").value = s.microsoftTodo.openUrl || DEFAULTS.microsoftTodo.openUrl;
    el("tePlannerWebhook").value = s.microsoftPlanner.webhookUrl || "";
    el("tePlannerOpenUrl").value = s.microsoftPlanner.openUrl || DEFAULTS.microsoftPlanner.openUrl;
    el("teWebhookUrl").value = s.webhook.url || "";
    el("teWebhookLabel").value = s.webhook.label || "";
    el("teDefaultProvider").value = s.defaultProvider || "clickup";
    if (window.kbPickers?.refresh) window.kbPickers.refresh("teDefaultProvider");
    el("taskExportSettingsDialog").showModal();
  }

  function injectSettingsPage() {
    const page = el("page-nastaveni");
    if (!page || el("taskExportSettingsPanel")) return;

    const panel = document.createElement("section");
    panel.id = "taskExportSettingsPanel";
    panel.className = "panel";
    panel.innerHTML = `
      <h2>Export úkolů</h2>
      <p id="taskExportKeyStatus" class="taskExportKeyStatus hint">Kontroluji nastavení…</p>
      <p class="hint">Úkoly (typ „Úkol“ nebo vyplněný další krok) lze poslat do ClickUp, Microsoft To Do, Planner nebo vlastního webhooku.</p>
      <div class="settingsActions">
        <button id="taskExportSettingsPageBtn" type="button" class="button secondary">Nastavení exportu úkolů</button>
      </div>
    `;
    page.appendChild(panel);
    el("taskExportSettingsPageBtn").addEventListener("click", openSettingsDialog);
    updateTaskExportStatus();
  }

  function enhanceOpenRecord() {
    if (!window.openRecord || window.openRecord.__taskExportEnhanced) return;
    const original = window.openRecord;
    window.openRecord = function (...args) {
      original(...args);
      setTimeout(updateTaskExportPanel, 0);
    };
    window.openRecord.__taskExportEnhanced = true;
  }

  function enhanceSaveRecord() {
    if (!window.saveRecord || window.saveRecord.__taskExportEnhanced) return;
    const original = window.saveRecord;
    window.saveRecord = async function taskExportSaveRecord(e) {
      const settings = loadSettings();
      const shouldExport = settings.autoExportOnSave && isTaskFromForm();
      const id = el("editId")?.value;
      const idx = Array.isArray(records) ? records.findIndex(x => getRecordIdSafe(x) === id) : -1;

      await original(e);

      if (!shouldExport || idx < 0) return;
      const record = records[idx];
      if (!isTaskRecord(record)) return;

      try {
        const task = buildTaskFromRecord(record);
        const exportResult = await exportTask(task, settings.defaultProvider, { record, settings });
        if (exportResult?.message) setTimeout(() => alert(exportResult.message), 120);
      } catch (error) {
        alert("Auto-export úkolu selhal: " + (error.message || error));
      }
    };
    window.saveRecord.__taskExportEnhanced = true;
  }

  window.kbTaskExport = {
    loadSettings,
    saveSettings,
    isTaskRecord,
    buildTaskFromRecord,
    buildTaskFromForm,
    exportTask,
    hasTaskExport,
    getExportBadge,
    providerLabel,
    openSettingsDialog,
    updateTaskExportPanel,
    parseClickUpListId,
    testClickUpConnection
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectSettingsDialog();
    injectRecordPanel();
    injectSettingsPage();
    enhanceOpenRecord();
    enhanceSaveRecord();
    updateTaskExportStatus();
    setTimeout(() => {
      injectRecordPanel();
      updateTaskExportPanel();
    }, 300);
  });
})();
