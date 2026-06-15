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
    if (el("captureLink")) el("captureLink").value = "";
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
    if (emailFields) emailFields.hidden = mode === "note";
    const hint = el("captureBodyHint");
    if (hint) {
      hint.textContent = mode === "email"
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

  async function saveCapture(e) {
    e.preventDefault();
    const mode = el("captureMode")?.value || "email";
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

    const kbId = uuid();
    const now = new Date().toISOString();
    const dateInput = el("captureDate")?.value;
    const datumEmailu = dateInput ? new Date(dateInput).toISOString() : now;

    let record = {
      id: kbId,
      kb_id: kbId,
      title: parsed.title || "Bez názvu",
      odesilatel: parsed.odesilatel,
      datum_emailu: parsed.datum_emailu || datumEmailu,
      datum_pridani: now,
      agenda: "Nezařazeno",
      stav: "K roztřídění",
      typ: mode === "note" ? "Strategická poznámka" : "Informace",
      kam_patri: "Nezařazeno",
      priorita: "Běžná",
      odkaz_na_email: n(el("captureLink")?.value) || null,
      source: mode === "email" ? "paste" : "manual",
      message_id: parsed.message_id || null,
      received_at: now,
      text: parsed.body || rawBody,
      __source: "supabase"
    };

    const btn = el("captureSaveBtn");
    const prevText = btn?.textContent;
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Ukládám…"; }
      setStatus("Ukládám záznam…");

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
      if (pendingFiles.length && window.kbSupabaseCapture?.uploadAttachment && record.__source === "supabase") {
        setStatus("Nahrávám přílohy…");
        for (const file of pendingFiles) {
          await window.kbSupabaseCapture.uploadAttachment(kbId, file);
          uploadedNames.push(file.name);
        }
      }
      record = appendAttachmentNote(record, uploadedNames);

      records.unshift(record);
      if (typeof persist === "function") persist();
      if (typeof populateFilters === "function") populateFilters();
      if (typeof render === "function") render();

      const autoAi = el("captureAutoAi")?.checked !== false;
      const autoTopics = el("captureAutoTopics")?.checked !== false;

      if (autoAi && window.kbAiClassify?.classifyRecord) {
        setStatus("Spouštím AI klasifikaci…");
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
            if (typeof render === "function") render();
            if (window.kbSupabase?.saveRecordToSupabase && record.__source === "supabase") {
              await window.kbSupabase.saveRecordToSupabase(finalizeCapturedRecord(record));
            }
          }
        } catch (aiErr) {
          console.warn(aiErr);
          setStatus(`Uloženo. AI klasifikace selhala: ${aiErr.message || aiErr}`, true);
        }
      }

      let topicNote = "";
      if (autoTopics) {
        setStatus("Navrhuji témata…");
        const topicIds = await suggestTopics(record);
        if (topicIds.length) {
          await linkTopics(kbId, topicIds);
          const names = topicIds.map(id => window.kbTopics?.getTopic?.(id)?.name).filter(Boolean);
          topicNote = names.length ? ` · témata: ${names.join(", ")}` : "";
        }
      }

      el("captureDialog")?.close();
      document.dispatchEvent(new CustomEvent("kb:records-loaded"));
      if (typeof window.openRecord === "function") window.openRecord(kbId);

      if (!el("captureStatus")?.classList.contains("captureStatusError")) {
        alert(`Záznam uložen${autoAi ? " a klasifikován AI" : ""}${topicNote}.`);
      }
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
      alert("Uložení selhalo: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText || "Uložit a klasifikovat"; }
    }
  }

  function finalizeCapturedRecord(record) {
    if (typeof finalizeClassificationPayload === "function") {
      return finalizeClassificationPayload({ ...record });
    }
    return record;
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
        </select>
      </label>
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
        <textarea id="captureBody" rows="12" required placeholder="Vložte text e-mailu, přeposlanou zprávu nebo poznámku…"></textarea>
      </label>
      <div class="captureAttachmentBlock">
        <label class="button secondary">
          + Příloha / soubor .eml
          <input id="captureFileInput" type="file" multiple hidden accept=".eml,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,message/rfc822,application/pdf" />
        </label>
        <label class="button secondary">
          Načíst .eml do textu
          <input id="captureEmlInput" type="file" hidden accept=".eml,message/rfc822" />
        </label>
        <div id="captureAttachmentList"></div>
      </div>
      <div class="captureOptions">
        <label class="checkboxLine"><input id="captureAutoAi" type="checkbox" checked /> Automaticky klasifikovat AI (OpenAI)</label>
        <label class="checkboxLine"><input id="captureAutoTopics" type="checkbox" checked /> Navrhnout a přiřadit témata</label>
      </div>
      <p id="captureStatus" class="hint captureStatus"></p>
      <div class="dialogActions">
        <button type="button" class="button secondary" id="captureCancelBtn">Zrušit</button>
        <button type="submit" class="button accent" id="captureSaveBtn">Uložit a klasifikovat</button>
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
      if (file) await handleEmlImport(file);
    });

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
      .captureStatusError { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    injectCaptureUi();
  }

  window.kbCapture = { openCaptureDialog, parsePastedEmail };

  document.addEventListener("DOMContentLoaded", init);
})();
