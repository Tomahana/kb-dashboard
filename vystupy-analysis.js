// Podmodul analýz výstupů — DKRVO, PPK a přehledy podle typu (Jimp, JSC, B, C).

(function () {
  const VIEWS = [
    { id: "prehled", label: "Přehled", icon: "📊" },
    { id: "dkrvo", label: "DKRVO", icon: "📋" },
    { id: "ppk", label: "PPK / osoby", icon: "👤" },
    { id: "mezery", label: "Mezery a kontrola", icon: "🎯" },
    { id: "report", label: "Textový report", icon: "📄" }
  ];

  const PUBL_TYP_LABELS = {
    Jimp: "Jimp — články v impaktovaných časopisech",
    JSC: "JSC — články v recenzovaných časopisech",
    B: "B — monografie",
    C: "C — kapitoly v odborných knihách"
  };

  let activeAnalysisId = "prehled";

  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function groupCount(items, field, fallback = "—") {
    const map = new Map();
    for (const item of items) {
      const key = n(item[field]) || fallback;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
  }

  function renderBarChart(groups, maxBars = 12) {
    const top = groups.slice(0, maxBars);
    const max = top[0]?.[1] || 1;
    return `<div class="vystupyBarChart">${top.map(([label, count]) => `
      <div class="vystupyBarRow">
        <div class="vystupyBarLabel" title="${html(label)}">${html(label)}</div>
        <div class="vystupyBarTrack"><div class="vystupyBarFill" style="width:${Math.round((count / max) * 100)}%"></div></div>
        <div class="vystupyBarCount">${count}</div>
      </div>`).join("")}</div>`;
  }

  function typLabel(item) {
    return PUBL_TYP_LABELS[item.typ_vystupu] || n(item.typ_vystupu) || "—";
  }

  function renderOverview(ctx) {
    const { items, filterRok } = ctx;
    const byTyp = new Map();
    for (const item of items) {
      const key = typLabel(item);
      byTyp.set(key, (byTyp.get(key) || 0) + 1);
    }
    const byTypSorted = [...byTyp.entries()].sort((a, b) => b[1] - a[1]);
    const byFak = groupCount(items, "zkr_fak");
    const byRok = groupCount(items, "rok");

    return `
      <div class="vystupyAnalysisGrid">
        <section class="vystupyAnalysisCard">
          <h3>Podle typu výstupu</h3>
          <p class="hint vystupyAnalysisHint">Jimp, JSC, B a C${filterRok ? ` — rok ${html(filterRok)}` : ""}.</p>
          ${renderBarChart(byTypSorted)}
        </section>
        <section class="vystupyAnalysisCard">
          <h3>Podle fakulty</h3>
          ${renderBarChart(byFak, 8)}
        </section>
        <section class="vystupyAnalysisCard">
          <h3>Podle roku</h3>
          ${renderBarChart(byRok, 10)}
        </section>
        <section class="vystupyAnalysisCard vystupyAnalysisWide">
          <h3>Shrnutí</h3>
          <ul class="vystupyBulletList">
            <li>Celkem výstupů: <strong>${items.length}</strong></li>
            <li>Jimp: <strong>${items.filter((i) => i.typ_vystupu === "Jimp").length}</strong></li>
            <li>JSC: <strong>${items.filter((i) => i.typ_vystupu === "JSC").length}</strong></li>
            <li>B: <strong>${items.filter((i) => i.typ_vystupu === "B").length}</strong></li>
            <li>C: <strong>${items.filter((i) => i.typ_vystupu === "C").length}</strong></li>
            <li>Propojeno na Osoby: <strong>${items.filter(ctx.isLinked).length}</strong> / ${items.length}</li>
          </ul>
        </section>
      </div>`;
  }

  function renderDkrvo(ctx) {
    const { items, filterRok } = ctx;
    const rok = filterRok ? Number(filterRok) : null;
    const filtered = rok ? items.filter((i) => Number(i.rok) === rok) : items;
    const types = ["Jimp", "JSC", "B", "C"];
    const faculties = [...new Set(filtered.map((i) => n(i.zkr_fak) || n(i.fakulta) || "—"))].sort((a, b) => a.localeCompare(b, "cs"));

    const header = `<tr><th class="vystupyMatrixCorner">Fakulta</th>${types.map((t) => `<th>${html(t)}</th>`).join("")}<th>Σ</th></tr>`;
    const rows = faculties.map((fac) => {
      const facItems = filtered.filter((i) => (n(i.zkr_fak) || n(i.fakulta) || "—") === fac);
      const counts = types.map((t) => facItems.filter((i) => i.typ_vystupu === t).length);
      const sum = counts.reduce((a, b) => a + b, 0);
      return `<tr>
        <th class="vystupyMatrixRowHead">${html(fac)}</th>
        ${counts.map((c) => `<td class="vystupyMatrixCell${c ? " vystupyMatrixCellHot" : ""}">${c || "·"}</td>`).join("")}
        <td class="vystupyMatrixSum">${sum}</td>
      </tr>`;
    }).join("");

    const colSums = types.map((t) => filtered.filter((i) => i.typ_vystupu === t).length);

    return `
      <section class="vystupyAnalysisCard vystupyAnalysisWide">
        <h3>Matice DKRVO — fakulta × typ výstupu</h3>
        <p class="hint vystupyAnalysisHint">Přehled pro roční výkaz výzkumu (DKRVO). Data lze exportovat z IS VaVaI a importovat do modulu Výstupy.${rok ? ` Filtr: rok ${rok}.` : ""}</p>
        ${faculties.length ? `
          <div class="vystupyMatrixWrap">
            <table class="vystupyMatrix">
              <thead>${header}</thead>
              <tbody>${rows}
                <tr class="vystupyMatrixFoot">
                  <th>Σ</th>
                  ${colSums.map((s) => `<td class="vystupyMatrixSum">${s}</td>`).join("")}
                  <td class="vystupyMatrixSum">${filtered.length}</td>
                </tr>
              </tbody>
            </table>
          </div>` : `<p class="hint">Nedostatek dat pro matici DKRVO.</p>`}
      </section>`;
  }

  function buildPersonProfiles(items, personDisplay, isLinked) {
    const map = new Map();
    for (const item of items) {
      const label = personDisplay(item) || n(item.autor) || "—";
      const key = l(item.autor_osobni_cislo) || l(label);
      if (!map.has(key)) {
        map.set(key, { label, linked: isLinked(item), items: [], byTyp: new Map() });
      }
      const profile = map.get(key);
      profile.items.push(item);
      const typ = typLabel(item);
      profile.byTyp.set(typ, (profile.byTyp.get(typ) || 0) + 1);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, "cs"));
  }

  function renderPpk(ctx) {
    const profiles = buildPersonProfiles(ctx.items, ctx.personDisplay, ctx.isLinked);
    const linked = profiles.filter((p) => p.linked);
    const unlinked = profiles.filter((p) => !p.linked);

    return `
      <div class="vystupyAnalysisGrid">
        <section class="vystupyAnalysisCard vystupyAnalysisWide">
          <h3>Výstupy podle osob (PPK)</h3>
          <p class="hint vystupyAnalysisHint">Přehled výstupů na autory — užitečné pro programy podpory kariéry a hodnocení výzkumníků.</p>
          <div class="vystupyPersonGrid">
            ${linked.slice(0, 24).map((p) => `
              <article class="vystupyPersonCard">
                <div class="vystupyPersonHead">
                  <strong>${html(p.label)}</strong>
                  <span class="vystupyBadge vystupyBadgeOk">${p.items.length} výst.</span>
                </div>
                <ul class="vystupyPersonTypList">
                  ${[...p.byTyp.entries()].map(([typ, cnt]) => `<li>${html(typ)}: ${cnt}</li>`).join("")}
                </ul>
              </article>`).join("")}
            ${linked.length > 24 ? `<p class="hint">… a dalších ${linked.length - 24} propojených osob</p>` : ""}
          </div>
        </section>
        ${unlinked.length ? `
          <section class="vystupyAnalysisCard vystupyAnalysisWide">
            <h3>Nepropojení autoři (${unlinked.length})</h3>
            <ul class="vystupyBulletList">
              ${unlinked.slice(0, 20).map((p) => `<li><strong>${html(p.label)}</strong> — ${p.items.length} výstupů</li>`).join("")}
              ${unlinked.length > 20 ? `<li class="hint">… a dalších ${unlinked.length - 20}</li>` : ""}
            </ul>
          </section>` : ""}
      </div>`;
  }

  function renderMezery(ctx) {
    const { items, isLinked } = ctx;
    const noPerson = items.filter((i) => !isLinked(i));
    const noRiv = items.filter((i) => !n(i.riv_id) && !n(i.cislo_na_riv));
    const noRok = items.filter((i) => !i.rok);
    const noFak = items.filter((i) => !n(i.zkr_fak) && !n(i.fakulta));

    return `
      <div class="vystupyAnalysisGrid">
        <section class="vystupyAnalysisCard">
          <h3>Bez propojení na Osoby (${noPerson.length})</h3>
          ${noPerson.length ? `<ul class="vystupyBulletList">${noPerson.slice(0, 15).map((i) =>
            `<li>${html(typLabel(i))}: <strong>${html(i.nazev)}</strong> — ${html(i.autor || "?")}</li>`
          ).join("")}</ul>` : `<p class="hint">Všechny výstupy mají autora propojeného na modul Osoby.</p>`}
        </section>
        <section class="vystupyAnalysisCard">
          <h3>Bez RIV ID (${noRiv.length})</h3>
          <p class="hint vystupyAnalysisHint">Pro DKRVO je vhodné mít identifikátor z IS VaVaI.</p>
          ${noRiv.length ? `<p>${noRiv.length} záznamů bez RIV ID / čísla na RIV.</p>` : `<p class="hint">Všechny záznamy mají RIV identifikátor.</p>`}
        </section>
        <section class="vystupyAnalysisCard">
          <h3>Bez roku (${noRok.length})</h3>
          ${noRok.length ? `<p>${noRok.length} záznamů bez kalendářního roku.</p>` : `<p class="hint">Všechny záznamy mají rok.</p>`}
        </section>
        <section class="vystupyAnalysisCard">
          <h3>Bez fakulty (${noFak.length})</h3>
          ${noFak.length ? `<p>${noFak.length} záznamů bez fakulty / zkratky.</p>` : `<p class="hint">Všechny záznamy mají fakultu.</p>`}
        </section>
      </div>`;
  }

  function buildReportMarkdown(ctx) {
    const { items, filterRok } = ctx;
    const rok = filterRok || "všechny roky";
    const lines = [
      `# Report výstupů UHK — ${rok}`,
      "",
      `Vygenerováno: ${new Date().toLocaleString("cs-CZ")}`,
      `Celkem výstupů: ${items.length}`,
      ""
    ];
    const types = ["Jimp", "JSC", "B", "C"];
    lines.push("## Výstupy podle typu");
    for (const t of types) {
      const cnt = items.filter((i) => i.typ_vystupu === t).length;
      lines.push(`- ${PUBL_TYP_LABELS[t] || t}: ${cnt}`);
    }
    lines.push("");
    lines.push("## Podle fakulty");
    for (const [fac, cnt] of groupCount(items, "zkr_fak")) {
      lines.push(`- ${fac}: ${cnt}`);
    }
    lines.push("");
    lines.push("## Nepropojení autoři");
    const unlinked = items.filter((i) => !ctx.isLinked(i));
    if (!unlinked.length) lines.push("- (žádní)");
    else unlinked.slice(0, 30).forEach((i) => lines.push(`- ${typLabel(i)}: ${i.nazev} — ${i.autor || "?"}`));
    return lines.join("\n");
  }

  function renderReport(ctx) {
    const text = buildReportMarkdown(ctx);
    return `
      <section class="vystupyAnalysisCard vystupyAnalysisWide">
        <div class="vystupyReportHead">
          <div>
            <h3>Textový report</h3>
            <p class="hint vystupyAnalysisHint">Strukturovaný výstup pro DKRVO, PPK nebo interní podklady — zkopírujte do e-mailu nebo Wordu.</p>
          </div>
          <button type="button" class="button secondary" id="vystupyCopyReportBtn">Kopírovat report</button>
        </div>
        <textarea class="vystupyReportText" id="vystupyReportText" rows="18" readonly>${html(text)}</textarea>
      </section>`;
  }

  const RENDERERS = {
    prehled: renderOverview,
    dkrvo: renderDkrvo,
    ppk: renderPpk,
    mezery: renderMezery,
    report: renderReport
  };

  function renderAnalysisPanel(ctx) {
    return `
      <div class="vystupyAnalysisHub">
        <div class="vystupyAnalysisTabs" role="tablist">
          ${VIEWS.map((v) => `
            <button type="button" class="vystupyAnalysisTab ${activeAnalysisId === v.id ? "active" : ""}" data-vystupy-analysis="${v.id}" role="tab">
              ${v.icon} ${html(v.label)}
            </button>`).join("")}
        </div>
        <div class="vystupyAnalysisBody">${(RENDERERS[activeAnalysisId] || renderOverview)(ctx)}</div>
      </div>`;
  }

  function bindAnalysisEvents(root, ctx) {
    root.querySelectorAll("[data-vystupy-analysis]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeAnalysisId = btn.dataset.vystupyAnalysis;
        root.innerHTML = renderAnalysisPanel(ctx);
        bindAnalysisEvents(root, ctx);
      });
    });
    root.querySelector("#vystupyCopyReportBtn")?.addEventListener("click", async () => {
      const text = root.querySelector("#vystupyReportText")?.value || buildReportMarkdown(ctx);
      try {
        await navigator.clipboard.writeText(text);
        const btn = root.querySelector("#vystupyCopyReportBtn");
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = "Zkopírováno";
          setTimeout(() => { btn.textContent = prev; }, 2000);
        }
      } catch (_) {
        alert("Kopírování se nepodařilo — označte text ručně.");
      }
    });
  }

  function injectStyles() {
    if (document.getElementById("vystupyAnalysisStyles")) return;
    const style = document.createElement("style");
    style.id = "vystupyAnalysisStyles";
    style.textContent = `
      .vystupyAnalysisHub { display: grid; gap: 1rem; }
      .vystupyAnalysisTabs { display: flex; flex-wrap: wrap; gap: .4rem; }
      .vystupyAnalysisTab {
        border: 1px solid var(--line); background: white; border-radius: 10px;
        padding: .4rem .7rem; font-size: .82rem; cursor: pointer; font-weight: 650;
      }
      .vystupyAnalysisTab.active { background: #eff8ff; border-color: var(--accent); color: var(--accent-dark, #2446b5); }
      .vystupyAnalysisGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .85rem; }
      .vystupyAnalysisCard { border: 1px solid var(--line); border-radius: 12px; padding: .85rem; background: white; }
      .vystupyAnalysisWide { grid-column: 1 / -1; }
      .vystupyAnalysisHint { margin: -.35rem 0 .65rem; }
      .vystupyBarChart { display: grid; gap: .35rem; }
      .vystupyBarRow { display: grid; grid-template-columns: minmax(80px, 1fr) 2fr auto; gap: .5rem; align-items: center; font-size: .84rem; }
      .vystupyBarLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vystupyBarTrack { height: 8px; background: #f2f4f7; border-radius: 999px; overflow: hidden; }
      .vystupyBarFill { height: 100%; background: var(--accent); border-radius: 999px; }
      .vystupyBarCount { font-weight: 800; min-width: 2rem; text-align: right; }
      .vystupyMatrixWrap { overflow: auto; max-width: 100%; }
      .vystupyMatrix { border-collapse: collapse; font-size: .84rem; min-width: 480px; }
      .vystupyMatrix th, .vystupyMatrix td { border: 1px solid var(--line); padding: .35rem .5rem; text-align: center; }
      .vystupyMatrixCorner, .vystupyMatrixRowHead { text-align: left; font-weight: 700; }
      .vystupyMatrixCellHot { background: rgba(49, 91, 232, .12); font-weight: 700; }
      .vystupyMatrixSum { background: #f8fafc; font-weight: 800; }
      .vystupyMatrixFoot th, .vystupyMatrixFoot td { background: #f2f4f7; }
      .vystupyPersonGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .65rem; }
      .vystupyPersonCard { border: 1px solid var(--line); border-radius: 10px; padding: .65rem; }
      .vystupyPersonHead { display: flex; justify-content: space-between; gap: .5rem; margin-bottom: .35rem; }
      .vystupyPersonTypList { margin: 0; padding-left: 1.1rem; font-size: .84rem; }
      .vystupyBadge { font-size: .72rem; font-weight: 800; padding: .15rem .45rem; border-radius: 999px; }
      .vystupyBadgeOk { background: #ecfdf3; color: #027a48; }
      .vystupyBulletList { margin: 0; padding-left: 1.1rem; line-height: 1.55; }
      .vystupyReportHead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; margin-bottom: .65rem; }
      .vystupyReportText { width: 100%; font-family: ui-monospace, monospace; font-size: .82rem; line-height: 1.45; padding: .75rem; border: 1px solid var(--line); border-radius: 10px; resize: vertical; }
    `;
    document.head.appendChild(style);
  }

  function mount(container, ctx) {
    if (!container) return;
    injectStyles();
    container.innerHTML = renderAnalysisPanel(ctx);
    bindAnalysisEvents(container, ctx);
  }

  window.kbVystupyAnalysis = {
    mount,
    buildReportMarkdown,
    VIEWS
  };
})();
