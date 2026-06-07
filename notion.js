// Propojení KB Dashboardu s Notion — zápisy ze schůzek a export e-mailů.

(function () {
  const SETTINGS_KEY = "kb-dashboard-notion-v1";
  const NOTION_VERSION = "2022-06-28";

  const DEFAULTS = {
    integrationToken: "",
    meetingsDatabaseId: "",
    exportDatabaseId: "",
    properties: {
      title: "Name",
      date: "Datum",
      meetingType: "Typ",
      kbId: "KB ID"
    }
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
        properties: { ...DEFAULTS.properties, ...(raw.properties || {}) }
      };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateNotionStatus();
  }

  function maskSecret(value) {
    const v = n(value);
    if (!v) return "";
    if (v.length <= 8) return "••••••••";
    return `${v.slice(0, 4)}…${v.slice(-4)}`;
  }

  function parseNotionId(raw) {
    const input = n(raw);
    if (!input) return "";

    const dashed = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (dashed) return dashed[0].replace(/-/g, "");

    const fromUrl = input.match(/(?:^|-)([0-9a-f]{32})(?:\?|$)/i);
    if (fromUrl) return fromUrl[1].toLowerCase();

    if (/^[0-9a-f]{32}$/i.test(input)) return input.toLowerCase();

    const digits = input.replace(/[^0-9a-f]/gi, "");
    if (digits.length === 32) return digits.toLowerCase();
    return "";
  }

  function toDashedId(id32) {
    const id = parseNotionId(id32);
    if (id.length !== 32) return id;
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }

  function notionPageUrl(pageId) {
    const id = parseNotionId(pageId);
    return id ? `https://www.notion.so/${id}` : "";
  }

  function getRecordIdSafe(record) {
    if (typeof getRecordId === "function") return getRecordId(record);
    return record?.kb_id || record?.KB_ID || record?.id || "";
  }

  function getCurrentRecord() {
    const id = el("editId")?.value;
    return typeof findRecordById === "function" ? findRecordById(id) : null;
  }

  function isCorsError(error) {
    return /failed to fetch|network|cors|load failed/i.test(error?.message || String(error));
  }

  async function notionFetch(path, options = {}) {
    const settings = loadSettings();
    const token = n(settings.integrationToken);
    if (!token) throw new Error("V Nastavení doplňte Notion Integration Token.");

    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || `Notion HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function extractTitle(properties, titleProp) {
    const prop = properties?.[titleProp];
    if (!prop) {
      const firstTitle = Object.values(properties || {}).find(p => p?.type === "title");
      prop = firstTitle;
    }
    const parts = prop?.title || [];
    return parts.map(t => t.plain_text || "").join("") || "Bez názvu";
  }

  function extractDate(properties, dateProp) {
    const prop = properties?.[dateProp];
    if (!prop) return "";
    if (prop.type === "date") return prop.date?.start || "";
    if (prop.type === "created_time") return prop.created_time || "";
    if (prop.type === "last_edited_time") return prop.last_edited_time || "";
    return "";
  }

  function mapMeetingPage(page, settings) {
    const props = page.properties || {};
    const title = extractTitle(props, settings.properties.title);
    const date = extractDate(props, settings.properties.date);
    const pageId = parseNotionId(page.id);
    return {
      pageId,
      url: page.url || notionPageUrl(pageId),
      title,
      date,
      lastEdited: page.last_edited_time || ""
    };
  }

  async function queryDatabase(databaseId, body = {}) {
    const id = parseNotionId(databaseId);
    if (!id) throw new Error("Chybí ID Notion databáze.");
    return notionFetch(`/databases/${toDashedId(id)}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 20, ...body })
    });
  }

  async function searchMeetings(query) {
    const settings = loadSettings();
    const dbId = parseNotionId(settings.meetingsDatabaseId);
    if (!dbId) throw new Error("V Nastavení doplňte ID databáze zápisů ze schůzek.");

    const titleProp = settings.properties.title || "Name";
    const body = {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
    };

    const q = n(query);
    if (q) {
      body.filter = {
        property: titleProp,
        title: { contains: q }
      };
    }

    const data = await queryDatabase(dbId, body);
    return (data.results || []).map(page => mapMeetingPage(page, settings));
  }

  async function testConnection(overrideSettings) {
    const settings = overrideSettings || loadSettings();
    const dbId = parseNotionId(settings.meetingsDatabaseId);
    if (!dbId) throw new Error("Vyplňte Integration Token a ID databáze schůzek.");
    const data = await queryDatabase(dbId, { page_size: 1 });
    const sample = (data.results || [])[0];
    const name = sample ? mapMeetingPage(sample, settings).title : null;
    return name
      ? `Notion OK — databáze schůzek dostupná (např. „${name}“).`
      : "Notion OK — databáze schůzek dostupná (zatím bez záznamů).";
  }

  function buildRecordMarkdown(record) {
    const kbId = getRecordIdSafe(record);
    return [
      `## ${record.title || record.predmet || "E-mail z KB"}`,
      "",
      record.shrnuti && `**Shrnutí:** ${record.shrnuti}`,
      record.ukol_dalsi_krok && `**Úkol / další krok:** ${record.ukol_dalsi_krok}`,
      `**Agenda:** ${record.agenda || "—"}`,
      `**Kam patří:** ${record.kam_patri || "—"}`,
      `**Stav:** ${record.stav || "—"}`,
      `**Priorita:** ${record.priorita || "—"}`,
      `**Termín:** ${record.termin || "—"}`,
      `**Odesílatel:** ${record.odesilatel || "—"}`,
      `**KB ID:** ${kbId}`,
      `**Datum:** ${record.datum_emailu || record.datum_pridani || "—"}`,
      "",
      record.text && `---\n${record.text.slice(0, 6000)}`
    ].filter(Boolean).join("\n");
  }

  function richTextParagraphs(text) {
    const content = n(text);
    if (!content) return [];
    const chunks = [];
    for (let i = 0; i < content.length; i += 1800) {
      chunks.push(content.slice(i, i + 1800));
    }
    return chunks.map(chunk => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }]
      }
    }));
  }

  function titleProperty(name) {
    return {
      title: [{ type: "text", text: { content: n(name).slice(0, 200) || "Záznam KB" } }]
    };
  }

  function dateProperty(dateStr) {
    const d = n(dateStr);
    if (!d) return null;
    return { date: { start: d } };
  }

  function richTextProperty(text) {
    const t = n(text).slice(0, 2000);
    if (!t) return null;
    return { rich_text: [{ type: "text", text: { content: t } }] };
  }

  async function createPageInDatabase(databaseId, record) {
    const settings = loadSettings();
    const db = parseNotionId(databaseId);
    if (!db) throw new Error("Chybí ID cílové Notion databáze.");

    const props = {};
    const titleKey = settings.properties.title || "Name";
    props[titleKey] = titleProperty(record.title || record.predmet || record.shrnuti || "E-mail KB");

    const dateKey = settings.properties.date;
    if (dateKey) {
      const dv = dateProperty(record.termin || record.datum_emailu || record.datum_pridani);
      if (dv) props[dateKey] = dv;
    }

    const kbKey = settings.properties.kbId;
    if (kbKey) {
      const kv = richTextProperty(getRecordIdSafe(record));
      if (kv) props[kbKey] = kv;
    }

    const meetingKey = settings.properties.meetingType;
    if (meetingKey && record.kam_patri) {
      const mv = richTextProperty(record.kam_patri);
      if (mv) props[meetingKey] = mv;
    }

    const bodyText = buildRecordMarkdown(record);
    const children = richTextParagraphs(bodyText).slice(0, 20);

    const data = await notionFetch("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: toDashedId(db) },
        properties: props,
        children
      })
    });

    return {
      pageId: parseNotionId(data.id),
      url: data.url || notionPageUrl(data.id),
      title: extractTitle(data.properties, titleKey)
    };
  }

  async function appendToPage(pageId, record) {
    const id = parseNotionId(pageId);
    if (!id) throw new Error("Chybí ID Notion stránky.");

    const heading = {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: `KB: ${(record.title || record.predmet || "E-mail").slice(0, 120)}` } }]
      }
    };
    const blocks = [heading, ...richTextParagraphs(buildRecordMarkdown(record))].slice(0, 25);

    await notionFetch(`/blocks/${toDashedId(id)}/children`, {
      method: "PATCH",
      body: JSON.stringify({ children: blocks })
    });
  }

  function stampNotionLink(record, meta) {
    record.notion_link = {
      pageId: meta.pageId,
      url: meta.url,
      title: meta.title || "Zápis ze schůzky",
      linkedAt: new Date().toISOString()
    };
    if (typeof persist === "function") persist();
    if (typeof render === "function") render();
  }

  function clearNotionLink(record) {
    delete record.notion_link;
    if (typeof persist === "function") persist();
    if (typeof render === "function") render();
  }

  function getNotionBadge(record) {
    const link = record?.notion_link;
    if (!link?.url) return "";
    const title = n(link.title).slice(0, 28);
    return `<a class="badge notionLinked" href="${escapeAttr(link.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Notion: ${escapeAttr(link.title || "")}">Notion · ${escapeHtml(title || "zápis")}</a>`;
  }

  function escapeHtml(s) {
    return n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function updateNotionPanel() {
    const panel = el("notionPanel");
    if (!panel) return;

    const record = getCurrentRecord();
    const linkBox = el("notionLinkedBox");
    const linkInfo = el("notionLinkInfo");
    const settings = loadSettings();
    const configured = !!(n(settings.integrationToken) && n(settings.meetingsDatabaseId));

    panel.hidden = false;

    if (linkBox && linkInfo) {
      if (record?.notion_link) {
        linkBox.hidden = false;
        linkInfo.innerHTML = `<a href="${escapeAttr(record.notion_link.url)}" target="_blank" rel="noopener">${escapeHtml(record.notion_link.title || "Zápis")}</a>`;
      } else {
        linkBox.hidden = true;
        linkInfo.textContent = "";
      }
    }

    const status = el("notionPanelStatus");
    if (status) {
      status.textContent = configured
        ? "Vyhledejte zápis ze schůzky v Notion a propojte ho s tímto e-mailem."
        : "Nejdříve nastavte Notion token a ID databáze schůzek v Nastavení.";
      status.className = configured ? "hint" : "hint danger";
    }
  }

  function updateNotionStatus() {
    const box = el("notionKeyStatus");
    if (!box) return;
    const s = loadSettings();
    if (n(s.integrationToken) && n(s.meetingsDatabaseId)) {
      box.textContent = `Notion nakonfigováno (${maskSecret(s.integrationToken)}). Databáze schůzek: ${parseNotionId(s.meetingsDatabaseId) || "—"}`;
      box.className = "notionKeyStatus ok";
    } else {
      box.textContent = "Notion zatím není nastaven — propojení schůzek nebude fungovat.";
      box.className = "notionKeyStatus hint";
    }
  }

  function renderSearchResults(results) {
    const list = el("notionSearchResults");
    if (!list) return;
    if (!results.length) {
      list.innerHTML = `<li class="notionSearchEmpty">Žádné zápisy nenalezeny.</li>`;
      return;
    }
    list.innerHTML = results.map((item, idx) => `
      <li class="notionSearchItem">
        <button type="button" class="notionSearchPick" data-idx="${idx}">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="smallMuted">${escapeHtml(item.date || item.lastEdited?.slice(0, 10) || "")}</span>
        </button>
      </li>
    `).join("");

    list.querySelectorAll(".notionSearchPick").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = results[Number(btn.dataset.idx)];
        if (!item) return;
        const record = getCurrentRecord();
        if (!record) return;
        stampNotionLink(record, item);
        updateNotionPanel();
        alert(`Propojeno se zápisem „${item.title}“ v Notion.`);
      });
    });
  }

  function injectRecordPanel() {
    if (el("notionPanel")) return;
    const form = el("recordForm");
    const taskPanel = el("taskExportPanel");
    const anchor = taskPanel || form?.querySelector(".dialogActions");
    if (!anchor) return;

    const panel = document.createElement("section");
    panel.id = "notionPanel";
    panel.className = "notionPanel";
    panel.innerHTML = `
      <div class="notionPanelHead">
        <h3>Notion — zápisy ze schůzek</h3>
        <p id="notionPanelStatus" class="hint">Propojte e-mail se zápisem schůzky v Notion.</p>
      </div>
      <div id="notionLinkedBox" class="notionLinkedBox" hidden>
        <span>Propojeno: </span><span id="notionLinkInfo"></span>
        <button id="notionUnlinkBtn" type="button" class="button small secondary">Odpojit</button>
        <button id="notionOpenBtn" type="button" class="button small secondary">Otevřít</button>
        <button id="notionAppendBtn" type="button" class="button small accent">Přidat e-mail do zápisu</button>
      </div>
      <div class="notionSearchRow">
        <label>Hledat zápis
          <input id="notionSearchInput" type="search" placeholder="např. Kolegium, OVV, porada…" />
        </label>
        <button id="notionSearchBtn" type="button" class="button secondary">Hledat</button>
      </div>
      <ul id="notionSearchResults" class="notionSearchResults"></ul>
      <div class="notionExportRow">
        <button id="notionExportBtn" type="button" class="button secondary">Vytvořit novou stránku v Notion</button>
        <button id="notionSettingsBtn" type="button" class="button secondary">Nastavení Notion</button>
      </div>
    `;

    if (taskPanel) taskPanel.insertAdjacentElement("afterend", panel);
    else anchor.parentNode.insertBefore(panel, anchor);

    el("notionUnlinkBtn").addEventListener("click", () => {
      const record = getCurrentRecord();
      if (!record?.notion_link) return;
      clearNotionLink(record);
      updateNotionPanel();
    });

    el("notionOpenBtn").addEventListener("click", () => {
      const url = getCurrentRecord()?.notion_link?.url;
      if (url) window.open(url, "_blank", "noopener");
    });

    el("notionAppendBtn").addEventListener("click", async () => {
      const record = getCurrentRecord();
      const pageId = record?.notion_link?.pageId;
      if (!record || !pageId) return alert("Nejdříve propojte zápis ze schůzky.");
      const btn = el("notionAppendBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Přidávám…";
      try {
        await appendToPage(pageId, buildRecordFromForm(record));
        alert("Shrnutí e-mailu bylo přidáno do Notion zápisu.");
      } catch (error) {
        handleNotionError(error, record);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    async function runSearch() {
      const btn = el("notionSearchBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Hledám…";
      try {
        const results = await searchMeetings(el("notionSearchInput").value);
        renderSearchResults(results);
      } catch (error) {
        handleNotionError(error);
        renderSearchResults([]);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    }

    el("notionSearchBtn").addEventListener("click", runSearch);
    el("notionSearchInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); runSearch(); }
    });

    el("notionExportBtn").addEventListener("click", async () => {
      const settings = loadSettings();
      const dbId = parseNotionId(settings.exportDatabaseId) || parseNotionId(settings.meetingsDatabaseId);
      if (!dbId) return alert("V nastavení Notion doplňte exportní databázi nebo databázi schůzek.");
      const record = buildRecordFromForm(getCurrentRecord());
      const btn = el("notionExportBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Exportuji…";
      try {
        const created = await createPageInDatabase(dbId, record);
        stampNotionLink(record, created);
        updateNotionPanel();
        alert(`Vytvořena stránka v Notion: ${created.title}`);
      } catch (error) {
        handleNotionError(error, record);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("notionSettingsBtn").addEventListener("click", openSettingsDialog);
  }

  function buildRecordFromForm(base) {
    return {
      ...(base || {}),
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
      id: el("editId")?.value,
      kb_id: el("editId")?.value
    };
  }

  async function handleNotionError(error, record) {
    if (isCorsError(error)) {
      const text = buildRecordMarkdown(record || buildRecordFromForm(getCurrentRecord()));
      try {
        await navigator.clipboard.writeText(text);
        alert(
          "Notion API nelze volat přímo z prohlížeče (CORS).\n\n" +
          "Text byl zkopírován do schránky — vložte ho do Notion ručně.\n\n" +
          "Alternativa: použijte Zapier/Make webhook nebo Supabase Edge Function jako proxy."
        );
      } catch (_) {
        alert("Notion API není z prohlížeče dostupné. Zkopírujte obsah ručně z pole Shrnutí.");
      }
      return;
    }
    alert("Notion: " + (error.message || error));
  }

  function injectSettingsDialog() {
    if (el("notionSettingsDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "notionSettingsDialog";
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialogHeader">
          <h2>Notion — nastavení</h2>
          <button class="iconButton" value="cancel">×</button>
        </div>
        <p class="hint">Vytvořte integraci na <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">notion.so/my-integrations</a> a sdílejte databázi se zápisy se schůzek s touto integrací (Invite).</p>
        <label>Integration token
          <input id="notionToken" type="password" placeholder="secret_…" autocomplete="off" />
        </label>
        <label>ID databáze zápisů ze schůzek
          <input id="notionMeetingsDb" placeholder="URL nebo ID databáze schůzek" />
        </label>
        <label>ID exportní databáze (volitelné)
          <input id="notionExportDb" placeholder="kam vytvářet nové stránky z e-mailů" />
        </label>
        <details class="taskExportDetails">
          <summary>Názvy sloupců v Notion (pokud se liší)</summary>
          <label>Název / title
            <input id="notionPropTitle" placeholder="Name" />
          </label>
          <label>Datum
            <input id="notionPropDate" placeholder="Datum" />
          </label>
          <label>Typ schůzky
            <input id="notionPropMeeting" placeholder="Typ" />
          </label>
          <label>KB ID
            <input id="notionPropKbId" placeholder="KB ID" />
          </label>
        </details>
        <p id="notionTestHint" class="hint">Z URL databáze použijte 32 znaků ID, nebo vložte celý odkaz.</p>
        <button id="notionTestBtn" type="button" class="button secondary">Otestovat Notion</button>
        <div class="dialogActions">
          <button value="cancel" class="button secondary">Zavřít</button>
          <button id="saveNotionSettingsBtn" type="button" class="button accent">Uložit</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    el("notionTestBtn").addEventListener("click", async () => {
      const btn = el("notionTestBtn");
      const hint = el("notionTestHint");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Testuji…";
      try {
        const msg = await testConnectionWithForm();
        hint.textContent = msg;
        hint.className = "hint ok";
      } catch (error) {
        hint.textContent = error.message || String(error);
        hint.className = "hint danger";
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("saveNotionSettingsBtn").addEventListener("click", () => {
      const s = loadSettings();
      s.integrationToken = el("notionToken").value;
      s.meetingsDatabaseId = parseNotionId(el("notionMeetingsDb").value) || el("notionMeetingsDb").value;
      s.exportDatabaseId = parseNotionId(el("notionExportDb").value) || el("notionExportDb").value;
      s.properties.title = n(el("notionPropTitle").value) || DEFAULTS.properties.title;
      s.properties.date = n(el("notionPropDate").value) || DEFAULTS.properties.date;
      s.properties.meetingType = n(el("notionPropMeeting").value) || DEFAULTS.properties.meetingType;
      s.properties.kbId = n(el("notionPropKbId").value) || DEFAULTS.properties.kbId;
      saveSettings(s);
      dialog.close();
      updateNotionPanel();
    });
  }

  async function testConnectionWithForm() {
    return testConnection({
      ...loadSettings(),
      integrationToken: el("notionToken").value,
      meetingsDatabaseId: parseNotionId(el("notionMeetingsDb").value) || el("notionMeetingsDb").value
    });
  }

  function openSettingsDialog() {
    injectSettingsDialog();
    const s = loadSettings();
    el("notionToken").value = s.integrationToken || "";
    el("notionMeetingsDb").value = s.meetingsDatabaseId || "";
    el("notionExportDb").value = s.exportDatabaseId || "";
    el("notionPropTitle").value = s.properties.title || "";
    el("notionPropDate").value = s.properties.date || "";
    el("notionPropMeeting").value = s.properties.meetingType || "";
    el("notionPropKbId").value = s.properties.kbId || "";
    el("notionSettingsDialog").showModal();
  }

  function injectSettingsPage() {
    const page = el("page-nastaveni");
    if (!page || el("notionSettingsPanel")) return;

    const panel = document.createElement("section");
    panel.id = "notionSettingsPanel";
    panel.className = "panel";
    panel.innerHTML = `
      <h2>Notion — zápisy ze schůzek</h2>
      <p id="notionKeyStatus" class="notionKeyStatus hint">Kontroluji nastavení…</p>
      <p class="hint">Propojte e-maily se zápisy schůzek v Notion. Vyhledání, odkaz na zápis, přidání shrnutí e-mailu do stránky.</p>
      <div class="settingsActions">
        <button id="notionSettingsPageBtn" type="button" class="button secondary">Nastavení Notion</button>
      </div>
    `;
    const insertBefore = [...page.querySelectorAll(".panel")].find(p => p.querySelector("h2")?.textContent === "Témata v Supabase");
    if (insertBefore) page.insertBefore(panel, insertBefore);
    else page.appendChild(panel);

    el("notionSettingsPageBtn").addEventListener("click", openSettingsDialog);
    updateNotionStatus();
  }

  function injectMeetingsBrowser() {
    const root = el("analyticsAdvancedRoot");
    if (!root || el("notionMeetingsRoot")) return;

    const box = document.createElement("section");
    box.id = "notionMeetingsRoot";
    box.className = "panel";
    box.innerHTML = `
      <div class="sectionHeader">
        <h2>Zápisy ze schůzek (Notion)</h2>
        <button id="notionMeetingsRefreshBtn" type="button" class="button small secondary">Načíst z Notion</button>
      </div>
      <p class="hint">Poslední zápisy z propojené Notion databáze — kliknutím otevřete v Notion.</p>
      <div id="notionMeetingsList" class="notionMeetingsList"></div>
    `;
    root.insertBefore(box, root.firstChild);

    el("notionMeetingsRefreshBtn").addEventListener("click", async () => {
      const list = el("notionMeetingsList");
      const btn = el("notionMeetingsRefreshBtn");
      btn.disabled = true;
      list.textContent = "Načítám…";
      try {
        const results = await searchMeetings("");
        if (!results.length) {
          list.innerHTML = `<p class="hint">Žádné zápisy — zkontrolujte nastavení Notion.</p>`;
          return;
        }
        list.innerHTML = results.map(item => `
          <a class="notionMeetingCard" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="smallMuted">${escapeHtml(item.date || item.lastEdited?.slice(0, 10) || "")}</span>
          </a>
        `).join("");
      } catch (error) {
        list.innerHTML = `<p class="hint danger">${escapeHtml(error.message || "Notion nedostupné")}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function enhanceOpenRecord() {
    if (!window.openRecord || window.openRecord.__notionEnhanced) return;
    const original = window.openRecord;
    window.openRecord = function (...args) {
      original(...args);
      setTimeout(updateNotionPanel, 0);
    };
    window.openRecord.__notionEnhanced = true;
  }

  function enhanceSaveRecord() {
    if (!window.saveRecord || window.saveRecord.__notionEnhanced) return;
    const original = window.saveRecord;
    window.saveRecord = async function (e) {
      const id = el("editId")?.value;
      const idx = Array.isArray(records) ? records.findIndex(x => getRecordIdSafe(x) === id) : -1;
      const notionLink = idx >= 0 ? records[idx]?.notion_link : null;
      await original(e);
      if (notionLink && idx >= 0 && records[idx]) {
        records[idx].notion_link = notionLink;
        if (typeof persist === "function") persist();
      }
    };
    window.saveRecord.__notionEnhanced = true;
  }

  window.kbNotion = {
    loadSettings,
    saveSettings,
    searchMeetings,
    testConnection,
    getNotionBadge,
    stampNotionLink,
    openSettingsDialog,
    parseNotionId
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectSettingsDialog();
    injectRecordPanel();
    injectSettingsPage();
    injectMeetingsBrowser();
    enhanceOpenRecord();
    enhanceSaveRecord();
    updateNotionStatus();
    setTimeout(() => {
      injectRecordPanel();
      updateNotionPanel();
    }, 350);
  });
})();
