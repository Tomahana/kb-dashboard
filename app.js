let records = [];
let groupedView = true;
const selectedIds = new Set();

const byId = (id) => document.getElementById(id);
const storageKey = "kb-dashboard-records-v1";
const hideExcludedKey = "kb-dashboard-hide-excluded-v1";
const normalize = (s) => (s || "").toString().trim();
const lower = (s) => normalize(s).toLowerCase();
const EXCLUDED_STATUSES = ["vyřazeno", "archiv"];

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseDate(value);
  if (!d) return "";
  return d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

function getDateValue(r) {
  return r.datum_pridani || r.datum_emailu || r.created || r.dateAdded;
}

function isExcluded(r) {
  return EXCLUDED_STATUSES.includes(lower(r.stav)) || lower(r.typ) === "vyřazeno";
}

function hideExcludedIsOn() {
  const el = byId("hideExcludedToggle");
  return el ? el.checked : true;
}

async function loadInitialData() {
  const local = localStorage.getItem(storageKey);
  if (local) {
    records = JSON.parse(local);
  } else {
    try {
      const res = await fetch("data/kb.json", { cache: "no-store" });
      records = await res.json();
    } catch (e) {
      records = [];
    }
  }
  ensureIds();
  populateFilters();
  injectExclusionControl();
  injectDiscardButton();
  injectAnalyticsPanel();
  render();
}

function ensureIds() {
  records = records.map((r, i) => ({
    id: r.id || r.kb_id || r.KB_ID || crypto.randomUUID?.() || `record-${Date.now()}-${i}`,
    title: r.title || r.predmet || r.subject || "Bez názvu",
    ...r
  }));
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(records, null, 2));
}

function uniqueValues(field) {
  return [...new Set(records.map(r => normalize(r[field])).filter(Boolean))].sort((a,b) => a.localeCompare(b, "cs"));
}

function fillSelect(id, values) {
  const select = byId(id);
  const current = select.value;
  select.innerHTML = '<option value="">Vše</option>' + values.map(v => `<option>${escapeHtml(v)}</option>`).join("");
  select.value = current;
}

function populateFilters() {
  fillSelect("agendaFilter", uniqueValues("agenda"));
  fillSelect("meetingFilter", uniqueValues("kam_patri"));
  fillSelect("statusFilter", uniqueValues("stav"));
  fillSelect("typeFilter", uniqueValues("typ"));
}

function injectExclusionControl() {
  if (byId("hideExcludedToggle")) return;
  const filters = document.querySelector(".filters");
  const reset = byId("resetBtn");
  if (!filters || !reset) return;
  const wrapper = document.createElement("label");
  wrapper.className = "checkboxLine";
  const saved = localStorage.getItem(hideExcludedKey);
  const checked = saved === null ? true : saved === "true";
  wrapper.innerHTML = `<input id="hideExcludedToggle" type="checkbox" ${checked ? "checked" : ""} /> Skrýt vyřazené a archiv`;
  filters.insertBefore(wrapper, reset);
  byId("hideExcludedToggle").addEventListener("change", (e) => {
    localStorage.setItem(hideExcludedKey, e.target.checked ? "true" : "false");
    render();
  });
  injectExclusionStyles();
}

function injectDiscardButton() {
  if (byId("discardRecordBtn")) return;
  const actions = document.querySelector("#recordForm .dialogActions");
  if (!actions) return;
  const btn = document.createElement("button");
  btn.id = "discardRecordBtn";
  btn.type = "button";
  btn.className = "button danger";
  btn.textContent = "Vyřadit";
  btn.title = "Označí záznam jako Vyřazeno. Záznam se nemaže.";
  btn.addEventListener("click", markCurrentRecordExcluded);
  actions.insertBefore(btn, actions.firstChild);
}

