// Modul Interní soutěže – podmoduly UHK programů, přihlášky, podpora, finance.

(function () {
  const PROGRAMS = [
    { slug: "connect", title: "UHK Connect", icon: "🔗" },
    { slug: "prestige", title: "UHK Prestige", icon: "⭐" },
    { slug: "horizon", title: "UHK Horizon No-Cost Entry", icon: "🌅" },
    { slug: "rega", title: "UHK Rega", icon: "📚" },
    { slug: "navraty", title: "UHK Návraty", icon: "↩️" },
    { slug: "phd-seed", title: "UHK PhD Seed", icon: "🌱" }
  ];

  const STORAGE_KEY = "kb-dashboard-competitions-v1";
  const YEAR_BUDGET_KEY = "kb-dashboard-competitions-year-budgets";
  let competitions = [];
  let yearBudgets = {};
  let useSupabase = false;
  let loading = false;
  let activeProgram = PROGRAMS[0].slug;
  let activeCompetitionId = null;
  let overviewFilterRok = "";
  let overviewFilterProgram = "";
  let overviewFilterBeh = "";
  let overviewFilterStav = "";
  let pendingPokynFile = null;
  let pendingVyvzaFile = null;
  let removePokynPdf = false;
  let removeVyvzaPdf = false;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `comp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fmtMoney = (v) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Number(v) || 0);

  function getProgram(slug) {
    return PROGRAMS.find(p => p.slug === slug) || PROGRAMS[0];
  }

  function competitionsForProgram(slug) {
    return competitions.filter(c => c.program_slug === slug).sort((a, b) => (b.rok || 0) - (a.rok || 0) || (b.beh_cislo || 0) - (a.beh_cislo || 0));
  }

  function getCompetition(id) {
    return competitions.find(c => c.id === id) || null;
  }

  function sumSupported(comp) {
    return (comp?.supported || []).reduce((s, r) => s + (Number(r.castka_podpory) || 0), 0);
  }

  function sumApplications(comp) {
    return (comp?.applications || []).reduce((s, r) => s + (Number(r.financni_pozadavek) || 0), 0);
  }

  function usesCascadingAllocation(programSlug) {
    return programSlug === "connect";
  }

  function runsForYear(programSlug, rok) {
    if (!programSlug || rok == null) return [];
    return competitions
      .filter(c => c.program_slug === programSlug && Number(c.rok) === Number(rok))
      .sort((a, b) => (a.beh_cislo || 0) - (b.beh_cislo || 0));
  }

  function annualBudget(programSlug, rok) {
    if (!usesCascadingAllocation(programSlug)) return 0;
    const beh1 = runsForYear(programSlug, rok).find(r => (r.beh_cislo || 1) === 1);
    return Number(beh1?.alokovana_castka) || 0;
  }

  function usedInPriorRuns(programSlug, rok, behCislo) {
    return runsForYear(programSlug, rok)
      .filter(r => (r.beh_cislo || 1) < behCislo)
      .reduce((s, r) => s + sumSupported(r), 0);
  }

  function remainingForBeh(programSlug, rok, behCislo) {
    if (!usesCascadingAllocation(programSlug) || behCislo <= 1) {
      return annualBudget(programSlug, rok);
    }
    return Math.max(0, annualBudget(programSlug, rok) - usedInPriorRuns(programSlug, rok, behCislo));
  }

  function effectiveAllocation(c) {
    const stored = Number(c?.alokovana_castka) || 0;
    if (!usesCascadingAllocation(c?.program_slug)) return stored;
    const beh = c?.beh_cislo || 1;
    if (beh <= 1) return stored;
    return remainingForBeh(c.program_slug, c.rok, beh);
  }

  function allocationAllocLabel(c) {
    if (usesCascadingAllocation(c?.program_slug) && (c?.beh_cislo || 1) > 1) {
      return "Zbývá z alokace";
    }
    return "Alokovaná částka";
  }

  function stavBucket(stav) {
    const s = n(stav).toLowerCase();
    if (["aktivní", "hodnocení"].includes(s)) return "bezi";
    if (s === "rozhodnuto") return "rozhodnuto";
    if (s === "uzavřeno") return "uzavreno";
    return "bezi";
  }

  function stavLabel(stav) {
    const map = { bezi: "Běží", rozhodnuto: "Rozhodnuto", uzavreno: "Uzavřeno" };
    return map[stavBucket(stav)] || html(stav);
  }

  function loadYearBudgets() {
    try {
      yearBudgets = JSON.parse(localStorage.getItem(YEAR_BUDGET_KEY) || "{}");
      if (typeof yearBudgets !== "object" || !yearBudgets) yearBudgets = {};
    } catch (_) {
      yearBudgets = {};
    }
  }

  function getYearBudgetTotal(rok) {
    return Number(yearBudgets[String(rok)]) || 0;
  }

  function setYearBudgetTotal(rok, amount) {
    yearBudgets[String(rok)] = Math.max(0, Number(amount) || 0);
    localStorage.setItem(YEAR_BUDGET_KEY, JSON.stringify(yearBudgets));
  }

  function programAllocationStats(programSlug, rok, runs) {
    const used = runs.reduce((s, c) => s + sumSupported(c), 0);
    const requested = runs.reduce((s, c) => s + sumApplications(c), 0);
    const alloc = usesCascadingAllocation(programSlug)
      ? annualBudget(programSlug, rok)
      : runs.reduce((s, c) => s + effectiveAllocation(c), 0);
    const remaining = alloc - used;
    const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
    return {
      alloc,
      used,
      requested,
      remaining,
      pct,
      annual: usesCascadingAllocation(programSlug) ? alloc : null,
      allocLabel: usesCascadingAllocation(programSlug) ? "Celková alokace" : "Alokovaná částka"
    };
  }

  function allocationStats(c) {
    const alloc = effectiveAllocation(c);
    const used = sumSupported(c);
    const requested = sumApplications(c);
    const remaining = alloc - used;
    const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
    const annual = usesCascadingAllocation(c?.program_slug) ? annualBudget(c.program_slug, c.rok) : alloc;
    return { alloc, used, requested, remaining, pct, annual, allocLabel: allocationAllocLabel(c) };
  }

  function renderAllocationSummaryStats(stats, options = {}) {
    const { alloc, used, requested, remaining, pct, allocLabel, annual } = stats;
    const bar = alloc > 0 ? `
      <div class="allocationBar" aria-hidden="true">
        <div class="allocationBarFill" style="width:${Math.min(pct, 100)}%"></div>
      </div>
      <p class="allocationBarLabel">${pct} % čerpáno · ${fmtMoney(used)} z ${fmtMoney(alloc)}</p>` : "";
    const annualRow = annual > 0 && allocLabel === "Zbývá z alokace"
      ? `<tr><td>Celoroční alokace</td><td class="money">${fmtMoney(annual)}</td></tr>` : "";
    return `
      ${options.showBar !== false ? bar : ""}
      <table class="competitionTable competitionSummaryTable">
        ${annualRow}
        <tr><td>${html(allocLabel || "Alokovaná částka")}</td><td class="money">${fmtMoney(alloc)}</td></tr>
        <tr><td>Celkem požadováno v přihláškách</td><td class="money">${fmtMoney(requested)}</td></tr>
        <tr><td>Celkem podpořeno</td><td class="money">${fmtMoney(used)}</td></tr>
        <tr><td><strong>Zbývá / přebytek</strong></td><td class="money"><strong>${fmtMoney(remaining)}</strong></td></tr>
        <tr><td>Využití alokace</td><td>${alloc > 0 ? `<strong>${pct} %</strong>` : "—"}</td></tr>
      </table>`;
  }

  function renderAllocationSummary(c, options = {}) {
    const stats = typeof c?.program_slug === "string" && Array.isArray(c?.runs)
      ? programAllocationStats(c.program_slug, c.rok, c.runs)
      : allocationStats(c);
    if (typeof c?.program_slug === "string" && Array.isArray(c?.runs)) {
      return renderAllocationSummaryStats(stats, options);
    }
    const { annual, allocLabel } = stats;
    const annualRow = usesCascadingAllocation(c?.program_slug) && annual > 0 && (c?.beh_cislo || 1) > 1
      ? `<tr><td>Celoroční alokace ${c.rok || ""}</td><td class="money">${fmtMoney(annual)}</td></tr>` : "";
    const bar = stats.alloc > 0 ? `
      <div class="allocationBar" aria-hidden="true">
        <div class="allocationBarFill" style="width:${Math.min(stats.pct, 100)}%"></div>
      </div>
      <p class="allocationBarLabel">${stats.pct} % čerpáno · ${fmtMoney(stats.used)} z ${fmtMoney(stats.alloc)}</p>` : "";
    return `
      ${options.showBar !== false ? bar : ""}
      <table class="competitionTable competitionSummaryTable">
        ${annualRow}
        <tr><td>${html(allocLabel)}</td><td class="money">${fmtMoney(stats.alloc)}</td></tr>
        <tr><td>Celkem požadováno v přihláškách</td><td class="money">${fmtMoney(stats.requested)}</td></tr>
        <tr><td>Celkem podpořeno</td><td class="money">${fmtMoney(stats.used)}</td></tr>
        <tr><td><strong>Zbývá / přebytek</strong></td><td class="money"><strong>${fmtMoney(stats.remaining)}</strong></td></tr>
        <tr><td>Využití alokace</td><td>${stats.alloc > 0 ? `<strong>${stats.pct} %</strong>` : "—"}</td></tr>
      </table>`;
  }

  function groupStavBucket(runs) {
    const buckets = runs.map(r => stavBucket(r.stav));
    if (buckets.some(b => b === "bezi")) return "bezi";
    if (buckets.every(b => b === "uzavreno")) return "uzavreno";
    if (buckets.every(b => b === "rozhodnuto")) return "rozhodnuto";
    if (buckets.some(b => b === "rozhodnuto")) return "rozhodnuto";
    return "bezi";
  }

  function overviewGroups(items) {
    if (overviewFilterBeh) {
      return items.map(c => ({
        type: "beh",
        key: c.id,
        programSlug: c.program_slug,
        rok: c.rok,
        runs: [c],
        primary: c
      }));
    }
    const map = new Map();
    items.forEach(c => {
      const key = `${c.program_slug}::${c.rok}`;
      if (!map.has(key)) {
        map.set(key, { type: "program", key, programSlug: c.program_slug, rok: c.rok, runs: [] });
      }
      map.get(key).runs.push(c);
    });
    return [...map.values()]
      .map(g => {
        g.runs.sort((a, b) => (a.beh_cislo || 0) - (b.beh_cislo || 0));
        g.primary = g.runs[g.runs.length - 1];
        return g;
      })
      .sort((a, b) => (b.rok || 0) - (a.rok || 0) || n(getProgram(a.programSlug).title).localeCompare(n(getProgram(b.programSlug).title), "cs"));
  }

  function sumProgramsAllocation(groups) {
    const seen = new Set();
    return groups.reduce((s, g) => {
      const budgetKey = `${g.programSlug}-${g.rok}`;
      if (usesCascadingAllocation(g.programSlug)) {
        if (seen.has(budgetKey)) return s;
        seen.add(budgetKey);
        return s + annualBudget(g.programSlug, g.rok);
      }
      return s + programAllocationStats(g.programSlug, g.rok, g.runs).alloc;
    }, 0);
  }

  function filteredCompetitionsOverview() {
    return competitions.filter(c => {
      if (overviewFilterRok && String(c.rok) !== String(overviewFilterRok)) return false;
      if (overviewFilterProgram && c.program_slug !== overviewFilterProgram) return false;
      if (overviewFilterBeh && String(c.beh_cislo) !== String(overviewFilterBeh)) return false;
      if (overviewFilterStav && stavBucket(c.stav) !== overviewFilterStav) return false;
      return true;
    }).sort((a, b) => (b.rok || 0) - (a.rok || 0) || (b.beh_cislo || 0) - (a.beh_cislo || 0) || n(a.nazev).localeCompare(n(b.nazev), "cs"));
  }

  function uniqueYears() {
    return [...new Set(competitions.map(c => c.rok).filter(Boolean))].sort((a, b) => b - a);
  }

  function uniqueBeh() {
    const src = competitions.filter(c => {
      if (overviewFilterRok && String(c.rok) !== String(overviewFilterRok)) return false;
      if (overviewFilterProgram && c.program_slug !== overviewFilterProgram) return false;
      return true;
    });
    return [...new Set(src.map(c => c.beh_cislo).filter(Boolean))].sort((a, b) => a - b);
  }

  function renderCompetitionOverview() {
    const grid = el("competitionOverviewGrid");
    const rokSel = el("overviewRokFilter");
    const progSel = el("overviewProgramFilter");
    const behSel = el("overviewBehFilter");
    const stavSel = el("overviewStavFilter");
    const yearBudgetRow = el("overviewYearBudgetRow");
    const yearBudgetInput = el("overviewYearBudgetInput");
    if (!grid) return;

    if (rokSel) {
      const years = uniqueYears();
      rokSel.innerHTML = `<option value="">Vše</option>${years.map(y => `<option value="${y}" ${String(y) === String(overviewFilterRok) ? "selected" : ""}>${y}</option>`).join("")}`;
    }
    if (progSel) {
      progSel.innerHTML = `<option value="">Vše</option>${PROGRAMS.map(p =>
        `<option value="${p.slug}" ${p.slug === overviewFilterProgram ? "selected" : ""}>${html(p.title)}</option>`
      ).join("")}`;
    }
    if (behSel) {
      const behs = uniqueBeh();
      behSel.innerHTML = `<option value="">Vše</option>${behs.map(b => `<option value="${b}" ${String(b) === String(overviewFilterBeh) ? "selected" : ""}>Běh ${b}</option>`).join("")}`;
    }
    if (stavSel) stavSel.value = overviewFilterStav;
    if (yearBudgetRow) yearBudgetRow.hidden = !overviewFilterRok;
    if (yearBudgetInput && overviewFilterRok) {
      yearBudgetInput.value = getYearBudgetTotal(overviewFilterRok) || "";
    }

    if (loading) {
      grid.innerHTML = `<p class="hint">Načítám přehled…</p>`;
      return;
    }

    const items = filteredCompetitionsOverview();
    if (!items.length) {
      grid.innerHTML = `<p class="hint">${competitions.length ? "Žádný běh nevyhovuje filtrům." : "Zatím žádné soutěže — vytvořte běh nebo načtěte šablonu ReGa."}</p>`;
      return;
    }

    const groups = overviewGroups(items);
    const used = items.reduce((s, c) => s + sumSupported(c), 0);
    const requested = items.reduce((s, c) => s + sumApplications(c), 0);
    const programsAlloc = sumProgramsAllocation(groups);
    const yearAlloc = overviewFilterRok ? getYearBudgetTotal(overviewFilterRok) : 0;
    const totalAlloc = overviewFilterRok && yearAlloc > 0 ? yearAlloc : programsAlloc;
    const totalRemaining = totalAlloc - used;
    const totalPct = totalAlloc > 0 ? Math.round((used / totalAlloc) * 100) : 0;
    const totalStats = {
      alloc: totalAlloc,
      used,
      requested,
      remaining: totalRemaining,
      pct: totalPct,
      allocLabel: overviewFilterRok ? "Celková alokace roku" : "Celkem alokováno"
    };
    const showTotal = overviewFilterRok || groups.length > 1;
    const totalTitle = overviewFilterRok
      ? `Celkem za rok ${overviewFilterRok} (${groups.length} ${groups.length === 1 ? "soutěž" : "soutěže"}, ${items.length} běhů)`
      : `Celkem ve filtru (${groups.length} soutěží, ${items.length} běhů)`;
    const totalHint = overviewFilterRok && !yearAlloc
      ? `<p class="hint competitionOverviewTotalHint">Zadejte celkovou alokaci roku výše — jinak se počítá součet alokací jednotlivých soutěží (${fmtMoney(programsAlloc)}).</p>`
      : "";

    grid.innerHTML = `
      ${showTotal ? `
        <article class="competitionOverviewCard competitionOverviewTotal">
          <h3>${totalTitle}</h3>
          ${totalHint}
          ${renderAllocationSummaryStats(totalStats, { showBar: true })}
        </article>` : ""}
      <div class="competitionOverviewGrid">
        ${groups.map(g => {
          const prog = getProgram(g.programSlug);
          const active = g.runs.some(r => r.id === activeCompetitionId) ? "active" : "";
          if (g.type === "beh") {
            const c = g.primary;
            return `<article class="competitionOverviewCard ${active}" data-comp-id="${html(c.id)}" data-program="${html(c.program_slug)}" tabindex="0" role="button">
              <div class="competitionOverviewHead">
                <span class="competitionOverviewProgram">${prog.icon} ${html(prog.title)}</span>
                <span class="competitionOverviewStav stav-${stavBucket(c.stav)}">${html(stavLabel(c.stav))}</span>
              </div>
              <h3 class="competitionOverviewTitle">${html(c.nazev)}</h3>
              <p class="hint competitionOverviewMeta">Rok ${c.rok || "—"} · běh ${c.beh_cislo || 1} · ${(c.applications || []).length} přihlášek · ${(c.supported || []).length} podpořených</p>
              <h4 class="competitionOverviewSummaryTitle">Souhrn využití alokace</h4>
              ${renderAllocationSummary(c)}
              <span class="competitionOverviewCta">Otevřít detail →</span>
            </article>`;
          }
          const apps = g.runs.reduce((n, r) => n + (r.applications || []).length, 0);
          const supp = g.runs.reduce((n, r) => n + (r.supported || []).length, 0);
          const behLabel = g.runs.map(r => r.beh_cislo || 1).join(", ");
          const stav = groupStavBucket(g.runs);
          const stavText = { bezi: "Běží", rozhodnuto: "Rozhodnuto", uzavreno: "Uzavřeno" }[stav] || stav;
          return `<article class="competitionOverviewCard ${active}" data-comp-id="${html(g.primary.id)}" data-program="${html(g.programSlug)}" tabindex="0" role="button">
            <div class="competitionOverviewHead">
              <span class="competitionOverviewProgram">${prog.icon} ${html(prog.title)}</span>
              <span class="competitionOverviewStav stav-${stav}">${html(stavText)}</span>
            </div>
            <h3 class="competitionOverviewTitle">${html(prog.title)} · ${g.rok || "—"}</h3>
            <p class="hint competitionOverviewMeta">Běhy ${behLabel} · ${apps} přihlášek · ${supp} podpořených · ${g.runs.length} běhů</p>
            <h4 class="competitionOverviewSummaryTitle">Souhrn využití alokace (všechny běhy)</h4>
            ${renderAllocationSummary({ program_slug: g.programSlug, rok: g.rok, runs: g.runs })}
            <span class="competitionOverviewCta">Otevřít program →</span>
          </article>`;
        }).join("")}
      </div>`;

    grid.querySelectorAll(".competitionOverviewCard[data-comp-id]").forEach(card => {
      const open = () => {
        activeProgram = card.dataset.program;
        activeCompetitionId = card.dataset.compId;
        render();
        el("competitionDetail")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  function bindOverviewFilters() {
    const rokSel = el("overviewRokFilter");
    const progSel = el("overviewProgramFilter");
    const behSel = el("overviewBehFilter");
    const stavSel = el("overviewStavFilter");
    const yearBudgetInput = el("overviewYearBudgetInput");
    const yearBudgetSave = el("overviewYearBudgetSave");
    if (!rokSel || rokSel.__bound) return;
    rokSel.addEventListener("change", () => {
      overviewFilterRok = rokSel.value;
      overviewFilterBeh = "";
      renderCompetitionOverview();
    });
    progSel?.addEventListener("change", () => {
      overviewFilterProgram = progSel.value;
      overviewFilterBeh = "";
      renderCompetitionOverview();
    });
    behSel.addEventListener("change", () => {
      overviewFilterBeh = behSel.value;
      renderCompetitionOverview();
    });
    stavSel.addEventListener("change", () => {
      overviewFilterStav = stavSel.value;
      renderCompetitionOverview();
    });
    yearBudgetSave?.addEventListener("click", () => {
      if (!overviewFilterRok) return;
      setYearBudgetTotal(overviewFilterRok, yearBudgetInput?.value);
      renderCompetitionOverview();
      setStatus(`Celková alokace roku ${overviewFilterRok} uložena.`);
    });
    yearBudgetInput?.addEventListener("change", () => {
      if (!overviewFilterRok) return;
      setYearBudgetTotal(overviewFilterRok, yearBudgetInput.value);
      renderCompetitionOverview();
    });
    rokSel.__bound = true;
  }

  function personLabel(p) {
    return window.kbPersons?.personLabel?.(p) || "";
  }

  function getPerson(id) {
    return window.kbPersons?.getPerson?.(id) || null;
  }

  function resitelDisplay(item) {
    if (window.kbPersonLinks?.personDisplay) {
      return window.kbPersonLinks.personDisplay(item, "resitel");
    }
    if (item?.resitel_id) {
      const p = getPerson(item.resitel_id);
      if (p) return personLabel(p);
    }
    return item?.resitel || "";
  }

  function applyResitelLink(item, person) {
    if (window.kbPersonLinks?.applyPersonLink) {
      return window.kbPersonLinks.applyPersonLink(item, person, "resitel");
    }
    return {
      ...item,
      resitel_id: person?.id || null,
      resitel_osobni_cislo: person?.osobni_cislo || null,
      resitel: person ? personLabel(person) : ""
    };
  }

  function suggestProjektId(comp) {
    const prog = getProgram(comp.program_slug);
    const prefix = prog.slug.toUpperCase().replace(/-/g, "");
    const year = comp.rok || new Date().getFullYear();
    const seq = (comp.applications?.length || 0) + 1;
    return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
  }

  function pdfHref(path) {
    if (!path) return "";
    return window.kbSupabaseCompetitions?.resolvePdfUrl?.(path) || path;
  }

  function renderPdfBlock(path, nazev, label) {
    if (!path) {
      return `<div class="competitionPdfBlock"><strong>${html(label)}</strong><p class="hint">PDF není nahráno.</p></div>`;
    }
    const href = pdfHref(path);
    const name = html(nazev || `${label}.pdf`);
    return `<div class="competitionPdfBlock">
      <strong>${html(label)}</strong>
      <a class="competitionPdfLink" href="${html(href)}" target="_blank" rel="noopener">📄 ${name}</a>
      <span class="hint">Otevřít PDF v novém okně</span>
    </div>`;
  }

  function updatePdfFieldPreview(kind, path, nazev) {
    const cap = kind === "pokyn" ? "Pokyn" : "Vyvza";
    const current = el(`comp${cap}Current`);
    const removeBtn = el(`comp${cap}Remove`);
    const pending = kind === "pokyn" ? pendingPokynFile : pendingVyvzaFile;
    const removed = kind === "pokyn" ? removePokynPdf : removeVyvzaPdf;
    if (!current) return;
    if (pending) {
      current.textContent = `Nový soubor: ${pending.name}`;
      if (removeBtn) removeBtn.hidden = false;
      return;
    }
    if (removed) {
      current.textContent = "PDF bude odebráno po uložení.";
      if (removeBtn) removeBtn.hidden = false;
      return;
    }
    if (path) {
      const href = pdfHref(path);
      const name = html(nazev || "dokument.pdf");
      current.innerHTML = `Aktuální: <a href="${href}" target="_blank" rel="noopener">${name}</a>`;
      if (removeBtn) removeBtn.hidden = false;
    } else {
      current.textContent = "Zatím není nahráno PDF.";
      if (removeBtn) removeBtn.hidden = true;
    }
  }

  function resetPdfDialogState(c) {
    pendingPokynFile = null;
    pendingVyvzaFile = null;
    removePokynPdf = false;
    removeVyvzaPdf = false;
    const pokynInput = el("compPokynFile");
    const vyvzaInput = el("compVyvzaFile");
    if (pokynInput) pokynInput.value = "";
    if (vyvzaInput) vyvzaInput.value = "";
    updatePdfFieldPreview("pokyn", c?.pokyn, c?.pokyn_nazev);
    updatePdfFieldPreview("vyvza", c?.vyvza, c?.vyvza_nazev);
  }

  async function applyPdfFields(compId, existing) {
    let pokyn = existing?.pokyn || "";
    let pokyn_nazev = existing?.pokyn_nazev || "";
    let vyvza = existing?.vyvza || "";
    let vyvza_nazev = existing?.vyvza_nazev || "";
    const api = window.kbSupabaseCompetitions;

    if (removePokynPdf) {
      if (pokyn && api?.deletePdf) await api.deletePdf(pokyn);
      pokyn = "";
      pokyn_nazev = "";
    }
    if (removeVyvzaPdf) {
      if (vyvza && api?.deletePdf) await api.deletePdf(vyvza);
      vyvza = "";
      vyvza_nazev = "";
    }
    if (pendingPokynFile) {
      const up = api?.uploadPdf
        ? await api.uploadPdf(compId, "pokyn", pendingPokynFile)
        : { path: "", nazev: pendingPokynFile.name };
      if (pokyn && api?.deletePdf) await api.deletePdf(pokyn);
      pokyn = up.path;
      pokyn_nazev = up.nazev;
    }
    if (pendingVyvzaFile) {
      const up = api?.uploadPdf
        ? await api.uploadPdf(compId, "vyvza", pendingVyvzaFile)
        : { path: "", nazev: pendingVyvzaFile.name };
      if (vyvza && api?.deletePdf) await api.deletePdf(vyvza);
      vyvza = up.path;
      vyvza_nazev = up.nazev;
    }
    return { pokyn, pokyn_nazev, vyvza, vyvza_nazev };
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(competitions, null, 2));
  }

  function formatSaveError(err) {
    const msg = (err?.message || err || "").toString();
    if (/schema cache|could not find the .* column/i.test(msg)) {
      return `${msg}\n\nV Supabase chybí nové sloupce tabulky kb_competitions.\nSpusťte v SQL Editoru soubor:\nsupabase/competitions-migrate-v3.sql\n\nPoté obnovte stránku (Ctrl+F5) a zkuste uložit znovu.`;
    }
    return msg;
  }

  function setStatus(text, isError) {
    const node = el("competitionsStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("competitionsStatusError", !!isError);
  }

  async function loadCompetitions() {
    loading = true;
    render();
    try {
      if (!window.kbSupabaseCompetitions) {
        useSupabase = false;
        competitions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(competitions)) competitions = [];
        await window.kbPersons?.ensureLoaded?.();
        setStatus("Data v prohlížeči. Pro Supabase spusťte supabase/competitions-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseCompetitions.probeTables();
      if (!available) {
        useSupabase = false;
        competitions = window.kbSupabaseCompetitions.loadLocal();
        await window.kbPersons?.ensureLoaded?.();
        setStatus("Tabulky v Supabase zatím neexistují. Spusťte supabase/competitions-schema.sql.");
        return;
      }
      useSupabase = true;
      const loaded = await window.kbSupabaseCompetitions.loadAll();
      await window.kbPersons?.ensureLoaded?.();
      let repaired = 0;
      competitions = [];
      for (const comp of loaded) {
        const reconciled = reconcileCompetitionSupport(comp);
        if (competitionSupportChanged(comp, reconciled)) {
          try {
            const saved = await window.kbSupabaseCompetitions.saveCompetition({ ...reconciled, __existing: true });
            competitions.push(saved);
            repaired += 1;
          } catch (repairErr) {
            console.warn("Synchronizace podpoření selhala:", repairErr);
            competitions.push(reconciled);
          }
        } else {
          competitions.push(reconciled);
        }
      }
      const personCount = window.kbPersons?.getPersons?.().length || 0;
      const repairNote = repaired ? ` · sjednoceno ${repaired} běhů` : "";
      setStatus(`Načteno ze Supabase: ${competitions.length} běhů, ${personCount} osob${repairNote}.`);
    } catch (e) {
      console.error(e);
      useSupabase = false;
      competitions = window.kbSupabaseCompetitions?.loadLocal?.() || [];
      await window.kbPersons?.ensureLoaded?.();
      setStatus(`Chyba: ${e.message || e}`, true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:competitions-loaded"));
    }
  }

  async function fetchPdfAsFile(path, filename) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Soubor ${filename} se nepodařilo načíst.`);
    const blob = await res.blob();
    return new File([blob], filename, { type: "application/pdf" });
  }

  function buildKomiseHodnoceni(row) {
    return [
      `Pořadí: ${row.poradi}/8 · Průměr hodnocení komise: ${row.prumer}`,
      `EPZ ID: ${row.epz_id}`,
      `Období: ${row.obdobi || "15.04.2026 – 30.11.2026"}`,
      `Původní stav v evidenci: ${row.podporit ? "V realizaci (podpořeno)" : "Nepodpořen"}`
    ].join("\n");
  }

  function scoreLabel(v) {
    return v == null || v === "" ? "—" : v;
  }

  function isSupportedApplication(comp, appId) {
    return (comp.supported || []).some(s => s.application_id === appId);
  }

  function buildSupportedFromApplication(app, existing) {
    const linkedPerson = window.kbPersonLinks?.resolvePerson?.(app, "resitel")
      || (app.resitel_id ? getPerson(app.resitel_id) : null);
    return {
      ...applyResitelLink({
        id: existing?.id || uuid(),
        application_id: app.id,
        projekt_id: app.projekt_id,
        nazev_projektu: app.nazev_projektu,
        fakulta: app.fakulta,
        katedra: app.katedra,
        castka_podpory: app.financni_pozadavek,
        poznamka: existing?.poznamka || `Podpořeno – přihláška ${app.projekt_id || app.id}`,
        created_at: existing?.created_at || new Date().toISOString(),
        __existing: !!existing
      }, linkedPerson),
      resitel: resitelDisplay(app)
    };
  }

  function reconcileCompetitionSupport(comp) {
    const supported = [...(comp.supported || [])];
    const supportedByApp = new Map(supported.filter(s => s.application_id).map(s => [s.application_id, s]));
    const applications = (comp.applications || []).map(app => {
      const sup = supportedByApp.get(app.id);
      if (sup && app.stav !== "Podpořeno") {
        return { ...app, stav: "Podpořeno", __existing: true };
      }
      if (!sup && app.stav === "Podpořeno") {
        return { ...app, stav: "Zamítnuto", __existing: true };
      }
      return app;
    });
    const nextSupported = [...supported];
    for (const app of applications) {
      if (app.stav !== "Podpořeno") continue;
      const idx = nextSupported.findIndex(s => s.application_id === app.id);
      if (idx === -1) nextSupported.push(buildSupportedFromApplication(app));
      else {
        nextSupported[idx] = {
          ...nextSupported[idx],
          projekt_id: app.projekt_id,
          nazev_projektu: app.nazev_projektu,
          fakulta: app.fakulta,
          katedra: app.katedra,
          castka_podpory: app.financni_pozadavek,
          resitel: resitelDisplay(app),
          __existing: true
        };
      }
    }
    const filteredSupported = nextSupported.filter(s => {
      if (!s.application_id) return true;
      const app = applications.find(a => a.id === s.application_id);
      return app && app.stav === "Podpořeno";
    });
    return { ...comp, applications, supported: filteredSupported };
  }

  function competitionSupportChanged(before, after) {
    if (!before || !after) return true;
    const appSig = (comp) => (comp.applications || []).map(a => `${a.id}:${a.stav}`).join("|");
    const supSig = (comp) => (comp.supported || []).map(s => `${s.id}:${s.application_id}`).join("|");
    return appSig(before) !== appSig(after) || supSig(before) !== supSig(after);
  }

  function buildPrestigeHodnoceni(row) {
    const k = row.kriteria || {};
    return [
      `Pořadí: ${row.poradi ?? "—"}/11 · Průměr K1–K7: ${row.prumer ?? "—"}`,
      `K1=${scoreLabel(k.k1)} K2=${scoreLabel(k.k2)} K3=${scoreLabel(k.k3)} K4=${scoreLabel(k.k4)} K5=${scoreLabel(k.k5)} K6=${scoreLabel(k.k6)} K7=${scoreLabel(k.k7)}`,
      `Cílová soutěž: ${row.cilova_soutez || "—"}`,
      `Termín podání: ${row.termin_podani || "—"}`,
      `Rozpočet: rok 1 ${row.financni_pozadavek ?? "—"} Kč, rok 2 ${row.rozpocet_rok_2 ?? "—"} Kč`,
      `Rozhodnutí: ${row.rozhodnuti || "—"}`
    ].join("\n");
  }

  function mapPrestigeApplicationRow(row, person) {
    return {
      id: row.id,
      projekt_id: row.projekt_id,
      nazev_projektu: row.nazev_projektu,
      ...applyResitelLink({}, person),
      fakulta: row.fakulta,
      katedra: row.katedra || "",
      financni_pozadavek: Number(row.financni_pozadavek) || 0,
      cilova_soutez: row.cilova_soutez || "",
      termin_podani: row.termin_podani || "",
      rozpocet_rok_2: Number(row.rozpocet_rok_2) || 0,
      hodnoceni_prumer: row.prumer ?? null,
      rozhodnuti_poradi: row.poradi ?? null,
      hodnoceni_kriteria: row.kriteria || null,
      hodnoceni: row.poradi ? `Pořadí ${row.poradi}/11 · ${row.rozhodnuti || ""}` : "",
      hodnoceni_komise: buildPrestigeHodnoceni(row),
      stav: row.stav || (row.podporit ? "Podpořeno" : "Zamítnuto"),
      poznamka: row.poznamka || "",
      created_at: new Date().toISOString(),
      __existing: false
    };
  }

  async function resolvePersonForImport(p, personByKey) {
    if (personByKey[p.key]) return personByKey[p.key];
    let found = window.kbPersons?.matchPersonFromRegistry?.(p) || null;
    if (found) {
      personByKey[p.key] = found;
      return found;
    }
    if (p.osobni_cislo) {
      found = await window.kbPersons.upsertPerson(p);
      personByKey[p.key] = found;
      return found;
    }
    return null;
  }

  function buildConnectHodnoceni(row) {
    const s = row.skore || {};
    const lines = [
      `Kolo hodnocení: ${row.kolo || "—"}`,
      `Skóre fakult: HT ${scoreLabel(s.ht)}, PřF ${scoreLabel(s.prf)}, PdF ${scoreLabel(s.pdf)}, FF ${scoreLabel(s.ff)}, FIM ${scoreLabel(s.fim)}`,
      `Průměr: ${row.prumer ?? "—"}`,
      `Rozhodnutí: ${row.rozhodnuti || "—"}`
    ];
    if (row.podporit && Number(row.castka_alokovana) !== Number(row.financni_pozadavek)) {
      lines.push(`Alokováno ${row.castka_alokovana} Kč (požadováno ${row.financni_pozadavek} Kč)`);
    }
    return lines.join("\n");
  }

  function seedEntriesFromFile(seed) {
    const shared = {
      pokyn_file: seed.pokyn_file,
      vyvza_file: seed.vyvza_file,
      pokyn_nazev: seed.pokyn_nazev,
      vyvza_nazev: seed.vyvza_nazev
    };
    if (seed.competitions?.length) {
      return seed.competitions.map((c) => ({ ...shared, ...c }));
    }
    return [{ ...shared, ...seed.competition }];
  }

  async function importCompetitionSeed(seedPath, pdfNames, programSlug) {
    let seed;
    try {
      const seedRes = await fetch(seedPath);
      if (!seedRes.ok) throw new Error(`Soubor ${seedPath} nenalezen.`);
      seed = await seedRes.json();
    } catch (err) {
      alert("Šablonu se nepodařilo načíst: " + (err.message || err));
      return;
    }
    const entries = seedEntriesFromFile(seed);
    const withApps = entries.filter((s) => {
      const ex = competitions.find(c => c.program_slug === s.program_slug && c.rok === s.rok && c.beh_cislo === s.beh_cislo);
      return ex?.applications?.length;
    });
    if (withApps.length && !confirm(`Některé běhy už obsahují přihlášky. Aktualizovat metadata a PDF (pokyn, výzva)? Projekty zůstanou.`)) {
      return;
    }
    const existingOnly = entries.filter((s) => {
      const ex = competitions.find(c => c.program_slug === s.program_slug && c.rok === s.rok && c.beh_cislo === s.beh_cislo);
      return ex && !ex.applications?.length;
    });
    if (existingOnly.length && !withApps.length && !confirm(`Některé běhy už existují. Nahradit pokynem a výzvou ze šablony?`)) {
      return;
    }
    setStatus(`Načítám šablonu (${entries.length} běhů)…`);
    loading = true;
    render();
    try {
      const api = window.kbSupabaseCompetitions;
      let pokynFile = null;
      let vyvzaFile = null;
      if (!seed.skip_pdf) {
        pokynFile = await fetchPdfAsFile(seed.pokyn_file || entries[0].pokyn_file, pdfNames.pokyn);
        vyvzaFile = await fetchPdfAsFile(seed.vyvza_file || entries[0].vyvza_file, pdfNames.vyvza);
      }
      let lastSaved = null;
      for (const s of entries) {
        const existing = competitions.find(c => c.program_slug === s.program_slug && c.rok === s.rok && c.beh_cislo === s.beh_cislo);
        const compId = existing?.id || uuid();
        let pokyn = existing?.pokyn || "";
        let vyvza = existing?.vyvza || "";
        if (api?.uploadPdf && pokynFile && vyvzaFile) {
          const upP = await api.uploadPdf(compId, "pokyn", pokynFile);
          const upV = await api.uploadPdf(compId, "vyvza", vyvzaFile);
          pokyn = upP.path;
          vyvza = upV.path;
        }
        const comp = {
          id: compId,
          program_slug: s.program_slug,
          nazev: s.nazev,
          rok: s.rok,
          beh_cislo: s.beh_cislo,
          alokovana_castka: Number(s.alokovana_castka) || existing?.alokovana_castka || 0,
          pokyn,
          pokyn_nazev: s.pokyn_nazev,
          vyvza,
          vyvza_nazev: s.vyvza_nazev,
          poznamka: s.poznamka,
          stav: s.stav || existing?.stav || "Aktivní",
          hodnoceni_prodekanu: existing?.hodnoceni_prodekanu || "",
          rozhodnuti_prorektorky: existing?.rozhodnuti_prorektorky || "",
          applications: existing?.applications || [],
          supported: existing?.supported || [],
          created_at: existing?.created_at || new Date().toISOString(),
          __existing: !!existing
        };
        lastSaved = await saveCompetition(comp);
      }
      activeProgram = programSlug;
      activeCompetitionId = lastSaved?.id || activeCompetitionId;
      setStatus(`Šablona načtena: ${entries.map(s => `běh ${s.beh_cislo}`).join(", ")}.`);
    } catch (err) {
      console.error(err);
      alert("Import šablony selhal: " + formatSaveError(err));
      setStatus("Import šablony selhal.", true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:competitions-loaded"));
    }
  }

  async function applyCompetitionProjectsImport(data, programSlug, rok, behCislo, buildHodnoceni, supportedNote) {
    let comp = competitions.find(c => c.program_slug === programSlug && c.rok === rok && c.beh_cislo === behCislo);
    if (!comp) {
      if (!confirm("Běh ještě neexistuje. Načíst nejdřív šablonu (pokyn + výzva)?")) return;
      if (programSlug === "rega") await importRegaSeed();
      else if (programSlug === "connect") await importConnectSeed();
      else if (programSlug === "prestige") await importPrestigeSeed();
      comp = competitions.find(c => c.program_slug === programSlug && c.rok === rok && c.beh_cislo === behCislo);
      if (!comp) return;
    }
    if (comp.applications?.length && !confirm(`Běh už má ${comp.applications.length} přihlášek. Nahradit importem ${data.applications.length} projektů z tabulky?`)) {
      return;
    }
    setStatus("Importuji osoby a projekty…");
    loading = true;
    render();
    try {
      await window.kbPersons?.ensureLoaded?.();
      const personByKey = {};
      for (const p of data.persons || []) {
        await resolvePersonForImport(p, personByKey);
      }
      const buildRow = programSlug === "prestige"
        ? (row) => mapPrestigeApplicationRow(row, personByKey[row.person_key])
        : (row) => {
          const person = personByKey[row.person_key];
          return {
            id: row.id,
            projekt_id: row.projekt_id,
            nazev_projektu: row.nazev_projektu,
            ...applyResitelLink({}, person),
            fakulta: row.fakulta,
            katedra: row.katedra || "",
            financni_pozadavek: row.financni_pozadavek,
            hodnoceni: row.kolo ? `Kolo ${row.kolo}` : (row.poradi ? `Pořadí ${row.poradi}/8` : ""),
            hodnoceni_komise: buildHodnoceni(row),
            stav: row.stav,
            poznamka: row.poznamka || (row.kolo ? `Kolo ${row.kolo} · ${row.rozhodnuti || ""}` : ""),
            created_at: new Date().toISOString(),
            __existing: false
          };
        };
      const applications = (data.applications || []).map(buildRow);
      const supported = (data.applications || [])
        .filter(row => row.podporit)
        .map(row => {
          const person = personByKey[row.person_key];
          const app = applications.find(a => a.id === row.id);
          const castka = Number(row.castka_alokovana ?? row.financni_pozadavek) || 0;
          return {
            id: uuid(),
            application_id: row.id,
            projekt_id: row.projekt_id,
            nazev_projektu: row.nazev_projektu,
            ...applyResitelLink(app || {}, person || (app?.resitel_id ? getPerson(app.resitel_id) : null)),
            fakulta: row.fakulta,
            katedra: row.katedra || "",
            castka_podpory: castka,
            poznamka: `${supportedNote}${row.kolo ? ` · kolo ${row.kolo}` : ""}${row.rozhodnuti === "Cut" ? " (snížená alokace)" : ""}`,
            created_at: new Date().toISOString()
          };
        });
      const upd = data.competition_updates || {};
      const updated = {
        ...comp,
        alokovana_castka: upd.alokovana_castka ?? comp.alokovana_castka,
        stav: upd.stav || comp.stav,
        hodnoceni_prodekanu: upd.hodnoceni_prodekanu || comp.hodnoceni_prodekanu,
        rozhodnuti_prorektorky: upd.rozhodnuti_prorektorky || comp.rozhodnuti_prorektorky,
        applications,
        supported,
        __existing: true
      };
      const saved = await saveCompetition(updated);
      activeProgram = programSlug;
      activeCompetitionId = saved.id;
      setStatus(`Import dokončen: ${applications.length} přihlášek, ${supported.length} podpořených projektů, ${(data.persons || []).length} osob.`);
    } catch (err) {
      console.error(err);
      alert("Import projektů selhal: " + formatSaveError(err));
      setStatus("Import projektů selhal.", true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:competitions-loaded"));
      document.dispatchEvent(new CustomEvent("kb:persons-loaded"));
    }
  }

  async function importCompetitionProjects(dataPath, programSlug, rok, behCislo, buildHodnoceni, supportedNote) {
    let data;
    try {
      const res = await fetch(dataPath);
      if (!res.ok) throw new Error(`Soubor ${dataPath} nenalezen.`);
      data = await res.json();
    } catch (err) {
      alert("Projekty se nepodařilo načíst: " + (err.message || err));
      return;
    }
    return applyCompetitionProjectsImport(data, programSlug, rok, behCislo, buildHodnoceni, supportedNote);
  }

  function normalizePrestigeHeader(header) {
    return String(header || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function parsePrestigeMoney(value) {
    if (value == null || value === "") return 0;
    const num = String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s/g, "")
      .replace(/kč/gi, "")
      .replace(",", ".");
    return Number(num) || 0;
  }

  function parsePrestigeDecision(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d+)\s+(podpořit|nepodpořit)/i);
    if (!match) {
      const podporit = /podpořit/i.test(text) && !/nepodpořit/i.test(text);
      return { poradi: null, rozhodnuti: text, podporit };
    }
    const poradi = Number(match[1]);
    const podporit = !/^nepodpořit/i.test(match[2]);
    return { poradi, rozhodnuti: podporit ? "podpořit" : "nepodpořit", podporit };
  }

  function parsePrestigeApplicant(cell) {
    const raw = String(cell || "").trim();
    if (!raw) return { jmeno: "", prijmeni: "", tituly: "" };
    const comma = raw.indexOf(",");
    const main = (comma >= 0 ? raw.slice(0, comma) : raw).trim();
    const tituly = comma >= 0 ? raw.slice(comma + 1).trim() : "";
    const parts = main.split(/\s+/).filter(Boolean);
    const honorific = /^(prof|doc|ing|mgr|dr|pharmdr|rndr|phdr|mba|mpa|m\.a|ph\.d)\.?$/i;
    while (parts.length && honorific.test(parts[0])) parts.shift();
    if (parts.length >= 2 && /^lamb$/i.test(parts[0])) {
      return { jmeno: parts.slice(1).join(" "), prijmeni: parts[0], tituly };
    }
    const prijmeni = parts.pop() || "";
    const jmeno = parts.join(" ");
    return { jmeno, prijmeni, tituly };
  }

  function prestigePersonKey(prijmeni, used) {
    const base = String(prijmeni || "osoba")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || "osoba";
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let i = 2;
    while (used.has(`${base}${i}`)) i += 1;
    const key = `${base}${i}`;
    used.add(key);
    return key;
  }

  function prestigeRowValue(row, aliases) {
    for (const alias of aliases) {
      if (row[alias] != null && String(row[alias]).trim() !== "") return row[alias];
    }
    return "";
  }

  function prestigeDataFromCsvRows(rows) {
    const persons = [];
    const applications = [];
    const usedKeys = new Set();
    rows.forEach((row, index) => {
      const normalized = {};
      Object.entries(row).forEach(([key, value]) => {
        normalized[normalizePrestigeHeader(key)] = value;
      });
      const applicant = parsePrestigeApplicant(prestigeRowValue(normalized, ["zadatel", "žadatel", "applicant"]));
      if (!applicant.prijmeni && !applicant.jmeno) return;
      const key = prestigePersonKey(applicant.prijmeni, usedKeys);
      persons.push({ key, ...applicant, fakulta: prestigeRowValue(normalized, ["fakulta"]) });
      const decision = parsePrestigeDecision(prestigeRowValue(normalized, ["rozhodnuti", "rozhodnutí", "decision"]));
      const kriteria = {};
      for (let i = 1; i <= 7; i += 1) {
        const score = Number(prestigeRowValue(normalized, [`k${i}`]));
        if (score) kriteria[`k${i}`] = score;
      }
      const prumerRaw = prestigeRowValue(normalized, ["prumer", "průměr", "average"]);
      const prumer = prumerRaw ? Number(String(prumerRaw).replace(",", ".")) : null;
      applications.push({
        id: `p2600001-0001-4001-8001-${String(index + 1).padStart(12, "0")}`,
        projekt_id: `PRESTIGE-2026-${String(index + 1).padStart(3, "0")}`,
        person_key: key,
        nazev_projektu: prestigeRowValue(normalized, ["projekt", "nazev projektu", "název projektu"]),
        fakulta: prestigeRowValue(normalized, ["fakulta"]),
        cilova_soutez: prestigeRowValue(normalized, ["cilova soutez", "cílová soutěž", "cilova soutěž"]),
        termin_podani: prestigeRowValue(normalized, [
          "predpokladany termin podani navrhu",
          "předpokládaný termín podání návrhu",
          "termin",
          "termín"
        ]),
        financni_pozadavek: parsePrestigeMoney(prestigeRowValue(normalized, ["rozpocet 1. rok", "rozpočet 1. rok", "rok 1"])),
        rozpocet_rok_2: parsePrestigeMoney(prestigeRowValue(normalized, ["rozpocet 2. rok", "rozpočet 2. rok", "rok 2"])),
        kriteria: Object.keys(kriteria).length ? kriteria : null,
        prumer,
        poradi: decision.poradi,
        rozhodnuti: decision.rozhodnuti,
        stav: decision.podporit ? "Podpořeno" : "Zamítnuto",
        podporit: decision.podporit
      });
    });
    return {
      source: "Import CSV – UHK Prestige výzva 1/2026",
      competition_updates: {
        stav: "Rozhodnuto",
        hodnoceni_prodekanu: "Hodnocení proděkanů fakult a komise dle kritérií K1–K7 — import z tabulky.",
        rozhodnuti_prorektorky: "Import z tabulky podaných projektů (výzva č. 1/2026)."
      },
      persons,
      applications
    };
  }

  async function readPrestigeCsvText(file) {
    const buffer = await file.arrayBuffer();
    const encodings = ["utf-8", "windows-1250", "iso-8859-2"];
    let bestText = "";
    let bestScore = -1;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding).decode(buffer);
        const score = (text.match(/[ěščřžýáíéúůďťňó]/gi) || []).length;
        if (score > bestScore) {
          bestScore = score;
          bestText = text;
        }
      } catch (_) { /* next encoding */ }
    }
    return bestText || new TextDecoder("utf-8").decode(buffer);
  }

  async function importPrestigeFromCsv(file) {
    if (!file) return;
    let text;
    try {
      text = await readPrestigeCsvText(file);
    } catch (err) {
      alert("CSV se nepodařilo načíst: " + (err.message || err));
      return;
    }
    const table = window.kbPersons?.parseDelimitedTable?.(text);
    if (!table?.rows?.length) {
      alert("V CSV nebyly nalezeny žádné řádky projektů.");
      return;
    }
    const data = prestigeDataFromCsvRows(table.rows);
    if (!data.applications.length) {
      alert("Nepodařilo se zpracovat žádnou přihlášku. Zkontrolujte hlavičku (Žadatel, Projekt, K1–K7, Rozhodnutí).");
      return;
    }
    return applyCompetitionProjectsImport(data, "prestige", 2026, 1, buildPrestigeHodnoceni, "Podpořeno – UHK Prestige výzva 1/2026");
  }

  function importRegaProjects() {
    return importCompetitionProjects(
      "data/competitions/rega-2026-projects.json",
      "rega",
      2026,
      1,
      buildKomiseHodnoceni,
      "Podpořeno – výzva ReGa 2026/1"
    );
  }

  function importRegaSeed() {
    return importCompetitionSeed(
      "data/competitions/rega-seed.json",
      { pokyn: "pokyn-rega-2026.pdf", vyvza: "vyvza-rega-2026.pdf" },
      "rega"
    );
  }

  async function importConnectProjects() {
    const steps = [
      { path: "data/competitions/connect-2026-beh1-projects.json", beh: 1, note: "Podpořeno – UHK Connect 2026 kolo 1" },
      { path: "data/competitions/connect-2026-beh2-projects.json", beh: 2, note: "Podpořeno – UHK Connect 2026 kolo 2" }
    ];
    for (const step of steps) {
      await importCompetitionProjects(
        step.path,
        "connect",
        2026,
        step.beh,
        buildConnectHodnoceni,
        step.note
      );
    }
  }

  function importConnectSeed() {
    return importCompetitionSeed(
      "data/competitions/connect-seed.json",
      { pokyn: "pokyn-connect-2026.pdf", vyvza: "vyvza-connect-2026.pdf" },
      "connect"
    );
  }

  function importPrestigeProjects() {
    return importCompetitionProjects(
      "data/competitions/prestige-2026-projects.json",
      "prestige",
      2026,
      1,
      buildPrestigeHodnoceni,
      "Podpořeno – UHK Prestige výzva 1/2026"
    );
  }

  function importPrestigeSeed() {
    return importCompetitionSeed(
      "data/competitions/prestige-seed.json",
      {},
      "prestige"
    );
  }

  const PROGRAM_SEED_BANNERS = {
    rega: {
      title: "UHK ReGa",
      description: "Interní soutěž pro dopracování nezafinancovaných projektů základního výzkumu.",
      sourceUrl: "https://www.uhk.cz/cs/univerzita-hradec-kralove/veda-a-vyzkum/programy-projekty-a-souteze/interni-celouniverzitni-projekty/re_ga_uhk",
      sourceNote: "pokyn prorektorky č. 5/2026, výzva č. 1/2026",
      rok: 2026,
      beh: 1,
      seedBtn: { id: "importRegaSeedBtn", labelNew: "1. Načíst šablonu ReGa", labelUpdate: "Aktualizovat šablonu ReGa" },
      projectsBtn: { id: "importRegaProjectsBtn", label: "2. Importovat podané projekty (8)" },
      onSeed: importRegaSeed,
      onProjects: importRegaProjects
    },
    connect: {
      title: "UHK Connect",
      description: "Krátké projekty pro síťování, mobilitu a navázání spolupráce — celoroční alokace u běhu 1, další běhy čerpají automaticky „zbývá z alokace“.",
      sourceUrl: "https://www.uhk.cz/cs/univerzita-hradec-kralove/veda-a-vyzkum/programy-projekty-a-souteze/interni-celouniverzitni-projekty/uhk-connect",
      sourceNote: "pokyn prorektorky č. 06/2026, výzva č. 2/2026",
      rok: 2026,
      behs: [1, 2],
      seedBtn: { id: "importConnectSeedBtn", labelNew: "1. Načíst šablony Connect (běh 1 + 2)", labelUpdate: "Aktualizovat šablony Connect" },
      projectsBtn: { id: "importConnectProjectsBtn", label: "2. Importovat projekty (kolo 1: 7, kolo 2: 7)" },
      onSeed: importConnectSeed,
      onProjects: importConnectProjects
    },
    prestige: {
      title: "UHK Prestige",
      description: "Podpora přípravy návrhů do ERC, Horizon Europe a dalších prestižních programů. Jeden běh výzvy 1/2026 — tabulka 11 podaných projektů s hodnocením K1–K7. Pro přesná data (včetně rozhodnutí podpořit/nepodpořit) použijte Import z CSV.",
      sourceUrl: "https://www.uhk.cz/cs/univerzita-hradec-kralove/veda-a-vyzkum/programy-projekty-a-souteze/interni-celouniverzitni-projekty/soutez-uhk-prestige",
      sourceNote: "pokyn prorektorky č. 11/2026, výzva č. 1/2026",
      rok: 2026,
      beh: 1,
      seedBtn: { id: "importPrestigeSeedBtn", labelNew: "1. Načíst šablonu Prestige", labelUpdate: "Aktualizovat šablonu Prestige" },
      projectsBtn: { id: "importPrestigeProjectsBtn", label: "2. Načíst šablonu projektů (11)" },
      csvBtn: { id: "importPrestigeCsvBtn", inputId: "importPrestigeCsvInput", label: "Import z CSV (Excel) — doporučeno" },
      onSeed: importPrestigeSeed,
      onProjects: importPrestigeProjects,
      onCsv: importPrestigeFromCsv
    }
  };

  function renderProgramSeedBanner() {
    const box = el("competitionProgramBanner");
    if (!box) return;
    const cfg = PROGRAM_SEED_BANNERS[activeProgram];
    if (!cfg) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const behs = cfg.behs || [cfg.beh];
    const hasRun = behs.every(beh => competitions.some(c => c.program_slug === activeProgram && c.rok === cfg.rok && c.beh_cislo === beh));
    box.innerHTML = `
      <div class="competitionRegaSeedBox">
        <p><strong>${cfg.title}</strong> — ${cfg.description}
          Údaje a PDF podle <a href="${cfg.sourceUrl}" target="_blank" rel="noopener">oficiální stránky UHK</a>
          (${cfg.sourceNote}).</p>
        <div class="competitionRegaSeedActions">
          <button type="button" id="${cfg.seedBtn.id}" class="button small accent">${hasRun ? cfg.seedBtn.labelUpdate : cfg.seedBtn.labelNew}</button>
          <button type="button" id="${cfg.projectsBtn.id}" class="button small secondary">${cfg.projectsBtn.label}</button>
          ${cfg.csvBtn ? `<input type="file" id="${cfg.csvBtn.inputId}" accept=".csv,.txt,text/csv" hidden>
          <button type="button" id="${cfg.csvBtn.id}" class="button small secondary">${cfg.csvBtn.label}</button>` : ""}
        </div>
      </div>`;
    el(cfg.seedBtn.id)?.addEventListener("click", cfg.onSeed);
    el(cfg.projectsBtn.id)?.addEventListener("click", cfg.onProjects);
    if (cfg.csvBtn) {
      const csvInput = el(cfg.csvBtn.inputId);
      el(cfg.csvBtn.id)?.addEventListener("click", () => csvInput?.click());
      csvInput?.addEventListener("change", async () => {
        const file = csvInput.files?.[0];
        csvInput.value = "";
        if (file) await cfg.onCsv(file);
      });
    }
  }

  async function saveCompetition(comp) {
    const synced = reconcileCompetitionSupport(comp);
    let saved;
    if (useSupabase && window.kbSupabaseCompetitions) {
      saved = await window.kbSupabaseCompetitions.saveCompetition(synced);
      const idx = competitions.findIndex(c => c.id === saved.id);
      if (idx === -1) competitions.unshift(saved);
      else competitions[idx] = saved;
    } else {
      const idx = competitions.findIndex(c => c.id === synced.id);
      if (idx === -1) competitions.unshift(synced);
      else competitions[idx] = synced;
      persistLocal();
      saved = synced;
    }
    if (usesCascadingAllocation(saved.program_slug) && saved.rok) {
      await syncCascadingAllocations(saved.program_slug, saved.rok);
    }
    return saved;
  }

  function renderProgramTabs() {
    const box = el("competitionProgramTabs");
    if (!box) return;
    box.innerHTML = PROGRAMS.map(p => {
      const count = competitionsForProgram(p.slug).length;
      const active = p.slug === activeProgram ? "active" : "";
      return `<button type="button" class="competitionTab ${active}" data-program="${html(p.slug)}">${p.icon} ${html(p.title)}${count ? ` <span class="tabCount">${count}</span>` : ""}</button>`;
    }).join("");
    box.querySelectorAll("[data-program]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeProgram = btn.dataset.program;
        activeCompetitionId = null;
        render();
      });
    });
  }

  function renderCompetitionList() {
    const box = el("competitionList");
    if (!box) return;
    const items = competitionsForProgram(activeProgram);
    const prog = getProgram(activeProgram);
    if (loading) {
      box.innerHTML = `<p class="hint">Načítám…</p>`;
      return;
    }
    if (!items.length) {
      const seedCfg = PROGRAM_SEED_BANNERS[activeProgram];
      const hint = seedCfg
        ? `<p class="hint">Zatím žádný běh ${html(prog.title)}. Použijte <strong>${html(seedCfg.seedBtn.labelNew)}</strong> výše (pokyn + výzva v PDF), nebo vytvořte běh ručně.</p>`
        : `<p class="hint">Zatím žádný běh pro ${html(prog.title)}. Klikněte „Nový běh / výzva“.</p>`;
      box.innerHTML = hint;
      return;
    }
    box.innerHTML = `<div class="competitionCards">${items.map(c => {
      const { alloc, used, pct, allocLabel } = allocationStats(c);
      const allocShort = allocLabel === "Zbývá z alokace" ? "zbývá" : "alokace";
      const active = c.id === activeCompetitionId ? "active" : "";
      return `<article class="competitionCard ${active}" data-comp-id="${html(c.id)}" tabindex="0" role="button">
        <strong>${html(c.nazev)}</strong>
        <span class="competitionCardMeta">${c.rok || "—"} · běh ${c.beh_cislo || 1} · ${(c.applications || []).length} přihlášek</span>
        <span class="competitionCardMoney">${fmtMoney(alloc)} ${allocShort} · ${fmtMoney(used)} čerpáno (${pct}%)</span>
        <span class="badge">${html(c.stav || "")}</span>
      </article>`;
    }).join("")}</div>`;
    box.querySelectorAll(".competitionCard").forEach(card => {
      card.addEventListener("click", () => { activeCompetitionId = card.dataset.compId; render(); });
    });
  }

  function renderCompetitionDetail() {
    const box = el("competitionDetail");
    if (!box) return;
    const c = getCompetition(activeCompetitionId);
    if (!c) {
      box.innerHTML = `<p class="hint">Vyberte běh / výzvu vlevo, nebo vytvořte nový.</p>`;
      return;
    }
    const { alloc, used, requested, remaining, annual, allocLabel } = allocationStats(c);
    const behCount = competitionsForProgram(c.program_slug).length;
    const cascadeHint = usesCascadingAllocation(c.program_slug) && (c.beh_cislo || 1) > 1 && annual > 0
      ? `<p class="hint">Celoroční alokace ${c.rok}: ${fmtMoney(annual)} · pro tento běh zbývá ${fmtMoney(alloc)} z předchozích kol</p>`
      : "";

    box.innerHTML = `
      <div class="competitionDetailHead">
        <div>
          <h2>${html(c.nazev)}</h2>
          <p class="hint">${html(getProgram(c.program_slug).title)} · rok ${c.rok || "—"} · běh ${c.beh_cislo || 1} · celkem běhů programu: ${behCount}</p>
          ${cascadeHint}
        </div>
        <div class="competitionDetailActions">
          <button type="button" class="button small secondary" id="editCompetitionBtn">Upravit běh</button>
          <button type="button" class="button small danger" id="deleteCompetitionBtn">Smazat</button>
        </div>
      </div>
      <div class="competitionMetrics">
        <article class="metric"><span>${fmtMoney(alloc)}</span><small>${html(allocLabel.toLowerCase())}</small></article>
        <article class="metric"><span>${fmtMoney(requested)}</span><small>požadováno (přihlášky)</small></article>
        <article class="metric"><span>${fmtMoney(used)}</span><small>podpořeno celkem</small></article>
        <article class="metric"><span>${fmtMoney(remaining)}</span><small>zbývá z alokace</small></article>
        <article class="metric"><span>${(c.applications || []).length}</span><small>přihlášek</small></article>
        <article class="metric"><span>${(c.supported || []).length}</span><small>podpořených projektů</small></article>
      </div>
      <section class="competitionSection panel">
        <h3>Pokyn a výzva</h3>
        <div class="competitionDocs">
          ${renderPdfBlock(c.pokyn, c.pokyn_nazev, "Pokyn")}
          ${renderPdfBlock(c.vyvza, c.vyvza_nazev, "Výzva")}
        </div>
      </section>
      <section class="competitionSection panel">
        <div class="sectionHeader"><h3>Přihlášené projekty</h3>
          <button type="button" class="button small accent" id="addApplicationBtn">+ Přihláška</button></div>
        ${renderApplicationsTable(c)}
      </section>
      <section class="competitionSection panel">
        <h3>Hodnocení proděkanů</h3>
        <p class="competitionTextBlock">${html(c.hodnoceni_prodekanu) || "Zatím nevyplněno."}</p>
      </section>
      <section class="competitionSection panel">
        <h3>Rozhodnutí prorektorky</h3>
        <p class="competitionTextBlock">${html(c.rozhodnuti_prorektorky) || "Zatím nevyplněno."}</p>
      </section>
      <section class="competitionSection panel">
        <div class="sectionHeader"><h3>Podpořené projekty</h3>
          <button type="button" class="button small accent" id="addSupportedBtn">+ Podpořený projekt</button></div>
        ${renderSupportedTable(c)}
      </section>
      <section class="competitionSection panel competitionSummary">
        <h3>Souhrn využití alokace</h3>
        ${renderAllocationSummary(c)}
      </section>
    `;
    el("editCompetitionBtn")?.addEventListener("click", () => openCompetitionDialog(c));
    el("deleteCompetitionBtn")?.addEventListener("click", () => deleteCompetition(c.id));
    el("addApplicationBtn")?.addEventListener("click", () => openApplicationDialog(c.id));
    el("addSupportedBtn")?.addEventListener("click", () => openSupportedDialog(c.id));
    box.querySelectorAll("[data-edit-app]").forEach(btn => btn.addEventListener("click", () => openApplicationDialog(c.id, btn.dataset.editApp)));
    box.querySelectorAll("[data-del-app]").forEach(btn => btn.addEventListener("click", () => removeApplication(c.id, btn.dataset.delApp)));
    box.querySelectorAll("[data-edit-supp]").forEach(btn => btn.addEventListener("click", () => openSupportedDialog(c.id, btn.dataset.editSupp)));
    box.querySelectorAll("[data-del-supp]").forEach(btn => btn.addEventListener("click", () => removeSupported(c.id, btn.dataset.delSupp)));
    box.querySelectorAll("[data-promote-app]").forEach(btn => btn.addEventListener("click", () => promoteToSupported(c.id, btn.dataset.promoteApp)));
    box.querySelectorAll("[data-reject-app]").forEach(btn => btn.addEventListener("click", () => rejectApplication(c.id, btn.dataset.rejectApp)));
  }

  function renderApplicationsTable(c) {
    const apps = c.applications || [];
    if (!apps.length) return `<p class="hint">Žádné přihlášky.</p>`;
    const isPrestige = c.program_slug === "prestige";
    const headers = isPrestige
      ? `<th>ID</th><th>Projekt</th><th>Žadatel</th><th>Fak.</th><th>Cílová soutěž</th><th>Termín</th><th>Rok 1</th><th>Rok 2</th><th>Průměr</th><th>Poř.</th><th>Stav</th><th></th>`
      : `<th>ID</th><th>Projekt</th><th>Řešitel</th><th>Fakulta</th><th>Katedra</th><th>Požadavek</th><th>Stav</th><th></th>`;
    const colspan = isPrestige ? 12 : 8;
    return `<div class="competitionTableWrap"><table class="competitionTable ${isPrestige ? "competitionTablePrestige" : ""}">
      <thead><tr>${headers}</tr></thead>
      <tbody>${apps.map(a => `<tr>
        <td><code class="projektId">${html(a.projekt_id) || "—"}</code></td>
        <td><strong>${html(a.nazev_projektu)}</strong>${a.resitel_osobni_cislo ? `<br><span class="hint">${html(a.resitel_osobni_cislo)}</span>` : ""}</td>
        <td>${html(resitelDisplay(a))}</td>
        <td>${html(a.fakulta)}</td>
        ${isPrestige ? `
        <td>${html(a.cilova_soutez)}</td>
        <td>${html(a.termin_podani)}</td>
        <td class="money">${fmtMoney(a.financni_pozadavek)}</td>
        <td class="money">${fmtMoney(a.rozpocet_rok_2)}</td>
        <td>${a.hodnoceni_prumer != null ? html(String(a.hodnoceni_prumer)) : "—"}</td>
        <td>${a.rozhodnuti_poradi != null ? html(String(a.rozhodnuti_poradi)) : "—"}</td>
        ` : `<td>${html(a.katedra)}</td><td class="money">${fmtMoney(a.financni_pozadavek)}</td>`}
        <td>${html(a.stav)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-app="${html(a.id)}">Upravit</button>
          ${a.stav === "Podpořeno" || isSupportedApplication(c, a.id)
            ? `<button type="button" class="button small secondary" data-reject-app="${html(a.id)}">Nepodpořit</button>`
            : `<button type="button" class="button small accent" data-promote-app="${html(a.id)}">Podpořit</button>`}
          <button type="button" class="button small secondary" data-del-app="${html(a.id)}">×</button>
        </td>
      </tr>${a.hodnoceni || a.hodnoceni_komise ? `<tr class="appEvalRow"><td colspan="${colspan}">
        ${a.hodnoceni ? `<div><strong>Proděkan:</strong> ${html(a.hodnoceni)}</div>` : ""}
        ${a.hodnoceni_komise ? `<div class="appKomiseBlock"><strong>Hodnocení komise:</strong><p class="competitionTextBlock">${html(a.hodnoceni_komise)}</p></div>` : ""}
      </td></tr>` : ""}`).join("")}</tbody></table></div>`;
  }

  function renderSupportedTable(c) {
    const items = c.supported || [];
    if (!items.length) return `<p class="hint">Žádné podpořené projekty.</p>`;
    return `<div class="competitionTableWrap"><table class="competitionTable">
      <thead><tr><th>ID</th><th>Projekt</th><th>Řešitel</th><th>Fakulta</th><th>Katedra</th><th>Částka podpory</th><th></th></tr></thead>
      <tbody>${items.map(s => `<tr>
        <td><code class="projektId">${html(s.projekt_id) || "—"}</code></td>
        <td><strong>${html(s.nazev_projektu)}</strong></td>
        <td>${html(resitelDisplay(s))}</td>
        <td>${html(s.fakulta)}</td>
        <td>${html(s.katedra)}</td>
        <td class="money">${fmtMoney(s.castka_podpory)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-supp="${html(s.id)}">Upravit</button>
          <button type="button" class="button small secondary" data-del-supp="${html(s.id)}">×</button>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function updateCompetitionAlokaceField() {
    const program = el("compProgram")?.value || activeProgram;
    const rok = Number(el("compRok")?.value) || null;
    const beh = Number(el("compBeh")?.value) || 1;
    const allocInput = el("compAlokace");
    const allocLabel = el("compAlokaceLabel");
    if (!allocInput || !allocLabel) return;
    const cascade = usesCascadingAllocation(program) && beh > 1 && rok;
    if (cascade) {
      const remaining = remainingForBeh(program, rok, beh);
      allocLabel.textContent = "Zbývá z alokace (Kč)";
      allocInput.value = remaining;
      allocInput.readOnly = true;
      allocInput.title = remaining === 0
        ? "Z předchozích kol nezbývá rozpočet — nové běhy až v dalším roce nebo po navýšení alokace u běhu 1."
        : "Automaticky z celoroční alokace mínus čerpání předchozích běhů stejného roku.";
    } else {
      allocLabel.textContent = usesCascadingAllocation(program) && beh === 1
        ? "Celoroční alokace (Kč)"
        : "Alokovaná částka (Kč)";
      allocInput.readOnly = false;
      allocInput.removeAttribute("title");
      if (allocInput.readOnly === false && document.activeElement !== allocInput && !allocInput.dataset.userEdited) {
        // keep user value when switching back from cascade
      }
    }
  }

  async function syncCascadingAllocations(programSlug, rok) {
    if (!usesCascadingAllocation(programSlug) || !rok) return;
    for (const run of runsForYear(programSlug, rok)) {
      if ((run.beh_cislo || 1) <= 1) continue;
      const eff = remainingForBeh(programSlug, rok, run.beh_cislo);
      if (Number(run.alokovana_castka) === eff) continue;
      const updated = { ...run, alokovana_castka: eff, __existing: true };
      if (useSupabase && window.kbSupabaseCompetitions) {
        const saved = await window.kbSupabaseCompetitions.saveCompetition(updated);
        const idx = competitions.findIndex(c => c.id === saved.id);
        if (idx >= 0) competitions[idx] = saved;
      } else {
        const idx = competitions.findIndex(c => c.id === updated.id);
        if (idx >= 0) competitions[idx] = updated;
        persistLocal();
      }
    }
  }

  function openCompetitionDialog(existing) {
    const yearRuns = runsForYear(activeProgram, new Date().getFullYear());
    const nextBeh = yearRuns.length
      ? Math.max(...yearRuns.map(r => r.beh_cislo || 1)) + 1
      : 1;
    const defaultRok = yearRuns[0]?.rok || new Date().getFullYear();
    const c = existing || {
      id: uuid(),
      program_slug: activeProgram,
      nazev: `${getProgram(activeProgram).title} – běh ${nextBeh}`,
      rok: defaultRok,
      beh_cislo: nextBeh,
      alokovana_castka: usesCascadingAllocation(activeProgram) && nextBeh > 1
        ? remainingForBeh(activeProgram, defaultRok, nextBeh)
        : 0,
      pokyn: "",
      pokyn_nazev: "",
      vyvza: "",
      vyvza_nazev: "",
      hodnoceni_prodekanu: "",
      rozhodnuti_prorektorky: "",
      poznamka: "",
      stav: "Aktivní",
      applications: [],
      supported: []
    };
    el("compEditId").value = existing?.id || "";
    el("compProgram").value = c.program_slug;
    el("compNazev").value = c.nazev;
    el("compRok").value = c.rok || "";
    el("compBeh").value = c.beh_cislo || 1;
    el("compAlokace").value = existing ? effectiveAllocation(c) : (c.alokovana_castka || "");
    el("compAlokace").dataset.userEdited = "";
    updateCompetitionAlokaceField();
    resetPdfDialogState(c);
    el("compHodnoceni").value = c.hodnoceni_prodekanu || "";
    el("compRozhodnuti").value = c.rozhodnuti_prorektorky || "";
    el("compStav").value = c.stav || "Aktivní";
    el("compPoznamka").value = c.poznamka || "";
    el("compDialogTitle").textContent = existing ? "Upravit běh / výzvu" : "Nový běh / výzva";
    el("competitionDialog").showModal();
  }

  async function saveCompetitionDialog(e) {
    e.preventDefault();
    const id = el("compEditId").value || uuid();
    const existing = getCompetition(id);
    let pdfFields;
    try {
      pdfFields = await applyPdfFields(id, existing);
    } catch (err) {
      alert("PDF se nepodařilo nahrát: " + (err.message || err));
      return;
    }
    const programSlug = el("compProgram").value || activeProgram;
    const rok = Number(el("compRok").value) || null;
    const behCislo = Number(el("compBeh").value) || 1;
    const alokace = usesCascadingAllocation(programSlug) && behCislo > 1 && rok
      ? remainingForBeh(programSlug, rok, behCislo)
      : Number(el("compAlokace").value) || 0;
    const comp = {
      id,
      program_slug: programSlug,
      nazev: n(el("compNazev").value) || "Bez názvu",
      rok,
      beh_cislo: behCislo,
      alokovana_castka: alokace,
      pokyn: pdfFields.pokyn,
      pokyn_nazev: pdfFields.pokyn_nazev,
      vyvza: pdfFields.vyvza,
      vyvza_nazev: pdfFields.vyvza_nazev,
      hodnoceni_prodekanu: n(el("compHodnoceni").value),
      rozhodnuti_prorektorky: n(el("compRozhodnuti").value),
      poznamka: n(el("compPoznamka").value),
      stav: n(el("compStav").value) || "Aktivní",
      applications: existing?.applications || [],
      supported: existing?.supported || [],
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    };
    try {
      const saved = await saveCompetition(comp);
      activeCompetitionId = saved.id;
      activeProgram = saved.program_slug;
      resetPdfDialogState(saved);
      el("competitionDialog").close();
      setStatus("Běh soutěže uložen.");
      render();
    } catch (err) {
      alert("Uložení selhalo: " + formatSaveError(err));
    }
  }

  async function deleteCompetition(id) {
    if (!confirm("Smazat tento běh včetně přihlášek a podpořených projektů?")) return;
    try {
      if (useSupabase && window.kbSupabaseCompetitions) await window.kbSupabaseCompetitions.deleteCompetition(id);
      competitions = competitions.filter(c => c.id !== id);
      if (!useSupabase) persistLocal();
      if (activeCompetitionId === id) activeCompetitionId = null;
      render();
    } catch (err) {
      alert("Smazání selhalo: " + (err.message || err));
    }
  }

  function fillResitelFromPerson(selectEl) {
    const p = getPerson(selectEl.value);
    if (!p) return;
    if (el("appFakulta")) el("appFakulta").value = p.pracoviste || p.fakulta || "";
    if (el("appKatedra")) el("appKatedra").value = p.katedra || "";
  }

  function fillSuppResitelFromPerson(selectEl) {
    const p = getPerson(selectEl.value);
    if (!p) return;
    if (el("suppFakulta")) el("suppFakulta").value = p.pracoviste || p.fakulta || "";
    if (el("suppKatedra")) el("suppKatedra").value = p.katedra || "";
  }

  async function openApplicationDialog(compId, appId) {
    await window.kbPersons?.ensureLoaded?.();
    const comp = getCompetition(compId);
    if (!comp) return;
    const existing = appId ? (comp.applications || []).find(a => a.id === appId) : null;
    el("appEditId").value = existing?.id || "";
    el("appCompId").value = compId;
    el("appProjektId").value = existing?.projekt_id || suggestProjektId(comp);
    el("appNazev").value = existing?.nazev_projektu || "";
    await window.kbPersons?.setupSearchPicker?.(
      el("appResitelId"),
      window.kbPersonLinks?.personSelectId?.(existing, "resitel") || existing?.resitel_id
    );
    el("appFakulta").value = existing?.fakulta || "";
    el("appKatedra").value = existing?.katedra || "";
    el("appCastka").value = existing?.financni_pozadavek || "";
    el("appHodnoceni").value = existing?.hodnoceni || "";
    el("appHodnoceniKomise").value = existing?.hodnoceni_komise || "";
    el("appStav").value = existing?.stav || "Přihláška";
    el("appPoznamka").value = existing?.poznamka || "";
    el("applicationDialog").showModal();
  }

  async function saveApplicationDialog(e) {
    e.preventDefault();
    const compId = el("appCompId").value;
    const comp = getCompetition(compId);
    if (!comp) return;
    const id = el("appEditId").value || uuid();
    const existing = (comp.applications || []).find(a => a.id === id);
    const resitelId = el("appResitelId").value || null;
    const person = resitelId ? getPerson(resitelId) : null;
    const app = applyResitelLink({
      id,
      projekt_id: n(el("appProjektId").value),
      nazev_projektu: n(el("appNazev").value) || "Bez názvu",
      fakulta: n(el("appFakulta").value),
      katedra: n(el("appKatedra").value),
      financni_pozadavek: Number(el("appCastka").value) || 0,
      hodnoceni: n(el("appHodnoceni").value),
      hodnoceni_komise: n(el("appHodnoceniKomise").value),
      stav: n(el("appStav").value) || "Přihláška",
      poznamka: n(el("appPoznamka").value),
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    }, person);
    const apps = [...(comp.applications || []).filter(a => a.id !== id), app];
    try {
      await saveCompetition({ ...comp, applications: apps, __existing: true });
      el("applicationDialog").close();
      render();
    } catch (err) {
      alert("Uložení selhalo: " + (err.message || err));
    }
  }

  async function removeApplication(compId, appId) {
    const comp = getCompetition(compId);
    if (!comp || !confirm("Odebrat přihlášku?")) return;
    await saveCompetition({ ...comp, applications: (comp.applications || []).filter(a => a.id !== appId), __existing: true });
    render();
  }

  async function openSupportedDialog(compId, suppId) {
    await window.kbPersons?.ensureLoaded?.();
    const comp = getCompetition(compId);
    if (!comp) return;
    const existing = suppId ? (comp.supported || []).find(s => s.id === suppId) : null;
    el("suppEditId").value = existing?.id || "";
    el("suppCompId").value = compId;
    el("suppProjektId").value = existing?.projekt_id || "";
    el("suppNazev").value = existing?.nazev_projektu || "";
    await window.kbPersons?.setupSearchPicker?.(
      el("suppResitelId"),
      window.kbPersonLinks?.personSelectId?.(existing, "resitel") || existing?.resitel_id
    );
    el("suppFakulta").value = existing?.fakulta || "";
    el("suppKatedra").value = existing?.katedra || "";
    el("suppCastka").value = existing?.castka_podpory || "";
    el("suppPoznamka").value = existing?.poznamka || "";
    el("supportedDialog").showModal();
  }

  async function saveSupportedDialog(e) {
    e.preventDefault();
    const compId = el("suppCompId").value;
    const comp = getCompetition(compId);
    if (!comp) return;
    const id = el("suppEditId").value || uuid();
    const existing = (comp.supported || []).find(s => s.id === id);
    const resitelId = el("suppResitelId").value || null;
    const person = resitelId ? getPerson(resitelId) : null;
    const item = applyResitelLink({
      id,
      projekt_id: n(el("suppProjektId").value),
      nazev_projektu: n(el("suppNazev").value) || "Bez názvu",
      fakulta: n(el("suppFakulta").value),
      katedra: n(el("suppKatedra").value),
      castka_podpory: Number(el("suppCastka").value) || 0,
      poznamka: n(el("suppPoznamka").value),
      application_id: existing?.application_id || null,
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    }, person);
    const supported = [...(comp.supported || []).filter(s => s.id !== id), item];
    try {
      await saveCompetition({ ...comp, supported, __existing: true });
      el("supportedDialog").close();
      render();
    } catch (err) {
      alert("Uložení selhalo: " + (err.message || err));
    }
  }

  async function removeSupported(compId, suppId) {
    const comp = getCompetition(compId);
    if (!comp || !confirm("Odebrat podpořený projekt?")) return;
    await saveCompetition({ ...comp, supported: (comp.supported || []).filter(s => s.id !== suppId), __existing: true });
    render();
  }

  async function promoteToSupported(compId, appId) {
    const comp = getCompetition(compId);
    const app = (comp?.applications || []).find(a => a.id === appId);
    if (!comp || !app) return;
    const apps = (comp.applications || []).map(a => (
      a.id === appId ? { ...a, stav: "Podpořeno", __existing: true } : a
    ));
    const existingSup = (comp.supported || []).find(s => s.application_id === appId);
    const item = buildSupportedFromApplication({ ...app, stav: "Podpořeno" }, existingSup);
    const supported = [...(comp.supported || []).filter(s => s.application_id !== appId), item];
    await saveCompetition({ ...comp, applications: apps, supported, __existing: true });
    render();
  }

  async function rejectApplication(compId, appId) {
    const comp = getCompetition(compId);
    if (!comp) return;
    const apps = (comp.applications || []).map(a => (
      a.id === appId ? { ...a, stav: "Zamítnuto", __existing: true } : a
    ));
    const supported = (comp.supported || []).filter(s => s.application_id !== appId);
    await saveCompetition({ ...comp, applications: apps, supported, __existing: true });
    render();
  }

  function injectPage() {
    const root = el("interniSoutezeRoot");
    if (!root || el("competitionProgramTabs")) return;
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>Interní soutěže</h2>
            <p class="hint">Programy UHK Connect, Prestige, Horizon, Rega, Návraty a PhD Seed — běhy, přihlášky, hodnocení a finance. Osoby spravujete v modulu <a href="#osoby" data-goto="osoby">Osoby</a>.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="competitionsReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="newCompetitionBtn" class="button accent">Nový běh / výzva</button>
          </div>
        </div>
        <p id="competitionsStatus" class="competitionsStatus hint">Načítám…</p>
      </section>
      <section class="panel competitionOverviewPanel">
        <div class="sectionHeader">
          <div>
            <h3>Přehled čerpání alokací</h3>
            <p class="hint">Filtrujte podle roku a soutěže — dlaždice ukazují souhrn za všechny běhy dané soutěže. Celková alokace roku zadáváte ručně.</p>
          </div>
        </div>
        <div class="competitionOverviewFilters">
          <label>Rok
            <select id="overviewRokFilter"><option value="">Vše</option></select>
          </label>
          <label>Soutěž
            <select id="overviewProgramFilter"><option value="">Vše</option></select>
          </label>
          <label>Běh
            <select id="overviewBehFilter"><option value="">Vše</option></select>
          </label>
          <label>Stav
            <select id="overviewStavFilter">
              <option value="">Vše</option>
              <option value="bezi">Běží</option>
              <option value="rozhodnuto">Rozhodnuto</option>
              <option value="uzavreno">Uzavřeno</option>
            </select>
          </label>
        </div>
        <div id="overviewYearBudgetRow" class="competitionYearBudgetRow" hidden>
          <label>Celková alokace roku (všechny soutěže, Kč)
            <div class="competitionYearBudgetInputRow">
              <input id="overviewYearBudgetInput" type="number" min="0" step="1000" placeholder="např. 5000000" />
              <button type="button" id="overviewYearBudgetSave" class="button small secondary">Uložit</button>
            </div>
          </label>
        </div>
        <div id="competitionOverviewGrid"></div>
      </section>
      <section class="panel competitionProgramsPanel">
        <h3>Programy a detail běhu</h3>
        <div id="competitionProgramTabs" class="competitionProgramTabs"></div>
        <div id="competitionProgramBanner" hidden></div>
      </section>
      <div class="competitionLayout">
        <section class="panel competitionListPanel">
          <h3>Běhy / výzvy</h3>
          <div id="competitionList"></div>
        </section>
        <section class="panel competitionDetailPanel">
          <div id="competitionDetail"></div>
        </section>
      </div>
    `;
    el("competitionsReloadBtn").addEventListener("click", loadCompetitions);
    el("newCompetitionBtn").addEventListener("click", () => openCompetitionDialog());
    bindOverviewFilters();
  }

  function injectDialogs() {
    if (el("competitionDialog")) return;
    const dialogs = document.createElement("div");
    dialogs.innerHTML = `
      <dialog id="competitionDialog">
        <form method="dialog" id="competitionForm">
          <div class="dialogHeader"><h2 id="compDialogTitle">Nový běh</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="compEditId" />
          <label>Program<select id="compProgram">${PROGRAMS.map(p => `<option value="${p.slug}">${html(p.title)}</option>`).join("")}</select></label>
          <label>Název běhu / výzvy<input id="compNazev" required /></label>
          <div class="grid2">
            <label>Rok<input id="compRok" type="number" min="2020" max="2040" /></label>
            <label>Číslo běhu<input id="compBeh" type="number" min="1" value="1" /></label>
            <label><span id="compAlokaceLabel">Alokovaná částka (Kč)</span><input id="compAlokace" type="number" min="0" step="1000" /></label>
            <label>Stav<select id="compStav"><option>Aktivní</option><option>Hodnocení</option><option>Rozhodnuto</option><option>Uzavřeno</option></select></label>
          </div>
          <label>Pokyn (PDF)
            <div class="pdfField">
              <p id="compPokynCurrent" class="hint pdfFieldCurrent">Zatím není nahráno PDF.</p>
              <input id="compPokynFile" type="file" accept=".pdf,application/pdf" />
              <button type="button" id="compPokynRemove" class="button small secondary" hidden>Odebrat PDF</button>
            </div>
          </label>
          <label>Výzva (PDF)
            <div class="pdfField">
              <p id="compVyvzaCurrent" class="hint pdfFieldCurrent">Zatím není nahráno PDF.</p>
              <input id="compVyvzaFile" type="file" accept=".pdf,application/pdf" />
              <button type="button" id="compVyvzaRemove" class="button small secondary" hidden>Odebrat PDF</button>
            </div>
          </label>
          <label>Hodnocení proděkanů<textarea id="compHodnoceni" rows="3"></textarea></label>
          <label>Rozhodnutí prorektorky<textarea id="compRozhodnuti" rows="3"></textarea></label>
          <label>Poznámka<textarea id="compPoznamka" rows="2"></textarea></label>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="saveCompBtn" type="button" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>
      <dialog id="applicationDialog">
        <form method="dialog">
          <div class="dialogHeader"><h2>Přihláška projektu</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="appEditId" /><input type="hidden" id="appCompId" />
          <div class="grid2">
            <label>ID projektu<input id="appProjektId" placeholder="CONNECT-2025-001" required /></label>
            <label>Název projektu<input id="appNazev" required /></label>
          </div>
          <label>Řešitel (centrální databáze osob)
            <div class="personSelectRow">
              <select id="appResitelId"></select>
              <button type="button" id="appNewPersonBtn" class="button small secondary">+ Osoba</button>
            </div>
          </label>
          <div class="grid2">
            <label>Fakulta<input id="appFakulta" /></label>
            <label>Katedra<input id="appKatedra" /></label>
            <label>Finanční požadavek (Kč)<input id="appCastka" type="number" min="0" step="1000" /></label>
            <label>Stav<select id="appStav"><option>Přihláška</option><option>Hodnoceno</option><option>Podpořeno</option><option>Zamítnuto</option></select></label>
          </div>
          <label>Hodnocení proděkana<textarea id="appHodnoceni" rows="2" placeholder="Krátké hodnocení proděkana…"></textarea></label>
          <label>Hodnocení komise<textarea id="appHodnoceniKomise" rows="8" placeholder="Delší text hodnocení komise…"></textarea></label>
          <label>Poznámka<textarea id="appPoznamka" rows="2"></textarea></label>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="saveAppBtn" type="button" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>
      <dialog id="supportedDialog">
        <form method="dialog">
          <div class="dialogHeader"><h2>Podpořený projekt</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="suppEditId" /><input type="hidden" id="suppCompId" />
          <div class="grid2">
            <label>ID projektu<input id="suppProjektId" /></label>
            <label>Název projektu<input id="suppNazev" required /></label>
          </div>
          <label>Řešitel
            <div class="personSelectRow">
              <select id="suppResitelId"></select>
              <button type="button" id="suppNewPersonBtn" class="button small secondary">+ Osoba</button>
            </div>
          </label>
          <div class="grid2">
            <label>Fakulta<input id="suppFakulta" /></label>
            <label>Katedra<input id="suppKatedra" /></label>
            <label>Částka podpory (Kč)<input id="suppCastka" type="number" min="0" step="1000" /></label>
          </div>
          <label>Poznámka<textarea id="suppPoznamka" rows="2"></textarea></label>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="saveSuppBtn" type="button" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>
    `;
    document.body.appendChild(dialogs);
    el("compPokynFile")?.addEventListener("change", (e) => {
      pendingPokynFile = e.target.files?.[0] || null;
      removePokynPdf = false;
      const existing = getCompetition(el("compEditId").value);
      updatePdfFieldPreview("pokyn", existing?.pokyn, existing?.pokyn_nazev);
    });
    el("compVyvzaFile")?.addEventListener("change", (e) => {
      pendingVyvzaFile = e.target.files?.[0] || null;
      removeVyvzaPdf = false;
      const existing = getCompetition(el("compEditId").value);
      updatePdfFieldPreview("vyvza", existing?.vyvza, existing?.vyvza_nazev);
    });
    el("compPokynRemove")?.addEventListener("click", () => {
      pendingPokynFile = null;
      removePokynPdf = true;
      el("compPokynFile").value = "";
      updatePdfFieldPreview("pokyn", "", "");
    });
    el("compVyvzaRemove")?.addEventListener("click", () => {
      pendingVyvzaFile = null;
      removeVyvzaPdf = true;
      el("compVyvzaFile").value = "";
      updatePdfFieldPreview("vyvza", "", "");
    });
    ["compProgram", "compRok", "compBeh"].forEach((id) => {
      el(id)?.addEventListener("change", updateCompetitionAlokaceField);
      el(id)?.addEventListener("input", updateCompetitionAlokaceField);
    });
    el("compAlokace")?.addEventListener("input", () => {
      if (!el("compAlokace").readOnly) el("compAlokace").dataset.userEdited = "1";
    });
    el("appResitelId")?.addEventListener("change", (e) => fillResitelFromPerson(e.target));
    el("suppResitelId")?.addEventListener("change", (e) => fillSuppResitelFromPerson(e.target));
    el("appNewPersonBtn")?.addEventListener("click", () => {
      window.kbPersons?.openDialog?.(null, {
        onSaved: (p) => {
          window.kbPersons.setSelectPersonValue(el("appResitelId"), p.id);
          el("appResitelId")?.dispatchEvent(new Event("change", { bubbles: true }));
          window.kbPersons.setupSearchPicker(el("appResitelId"), p.id);
        }
      });
    });
    el("suppNewPersonBtn")?.addEventListener("click", () => {
      window.kbPersons?.openDialog?.(null, {
        onSaved: (p) => {
          window.kbPersons.setSelectPersonValue(el("suppResitelId"), p.id);
          el("suppResitelId")?.dispatchEvent(new Event("change", { bubbles: true }));
          window.kbPersons.setupSearchPicker(el("suppResitelId"), p.id);
        }
      });
    });
    el("saveCompBtn").addEventListener("click", saveCompetitionDialog);
    el("saveAppBtn").addEventListener("click", saveApplicationDialog);
    el("saveSuppBtn").addEventListener("click", saveSupportedDialog);
  }

  function injectStyles() {
    if (el("competitionStyles")) return;
    const style = document.createElement("style");
    style.id = "competitionStyles";
    style.textContent = `
      .competitionProgramTabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
      .competitionTab { border: 1px solid var(--line); background: white; border-radius: 999px; padding: .4rem .75rem; font-size: .85rem; cursor: pointer; }
      .competitionTab.active { background: var(--accent); color: white; border-color: var(--accent); }
      .competitionTab .tabCount { opacity: .85; font-weight: 700; }
      .competitionLayout { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; align-items: start; }
      .competitionCards { display: grid; gap: .5rem; }
      .competitionCard { border: 1px solid var(--line); border-radius: 10px; padding: .65rem; cursor: pointer; background: white; }
      .competitionCard.active, .competitionCard:hover { border-color: var(--accent); background: #f8fafc; }
      .competitionCardMeta, .competitionCardMoney { display: block; font-size: .82rem; color: var(--muted); margin-top: .15rem; }
      .competitionMetrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .65rem; margin-bottom: 1rem; }
      .competitionSection { margin-bottom: 1rem; }
      .competitionDocs { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .competitionPdfBlock { border: 1px solid var(--line); border-radius: 10px; padding: .75rem; background: #f8fafc; }
      .competitionPdfLink { display: inline-block; margin-top: .35rem; font-weight: 700; color: var(--accent); text-decoration: none; }
      .competitionPdfLink:hover { text-decoration: underline; }
      .pdfField { display: grid; gap: .45rem; margin-top: .25rem; }
      .pdfFieldCurrent { margin: 0; }
      .competitionTextBlock { white-space: pre-wrap; color: var(--text); }
      .competitionTableWrap { overflow-x: auto; }
      .competitionTable { width: 100%; border-collapse: collapse; }
      .competitionTable th, .competitionTable td { padding: .45rem .5rem; border-bottom: 1px solid var(--line); text-align: left; font-size: .88rem; }
      .competitionTablePrestige { min-width: 1200px; }
      .competitionTablePrestige td:nth-child(2) { max-width: 280px; white-space: normal; }
      .competitionTable .money { text-align: right; font-variant-numeric: tabular-nums; }
      .rowActions { white-space: nowrap; }
      .competitionDetailHead { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .competitionSummary table { max-width: 480px; }
      .competitionsStatus { margin: .35rem 0 .75rem; }
      .competitionsStatusError { color: #b42318; }
      .projektId { font-size: .82rem; background: #f2f4f7; padding: .1rem .35rem; border-radius: 4px; }
      .appEvalRow td { background: #f8fafc; font-size: .88rem; }
      .appKomiseBlock { margin-top: .5rem; }
      .personSelectRow { display: flex; gap: .5rem; align-items: flex-start; margin-top: .25rem; }
      .personSelectRow select { flex: 1; }
      .personSelectRow .kb-person-search-picker { flex: 1; min-width: 0; }
      .competitionRegaSeedBox { margin: .75rem 0 0; padding: .85rem 1rem; border: 1px solid var(--line); border-radius: 10px; background: #f0f9ff; }
      .competitionRegaSeedBox p { margin: 0 0 .6rem; line-height: 1.5; }
      .competitionRegaSeedActions { display: flex; flex-wrap: wrap; gap: .5rem; }
      .competitionOverviewPanel { margin-bottom: 1rem; }
      .competitionOverviewFilters { display: flex; flex-wrap: wrap; gap: .75rem 1rem; margin-bottom: 1rem; }
      .competitionOverviewFilters label { min-width: 120px; }
      .competitionYearBudgetRow { margin: 0 0 1rem; padding: .75rem 1rem; background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; }
      .competitionYearBudgetRow label { display: block; max-width: 420px; }
      .competitionYearBudgetInputRow { display: flex; gap: .5rem; margin-top: .35rem; }
      .competitionYearBudgetInputRow input { flex: 1; }
      .competitionOverviewTotalHint { margin: 0 0 .65rem; }
      .competitionOverviewGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
      .competitionOverviewCard {
        border: 1px solid var(--line); border-radius: 12px; padding: 1rem; background: white;
        cursor: pointer; transition: border-color .15s, box-shadow .15s;
      }
      .competitionOverviewCard:hover, .competitionOverviewCard.active, .competitionOverviewCard:focus-visible {
        border-color: var(--accent); box-shadow: 0 4px 14px rgba(0,0,0,.06); outline: none;
      }
      .competitionOverviewCard.active { border-left: 4px solid var(--accent); }
      .competitionOverviewTotal { grid-column: 1 / -1; background: #f8fafc; cursor: default; }
      .competitionOverviewTotal:hover { border-color: var(--line); box-shadow: none; }
      .competitionOverviewHead { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .35rem; }
      .competitionOverviewProgram { font-size: .82rem; font-weight: 700; color: var(--muted); }
      .competitionOverviewStav { font-size: .75rem; font-weight: 700; padding: .15rem .45rem; border-radius: 999px; }
      .stav-bezi { background: #ecfdf3; color: #027a48; }
      .stav-rozhodnuto { background: #eff8ff; color: #175cd3; }
      .stav-uzavreno { background: #f2f4f7; color: #475467; }
      .competitionOverviewTitle { margin: 0 0 .25rem; font-size: 1.05rem; }
      .competitionOverviewMeta { margin: 0 0 .65rem; }
      .competitionOverviewSummaryTitle { margin: 0 0 .4rem; font-size: .88rem; font-weight: 800; color: var(--text); }
      .competitionOverviewCta { display: block; margin-top: .65rem; font-size: .82rem; font-weight: 700; color: var(--accent); text-align: right; }
      .competitionSummaryTable { width: 100%; font-size: .85rem; }
      .competitionSummaryTable td { padding: .3rem .35rem; }
      .allocationBar { height: 8px; background: #e4e7ec; border-radius: 999px; overflow: hidden; margin: .5rem 0 .25rem; }
      .allocationBarFill { height: 100%; background: linear-gradient(90deg, var(--accent), #3b82f6); border-radius: 999px; }
      .allocationBarLabel { margin: 0 0 .5rem; font-size: .8rem; color: var(--muted); font-weight: 600; }
      .competitionProgramsPanel { margin-bottom: 1rem; }
      .competitionProgramsPanel h3 { margin: 0 0 .65rem; }
      @media (max-width: 900px) {
        .competitionLayout, .competitionDocs, .competitionMetrics, .competitionOverviewGrid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function render() {
    renderCompetitionOverview();
    renderProgramTabs();
    renderProgramSeedBanner();
    renderCompetitionList();
    renderCompetitionDetail();
  }

  function init() {
    loadYearBudgets();
    injectStyles();
    injectPage();
    injectDialogs();
    setTimeout(loadCompetitions, 150);
    document.addEventListener("kb:page-changed", async (e) => {
      if (e.detail?.page !== "interni-souteze") return;
      if (!competitions.length && !loading) loadCompetitions();
      await window.kbPersons?.ensureLoaded?.();
    });
    document.addEventListener("kb:persons-loaded", () => render());
  }

  window.kbCompetitions = { PROGRAMS, loadCompetitions, getCompetitions: () => competitions };

  document.addEventListener("DOMContentLoaded", init);
})();
