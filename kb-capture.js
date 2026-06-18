// Zachytávání znalostí – vložení e-mailu, poznámky, příloh; AI klasifikace a propojení s tématy.

(function () {
  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `kb-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let pendingFiles = [];

  function getRecords() {
    return Array.isArray(records) ? records : [];
  }

  function getRecordId(r) {
    if (window.kbSelection?.getRecordId) return window.kbSelection.getRecordId(r);
    return r?.id || r?.kb_id || r?.KB_ID || "";
  }

  function parseEmailHeaders(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const headers = {};
    let i = 0;
    let currentKey = null;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") { i++; break; }
      if (/^\s/.test(line) && currentKey) {
        headers[currentKey] = `${headers[currentKey]} ${line.trim()}`;
        continue;
      }
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      currentKey = m[1].toLowerCase();
      headers[currentKey] = m[2].trim();
    }
    const body = lines.slice(i).join("\n").trim();
    return { headers, body };
  }

  function decodeQuotedPrintable(str) {
    return str
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function extractEmlBody(raw) {
    const text = raw.replace(/\r\n/g, "\n");
    const boundaryMatch = text.match(/boundary="?([^"\s;]+)"?/i);
    if (!boundaryMatch) {
      const { headers, body } = parseEmailHeaders(text);
      const enc = (headers["content-transfer-encoding"] || "").toLowerCase();
      let decoded = body;
      if (enc.includes("quoted-printable")) decoded = decodeQuotedPrintable(body);
      return { headers, body: decoded };
    }
    const boundary = boundaryMatch[1];
    const parts = text.split(`--${boundary}`);
    const { headers } = parseEmailHeaders(text);
    for (const part of parts) {
      if (!part.trim() || part.trim() === "--") continue;
      const blank = part.indexOf("\n\n");
      if (blank === -1) continue;
      const partHeaders = part.slice(0, blank).toLowerCase();
      let partBody = part.slice(blank + 2).trim();
      if (partHeaders.includes("content-type: text/plain")) {
        if (partHeaders.includes("quoted-printable")) partBody = decodeQuotedPrintable(partBody);
        return { headers, body: partBody };
      }
    }
    const { body } = parseEmailHeaders(text);
    return { headers, body };
  }

  function parsePastedEmail(text) {
    const raw = n(text);
    if (!raw) return { title: "", odesilatel: "", datum_emailu: "", body: "", message_id: "" };

    const fwdMatch = raw.match(/(?:^|\n)----------\s*Přeposlaná zpráva\s*----------[\s\S]*?(?:^|\n)Od:\s*(.+)$/im);
    const emlLike = /^from:/im.test(raw) || /^subject:/im.test(raw) || /^date:/im.test(raw);

    if (emlLike) {
      const { headers, body } = extractEmlBody(raw);
      return {
        title: headers.subject || headers.předmět || "Bez názvu",
        odesilatel: headers.from || headers.od || "",
        datum_emailu: headers.date || headers.datum || "",
        message_id: headers["message-id"] || "",
        body: body || raw
      };
    }

    const subjectMatch = raw.match(/(?:^|\n)(?:Předmět|Subject):\s*(.+)/i);
    const fromMatch = raw.match(/(?:^|\n)(?:Od|From):\s*(.+)/i);
    const dateMatch = raw.match(/(?:^|\n)(?:Datum|Date|Sent):\s*(.+)/i);
    const msgIdMatch = raw.match(/(?:^|\n)Message-ID:\s*(.+)/i);

    let body = raw;
    const splitMarkers = [
      /\n-{2,}\s*Původní zpráva\s*-{2,}\n/i,
      /\n-{2,}\s*Original Message\s*-{2,}\n/i,
      /\nFrom:\s*.+\nSent:\s*.+\nTo:/i
    ];
    for (const re of splitMarkers) {
      const m = raw.match(re);
      if (m?.index != null) {
        body = raw.slice(0, m.index).trim();
        break;
      }
    }

    return {
      title: subjectMatch?.[1]?.trim() || (fwdMatch ? "Přeposlaný e-mail" : "Vložený text"),
      odesilatel: fromMatch?.[1]?.trim() || "",
      datum_emailu: dateMatch?.[1]?.trim() || "",
      message_id: msgIdMatch?.[1]?.trim() || "",
      body: body || raw
    };
  }

  async function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => reject(new Error(`Soubor ${file.name} se nepodařilo přečíst.`));
      reader.readAsText(file, "utf-8");
    });
  }

  async function readFileArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Soubor ${file.name} se nepodařilo přečíst.`));
      reader.readAsArrayBuffer(file);
    });
  }

  let msgReaderPromise = null;

  function loadMsgReader() {
    if (!msgReaderPromise) {
      msgReaderPromise = import("https://esm.sh/@kenjiuno/msgreader-web-ng@0.2.0-alpha1")
        .then((mod) => mod.MsgReader || mod.default)
        .catch((err) => {
          msgReaderPromise = null;
          throw new Error(`Knihovna pro .msg se nepodařila načíst: ${err.message || err}`);
        });
    }
    return msgReaderPromise;
  }

  function formatMsgSender(data) {
    const name = n(data?.senderName);
    const email = n(data?.senderEmail);
    if (name && email) return `${name} <${email}>`;
    return email || name || "";
  }

  function formatMsgDate(data) {
    const raw = data?.messageDeliveryTime || data?.creationTime || data?.lastModificationTime;
    if (!raw) return "";
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString();
  }

  async function parseMsgBuffer(arrayBuffer) {
    const MsgReader = await loadMsgReader();
    const reader = new MsgReader(arrayBuffer);
    const data = reader.getFileData();
    const body = n(data?.body) || n(data?.bodyHTML)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
    return {
      title: n(data?.subject) || "Bez názvu",
      odesilatel: formatMsgSender(data),
      datum_emailu: formatMsgDate(data),
      message_id: n(data?.messageId) || n(data?.internetMessageId) || "",
      body: body || n(data?.subject) || "Prázdná zpráva (.msg)"
    };
  }

  function looksLikeEmailBlock(text) {
    const sample = text.slice(0, 1200);
    return /(?:^|\n)(?:From|Od|Subject|Předmět|Sent|Date|Datum|Odesláno)\s*:/im.test(sample);
  }

  function splitBulkEmailText(text) {
    const normalized = n(text).replace(/\r\n/g, "\n");
    if (!normalized) return [];

    const headerBlockRe = /(?=^(?:From|Od)\s*:\s*.+(?:\n(?:Sent|Date|Datum|Odesláno|To|Komu)\s*:|\n(?:Subject|Předmět)\s*:))/im;
    let parts = normalized.split(headerBlockRe).map(p => p.trim()).filter(Boolean);

    if (parts.length <= 1) {
      const alt = normalized.split(/\n_{10,}\n+/).map(p => p.trim()).filter(Boolean);
      if (alt.length > 1) parts = alt;
    }
    if (parts.length <= 1) {
      const alt = normalized.split(/\n-{5,}\s*(?:Přeposlaná zpráva|Forwarded message|Original Message|Původní zpráva)\s*-{5,}\n/i)
        .map(p => p.trim()).filter(Boolean);
      if (alt.length > 1) parts = alt;
    }

    if (!parts.length) return [];
    if (parts.length === 1) return [parts[0]];
    const filtered = parts.filter(looksLikeEmailBlock);
    return filtered.length ? filtered : parts;
  }

  function fileExt(name) {
    const m = n(name).match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : "";
  }

  async function parseMessagesFromFile(file) {
    const ext = fileExt(file.name);
    if (ext === "msg") {
      const buffer = await readFileArrayBuffer(file);
      const parsed = await parseMsgBuffer(buffer);
      return [{ parsed, file, source: "msg" }];
    }
    if (ext === "eml") {
      const text = await readFileText(file);
      return [{ parsed: parsePastedEmail(text), file, source: "eml" }];
    }
    const text = await readFileText(file);
    const chunks = splitBulkEmailText(text);
    if (!chunks.length) return [{ parsed: parsePastedEmail(text), file, source: "paste" }];
    return chunks.map((chunk, index) => ({
      parsed: parsePastedEmail(chunk),
      file: chunks.length === 1 ? file : null,
      source: "paste",
      partLabel: chunks.length > 1 ? `${file.name} #${index + 1}` : file.name
    }));
  }

  function buildCaptureRecord(parsed, options = {}) {
    const {
      mode = "email",
      source = "paste",
      link = "",
      datumFallback = new Date().toISOString()
    } = options;
    const kbId = uuid();
    const now = new Date().toISOString();
    return {
      id: kbId,
      kb_id: kbId,
      title: parsed.title || "Bez názvu",
      odesilatel: parsed.odesilatel || "",
      datum_emailu: parsed.datum_emailu || datumFallback,
      datum_pridani: now,
      agenda: "Nezařazeno",
      stav: "K roztřídění",
      typ: mode === "note" ? "Strategická poznámka" : "Informace",
      kam_patri: "Nezařazeno",
      priorita: "Běžná",
      odkaz_na_email: n(link) || null,
      source,
      message_id: parsed.message_id || null,
      received_at: now,
      text: parsed.body || "",
      __source: "supabase"
    };
  }

  function setStatus(text, isError) {
    const node = el("captureStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("captureStatusError", !!isError);
  }

  function renderAttachmentList() {
    const box = el("captureAttachmentList");
    if (!box) return;
    if (!pendingFiles.length) {
      box.innerHTML = `<p class="hint">Zatím žádné přílohy.</p>`;
      return;
    }
    box.innerHTML = `<ul class="captureAttachmentItems">${pendingFiles.map((f, i) =>
      `<li><span>${html(f.name)}</span> <span class="hint">${Math.round(f.size / 1024)} kB</span>
      <button type="button" class="button small secondary" data-remove-file="${i}">×</button></li>`
    ).join("")}</ul>`;
    box.querySelectorAll("[data-remove-file]").forEach(btn => {
      btn.addEventListener("click", () => {
        pendingFiles.splice(Number(btn.dataset.removeFile), 1);
        renderAttachmentList();
      });
    });
  }

  function openCaptureDialog(mode = "email") {
    pendingFiles = [];
    if (el("captureMode")) el("captureMode").value = mode;
    if (el("captureSubject")) el("captureSubject").value = "";
    if (el("captureSender")) el("captureSender").value = "";
    if (el("captureDate")) el("captureDate").value = new Date().toISOString().slice(0, 16);
    if (el("captureBody")) el("captureBody").value = "";
    if (el("captureBulkBody")) el("captureBulkBody").value = "";
    if (el("captureLink")) el("captureLink").value = "";
    if (el("captureBulkLink")) el("captureBulkLink").value = "";
    if (el("captureBulkFileInput")) el("captureBulkFileInput").value = "";
    if (el("captureAutoAi")) el("captureAutoAi").checked = true;
    if (el("captureAutoTopics")) el("captureAutoTopics").checked = true;
    setStatus("");
    renderAttachmentList();
    updateCaptureModeUi();
    el("captureDialog")?.showModal();
  }

  function updateCaptureModeUi() {
    const mode = el("captureMode")?.value || "email";
    const emailFields = el("captureEmailFields");
    const singleFields = el("captureSingleFields");
    const bulkFields = el("captureBulkFields");
    const saveBtn = el("captureSaveBtn");
    const bulkBtn = el("captureBulkSaveBtn");
    if (emailFields) emailFields.hidden = mode !== "email";
    if (singleFields) singleFields.hidden = mode === "bulk";
    if (bulkFields) bulkFields.hidden = mode !== "bulk";
    if (saveBtn) saveBtn.hidden = mode === "bulk";
    if (bulkBtn) bulkBtn.hidden = mode !== "bulk";
    const hint = el("captureBodyHint");
    if (hint) {
      hint.textContent = mode === "bulk"
        ? "Volitelně vložte více zpráv z Outlooku (oddělené Od:/From:). Nebo použijte tlačítko pro výběr souborů .msg / .eml / .txt."
        : mode === "email"
          ? "Vložte celý e-mail (včetně hlaviček Od/Předmět) nebo tělo přeposlané zprávy."
          : "Vložte text poznámky, zápisu z jednání nebo jiný podklad.";
    }
  }

  async function handleEmlImport(file) {
    const text = await readFileText(file);
    const parsed = parsePastedEmail(text);
    if (el("captureSubject") && parsed.title) el("captureSubject").value = parsed.title;
    if (el("captureSender") && parsed.odesilatel) el("captureSender").value = parsed.odesilatel;
    if (el("captureBody")) el("captureBody").value = parsed.body || text;
    pendingFiles.push(file);
    renderAttachmentList();
    setStatus("Soubor .eml načten — zkontrolujte předmět a text.");
  }

  async function handleMsgImport(file) {
    const buffer = await readFileArrayBuffer(file);
    const parsed = await parseMsgBuffer(buffer);
    if (el("captureSubject") && parsed.title) el("captureSubject").value = parsed.title;
    if (el("captureSender") && parsed.odesilatel) el("captureSender").value = parsed.odesilatel;
    if (el("captureBody")) el("captureBody").value = parsed.body || "";
    pendingFiles.push(file);
    renderAttachmentList();
    setStatus("Soubor .msg načten — zkontrolujte předmět a text.");
  }

  async function handleMailFileImport(file) {
    const ext = fileExt(file.name);
    if (ext === "msg") return handleMsgImport(file);
    if (ext === "eml") return handleEmlImport(file);
    throw new Error(`Nepodporovaný formát: ${file.name}`);
  }

  async function suggestTopics(record) {
    if (!window.kbAiClassify?.hasApiKey?.() || !window.kbAiClassify?.callChat) return [];
    await window.kbTopics?.loadTopics?.();
    const topics = window.kbTopics?.topics || [];
    if (!topics.length) return [];

    const topicLines = topics.map(t => `- id: ${t.id} | název: ${t.name}${t.agenda ? ` | agenda: ${t.agenda}` : ""}${t.description ? ` | popis: ${t.description.slice(0, 120)}` : ""}`).join("\n");
    const prompt = `Na základě tohoto záznamu vyber vhodná existující témata.

Záznam:
Předmět: ${record.title}
Odesílatel: ${record.odesilatel || "—"}
Shrnutí: ${record.shrnuti || "—"}
Text (zkráceno): ${(record.text || "").slice(0, 4000)}

Existující témata:
${topicLines}

Vrať POUZE JSON: { "topic_ids": ["uuid", ...], "reason": "krátké zdůvodnění" }
Vyber 0–3 nejvhodnější témata. Nevymýšlej nová ID.`;

    try {
      const content = await window.kbAiClassify.callChat([
        { role: "system", content: "Jsi asistent pro řazení pracovních podkladů do témat. Vrať jen validní JSON." },
        { role: "user", content: prompt }
      ], { json: true, temperature: 0.1 });
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start === -1) return [];
      const parsed = JSON.parse(content.slice(start, end + 1));
      const ids = Array.isArray(parsed.topic_ids) ? parsed.topic_ids.filter(Boolean) : [];
      return ids.filter(id => topics.some(t => t.id === id));
    } catch (err) {
      console.warn("Návrh témat selhal:", err);
      return [];
    }
  }

  async function linkTopics(recordId, topicIds) {
    if (!topicIds.length || !window.kbTopics?.addRecordsToTopic) return;
    for (const topicId of topicIds) {
      await window.kbTopics.addRecordsToTopic(topicId, [recordId]);
    }
  }

  function appendAttachmentNote(record, filenames) {
    if (!filenames.length) return record;
    const note = `Přílohy: ${filenames.join(", ")}`;
    return {
      ...record,
      poznamka: record.poznamka ? `${record.poznamka}\n${note}` : note
    };
  }

  function finalizeCapturedRecord(record) {
    if (typeof finalizeClassificationPayload === "function") {
      return finalizeClassificationPayload({ ...record });
    }
    return record;
  }

  async function persistCapturedRecord(record, { files = [], autoAi = false, autoTopics = false, statusPrefix = "" } = {}) {
    const kbId = getRecordId(record);
    if (window.kbSupabaseCapture?.createRecord) {
      try {
        await window.kbSupabaseCapture.createRecord(record, record.text);
        record.__source = "supabase";
      } catch (supaErr) {
        console.warn("Supabase insert selhal, ukládám lokálně:", supaErr);
        record.__source = "local";
      }
    } else {
      record.__source = "local";
    }

    const uploadedNames = [];
    if (files.length && window.kbSupabaseCapture?.uploadAttachment && record.__source === "supabase") {
      for (const file of files) {
        await window.kbSupabaseCapture.uploadAttachment(kbId, file);
        uploadedNames.push(file.name);
      }
    }
    if (uploadedNames.length) record = appendAttachmentNote(record, uploadedNames);

    records.unshift(record);
    if (typeof persist === "function") persist();

    if (autoAi && window.kbAiClassify?.classifyRecord) {
      setStatus(`${statusPrefix}AI klasifikace: ${record.title?.slice(0, 60) || kbId}…`);
      try {
        const proposal = await window.kbAiClassify.classifyRecord(record, { applyToForm: false });
        if (proposal) {
          record = {
            ...record,
            ...proposal,
            _aiProposal: proposal,
            stav: proposal.stav || record.stav,
            agenda: proposal.agenda || record.agenda
          };
          const idx = records.findIndex(r => getRecordId(r) === kbId);
          if (idx >= 0) records[idx] = record;
          if (typeof persist === "function") persist();
          if (window.kbSupabase?.saveRecordToSupabase && record.__source === "supabase") {
            await window.kbSupabase.saveRecordToSupabase(finalizeCapturedRecord(record));
          }
        }
      } catch (aiErr) {
        console.warn(aiErr);
      }
    }

    if (autoTopics) {
      const topicIds = await suggestTopics(record);
      if (topicIds.length) await linkTopics(kbId, topicIds);
    }

    return record;
  }

  async function collectBulkImportItems() {
    const items = [];
    const pasted = n(el("captureBulkBody")?.value);
    if (pasted) {
      const chunks = splitBulkEmailText(pasted);
      const texts = chunks.length ? chunks : [pasted];
      texts.forEach((chunk, index) => {
        items.push({
          parsed: parsePastedEmail(chunk),
          file: null,
          source: "paste",
          partLabel: texts.length > 1 ? `Vložený text #${index + 1}` : "Vložený text"
        });
      });
    }

    const bulkFiles = [...(el("captureBulkFileInput")?.files || [])];
    for (const file of bulkFiles) {
      const parsedItems = await parseMessagesFromFile(file);
      items.push(...parsedItems);
    }
    return items;
  }

  async function saveBulkCapture(e) {
    e?.preventDefault?.();
    const btn = el("captureBulkSaveBtn");
    const prevText = btn?.textContent;
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Importuji…"; }
      setStatus("Připravuji hromadný import…");

      const items = await collectBulkImportItems();
      if (!items.length) {
        setStatus("Vyberte soubory (.msg, .eml, .txt) nebo vložte text se zprávami.", true);
        return;
      }

      const autoAi = el("captureAutoAi")?.checked !== false;
      const autoTopics = el("captureAutoTopics")?.checked !== false;
      const link = n(el("captureBulkLink")?.value);
      let saved = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prefix = `[${i + 1}/${items.length}] `;
        setStatus(`${prefix}Ukládám ${item.partLabel || item.file?.name || item.parsed.title || "zprávu"}…`);
        try {
          const record = buildCaptureRecord(item.parsed, {
            mode: "email",
            source: item.source,
            link
          });
          await persistCapturedRecord(record, {
            files: item.file ? [item.file] : [],
            autoAi,
            autoTopics,
            statusPrefix: prefix
          });
          saved += 1;
        } catch (err) {
          failed += 1;
          console.warn("Bulk import selhal pro položku:", item, err);
        }
      }

      if (typeof populateFilters === "function") populateFilters();
      if (typeof render === "function") render();
      el("captureDialog")?.close();
      if (el("captureBulkFileInput")) el("captureBulkFileInput").value = "";
      document.dispatchEvent(new CustomEvent("kb:records-loaded"));

      const summary = `Import dokončen: ${saved} záznamů uloženo${failed ? `, ${failed} selhalo` : ""}.`;
      setStatus(summary, failed > 0);
      alert(summary);
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
      alert("Hromadný import selhal: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText || "Importovat vše"; }
    }
  }

  async function saveCapture(e) {
    e.preventDefault();
    const mode = el("captureMode")?.value || "email";
    if (mode === "bulk") {
      return saveBulkCapture(e);
    }
    const rawBody = n(el("captureBody")?.value);
    if (!rawBody) {
      setStatus("Vyplňte text záznamu.", true);
      return;
    }

    let parsed = { title: "", odesilatel: "", datum_emailu: "", body: rawBody, message_id: "" };
    if (mode === "email") {
      parsed = { ...parsed, ...parsePastedEmail(rawBody) };
      if (el("captureSubject")?.value) parsed.title = n(el("captureSubject").value);
      if (el("captureSender")?.value) parsed.odesilatel = n(el("captureSender").value);
    } else {
      parsed.title = n(el("captureSubject")?.value) || "Poznámka";
      parsed.odesilatel = n(el("captureSender")?.value) || "";
    }

    const dateInput = el("captureDate")?.value;
    const datumFallback = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();
    const source = mode === "email" ? "paste" : "manual";
    let record = buildCaptureRecord(parsed, {
      mode,
      source,
      link: n(el("captureLink")?.value),
      datumFallback
    });
    const kbId = getRecordId(record);

    const btn = el("captureSaveBtn");
    const prevText = btn?.textContent;
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Ukládám…"; }
      setStatus("Ukládám záznam…");

      const autoAi = el("captureAutoAi")?.checked !== false;
      const autoTopics = el("captureAutoTopics")?.checked !== false;
      record = await persistCapturedRecord(record, {
        files: pendingFiles,
        autoAi,
        autoTopics
      });

      if (typeof populateFilters === "function") populateFilters();
      if (typeof render === "function") render();

      el("captureDialog")?.close();
      document.dispatchEvent(new CustomEvent("kb:records-loaded"));
      if (typeof window.openRecord === "function") window.openRecord(kbId);

      if (!el("captureStatus")?.classList.contains("captureStatusError")) {
        alert(`Záznam uložen${autoAi ? " a klasifikován AI" : ""}${autoTopics ? " (témata navržena)" : ""}.`);
      }
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
      alert("Uložení selhalo: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText || "Uložit a klasifikovat"; }
    }
  }

  function injectCaptureUi() {
    if (!el("captureKnowledgeBtn") && el("globalActionPool")) {
      const btn = document.createElement("button");
      btn.id = "captureKnowledgeBtn";
      btn.type = "button";
      btn.className = "button accent";
      btn.textContent = "Zachytit znalost";
      el("globalActionPool").prepend(btn);
    }
    if (el("captureDialog")) {
      window.kbLayout?.mountTopbarActions?.();
      return;
    }

    document.body.insertAdjacentHTML("beforeend", `
  <dialog id="captureDialog" class="captureDialog">
    <form id="captureForm">
      <div class="dialogHeader">
        <div>
          <h2>Zachytit znalost</h2>
          <p class="hint">Vložte e-mail, poznámku nebo podklad s přílohami. AI navrhne klasifikaci a přiřadí k tématům.</p>
        </div>
        <button type="button" class="iconButton" id="captureCloseBtn">×</button>
      </div>
      <label>Typ záznamu
        <select id="captureMode">
          <option value="email">E-mail / přeposlaná zpráva</option>
          <option value="note">Poznámka / text / podklad</option>
          <option value="bulk">Hromadný import (Outlook .msg / .txt)</option>
        </select>
      </label>
      <div id="captureSingleFields">
      <div id="captureEmailFields" class="grid2">
        <label>Předmět / název
          <input id="captureSubject" type="text" placeholder="Automaticky z textu e-mailu" />
        </label>
        <label>Odesílatel
          <input id="captureSender" type="email" placeholder="email@uhk.cz" />
        </label>
      </div>
      <label>Datum
        <input id="captureDate" type="datetime-local" />
      </label>
      <label>Odkaz (Outlook / Teams / URL)
        <input id="captureLink" type="url" placeholder="https://…" />
      </label>
      <label>Text
        <span id="captureBodyHint" class="hint">Vložte celý e-mail nebo tělo zprávy.</span>
        <textarea id="captureBody" rows="12" placeholder="Vložte text e-mailu, přeposlanou zprávu nebo poznámku…"></textarea>
      </label>
      <div class="captureAttachmentBlock">
        <label class="button secondary">
          + Příloha / soubor .eml / .msg
          <input id="captureFileInput" type="file" multiple hidden accept=".eml,.msg,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,message/rfc822,application/pdf,application/vnd.ms-outlook" />
        </label>
        <label class="button secondary">
          Načíst .eml / .msg do textu
          <input id="captureEmlInput" type="file" hidden accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook" />
        </label>
        <div id="captureAttachmentList"></div>
      </div>
      </div>
      <div id="captureBulkFields" class="captureBulkFields" hidden>
        <p class="hint">Vyberte více souborů najednou — každý <strong>.msg</strong> nebo <strong>.eml</strong> = jedna zpráva. Soubor <strong>.txt</strong> z exportu Outlooku může obsahovat více zpráv (oddělené řádky Od:/From:).</p>
        <label class="button secondary">
          Vybrat soubory (.msg, .eml, .txt)
          <input id="captureBulkFileInput" type="file" multiple hidden accept=".msg,.eml,.txt,message/rfc822,application/vnd.ms-outlook,text/plain" />
        </label>
        <label>Odkaz (volitelně, společný pro všechny)
          <input id="captureBulkLink" type="url" placeholder="https://…" />
        </label>
        <label>Nebo vložte text více zpráv
          <textarea id="captureBulkBody" rows="10" placeholder="Od: …&#10;Odesláno: …&#10;Předmět: …&#10;&#10;Od: …"></textarea>
        </label>
      </div>
      <div class="captureOptions">
        <label class="checkboxLine"><input id="captureAutoAi" type="checkbox" checked /> Automaticky klasifikovat AI (OpenAI)</label>
        <label class="checkboxLine"><input id="captureAutoTopics" type="checkbox" checked /> Navrhnout a přiřadit témata</label>
      </div>
      <p id="captureStatus" class="hint captureStatus"></p>
      <div class="dialogActions">
        <button type="button" class="button secondary" id="captureCancelBtn">Zrušit</button>
        <button type="submit" class="button accent" id="captureSaveBtn">Uložit a klasifikovat</button>
        <button type="button" class="button accent" id="captureBulkSaveBtn" hidden>Importovat vše</button>
      </div>
    </form>
  </dialog>`);

    el("captureForm")?.addEventListener("submit", saveCapture);
    el("captureCloseBtn")?.addEventListener("click", () => el("captureDialog")?.close());
    el("captureCancelBtn")?.addEventListener("click", () => el("captureDialog")?.close());
    el("captureMode")?.addEventListener("change", updateCaptureModeUi);
    el("captureKnowledgeBtn")?.addEventListener("click", () => openCaptureDialog("email"));

    el("captureFileInput")?.addEventListener("change", (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = "";
      pendingFiles.push(...files);
      renderAttachmentList();
    });

    el("captureEmlInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) {
        try {
          await handleMailFileImport(file);
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      }
    });

    el("captureBulkSaveBtn")?.addEventListener("click", saveBulkCapture);

    el("captureMode")?.addEventListener("change", updateCaptureModeUi);

    window.kbLayout?.mountTopbarActions?.();
    document.dispatchEvent(new CustomEvent("kb:ui-ready"));
  }

  function injectStyles() {
    if (el("captureStyles")) return;
    const style = document.createElement("style");
    style.id = "captureStyles";
    style.textContent = `
      .captureDialog { max-width: 720px; width: min(96vw, 720px); }
      .captureAttachmentBlock { margin: .75rem 0; display: flex; flex-wrap: wrap; gap: .5rem; align-items: flex-start; }
      .captureAttachmentItems { list-style: none; padding: 0; margin: .5rem 0 0; width: 100%; }
      .captureAttachmentItems li { display: flex; gap: .5rem; align-items: center; padding: .25rem 0; }
      .captureOptions { display: flex; flex-direction: column; gap: .35rem; margin: .5rem 0; }
      .captureBulkFields { margin: .5rem 0; display: flex; flex-direction: column; gap: .65rem; }
      .captureStatusError { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    injectCaptureUi();
  }

  window.kbCapture = {
    openCaptureDialog,
    parsePastedEmail,
    splitBulkEmailText,
    parseMsgBuffer,
    parseMessagesFromFile
  };

  document.addEventListener("DOMContentLoaded", init);
})();
