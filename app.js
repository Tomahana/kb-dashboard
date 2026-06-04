let records = [];
let groupedView = true;

const byId = (id) => document.getElementById(id);
const storageKey = "kb-dashboard-records-v1";

const normalize = (s) => (s || "").toString().trim();
const lower = (s) => normalize(s).toLowerCase();

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

function filteredRecords() {
  const period = byId("periodFilter").value;
  const agenda = byId("agendaFilter").value;
  const meeting = byId("meetingFilter").value;
  const status = byId("statusFilter").value;
  const type = byId("typeFilter").value;
  const q = lower(byId("searchInput").value);
  const now = new Date();

  return records
    .filter(r => {
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

function render() {
  const data = filteredRecords();
  byId("countAll").textContent = data.length;
  byId("countNew").textContent = data.filter(r => ["nové","k roztřídění"].includes(lower(r.stav))).length;
  byId("countRisks").textContent = data.filter(r => ["riziko","konflikt / problém"].includes(lower(r.typ)) || lower(r.agenda).includes("rizik")).length;
  byId("countMeetings").textContent = data.filter(r => normalize(r.kam_patri) && !["nezařazeno", "archiv"].includes(lower(r.kam_patri))).length;

  const container = byId("records");
  if (!data.length) {
    container.innerHTML = `<p class="hint">Žádné záznamy neodpovídají filtrům.</p>`;
    return;
  }
  container.innerHTML = groupedView ? renderGrouped(data) : renderTable(data);
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
    <thead><tr><th>Datum</th><th>Název</th><th>Agenda</th><th>Kam patří</th><th>Stav</th><th></th></tr></thead>
    <tbody>
      ${data.map(r => `<tr>
        <td>${escapeHtml(formatDate(getDateValue(r)))}</td>
        <td><strong>${escapeHtml(r.title || r.predmet)}</strong><br><span class="meta">${escapeHtml(r.odesilatel || "")}</span></td>
        <td>${escapeHtml(r.agenda || "")}</td>
        <td>${escapeHtml(r.kam_patri || "")}</td>
        <td>${escapeHtml(r.stav || "")}</td>
        <td><button class="button small secondary" onclick="openRecord('${r.id}')">Otevřít</button></td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function renderCard(r) {
  const isRisk = ["riziko", "konflikt / problém"].includes(lower(r.typ));
  const isMeeting = normalize(r.kam_patri) && !["nezařazeno", "archiv"].includes(lower(r.kam_patri));
  return `<article class="record">
    <div class="recordHeader">
      <div>
        <div class="recordTitle">${escapeHtml(r.title || r.predmet)}</div>
        <div class="meta">${escapeHtml(formatDate(getDateValue(r)))} · ${escapeHtml(r.odesilatel || "")}</div>
      </div>
      <div class="meta">${escapeHtml(r.stav || "")}</div>
    </div>
    <div class="badges">
      ${r.typ ? `<span class="badge ${isRisk ? "risk" : ""}">${escapeHtml(r.typ)}</span>` : ""}
      ${r.kam_patri ? `<span class="badge ${isMeeting ? "meeting" : ""}">${escapeHtml(r.kam_patri)}</span>` : ""}
      ${r.priorita ? `<span class="badge priority">${escapeHtml(r.priorita)}</span>` : ""}
    </div>
    <div class="summary">${escapeHtml(r.shrnuti || firstWords(r.text, 45) || "Bez shrnutí")}</div>
    <div class="recordActions">
      <button class="button small secondary" onclick="openRecord('${r.id}')">Otevřít / třídit</button>
    </div>
  </article>`;
}

function firstWords(text, count) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  return words.slice(0, count).join(" ") + (words.length > count ? "…" : "");
}

function escapeHtml(s) {
  return normalize(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

window.openRecord = function(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  byId("editId").value = r.id;
  byId("dialogTitle").textContent = r.title || r.predmet || "Záznam";
  byId("editAgenda").value = r.agenda || "";
  byId("editType").value = r.typ || "";
  byId("editMeeting").value = r.kam_patri || "";
  byId("editStatus").value = r.stav || "";
  byId("editPriority").value = r.priorita || "";
  byId("editDeadline").value = r.termin || "";
  byId("editSummary").value = r.shrnuti || "";
  byId("editNextStep").value = r.ukol_dalsi_krok || "";
  byId("editBody").value = r.text || "";
  byId("recordDialog").showModal();
}

function saveRecord(e) {
  e.preventDefault();
  const id = byId("editId").value;
  const idx = records.findIndex(x => x.id === id);
  if (idx === -1) return;
  records[idx] = {
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
    updated_at: new Date().toISOString()
  };
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
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  loadInitialData();
  ["periodFilter","agendaFilter","meetingFilter","statusFilter","typeFilter","searchInput"].forEach(id => {
    byId(id).addEventListener("input", render);
  });
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
