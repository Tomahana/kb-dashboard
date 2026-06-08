// Modul pro přehled termínů sběrů dat a odesílání na úřady.
// Využívá pole `termin` a/nebo typ záznamu `Termín` z již načtených záznamů.

(function () {
  const DAYS_UPCOMING = 30;

  function n(s) {
    return (s || "").toString().trim();
  }

  function l(s) {
    return n(s).toLowerCase();
  }

  function el(id) {
    return document.getElementById(id);
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d ? d.toLocaleDateString("cs-CZ") : "";
  }

  function isClosed(r) {
    return ["uzavřeno", "archiv", "projednáno", "vyřazeno"].includes(l(r.stav));
  }

  function getSourceRecords() {
    try {
      if (typeof filteredRecords === "function") {
        // Respektuje aktuální filtry v sekci E-maily, ale vždy skryje vyřazené/archiv pokud je přepínač zapnutý.
        return filteredRecords({ includeExcluded: false });
      }
    } catch (_) {}
    return Array.isArray(window.records) ? window.records : [];
  }

  function deadlineRecords() {
    const data = getSourceRecords();
    return data
      .map(r => {
        const deadline = parseDate(r.termin);
        const isDeadlineType = l(r.typ) === "termín";
        if (!deadline && !isDeadlineType) return null;
        return { record: r, deadline, isDeadlineType };
      })
      .filter(Boolean);
  }

  function splitByStatus(items) {
    const now = new Date();
    const upcoming = [];
    const overdue = [];
    items.forEach(item => {
      const { record, deadline } = item;
      if (!deadline) return;
      const diffDays = (deadline - now) / 86400000;
      if (diffDays < 0 && !isClosed(record)) {
        overdue.push(item);
      } else if (diffDays >= 0 && diffDays <= DAYS_UPCOMING) {
        upcoming.push(item);
      }
    });
    upcoming.sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
    overdue.sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
    return { upcoming, overdue };
  }

  function htmlEscape(s) {
    return n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  }

  function renderOverview(all, upcoming, overdue) {
    const totalEl = el("deadlinesTotal");
    const upcomingEl = el("deadlinesUpcoming");
    const overdueEl = el("deadlinesOverdue");
    if (totalEl) totalEl.textContent = String(all.length);
    if (upcomingEl) upcomingEl.textContent = String(upcoming.length);
    if (overdueEl) overdueEl.textContent = String(overdue.length);
  }

  function renderList(targetId, items, emptyText) {
    const box = el(targetId);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<p class="hint">${htmlEscape(emptyText)}</p>`;
      return;
    }
    box.innerHTML = `
      <div class="deadlinesList">
        ${items
          .map(({ record, deadline }) => {
            const dateText = deadline ? formatDate(deadline) : "Bez termínu";
            const status = htmlEscape(record.stav || "");
            const agenda = htmlEscape(record.agenda || "Nezařazeno");
            const meeting = htmlEscape(record.kam_patri || "");
            const type = htmlEscape(record.typ || "");
            const title = htmlEscape(record.title || record.predmet || "Bez názvu");
            const summary = htmlEscape(record.shrnuti || record.ukol_dalsi_krok || "");
            return `
              <article class="deadlineItem" data-record-id="${htmlEscape(record.id || record.kb_id || record.KB_ID || "")}">
                <header class="deadlineHeader">
                  <div>
                    <strong>${dateText}</strong>
                    <span class="deadlineMeta">${agenda}${meeting ? " · " + meeting : ""}</span>
                  </div>
                  <div class="deadlineTags">
                    ${type ? `<span class="badge">${type}</span>` : ""}
                    ${status ? `<span class="badge">${status}</span>` : ""}
                  </div>
                </header>
                <div class="deadlineTitle">${title}</div>
                ${summary ? `<p class="deadlineSummary">${summary}</p>` : ""}
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderTable(all) {
    const box = el("deadlinesAllList");
    if (!box) return;
    if (!all.length) {
      box.innerHTML = `<p class="hint">Žádné záznamy s vyplněným termínem v aktuálním výběru.</p>`;
      return;
    }
    const sorted = [...all].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline - b.deadline;
    });
    box.innerHTML = `
      <div class="deadlinesTableWrap">
        <table class="deadlinesTable">
          <thead>
            <tr>
              <th>Termín</th>
              <th>Název</th>
              <th>Agenda</th>
              <th>Kam patří</th>
              <th>Typ</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            ${sorted
              .map(({ record, deadline }) => {
                const dateText = deadline ? formatDate(deadline) : "";
                return `
                  <tr data-record-id="${htmlEscape(record.id || record.kb_id || record.KB_ID || "")}">
                    <td>${htmlEscape(dateText)}</td>
                    <td>${htmlEscape(record.title || record.predmet || "Bez názvu")}</td>
                    <td>${htmlEscape(record.agenda || "")}</td>
                    <td>${htmlEscape(record.kam_patri || "")}</td>
                    <td>${htmlEscape(record.typ || "")}</td>
                    <td>${htmlEscape(record.stav || "")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function buildAiPrompt(all) {
    if (!all.length) {
      return "V aktuálním výběru nejsou žádné záznamy s vyplněným termínem.";
    }
    const lines = all
      .map(({ record, deadline }, i) => {
        const dateText = deadline ? formatDate(deadline) : "";
        return `[${i + 1}] ${record.title || record.predmet || "Bez názvu"}
Termín: ${dateText}
Agenda: ${record.agenda || ""}
Kam patří: ${record.kam_patri || ""}
Typ: ${record.typ || ""}
Stav: ${record.stav || ""}
Shrnutí: ${record.shrnuti || ""}
Úkol / další krok: ${record.ukol_dalsi_krok || ""}`;
      })
      .join("\n---\n");

    return `Analyzuj termíny sběrů dat a odesílání výkazů na úřady z následujících záznamů.

Vytvoř:
1. seznam blížících se termínů (do ${DAYS_UPCOMING} dní) s doporučenými kroky,
2. seznam zpožděných termínů a návrh nápravných kroků,
3. přehled podle agend / adresátů (např. MŠMT, RVVI, poskytovatelé projektů),
4. návrh jednoduchého ročního kalendáře hlavních sběrů.

Nevymýšlej nové termíny, vycházej jen z pole „Termín“ a shrnutí/úkolů.

ZÁZNAMY:
${lines}`;
  }

  async function copyPrompt(all) {
    const prompt = buildAiPrompt(all);
    try {
      await navigator.clipboard.writeText(prompt);
      const btn = el("deadlinesCopyPromptBtn");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = "Zkopírováno";
      setTimeout(() => {
        btn.textContent = original || "AI přehled termínů";
      }, 1200);
    } catch (_) {
      alert("Nepodařilo se zkopírovat AI prompt do schránky.");
    }
  }

  function injectStyles() {
    if (el("deadlinesStyles")) return;
    const style = document.createElement("style");
    style.id = "deadlinesStyles";
    style.textContent = `
      .deadlinesOverview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .9rem; margin-bottom: .6rem; }
      .deadlinesList { display: grid; gap: .6rem; }
      .deadlineItem { border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; background: white; }
      .deadlineHeader { display: flex; justify-content: space-between; gap: .6rem; align-items: baseline; margin-bottom: .2rem; }
      .deadlineMeta { display: block; font-size: .82rem; color: var(--muted); margin-top: .1rem; }
      .deadlineTags { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-end; }
      .deadlineTitle { font-weight: 600; margin-bottom: .2rem; }
      .deadlineSummary { font-size: .9rem; color: var(--muted); margin: 0; }
      .deadlinesTableWrap { overflow-x: auto; }
      .deadlinesTable { width: 100%; border-collapse: collapse; }
      .deadlinesTable th, .deadlinesTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .9rem; }
      .deadlinesTable th { font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
      @media (max-width: 900px) {
        .deadlinesOverview { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function render() {
    const all = deadlineRecords();
    const { upcoming, overdue } = splitByStatus(all);
    renderOverview(all, upcoming, overdue);
    renderList("deadlinesUpcomingList", upcoming, "Žádné nadcházející termíny v následujících 30 dnech.");
    renderList("deadlinesOverdueList", overdue, "Žádné zpožděné termíny v aktuálním výběru.");
    renderTable(all);
  }

  function init() {
    injectStyles();
    const btn = el("deadlinesCopyPromptBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const all = deadlineRecords();
        copyPrompt(all);
      });
    }

    // První render po načtení stránky.
    setTimeout(render, 150);

    // Reakce na načtení záznamů ze Supabase a na změny filtrů.
    document.addEventListener("kb:records-loaded", () => setTimeout(render, 80));
    document.addEventListener("input", () => setTimeout(render, 120));
  }

  document.addEventListener("DOMContentLoaded", init);
})();