function markCurrentRecordExcluded() {
  const id = byId("editId").value;
  const idx = records.findIndex(x => x.id === id);
  if (idx === -1) return;
  records[idx] = {
    ...records[idx],
    stav: "Vyřazeno",
    vyrazeno: true,
    vyrazeno_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  persist();
  populateFilters();
  render();
  byId("recordDialog").close();
}

function injectExclusionStyles() {
  if (document.getElementById("exclusionStyles")) return;
  const style = document.createElement("style");
  style.id = "exclusionStyles";
  style.textContent = `
    .checkboxLine { display: flex; align-items: center; gap: .45rem; color: var(--text); font-size: .9rem; margin: .9rem 0; }
    .checkboxLine input { width: auto; margin: 0; }
    .button.danger { background: #fee4e2; color: #b42318; }
    .button.danger:hover { background: #fecdca; }
    .badge.excluded { background: #f2f4f7; color: #667085; }
  `;
  document.head.appendChild(style);
}

function filteredRecords(options = {}) {
  const period = byId("periodFilter").value;
  const agenda = options.ignoreAgenda ? "" : byId("agendaFilter").value;
  const meeting = byId("meetingFilter").value;
  const status = byId("statusFilter").value;
  const type = byId("typeFilter").value;
  const q = lower(byId("searchInput").value);
  const now = new Date();

  return records
    .filter(r => {
      if (!options.includeExcluded && hideExcludedIsOn() && isExcluded(r)) return false;
      if (period !== "all") {
        const d = parseDate(getDateValue(r));
        if (!d) return false;
        const days = Number(period);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (diff > days) return false;
      }
      if (agenda && normalize(r.agenda) !== agenda) return false;
      if (meeting && normalize(r.kam_patri) !== meeting) return false;
      if (status && normalize(r.stav) !== status) return false;
      if (type && normalize(r.typ) !== type) return false;
      if (q) {
        const hay = lower([r.title, r.predmet, r.odesilatel, r.agenda, r.typ, r.kam_patri, r.stav, r.shrnuti, r.ukol_dalsi_krok, r.text].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a,b) => (parseDate(getDateValue(b)) || 0) - (parseDate(getDateValue(a)) || 0));
}

function getRecordId(r) {
  return r?.id || r?.kb_id || r?.KB_ID || "";
}

function isRecordSelected(id) {
  return selectedIds.has(id);
}

function toggleRecordSelection(id, checked) {
  if (!id) return;
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateSelectionToolbar();
}

function selectAllVisibleRecords() {
  filteredRecords().forEach(r => {
    const id = getRecordId(r);
    if (id) selectedIds.add(id);
  });
  render();
}

function clearRecordSelection() {
  selectedIds.clear();
  render();
}

function getSelectedRecords() {
  const ids = new Set(selectedIds);
  return records.filter(r => ids.has(getRecordId(r)));
}

function updateSelectionToolbar() {
  const countEl = byId("selectionCount");
  const selectAllEl = byId("selectAllVisible");
  if (!countEl) return;
  const visible = filteredRecords();
  const visibleIds = visible.map(getRecordId).filter(Boolean);
  const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length;
  countEl.textContent = `${selectedIds.size} vybráno`;
  if (selectAllEl) {
    selectAllEl.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    selectAllEl.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }
}

function injectSelectionToolbar() {
  if (byId("selectionToolbar")) return;
  const sectionHeader = byId("recordsSectionHeader");
  if (!sectionHeader) return;
  const bar = document.createElement("div");
  bar.id = "selectionToolbar";
  bar.className = "selectionToolbar";
  bar.innerHTML = `
    <label class="checkboxLine selectionAll">
      <input id="selectAllVisible" type="checkbox" />
      Vybrat vše ve filtru
    </label>
    <span id="selectionCount" class="selectionCount">0 vybráno</span>
    <button id="clearSelectionBtn" type="button" class="button small secondary">Vymazat výběr</button>
    <button id="addToTopicBtn" type="button" class="button small">Přidat k tématu</button>
    <button id="aiSelectionBtn" type="button" class="button small accent">AI shrnutí výběru</button>
  `;
  sectionHeader.insertAdjacentElement("afterend", bar);
  byId("selectAllVisible").addEventListener("change", (e) => {
    if (e.target.checked) selectAllVisibleRecords();
    else clearRecordSelection();
  });
  byId("clearSelectionBtn").addEventListener("click", clearRecordSelection);
}

function render() {
  const data = filteredRecords();
  const allForPeriod = filteredRecords({ includeExcluded: true });
  injectSelectionToolbar();
  updateSelectionToolbar();
  byId("countAll").textContent = data.length;
  byId("countNew").textContent = data.filter(isRecordUnclassified).length;
  byId("countRisks").textContent = data.filter(r => ["riziko","konflikt / problém"].includes(lower(r.typ)) || lower(r.agenda).includes("rizik")).length;
  byId("countMeetings").textContent = data.filter(r => normalize(r.kam_patri) && !["nezařazeno", "archiv"].includes(lower(r.kam_patri))).length;
  renderAgendaAnalytics();
  renderExcludedInfo(allForPeriod);

  const container = byId("records");
  if (!data.length) {
    container.innerHTML = `<p class="hint">Žádné záznamy neodpovídají filtrům.</p>`;
    return;
  }
  container.innerHTML = groupedView ? renderGrouped(data) : renderTable(data);
  if (window.kbAiClassify?.updateAutoClassifyButton) window.kbAiClassify.updateAutoClassifyButton();
  if (window.kbLayout?.updateBadges) window.kbLayout.updateBadges();
}

function renderExcludedInfo(allForPeriod) {
  let el = byId("excludedInfo");
  const cards = document.querySelector(".cards");
  if (!el && cards) {
    el = document.createElement("p");
    el.id = "excludedInfo";
    el.className = "hint excludedInfo";
    cards.insertAdjacentElement("afterend", el);
  }
  if (!el) return;
  const excludedCount = allForPeriod.filter(isExcluded).length;
  el.textContent = hideExcludedIsOn() && excludedCount ? `Skryto vyřazených / archivovaných záznamů: ${excludedCount}. Zobrazíte je vypnutím volby „Skrýt vyřazené a archiv“. ` : "";
}

function injectAnalyticsPanel() {
  if (byId("agendaAnalytics")) return;
  const root = byId("analyticsAgendaRoot");
  if (!root) return;
  const section = document.createElement("section");
  section.className = "panel analyticsPanel";
  section.innerHTML = `
    <div class="sectionHeader">
      <div>
        <h2>Analýza podle agendy</h2>
        <p class="hint">Počty vycházejí z aktuálně vyfiltrovaných záznamů. Kliknutím na řádek rychle vyfiltrujete agendu.</p>
      </div>
      <button id="clearAgendaQuickFilter" class="button small secondary">Zrušit filtr agendy</button>
    </div>
    <div id="agendaAnalytics"></div>`;
  root.appendChild(section);
  byId("clearAgendaQuickFilter").addEventListener("click", () => { byId("agendaFilter").value = ""; render(); });
  injectAnalyticsStyles();
}

function injectAnalyticsStyles() {
  if (document.getElementById("analyticsStyles")) return;
  const style = document.createElement("style");
  style.id = "analyticsStyles";
  style.textContent = `
    .analyticsPanel { margin-bottom: 1rem; }
    .excludedInfo { margin: -.45rem 0 1rem; }
    .analyticsGrid { display: grid; grid-template-columns: 1.4fr repeat(8, minmax(70px, .6fr)); gap: .35rem; align-items: stretch; overflow-x: auto; }
    .analyticsHead, .analyticsCell { padding: .55rem .6rem; border-bottom: 1px solid var(--line); background: white; min-width: 74px; }
    .analyticsHead { font-size: .75rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .02em; }
    .analyticsAgenda { font-weight: 800; color: var(--text); min-width: 180px; }
    .analyticsRow { display: contents; cursor: pointer; }
    .analyticsRow:hover .analyticsCell { background: #f8fafc; }
    .analyticsNumber { font-weight: 800; }
    .analyticsSub { display: block; color: var(--muted); font-size: .75rem; margin-top: .12rem; }
    .analyticsBar { height: 8px; background: #e4e7ec; border-radius: 999px; overflow: hidden; margin-top: .35rem; }
    .analyticsBar span { display: block; height: 100%; width: 0%; background: var(--accent); }
    @media (max-width: 900px) { .analyticsGrid { grid-template-columns: 170px repeat(8, 86px); } }
  `;
  document.head.appendChild(style);
}

function renderAgendaAnalytics() {
  const container = byId("agendaAnalytics");
  if (!container) return;
  const data = filteredRecords({ ignoreAgenda: true });
  if (!data.length) {
    container.innerHTML = `<p class="hint">Žádné záznamy pro analýzu podle aktuálních filtrů.</p>`;
    return;
  }
  const rows = {};
  data.forEach(r => {
    const agenda = normalize(r.agenda) || "Nezařazeno";
    rows[agenda] ||= { agenda, total: 0, unclassified: 0, newOrTriage: 0, meeting: 0, risks: 0, closed: 0, missingSummary: 0, excluded: 0 };
    const row = rows[agenda];
    row.total += 1;
    const status = lower(r.stav);
    const type = lower(r.typ);
    const meeting = lower(r.kam_patri);
    const agendaLower = lower(r.agenda);
    if (!agendaLower || agendaLower === "nezařazeno") row.unclassified += 1;
    if (["nové", "k roztřídění"].includes(status)) row.newOrTriage += 1;
    if (normalize(r.kam_patri) && !["nezařazeno", "archiv"].includes(meeting)) row.meeting += 1;
    if (["riziko", "konflikt / problém"].includes(type) || agendaLower.includes("rizik")) row.risks += 1;
    if (["uzavřeno", "archiv", "projednáno"].includes(status)) row.closed += 1;
    if (!normalize(r.shrnuti)) row.missingSummary += 1;
    if (isExcluded(r)) row.excluded += 1;
  });
  const sorted = Object.values(rows).sort((a, b) => b.total - a.total || a.agenda.localeCompare(b.agenda, "cs"));
  const max = Math.max(...sorted.map(r => r.total), 1);
  container.innerHTML = `
    <div class="analyticsGrid">
      <div class="analyticsHead">Agenda</div><div class="analyticsHead">Celkem</div><div class="analyticsHead">Netříděno</div><div class="analyticsHead">Nové</div><div class="analyticsHead">K jednání</div><div class="analyticsHead">Rizika</div><div class="analyticsHead">Bez shrnutí</div><div class="analyticsHead">Uzavřeno</div><div class="analyticsHead">Vyřazeno</div>
      ${sorted.map(r => `
        <div class="analyticsRow" onclick="setAgendaFilter('${escapeForJs(r.agenda)}')" title="Filtrovat agendu: ${escapeHtml(r.agenda)}">
          <div class="analyticsCell analyticsAgenda">${escapeHtml(r.agenda)}<div class="analyticsBar"><span style="width:${Math.round((r.total / max) * 100)}%"></span></div></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.total}</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.unclassified}</span><span class="analyticsSub">agenda</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.newOrTriage}</span><span class="analyticsSub">nové/třídit</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.meeting}</span><span class="analyticsSub">kam patří</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.risks}</span><span class="analyticsSub">rizika</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.missingSummary}</span><span class="analyticsSub">doplnit</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.closed}</span><span class="analyticsSub">hotovo</span></div>
          <div class="analyticsCell"><span class="analyticsNumber">${r.excluded}</span><span class="analyticsSub">mimo</span></div>
        </div>`).join("")}
    </div>`;
}

