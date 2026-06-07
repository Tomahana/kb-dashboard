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
    if (dashed) return dashed[0].replace(/-/g, "").toLowerCase();

    const beforeV = input.match(/([0-9a-f]{32})\?v=/i);
    if (beforeV) return beforeV[1].toLowerCase();

    const fromUrl = input.match(/(?:^|\/|-)([0-9a-f]{32})(?:[/?#]|$)/i);
    if (fromUrl) return fromUrl[1].toLowerCase();

    if (/^[0-9a-f]{32}$/i.test(input)) return input.toLowerCase();

    const hexRuns = input.match(/[0-9a-f]{32}/gi);
    if (hexRuns?.length) return hexRuns[hexRuns.length - 1].toLowerCase();

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

  function isProxyMissingError(errorOrData, status) {
    const msg = (errorOrData?.message || errorOrData?.error || "").toString().toLowerCase();
    return status === 404 || msg.includes("proxy") || msg.includes("function not found");
  }

  async function getSupabaseAccessToken() {
    if (!window.kbAuth?.getSession) return null;
    const session = await window.kbAuth.getSession();
    return session?.access_token || null;
  }

  function parseNotionError(data, status) {
    if (data?.message) return data.message;
    if (data?.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
    if (status === 401) return "Neplatný Notion token nebo nepřihlášená session.";
    if (status === 404) return "Notion databáze nebo stránka nenalezena — zkontrolujte ID a sdílení s integrací.";
    if (status === 403) return "Integrace nemá přístup — v Notion u databáze přidejte Connection k integraci.";
    return `Notion HTTP ${status}`;
  }

  function proxyNotDeployedMessage() {
    return (
      "Notion proxy (Edge Function) není nasazená.\n\n" +
      "1. Otevřete Supabase Dashboard → Edge Functions\n" +
      "   https://supabase.com/dashboard/project/xrgdfghiwjyrdckpjzdj/functions\n" +
      "2. Vytvořte funkci notion-proxy a vložte kód z NOTION.md\n" +
      "3. Deploy → znovu Otestovat Notion\n\n" +
      "Do té doby použijte „Ruční propojení odkazem“ v dialogu e-mailu."
    );
  }

  async function notionFetchViaProxy(path, options, notionToken) {
    const client = window.kbAuth?.getClient?.();
    if (!client) throw new Error("Chybí Supabase klient — přihlaste se znovu.");

    const method = options.method || (options.body ? "POST" : "GET");
    const body = options.body ? JSON.parse(options.body) : null;

    let data = null;
    let error = null;
    try {
      const result = await client.functions.invoke("notion-proxy", {
        body: { notionToken, path, method, body }
      });
      data = result.data;
      error = result.error;
    } catch (invokeError) {
      if (isCorsError(invokeError)) throw new Error(proxyNotDeployedMessage());
      throw invokeError;
    }

    if (error) {
      const ctx = error.context;
      let status = 0;
      let payload = {};
      if (ctx && typeof ctx.json === "function") {
        try {
          payload = await ctx.json();
          status = ctx.status || 0;
        } catch (_) {}
      }
      const msg = (payload?.error || payload?.message || error.message || "").toString();
      if (isProxyMissingError({ message: msg }, status) || /failed to fetch/i.test(msg)) {
        throw new Error(proxyNotDeployedMessage());
      }
      throw new Error(parseNotionError(payload, status) || msg);
    }

    if (data?.error) {
      throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }
    return data;
  }

  async function notionFetch(path, options = {}) {
    const settings = loadSettings();
    const notionToken = n(settings.integrationToken);
    if (!notionToken) throw new Error("V Nastavení doplňte Notion Integration Token.");

    if (!(await getSupabaseAccessToken())) {
      throw new Error("Pro Notion se nejdříve přihlaste do KB Dashboardu (Supabase Auth).");
    }

    try {
      return await notionFetchViaProxy(path, options, notionToken);
    } catch (error) {
      if (isCorsError(error) || isProxyMissingError(error) || /proxy.*není nasazen/i.test(error.message || "")) {
        throw new Error(error.message || proxyNotDeployedMessage());
      }
      throw error;
    }
  }

  function linkManualNotionUrl(rawUrl, titleHint) {
    const url = n(rawUrl);
    const pageId = parseNotionId(url);
    if (!pageId) throw new Error("Vložte platný odkaz na stránku Notion (https://www.notion.so/…).");
    const record = getCurrentRecord();
    if (!record) throw new Error("Nejdříve otevřete e-mail.");
    const finalUrl = /^https?:\/\//i.test(url) ? url.split("?")[0] : notionPageUrl(pageId);
    stampNotionLink(record, {
      pageId,
      url: finalUrl,
      title: n(titleHint) || "Zápis Notion"
    });
    updateNotionPanel();
    return finalUrl;
  }

  function detectPropertiesFromSchema(schema) {
    const props = schema?.properties || {};
    const detected = { ...DEFAULTS.properties };
    for (const [name, prop] of Object.entries(props)) {
      if (prop?.type === "title") detected.title = name;
      if (prop?.type === "date" && !detected.date) detected.date = name;
      if (prop?.type === "rich_text" && /kb/i.test(name)) detected.kbId = name;
      if (prop?.type === "select" && /typ|schůz|meeting/i.test(name)) detected.meetingType = name;
    }
    return detected;
  }

  async function fetchDatabaseSchema(databaseId, settings) {
    const id = parseNotionId(databaseId);
    if (!id) throw new Error("Neplatné ID Notion databáze.");
    return notionFetch(`/databases/${toDashedId(id)}`, { method: "GET" });
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
    const baseBody = {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 30
    };

    const q = n(query);
    let data;

    if (q) {
      try {
        data = await queryDatabase(dbId, {
          ...baseBody,
          filter: { property: titleProp, title: { contains: q } }
        });
      } catch (error) {
        if (!/property|validation|column/i.test(error.message || "")) throw error;
        data = await queryDatabase(dbId, baseBody);
      }
    } else {
      data = await queryDatabase(dbId, baseBody);
    }

    let results = (data.results || []).map(page => mapMeetingPage(page, settings));
    if (q && results.length) {
      const needle = l(q);
      const filtered = results.filter(item => l(item.title).includes(needle));
      if (filtered.length) results = filtered;
    }
    return results;
  }

  async function testConnection(overrideSettings) {
    const settings = overrideSettings || loadSettings();
    const dbId = parseNotionId(settings.meetingsDatabaseId);
    if (!dbId) throw new Error("Vyplňte Integration Token a ID databáze schůzek.");

    const schema = await fetchDatabaseSchema(dbId, settings);
    const detected = detectPropertiesFromSchema(schema);
    const merged = { ...settings, properties: { ...settings.properties, ...detected } };
    if (!overrideSettings) saveSettings(merged);

    const data = await queryDatabase(dbId, { page_size: 3 });
    const sample = (data.results || [])[0];
    const name = sample ? mapMeetingPage(sample, merged).title : null;
    const dbTitle = schema?.title?.[0]?.plain_text || "databáze";
    return name
      ? `Notion OK — „${dbTitle}“ (sloupec „${merged.properties.title}“). Např. zápis: „${name}“.`
      : `Notion OK — „${dbTitle}“ připojena (zatím bez záznamů). Sloupec názvu: „${merged.properties.title}“.`;
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
      <div class="notionManualBox">
        <strong>Ruční propojení (funguje hned, bez proxy)</strong>
        <div class="notionManualRow">
          <label>Odkaz na zápis v Notion
            <input id="notionManualUrl" type="url" placeholder="https://www.notion.so/…" />
          </label>
          <button id="notionManualLinkBtn" type="button" class="button accent">Propojit</button>
        </div>
        <button id="notionCopyMdBtn" type="button" class="button secondary">Kopírovat shrnutí pro Notion</button>
      </div>
      <div class="notionSearchRow">
        <label>Hledat zápis (vyžaduje nasazenou proxy)
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

    el("notionManualLinkBtn").addEventListener("click", () => {
      try {
        const url = linkManualNotionUrl(el("notionManualUrl").value);
        alert("Propojeno s Notion:\n" + url);
      } catch (error) {
        alert(error.message || error);
      }
    });

    el("notionCopyMdBtn").addEventListener("click", async () => {
      const record = buildRecordFromForm(getCurrentRecord());
      const text = buildRecordMarkdown(record);
      try {
        await navigator.clipboard.writeText(text);
        el("notionCopyMdBtn").textContent = "Zkopírováno ✓";
        setTimeout(() => { el("notionCopyMdBtn").textContent = "Kopírovat shrnutí pro Notion"; }, 1500);
      } catch (_) {
        alert("Nepodařilo se zkopírovat — označte text ze Shrnutí ručně.");
      }
    });

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
    const msg = error?.message || String(error);
    if (isCorsError(error) || /proxy|failed to fetch/i.test(msg)) {
      alert(
        msg + "\n\n" +
        "Zatím použijte v dialogu e-mailu:\n" +
        "• Ruční propojení odkazem (vložte URL zápisu)\n" +
        "• Kopírovat shrnutí pro Notion"
      );
      return;
    }
    alert("Notion: " + msg);
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
        <div class="notionDeployWarning">
          <strong>Proxy se nenasazuje v SQL Editoru.</strong>
          <p class="hint">V Supabase Dashboard → <a href="https://supabase.com/dashboard/project/xrgdfghiwjyrdckpjzdj/functions" target="_blank" rel="noopener">Edge Functions</a> vytvořte funkci <code>notion-proxy</code> a vložte kód ze souboru <code>supabase/functions/notion-proxy/index.ts</code>. Podrobně: <code>NOTION.md</code>.</p>
        </div>
        <p class="hint">Notion integrace: <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">notion.so/my-integrations</a> → token <code>secret_…</code> → u databáze zápisů přidejte Connection k integraci.</p>
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
        <button id="notionTestBtn" type="button" class="button secondary">Otestovat Notion API</button>
        <p class="hint">Bez nasazené proxy funguje <strong>ruční propojení odkazem</strong> v dialogu e-mailu — API test není nutný.</p>
        <details class="taskExportDetails">
          <summary>Kód pro Edge Function notion-proxy (kopírovat do Supabase)</summary>
          <textarea id="notionProxyCode" class="notionProxyCode" readonly rows="14"></textarea>
          <button id="notionCopyProxyBtn" type="button" class="button secondary">Kopírovat kód proxy</button>
        </details>
        <div class="dialogActions">
          <button value="cancel" class="button secondary">Zavřít</button>
          <button id="saveNotionSettingsBtn" type="button" class="button accent">Uložit</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    const proxyCode = `import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const NOTION_VERSION = "2022-06-28";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Chybí Authorization" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Neplatná session" }, 401);
    const payload = await req.json();
    const notionToken = (payload.notionToken || "").toString().trim();
    const path = (payload.path || "").toString().trim();
    const method = (payload.method || "GET").toString().toUpperCase();
    const body = payload.body ?? null;
    if (!notionToken || !path?.startsWith("/")) return json({ error: "Chybí notionToken nebo path" }, 400);
    const notionRes = await fetch(\`https://api.notion.com/v1\${path}\`, {
      method,
      headers: { Authorization: \`Bearer \${notionToken}\`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined
    });
    const text = await notionRes.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
    return new Response(JSON.stringify(parsed), { status: notionRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return json({ error: error?.message || "Proxy error" }, 500);
  }
});
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}`;
    const codeBox = el("notionProxyCode");
    if (codeBox) codeBox.value = proxyCode;
    el("notionCopyProxyBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(proxyCode);
        el("notionCopyProxyBtn").textContent = "Zkopírováno ✓";
        setTimeout(() => { el("notionCopyProxyBtn").textContent = "Kopírovat kód proxy"; }, 1500);
      } catch (_) {
        codeBox?.select();
        document.execCommand("copy");
      }
    });

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
      <p class="hint">Propojte e-maily se zápisy schůzek v Notion. Nejdříve nasajte Edge Function <code>notion-proxy</code> (ne SQL Editor — viz NOTION.md).</p>
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
    parseNotionId,
    linkManualNotionUrl,
    proxyNotDeployedMessage
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
