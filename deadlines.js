// Modul Termíny – sběry dat a odesílání (struktura tabulky kolegů, Supabase + import CSV/JSON).

(function () {
  const STORAGE_KEY = "kb-dashboard-deadlines-v1";
  const DAYS_UPCOMING = 30;
  const CLOSED_STATUSES = ["odesláno", "uzavřeno", "hotovo", "zrušeno", "archiv"];

  const IMPORT_ALIASES = {
    id_polozky: ["ID položky", "id položky", "id_polozky", "ID"],
    oblast: ["Oblast", "oblast"],
    nazev: ["Co se hlídá / název indikátoru", "Co se hlídá", "název indikátoru", "nazev", "Název", "name", "title"],
    popis: ["Stručný popis údaje", "popis", "Popis"],
    odpovedna_osoba: ["Kdo to hlídá na rektorátu", "odpovedna_osoba", "Odpovědná osoba"],
    potrebujeme_od: ["Od koho potřebujeme data", "potrebujeme_od"],
    dodavatel_fakulta: ["Kdo dodává data za fakultu / součást", "Kdo dodává data za fakultu", "dodavatel_fakulta"],
    kam_vyplnit: ["Kam se data vyplňují / zadávají", "Kam se data vyplňují", "kam_vyplnit"],
    system_zdroj: ["Primární systém nebo zdroj dat", "system_zdroj", "Systém"],
    termin_sberu: ["Termín pro fakulty / součásti", "termin_sberu", "Termín sběru"],
    termin_interni: ["Interní termín pro zpracování na rek.", "Interní termín", "termin_interni"],
    termin_odeslani: ["Finální / externí termín", "Finální termín", "termin_odeslani", "Termín odeslání"],
    periodicita: ["Periodicita", "periodicita"],
    ucel: ["K čemu údaj slouží", "ucel"],
    navazny_proces: ["Návazný proces / výstup", "Návazný proces", "navazny_proces"],
    riziko: ["Riziko při nedodání", "riziko"],
    poznamka: ["Poznámka", "poznamka", "note"],
    stav: ["Stav", "stav"],
    zdroj: ["Zdroj", "zdroj"],
    urad: ["Úřad", "urad", "authority"],
    agenda: ["Agenda", "agenda"],
    typ: ["Typ", "typ", "type"],
    kb_id: ["kb_id", "KB_ID"]
  };

  let deadlines = [];
  let useSupabase = false;
  let loading = false;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function excelSerialToIso(serial) {
    const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return Number.isNaN(utc.getTime()) ? "" : utc.toISOString().slice(0, 10);
  }

  function parseImportDate(value) {
    const v = n(value).replace(/^"|"$/g, "");
    if (!v || v === "-" || v === "—") return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const cz = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (cz) return `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
    const num = Number(v.replace(",", "."));
    if (Number.isFinite(num) && num > 1000 && num < 80000) return excelSerialToIso(num);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d ? d.toLocaleDateString("cs-CZ") : "";
  }

  function effectiveDate(item) {
    return parseDate(item.termin_interni) || parseDate(item.termin_odeslani) || parseDate(item.termin_sberu);
  }

  function isClosed(item) {
    return CLOSED_STATUSES.includes(l(item.stav));
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines, null, 2));
  }

  function setStatus(text, isError) {
    const node = el("deadlinesStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("deadlinesStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function loadDeadlines() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseDeadlines) {
        useSupabase = false;
        try {
          deadlines = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch (_) {
          deadlines = [];
        }
        if (!Array.isArray(deadlines)) deadlines = [];
        setStatus("Data pouze v prohlížeči. Spusťte SQL schéma a načtěte ze Supabase.");
        return;
      }
      const available = await window.kbSupabaseDeadlines.probeTables();
      if (!available) {
        useSupabase = false;
        deadlines = window.kbSupabaseDeadlines.loadLocalDeadlines();
        setStatus("Tabulka kb_deadlines v Supabase zatím neexistuje. Spusťte supabase/deadlines-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        await window.kbSupabaseDeadlines.migrateLocalDeadlinesIfNeeded();
        deadlines = await window.kbSupabaseDeadlines.loadDeadlinesFromSupabase();
        setStatus(`Načteno ze Supabase: ${deadlines.length} termínů.`);
      }
    } catch (error) {
      console.error(error);
      useSupabase = false;
      deadlines = window.kbSupabaseDeadlines?.loadLocalDeadlines?.() || [];
      setStatus(`Chyba načtení: ${error.message || error}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  function normalizeHeaderKey(s) {
    return n(s)
      .replace(/^\uFEFF/, "")
      .replace(/^"|"$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function getFieldFromRow(row, field) {
    const aliases = IMPORT_ALIASES[field] || [field];
    for (const key of aliases) {
      if (row[key] != null && n(row[key])) return n(row[key]);
    }
    const byNorm = {};
    Object.entries(row).forEach(([k, v]) => {
      byNorm[normalizeHeaderKey(k)] = v;
    });
    for (const key of aliases) {
      const nk = normalizeHeaderKey(key);
      if (byNorm[nk] != null && n(byNorm[nk])) return n(byNorm[nk]);
    }
    for (const [hdr, val] of Object.entries(byNorm)) {
      if (!n(val)) continue;
      for (const key of aliases) {
        const nk = normalizeHeaderKey(key);
        if (hdr === nk || hdr.includes(nk) || nk.includes(hdr)) return n(val);
      }
    }
    return "";
  }

  function filteredDeadlines() {
    const oblast = n(el("deadlinesOblastFilter")?.value);
    const stav = n(el("deadlinesStavFilter")?.value);
    const q = l(el("deadlinesSearch")?.value);
    return deadlines.filter(item => {
      const itemOblast = n(item.oblast) || n(item.agenda);
      if (oblast && itemOblast !== oblast) return false;
      if (stav && n(item.stav) !== stav) return false;
      if (q) {
        const hay = l([
          item.id_polozky, item.oblast, item.nazev, item.popis, item.odpovedna_osoba,
          item.potrebujeme_od, item.dodavatel_fakulta, item.kam_vyplnit, item.system_zdroj,
          item.ucel, item.navazny_proces, item.riziko, item.poznamka, item.periodicita, item.stav
        ].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function parseCsvRecords(text, delimiter) {
    const records = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        if (row.some(cell => n(cell))) records.push(row);
        row = [];
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i += 1;
        row.push(field);
        field = "";
        if (row.some(cell => n(cell))) records.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(cell => n(cell))) records.push(row);
    return records;
  }

  function detectDelimiter(sampleLine) {
    const line = sampleLine.replace(/^\uFEFF/, "");
    const counts = [
      ["\t", (line.match(/\t/g) || []).length],
      [";", (line.match(/;/g) || []).length],
      [",", (line.match(/,/g) || []).length]
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ";";
  }

  function headerRowScore(cells) {
    const joined = cells.map(normalizeHeaderKey).join(" ");
    const markers = ["id pol", "oblast", "hlídá", "indikátor", "termín", "periodicita", "rektorát"];
    return markers.reduce((score, m) => score + (joined.includes(m) ? 1 : 0), 0);
  }

  function findHeaderRowIndex(records) {
    let bestIdx = 0;
    let bestScore = -1;
    records.slice(0, 8).forEach((row, idx) => {
      const score = headerRowScore(row);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    return bestScore >= 2 ? bestIdx : 0;
  }

  function parseDelimitedTable(text) {
    const clean = text.replace(/^\uFEFF/, "").trim();
    if (!clean) return { rows: [], meta: { headers: [], delimiter: ";", headerRow: 0 } };
    const firstLine = clean.split(/\r?\n/).find(line => n(line)) || clean;
    const delimiter = detectDelimiter(firstLine);
    const records = parseCsvRecords(clean, delimiter);
    if (!records.length) return { rows: [], meta: { headers: [], delimiter, headerRow: 0 } };
    const headerIdx = findHeaderRowIndex(records);
    const headers = records[headerIdx].map(h => n(h).replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
    const rows = records.slice(headerIdx + 1).map(cols => {
      const row = {};
      headers.forEach((header, i) => {
        if (header) row[header] = (cols[i] ?? "").replace(/^"|"$/g, "").trim();
      });
      return row;
    }).filter(row => Object.values(row).some(v => n(v)));
    return { rows, meta: { headers, delimiter, headerRow: headerIdx + 1 } };
  }

  async function readImportFileText(file) {
    const buffer = await file.arrayBuffer();
    const encodings = ["utf-8", "windows-1250", "iso-8859-2"];
    let bestText = "";
    let bestScore = -1;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding).decode(buffer);
        const bad = (text.match(/\uFFFD/g) || []).length;
        const czech = (text.match(/[ěščřžýáíéúůďťň]/gi) || []).length;
        const score = czech * 3 - bad * 10;
        if (score > bestScore) {
          bestScore = score;
          bestText = text;
        }
      } catch (_) {}
    }
    return (bestText || new TextDecoder("utf-8").decode(buffer)).replace(/^\uFEFF/, "");
  }

  function splitByStatus(items) {
    const now = new Date();
    const upcoming = [];
    const overdue = [];
    items.forEach(item => {
      const deadline = effectiveDate(item);
      if (!deadline) return;
      const diffDays = (deadline - now) / 86400000;
      if (diffDays < 0 && !isClosed(item)) overdue.push({ item, deadline });
      else if (diffDays >= 0 && diffDays <= DAYS_UPCOMING) upcoming.push({ item, deadline });
    });
    upcoming.sort((a, b) => a.deadline - b.deadline);
    overdue.sort((a, b) => a.deadline - b.deadline);
    return { upcoming, overdue };
  }

  function uniqueOblast() {
    return [...new Set(deadlines.map(d => n(d.oblast) || n(d.agenda)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  }

  function populateFilters() {
    const fill = (id, values) => {
      const select = el(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">Vše</option>' + values.map(v => `<option>${html(v)}</option>`).join("");
      select.value = current;
    };
    fill("deadlinesOblastFilter", uniqueOblast());
    fill("deadlinesStavFilter", [...new Set(deadlines.map(d => n(d.stav)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs")));
  }

  function renderOverview(all, upcoming, overdue) {
    if (el("deadlinesTotal")) el("deadlinesTotal").textContent = String(all.length);
    if (el("deadlinesUpcoming")) el("deadlinesUpcoming").textContent = String(upcoming.length);
    if (el("deadlinesOverdue")) el("deadlinesOverdue").textContent = String(overdue.length);
    const badge = el("navBadgeDeadlines");
    if (badge) {
      badge.textContent = overdue.length > 0 ? String(overdue.length) : "";
      badge.hidden = overdue.length <= 0;
    }
  }

  function renderDeadlineCard({ item, deadline }) {
    const dateText = deadline ? formatDate(deadline) : "Bez termínu";
    const dates = [
      item.termin_sberu ? `Fakulty: ${formatDate(item.termin_sberu)}` : "",
      item.termin_interni ? `Interní: ${formatDate(item.termin_interni)}` : "",
      item.termin_odeslani ? `Externí: ${formatDate(item.termin_odeslani)}` : ""
    ].filter(Boolean).join(" · ");
    return `
      <article class="deadlineItem deadline-clickable" data-deadline-id="${html(item.id)}" tabindex="0" role="button">
        <header class="deadlineHeader">
          <div>
            <strong>${html(dateText)}</strong>
            <span class="deadlineMeta">${html(item.oblast || item.agenda || "—")}${item.id_polozky ? ` · ID ${html(item.id_polozky)}` : ""}</span>
            ${dates ? `<span class="deadlineMeta">${html(dates)}</span>` : ""}
          </div>
          <div class="deadlineTags">
            ${item.periodicita ? `<span class="badge">${html(item.periodicita)}</span>` : ""}
            ${item.stav ? `<span class="badge">${html(item.stav)}</span>` : ""}
          </div>
        </header>
        <div class="deadlineTitle">${html(item.nazev)}</div>
        ${item.odpovedna_osoba ? `<div class="deadlineMeta">Hlídá na rektorátu: ${html(item.odpovedna_osoba)}</div>` : ""}
        ${item.popis ? `<p class="deadlineSummary">${html(item.popis)}</p>` : ""}
      </article>
    `;
  }

  function renderList(targetId, items, emptyText) {
    const box = el(targetId);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<p class="hint">${html(emptyText)}</p>`;
      return;
    }
    box.innerHTML = `<div class="deadlinesList">${items.map(renderDeadlineCard).join("")}</div>`;
  }

  function renderTable(all) {
    const box = el("deadlinesAllList");
    if (!box) return;
    if (!all.length) {
      box.innerHTML = `<p class="hint">Žádné termíny. Importujte tabulku od kolegů (CSV/TSV) nebo přidejte nový záznam.</p>`;
      return;
    }
    const sorted = [...all].sort((a, b) => {
      const da = effectiveDate(a);
      const db = effectiveDate(b);
      if (!da && !db) return a.nazev.localeCompare(b.nazev, "cs");
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    box.innerHTML = `
      <div class="deadlinesTableWrap">
        <table class="deadlinesTable">
          <thead>
            <tr>
              <th>ID</th>
              <th>Oblast</th>
              <th>Co se hlídá</th>
              <th>Fakulty</th>
              <th>Interní rek.</th>
              <th>Externí</th>
              <th>Hlídá rek.</th>
              <th>Periodicita</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(item => `
              <tr class="deadline-clickable" data-deadline-id="${html(item.id)}" tabindex="0">
                <td>${html(item.id_polozky)}</td>
                <td>${html(item.oblast || item.agenda)}</td>
                <td><strong>${html(item.nazev)}</strong></td>
                <td>${html(formatDate(item.termin_sberu))}</td>
                <td>${html(formatDate(item.termin_interni))}</td>
                <td>${html(formatDate(item.termin_odeslani))}</td>
                <td>${html(item.odpovedna_osoba)}</td>
                <td>${html(item.periodicita)}</td>
                <td><span class="openHint">Upravit →</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render() {
    if (loading) {
      ["deadlinesUpcomingList", "deadlinesOverdueList", "deadlinesAllList"].forEach(id => {
        const node = el(id);
        if (node) node.innerHTML = `<p class="hint">Načítám termíny…</p>`;
      });
      return;
    }
    populateFilters();
    const all = filteredDeadlines();
    const { upcoming, overdue } = splitByStatus(all);
    renderOverview(all, upcoming, overdue);
    renderList("deadlinesUpcomingList", upcoming, "Žádné nadcházející termíny v následujících 30 dnech.");
    renderList("deadlinesOverdueList", overdue, "Žádné zpožděné termíny.");
    renderTable(all);
  }

  function normalizeImportRow(row, index) {
    const dateFields = ["termin_sberu", "termin_interni", "termin_odeslani"];
    const item = {
      id: row.id || uuid(),
      stav: getFieldFromRow(row, "stav") || "Aktivní",
      zdroj: getFieldFromRow(row, "zdroj") || "kolegové",
      created_at: row.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    Object.keys(IMPORT_ALIASES).forEach(field => {
      if (dateFields.includes(field)) {
        item[field] = parseImportDate(getFieldFromRow(row, field));
      } else {
        item[field] = getFieldFromRow(row, field);
      }
    });
    if (!item.nazev) item.nazev = item.id_polozky ? `Položka ${item.id_polozky}` : `Import ${index + 1}`;
    return item;
  }

  function parseImportRows(text, fileName) {
    const lower = (fileName || "").toLowerCase();
    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : parsed.deadlines || parsed.items || [];
      return { rows, meta: { format: "json" } };
    }
    if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt") || text.includes("\t") || text.includes(";")) {
      const parsed = parseDelimitedTable(text);
      return { rows: parsed.rows, meta: { format: "csv", ...parsed.meta } };
    }
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : parsed.deadlines || parsed.items || [];
      return { rows, meta: { format: "json" } };
    } catch (_) {
      const parsed = parseDelimitedTable(text);
      return { rows: parsed.rows, meta: { format: "csv", ...parsed.meta } };
    }
  }

  function importErrorHelp(error) {
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes("column") || msg.includes("oblast") || msg.includes("schema cache")) {
      return "\n\nV Supabase pravděpodobně chybí nové sloupce. Spusťte SQL soubor supabase/deadlines-migrate-v2.sql v SQL Editoru.";
    }
    if (msg.includes("jwt") || msg.includes("auth") || msg.includes("permission")) {
      return "\n\nNejste přihlášeni nebo nemáte oprávnění. Přihlaste se a zkuste znovu.";
    }
    return "";
  }

  async function importRows(rows, replace, meta = {}) {
    if (!rows.length) {
      const headers = meta.headers?.slice(0, 5).join(", ") || "neznámé";
      alert(
        `V souboru nejsou žádné datové řádky.\n` +
        `Rozpoznaná záhlaví (prvních 5): ${headers}\n` +
        `Oddělovač: ${meta.delimiter || "?"}, řádek záhlaví: ${meta.headerRow || 1}\n\n` +
        `Tip: Uložte z Excelu jako CSV UTF-8 (oddělovač středník).`
      );
      return;
    }
    const normalized = rows.map(normalizeImportRow);
    const withoutName = normalized.filter(r => !r.nazev || r.nazev.startsWith("Import ")).length;
    try {
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        if (replace) {
          for (const existing of [...deadlines]) {
            await window.kbSupabaseDeadlines.deleteDeadlineFromSupabase(existing.id);
          }
          deadlines = await window.kbSupabaseDeadlines.insertDeadlines(normalized);
        } else {
          const inserted = await window.kbSupabaseDeadlines.insertDeadlines(normalized);
          deadlines = [...inserted, ...deadlines];
        }
        setStatus(`Importováno do Supabase: ${normalized.length} položek.`);
      } else {
        if (replace) deadlines = normalized;
        else deadlines = [...normalized, ...deadlines];
        persistLocal();
        setStatus(`Importováno lokálně: ${normalized.length} položek.`);
      }
      if (withoutName > 0) {
        setStatus(`Importováno ${normalized.length} položek. U ${withoutName} chyběl sloupec „Co se hlídá“ — doplňte ručně.`, true);
      }
      render();
    } catch (error) {
      console.error(error);
      try {
        if (replace) deadlines = normalized;
        else deadlines = [...normalized, ...deadlines];
        persistLocal();
        setStatus(`Supabase selhalo, data uložena lokálně (${normalized.length} položek).`, true);
        render();
        alert(
          `Supabase import selhal: ${error.message || error}${importErrorHelp(error)}\n\n` +
          `Data jsou zatím uložena jen v tomto prohlížeči.`
        );
      } catch (fallbackError) {
        alert(`Import se nepodařil: ${error.message || error}${importErrorHelp(error)}`);
      }
    }
  }

  async function importFile(file, replace) {
    let text;
    try {
      text = await readImportFileText(file);
    } catch (_) {
      alert("Soubor se nepodařilo přečíst.");
      return;
    }
    let parsed;
    try {
      parsed = parseImportRows(text, file.name);
    } catch (error) {
      alert(`Soubor se nepodařilo zpracovat: ${error.message || error}\n\nPodporované formáty: CSV, TSV, JSON.`);
      return;
    }
    await importRows(parsed.rows, replace, parsed.meta);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(deadlines, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deadlines-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const FORM_FIELDS = [
    ["deadlineIdPolozky", "id_polozky"],
    ["deadlineOblast", "oblast"],
    ["deadlineNazev", "nazev"],
    ["deadlinePopis", "popis"],
    ["deadlineOdpovedna", "odpovedna_osoba"],
    ["deadlinePotrebujemeOd", "potrebujeme_od"],
    ["deadlineDodavatelFakulta", "dodavatel_fakulta"],
    ["deadlineKamVyplnit", "kam_vyplnit"],
    ["deadlineSystemZdroj", "system_zdroj"],
    ["deadlineSber", "termin_sberu"],
    ["deadlineInterni", "termin_interni"],
    ["deadlineOdeslani", "termin_odeslani"],
    ["deadlinePeriodicita", "periodicita"],
    ["deadlineUcel", "ucel"],
    ["deadlineNavaznyProces", "navazny_proces"],
    ["deadlineRiziko", "riziko"],
    ["deadlineStav", "stav"],
    ["deadlineZdroj", "zdroj"],
    ["deadlinePoznamka", "poznamka"]
  ];

  function openDialog(item) {
    const existing = item || null;
    el("deadlineEditId").value = existing?.id || "";
    FORM_FIELDS.forEach(([elementId, field]) => {
      const node = el(elementId);
      if (!node) return;
      const raw = existing?.[field];
      if (field.startsWith("termin_")) {
        node.value = raw ? String(raw).slice(0, 10) : "";
      } else {
        node.value = raw || (field === "stav" && !existing ? "Aktivní" : field === "zdroj" && !existing ? "vlastní" : "");
      }
    });
    el("deadlineDialogTitle").textContent = existing ? "Upravit položku" : "Nová položka";
    el("deleteDeadlineBtn").hidden = !existing;
    el("deadlineDialog").showModal();
  }

  function getDeadline(id) {
    return deadlines.find(d => d.id === id) || null;
  }

  function readFormPayload(id, existing) {
    const payload = {
      id,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      __existing: !!existing,
      urad: existing?.urad || "",
      agenda: existing?.agenda || "",
      typ: existing?.typ || "",
      kb_id: existing?.kb_id || ""
    };
    FORM_FIELDS.forEach(([elementId, field]) => {
      const node = el(elementId);
      if (!node) return;
      payload[field] = field.startsWith("termin_") ? (node.value || "") : n(node.value);
    });
    if (!payload.nazev) payload.nazev = payload.id_polozky ? `Položka ${payload.id_polozky}` : "Bez názvu";
    if (!payload.stav) payload.stav = "Aktivní";
    return payload;
  }

  async function saveDeadlineForm(e) {
    e.preventDefault();
    const id = el("deadlineEditId").value || uuid();
    const existing = getDeadline(id);
    const payload = readFormPayload(id, existing);
    const btn = el("saveDeadlineBtn");
    const prev = btn?.textContent;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = useSupabase ? "Ukládám do Supabase…" : "Ukládám…";
      }
      let saved;
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        saved = await window.kbSupabaseDeadlines.upsertDeadline(payload);
      } else {
        saved = { ...payload };
        delete saved.__existing;
        const idx = deadlines.findIndex(d => d.id === id);
        if (idx === -1) deadlines.unshift(saved);
        else deadlines[idx] = { ...deadlines[idx], ...saved };
        persistLocal();
      }
      const idx = deadlines.findIndex(d => d.id === saved.id);
      if (idx === -1) deadlines.unshift(saved);
      else deadlines[idx] = { ...deadlines[idx], ...saved };
      el("deadlineDialog").close();
      setStatus(useSupabase ? "Uloženo v Supabase." : "Uloženo lokálně v prohlížeči.");
      render();
    } catch (error) {
      console.error(error);
      alert("Uložení se nepodařilo: " + (error.message || error));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "Uložit";
      }
    }
  }

  async function deleteDeadline() {
    const id = el("deadlineEditId").value;
    if (!id || !confirm("Opravdu smazat tuto položku?")) return;
    try {
      if (useSupabase && window.kbSupabaseDeadlines && await ensureAuth()) {
        await window.kbSupabaseDeadlines.deleteDeadlineFromSupabase(id);
      }
      deadlines = deadlines.filter(d => d.id !== id);
      if (!useSupabase) persistLocal();
      el("deadlineDialog").close();
      setStatus("Položka smazána.");
      render();
    } catch (error) {
      alert("Smazání se nepodařilo: " + (error.message || error));
    }
  }

  function buildAiPrompt(all) {
    if (!all.length) return "Žádné termíny k analýze.";
    const lines = all.map((item, i) => `[${i + 1}] ${item.nazev}
ID: ${item.id_polozky || ""}
Oblast: ${item.oblast || ""}
Popis: ${item.popis || ""}
Hlídá na rektorátu: ${item.odpovedna_osoba || ""}
Potřebujeme od: ${item.potrebujeme_od || ""}
Dodavatel za fakultu: ${item.dodavatel_fakulta || ""}
Kam vyplnit: ${item.kam_vyplnit || ""}
Systém: ${item.system_zdroj || ""}
Termín fakulty: ${formatDate(item.termin_sberu)}
Interní termín rek.: ${formatDate(item.termin_interni)}
Externí termín: ${formatDate(item.termin_odeslani)}
Periodicita: ${item.periodicita || ""}
Účel: ${item.ucel || ""}
Návazný proces: ${item.navazny_proces || ""}
Riziko: ${item.riziko || ""}
Poznámka: ${item.poznamka || ""}`).join("\n---\n");
    return `Analyzuj termíny sběrů dat a odesílání výkazů na úřady podle evidence OVV.

Vytvoř:
1. seznam blížících se termínů (do ${DAYS_UPCOMING} dní) s doporučenými kroky,
2. seznam zpožděných termínů a návrh nápravných kroků,
3. přehled podle oblastí a odpovědných osob na rektorátu,
4. návrh ročního kalendáře hlavních sběrů.

Nevymýšlej nové termíny mimo data níže.

POLOŽKY:
${lines}`;
  }

  async function copyAiPrompt() {
    try {
      await navigator.clipboard.writeText(buildAiPrompt(filteredDeadlines()));
      const btn = el("deadlinesCopyPromptBtn");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = "Zkopírováno";
      setTimeout(() => { btn.textContent = original; }, 1200);
    } catch (_) {
      alert("Nepodařilo se zkopírovat prompt.");
    }
  }

  function bindClicks() {
    document.addEventListener("click", (e) => {
      const host = e.target.closest?.("[data-deadline-id]");
      if (!host || !host.closest("#page-terminy")) return;
      if (e.target.closest("button, input, a, label")) return;
      const item = getDeadline(host.dataset.deadlineId);
      if (item) openDialog(item);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const host = e.target.closest?.("[data-deadline-id]");
      if (!host || !host.closest("#page-terminy")) return;
      const item = getDeadline(host.dataset.deadlineId);
      if (item) {
        e.preventDefault();
        openDialog(item);
      }
    });
  }

  function injectStyles() {
    if (el("deadlinesStyles")) return;
    const style = document.createElement("style");
    style.id = "deadlinesStyles";
    style.textContent = `
      .deadlinesOverview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .9rem; margin-bottom: .6rem; }
      .deadlinesToolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: .75rem; }
      .deadlinesFilters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-bottom: .5rem; }
      .deadlinesStatus { margin: .35rem 0 .75rem; font-size: .88rem; color: var(--muted); }
      .deadlinesStatusError { color: #b42318; }
      .deadlinesList { display: grid; gap: .6rem; }
      .deadlineItem { border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; background: white; cursor: pointer; }
      .deadlineItem:hover { background: #f8fafc; }
      .deadlineHeader { display: flex; justify-content: space-between; gap: .6rem; align-items: baseline; margin-bottom: .2rem; }
      .deadlineMeta { display: block; font-size: .82rem; color: var(--muted); margin-top: .1rem; }
      .deadlineTags { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-end; }
      .deadlineTitle { font-weight: 600; margin-bottom: .2rem; }
      .deadlineSummary { font-size: .9rem; color: var(--muted); margin: .25rem 0 0; }
      .deadlinesTableWrap { overflow-x: auto; }
      .deadlinesTable { width: 100%; border-collapse: collapse; min-width: 960px; }
      .deadlinesTable th, .deadlinesTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .9rem; }
      .deadlinesTable th { font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
      .deadlinesTable tr.deadline-clickable { cursor: pointer; }
      .deadlinesTable tr.deadline-clickable:hover { background: #f8fafc; }
      .navBadgeDeadline { background: #fef0c7; color: #b54708; }
      #deadlineDialog { max-width: 760px; }
      #deadlineDialog form { max-height: 85vh; overflow-y: auto; }
      @media (max-width: 900px) {
        .deadlinesOverview, .deadlinesFilters { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    el("deadlinesNewBtn")?.addEventListener("click", () => openDialog(null));
    el("deadlinesReloadBtn")?.addEventListener("click", loadDeadlines);
    el("deadlinesExportBtn")?.addEventListener("click", exportJson);
    el("deadlinesCopyPromptBtn")?.addEventListener("click", copyAiPrompt);
    el("saveDeadlineBtn")?.addEventListener("click", saveDeadlineForm);
    el("deleteDeadlineBtn")?.addEventListener("click", deleteDeadline);
    el("deadlinesImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importFile(file, el("deadlinesImportReplace")?.checked);
      e.target.value = "";
    });
    ["deadlinesOblastFilter", "deadlinesStavFilter", "deadlinesSearch"].forEach(id => {
      el(id)?.addEventListener("input", render);
    });
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "terminy" && !deadlines.length && !loading) loadDeadlines();
    });
  }

  function init() {
    injectStyles();
    bindClicks();
    bindEvents();
    setTimeout(loadDeadlines, 200);
  }

  window.kbDeadlines = { loadDeadlines, getDeadlines: () => deadlines };

  document.addEventListener("DOMContentLoaded", init);
})();