function escapeForJs(s) {
  return normalize(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

window.setAgendaFilter = function(agenda) {
  byId("agendaFilter").value = agenda;
  render();
}

function renderGrouped(data) {
  const groups = {};
  data.forEach(r => {
    const key = normalize(r.agenda) || "Nezařazeno";
    groups[key] ||= [];
    groups[key].push(r);
  });
  return Object.entries(groups).map(([group, items]) => `
    <div class="groupTitle">${escapeHtml(group)} · ${items.length}</div>
    ${items.map(renderCard).join("")}
  `).join("");
}

function renderTable(data) {
  return `<table>
    <thead><tr><th class="selectCol"></th><th>Datum</th><th>Název</th><th>Agenda</th><th>Kam patří</th><th>Stav</th><th></th></tr></thead>
    <tbody>
      ${data.map(r => {
        const rid = getRecordId(r);
        const checked = isRecordSelected(rid) ? "checked" : "";
        const needsClassify = isRecordUnclassified(r);
        return `<tr class="recordRow ${needsClassify ? "needsClassify" : ""}" data-record-id="${escapeHtml(rid)}" tabindex="0" role="button" aria-label="Klasifikovat: ${escapeHtml(r.title || r.predmet)}">
        <td class="selectCol"><input type="checkbox" class="recordSelect" data-record-id="${escapeHtml(rid)}" ${checked} aria-label="Vybrat záznam" /></td>
        <td>${escapeHtml(formatDate(getDateValue(r)))}</td>
        <td><strong class="recordOpen">${escapeHtml(r.title || r.predmet)}</strong><br><span class="meta">${escapeHtml(r.odesilatel || "")}</span></td>
        <td>${escapeHtml(r.agenda || "")}</td>
        <td>${escapeHtml(r.kam_patri || "")}</td>
        <td>${escapeHtml(r.stav || "")}</td>
        <td><span class="openHint">Klasifikovat →</span></td>
      </tr>`;
      }).join("")}
    </tbody>
  </table>`;
}

function renderCard(r) {
  const risk = ["riziko", "konflikt / problém"].includes(lower(r.typ));
  const meeting = normalize(r.kam_patri) && !["nezařazeno", "archiv"].includes(lower(r.kam_patri));
  const excluded = isExcluded(r);
  const rid = getRecordId(r);
  const checked = isRecordSelected(rid) ? "checked" : "";
  const needsClassify = isRecordUnclassified(r);
  const aiProposal = hasAiProposal(r);
  const taskExported = window.kbTaskExport?.getExportBadge?.(r) || "";
  const notionLinked = window.kbNotion?.getNotionBadge?.(r) || "";
  return `<article class="record record-clickable ${needsClassify ? "needsClassify" : ""} ${aiProposal ? "hasAiProposal" : ""}" data-record-id="${escapeHtml(rid)}" tabindex="0" role="button" aria-label="Klasifikovat: ${escapeHtml(r.title || r.predmet)}">
    <div class="recordHeader"><label class="recordSelectWrap"><input type="checkbox" class="recordSelect" data-record-id="${escapeHtml(rid)}" ${checked} aria-label="Vybrat záznam" /></label><div class="recordMain"><div class="recordTitle recordOpen">${escapeHtml(r.title || r.predmet)}</div><div class="meta">${escapeHtml(formatDate(getDateValue(r)))} · ${escapeHtml(r.odesilatel || "")}</div></div><div class="meta recordStatus">${escapeHtml(r.stav || "")}${aiProposal ? ' · <span class="openHint">AI návrh</span>' : needsClassify ? ' · <span class="openHint">k třídění</span>' : ""}</div></div>
    <div class="badges">${excluded ? `<span class="badge excluded">Vyřazeno</span>` : ""}${aiProposal ? `<span class="badge aiProposal">Ke kontrole AI</span>` : needsClassify ? `<span class="badge classify">K roztřídění</span>` : ""}${r.typ ? `<span class="badge ${risk ? "risk" : ""}">${escapeHtml(r.typ)}</span>` : ""}${r.kam_patri ? `<span class="badge ${meeting ? "meeting" : ""}">${escapeHtml(r.kam_patri)}</span>` : ""}${r.priorita ? `<span class="badge priority">${escapeHtml(r.priorita)}</span>` : ""}${notionLinked}${taskExported}</div>
    <div class="summary recordOpen">${escapeHtml(r.shrnuti || firstWords(r.text, 45) || "Klikněte pro klasifikaci a shrnutí…")}</div>
    <div class="recordActions"><span class="openHint">Klikněte pro ruční nebo AI klasifikaci →</span></div>
  </article>`;
}

function firstWords(text, count) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  return words.slice(0, count).join(" ") + (words.length > count ? "…" : "");
}

function escapeHtml(s) {
  return normalize(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function findRecordById(id) {
  return records.find(x => x.id === id || x.kb_id === id || x.KB_ID === id);
}

function setSelectField(selectId, value) {
  const select = byId(selectId);
  if (!select) return;
  const v = normalize(value);
  if (!v) {
    select.value = "";
    if (window.kbPickers?.syncPicker) window.kbPickers.syncPicker(select);
    return;
  }
  const match = [...select.options].find(o => normalize(o.value) === v || normalize(o.textContent) === v);
  if (match) {
    select.value = match.value || match.textContent;
    if (window.kbPickers?.syncPicker) window.kbPickers.syncPicker(select);
    return;
  }
  const custom = new Option(`${v} (vlastní)`, v);
  select.add(custom);
  select.value = v;
  if (window.kbPickers?.refresh) window.kbPickers.refresh(select);
}

function hasAiProposal(r) {
  return !!r?._aiProposal;
}

function isRecordUnclassified(r) {
  if (!r) return false;
  if (r._aiProposal) return true;
  const agenda = lower(r.agenda);
  const stav = lower(r.stav);
  if (!normalize(r.shrnuti)) return true;
  if (!agenda || agenda === "nezařazeno") return true;
  if (["nové", "k roztřídění"].includes(stav)) return true;
  return false;
}

function finalizeClassificationPayload(payload) {
  const agenda = normalize(payload.agenda);
  const shrnuti = normalize(payload.shrnuti);
  const meeting = lower(payload.kam_patri);
  let stav = normalize(payload.stav);
  const hasCore = !!shrnuti && !!agenda && lower(agenda) !== "nezařazeno";

  if (hasCore && ["nové", "k roztřídění", ""].includes(lower(stav))) {
    if (meeting && !["nezařazeno", "archiv", ""].includes(meeting)) {
      stav = "Připravit bod";
    } else {
      stav = "Zařazeno";
    }
  }

  const result = { ...payload, stav };
  if (hasCore) {
    result.classified_at = new Date().toISOString();
    delete result._aiProposal;
  }
  return result;
}

window.isRecordUnclassified = isRecordUnclassified;

window.openRecord = function(id) {
  const r = findRecordById(id);
  if (!r) return;
  byId("editId").value = getRecordId(r);
  byId("editBody").value = normalize(r.text) || "";
  byId("dialogTitle").textContent = r.title || r.predmet || "Záznam";
  const hint = byId("recordDialogHint");
  if (hint) {
    hint.textContent = `${formatDate(getDateValue(r))} · ${r.odesilatel || ""} — upravte metadata ručně nebo použijte AI klasifikaci.`;
  }
  setSelectField("editAgenda", r.agenda);
  setSelectField("editType", r.typ);
  setSelectField("editMeeting", r.kam_patri);
  setSelectField("editStatus", r.stav);
  setSelectField("editPriority", r.priorita);
  byId("editDeadline").value = r.termin || "";
  byId("editSummary").value = r.shrnuti || "";
  byId("editNextStep").value = r.ukol_dalsi_krok || "";
  byId("editBody").value = r.text || "";
  if (window.kbPickers?.closeOpenMenu) window.kbPickers.closeOpenMenu();
  byId("recordDialog").showModal();
  if (window.kbPickers?.refresh) {
    ["editAgenda", "editType", "editMeeting", "editStatus", "editPriority"].forEach(window.kbPickers.refresh);
  }
}

window.saveRecord = function saveRecord(e) {
  e.preventDefault();
  const id = byId("editId").value;
  const idx = records.findIndex(x => getRecordId(x) === id);
  if (idx === -1) return;
  const payload = finalizeClassificationPayload({
    ...records[idx],
    agenda: byId("editAgenda").value,
    typ: byId("editType").value,
    kam_patri: byId("editMeeting").value,
    stav: byId("editStatus").value,
    priorita: byId("editPriority").value,
    termin: byId("editDeadline").value,
    shrnuti: byId("editSummary").value,
    ukol_dalsi_krok: byId("editNextStep").value,
    text: byId("editBody").value,
    vyrazeno: lower(byId("editStatus").value) === "vyřazeno",
    updated_at: new Date().toISOString()
  });
  records[idx] = payload;
  persist();
  populateFilters();
  render();
  byId("recordDialog").close();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kb-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      records = JSON.parse(reader.result);
      ensureIds();
      persist();
      populateFilters();
      render();
    } catch (e) {
      alert("Soubor se nepodařilo načíst jako JSON.");
    }
  };
  reader.readAsText(file, "utf-8");
}

function buildAiPrompt() {
  const data = filteredRecords();
  const lines = data.map((r, i) => `
[${i+1}] ${r.title || r.predmet || "Bez názvu"}
Datum přidání: ${getDateValue(r) || ""}
Odesílatel: ${r.odesilatel || ""}
Agenda: ${r.agenda || ""}
Typ: ${r.typ || ""}
Kam patří: ${r.kam_patri || ""}
Stav: ${r.stav || ""}
Priorita: ${r.priorita || ""}
Shrnutí: ${r.shrnuti || ""}
Úkol / další krok: ${r.ukol_dalsi_krok || ""}
Text:
${r.text || ""}
`).join("\n---\n");

  return `Analyzuj následující záznamy ze znalostní báze agend podle aktuálního filtru dashboardu.

Vytvoř:
1. hlavní témata,
2. věci vhodné na kolegium rektora,
3. věci vhodné na poradu OVV,
4. rizika a otevřené problémy,
5. rozhodnutí, která je třeba připravit,
6. úkoly a další kroky,
7. věci, které mohou zapadnout,
8. návrh programu příští porady.

U každého bodu uveď čísla záznamů, ze kterých vychází. Nevymýšlej fakta mimo záznamy.

ZÁZNAMY:
${lines}`;
}

function showAiPrompt() {
  byId("aiPromptText").value = buildAiPrompt();
  byId("aiDialog").showModal();
}

function resetFilters() {
  ["agendaFilter","meetingFilter","statusFilter","typeFilter"].forEach(id => byId(id).value = "");
  byId("periodFilter").value = "30";
  byId("searchInput").value = "";
  if (byId("hideExcludedToggle")) byId("hideExcludedToggle").checked = true;
  localStorage.setItem(hideExcludedKey, "true");
  render();
}

function bindRecordSelectionEvents() {
  const container = byId("records");
  if (!container || container.__selectionBound) return;
  container.addEventListener("change", (e) => {
    const box = e.target.closest?.(".recordSelect");
    if (!box) return;
    toggleRecordSelection(box.dataset.recordId, box.checked);
  });
  container.__selectionBound = true;
}

window.kbSelection = {
  get selectedIds() { return selectedIds; },
  getSelectedRecords,
  selectAllVisibleRecords,
  clearRecordSelection,
  getRecordId
};

document.addEventListener("DOMContentLoaded", () => {
  loadInitialData();
  injectSelectionToolbar();
  bindRecordSelectionEvents();
  ["periodFilter","agendaFilter","meetingFilter","statusFilter","typeFilter","searchInput"].forEach(id => byId(id).addEventListener("input", render));
  byId("resetBtn").addEventListener("click", resetFilters);
  byId("viewGrouped").addEventListener("click", () => { groupedView = true; render(); });
  byId("viewFlat").addEventListener("click", () => { groupedView = false; render(); });
  byId("exportBtn").addEventListener("click", exportJson);
  byId("importFile").addEventListener("change", e => e.target.files?.[0] && importJson(e.target.files[0]));
  byId("saveRecordBtn").addEventListener("click", saveRecord);
  byId("aiPromptBtn").addEventListener("click", showAiPrompt);
  byId("copyPromptBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(byId("aiPromptText").value);
    byId("copyPromptBtn").textContent = "Zkopírováno";
    setTimeout(() => byId("copyPromptBtn").textContent = "Kopírovat", 1200);
  });
});

let kbItemsModulePromise = null;

function getAppAssetVersion() {
  const src = document.querySelector('script[src*="app.js"]')?.src || "";
  const match = src.match(/[?&]v=([^&]+)/);
  return match ? match[1] : "";
}

function getKbItemsModule() {
  if (!kbItemsModulePromise) {
    const v = getAppAssetVersion();
    kbItemsModulePromise = import(`./js/kb-items.js${v ? `?v=${v}` : ""}`);
  }
  return kbItemsModulePromise;
}

function readKbItemsFilterValues() {
  const item_type = normalize(byId("kbItemsFilterType")?.value);
  const status = normalize(byId("kbItemsFilterStatus")?.value);
  const search = normalize(byId("kbItemsFilterSearch")?.value);
  const filters = {};
  if (item_type) filters.item_type = item_type;
  if (status) filters.status = status;
  if (search) filters.search = search;
  return filters;
}

async function refreshKbItemsList(useFilters = true) {
  const { loadKbItems, renderKbItems } = await getKbItemsModule();
  const items = await loadKbItems(useFilters ? readKbItemsFilterValues() : {});
  renderKbItems(items);
}

function bindKbItemsEvents() {
  byId("btnLoadKbItems")?.addEventListener("click", () => {
    refreshKbItemsList(true).catch((err) => {
      const list = byId("kbItemsList");
      if (list) list.innerHTML = `<p class="hint">Chyba načtení: ${escapeHtml(err.message || err)}</p>`;
    });
  });

  document.addEventListener("kb:page-changed", (e) => {
    if (e.detail?.page !== "kb-items") return;
    refreshKbItemsList(false).catch((err) => {
      const list = byId("kbItemsList");
      if (list) list.innerHTML = `<p class="hint">Chyba načtení: ${escapeHtml(err.message || err)}</p>`;
    });
  });

  if (window.kbLayout?.getPage?.() === "kb-items") {
    refreshKbItemsList(false).catch((err) => {
      const list = byId("kbItemsList");
      if (list) list.innerHTML = `<p class="hint">Chyba načtení: ${escapeHtml(err.message || err)}</p>`;
    });
  }
}

document.addEventListener("DOMContentLoaded", bindKbItemsEvents);
