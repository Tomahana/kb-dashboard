// Podmodul analýz výzkumných směrů PČR — vědecké a odborné pohledy na data.

(function () {
  const STOP_WORDS = new Set([
    "a", "aby", "aj", "ale", "ani", "asi", "bez", "co", "do", "ho", "i", "jako", "je", "jej", "jeho", "ji", "jim",
    "jsem", "jsme", "jsou", "k", "ke", "na", "nad", "ne", "nebo", "ni", "nic", "o", "od", "po", "pod", "pomocí",
    "pro", "při", "před", "s", "se", "si", "ta", "tak", "tam", "te", "to", "tu", "u", "v", "ve", "za", "ze", "že",
    "the", "and", "or", "for", "with", "from", "that", "this", "are", "was", "were", "been", "have", "has", "had"
  ]);

  const VIEWS = [
    { id: "prehled", label: "Přehled", icon: "📊" },
    { id: "matice", label: "Matice fakulta × oblast", icon: "🧩" },
    { id: "gestori", label: "Expertíza gestorů", icon: "👤" },
    { id: "slova", label: "Klíčová slova", icon: "🔤" },
    { id: "pokryti", label: "Pokrytí a mezery", icon: "🎯" },
    { id: "report", label: "Report pro PČR", icon: "📄" }
  ];

  let activeAnalysisId = "prehled";

  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function groupCount(items, field) {
    const map = new Map();
    for (const item of items) {
      const key = n(item[field]) || "—";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
  }

  function gestorKey(item, gestorDisplay) {
    return l(item.email) || l(gestorDisplay(item)) || l(item.gestor) || "—";
  }

  function renderBarChart(groups, maxBars = 12) {
    const top = groups.slice(0, maxBars);
    const max = top[0]?.[1] || 1;
    return `<div class="pcrBarChart">${top.map(([label, count]) => `
      <div class="pcrBarRow">
        <div class="pcrBarLabel" title="${html(label)}">${html(label)}</div>
        <div class="pcrBarTrack"><div class="pcrBarFill" style="width:${Math.round((count / max) * 100)}%"></div></div>
        <div class="pcrBarCount">${count}</div>
      </div>`).join("")}</div>`;
  }

  function renderOverview(ctx) {
    const { items, isLinked, uniqueValues } = ctx;
    const byOblast = groupCount(items, "oblast");
    const byFakulta = groupCount(items, "zkr_fak");
    const byKatedra = groupCount(items, "zkr_kat");
    const gestorGroups = new Map();
    for (const item of items) {
      const key = ctx.gestorDisplay(item) || n(item.gestor) || "—";
      gestorGroups.set(key, (gestorGroups.get(key) || 0) + 1);
    }
    const byGestor = [...gestorGroups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
    const unlinked = items.filter((t) => !isLinked(t));

    return `
      <div class="pcrAnalysisGrid">
        <section class="pcrAnalysisCard">
          <h3>Podle oblasti (${uniqueValues("oblast").length})</h3>
          <p class="hint pcrAnalysisHint">Tematické oblasti vhodné pro mapování na potřeby PČR.</p>
          ${renderBarChart(byOblast)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Podle fakulty</h3>
          ${renderBarChart(byFakulta, 8)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Podle katedry</h3>
          ${renderBarChart(byKatedra, 10)}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Zatížení gestorů (počet témat)</h3>
          ${renderBarChart(byGestor, 12)}
        </section>
        <section class="pcrAnalysisCard pcrAnalysisWide">
          <h3>Nepropojení gestoři (${unlinked.length})</h3>
          ${unlinked.length
            ? `<ul class="pcrUnlinkedList">${unlinked.slice(0, 25).map((t) =>
              `<li><strong>${html(t.tema)}</strong> — ${html(t.gestor)}${t.email ? ` · ${html(t.email)}` : ""}</li>`
            ).join("")}${unlinked.length > 25 ? `<li class="hint">… a dalších ${unlinked.length - 25}</li>` : ""}</ul>`
            : `<p class="hint">Všechna témata mají gestora propojeného na modul Osoby.</p>`}
        </section>
      </div>`;
  }

  function buildFacultyAreaMatrix(items) {
    const faculties = [...new Set(items.map((t) => n(t.zkr_fak)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
    const areas = [...new Set(items.map((t) => n(t.oblast)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
    const counts = new Map();
    let max = 0;
    for (const item of items) {
      const f = n(item.zkr_fak) || "—";
      const a = n(item.oblast) || "—";
      const key = `${f}|${a}`;
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      if (next > max) max = next;
    }
    return { faculties, areas, counts, max };
  }

  function renderMatrix(ctx) {
    const { items } = ctx;
    const { faculties, areas, counts, max } = buildFacultyAreaMatrix(items);
    if (!faculties.length || !areas.length) return `<p class="hint">Nedostatek dat pro matici.</p>`;

    const header = `<tr><th class="pcrMatrixCorner">Oblast \\ Fakulta</th>${faculties.map((f) => `<th>${html(f)}</th>`).join("")}<th>Σ</th></tr>`;
    const rows = areas.map((area) => {
      let rowSum = 0;
      const cells = faculties.map((fac) => {
        const c = counts.get(`${fac}|${area}`) || 0;
        rowSum += c;
        const intensity = max ? Math.round((c / max) * 100) : 0;
        const bg = c ? `style="--pcr-heat:${intensity}"` : "";
        return `<td class="pcrMatrixCell${c ? " pcrMatrixCellHot" : ""}" ${bg} title="${html(area)} · ${html(fac)}">${c || "·"}</td>`;
      }).join("");
      return `<tr><th class="pcrMatrixRowHead" title="${html(area)}">${html(area)}</th>${cells}<td class="pcrMatrixSum">${rowSum}</td></tr>`;
    }).join("");

    const colSums = faculties.map((fac) => {
      let s = 0;
      for (const area of areas) s += counts.get(`${fac}|${area}`) || 0;
      return s;
    });

    return `
      <section class="pcrAnalysisCard pcrAnalysisWide">
        <h3>Matice fakulta × oblast</h3>
        <p class="hint pcrAnalysisHint">Počet témat na průsečíku. Tmavší buňka = větší koncentrace expertízy. Užitečné pro jednání s PČR o institucionálním pokrytí.</p>
        <div class="pcrMatrixWrap">
          <table class="pcrMatrix">
            <thead>${header}</thead>
            <tbody>${rows}
              <tr class="pcrMatrixFoot"><th>Σ</th>${colSums.map((s) => `<td class="pcrMatrixSum">${s}</td>`).join("")}<td class="pcrMatrixSum">${items.length}</td></tr>
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function buildGestorProfiles(items, gestorDisplay, isLinked) {
    const map = new Map();
    for (const item of items) {
      const key = gestorKey(item, gestorDisplay);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: gestorDisplay(item) || n(item.gestor) || "—",
          email: n(item.email),
          topics: [],
          oblasti: new Set(),
          fakulty: new Set(),
          katedry: new Set(),
          linked: isLinked(item)
        });
      }
      const p = map.get(key);
      p.topics.push(item);
      if (item.oblast) p.oblasti.add(n(item.oblast));
      if (item.zkr_fak) p.fakulty.add(n(item.zkr_fak));
      if (item.zkr_kat) p.katedry.add(n(item.zkr_kat));
      p.linked = p.linked || isLinked(item);
    }
    return [...map.values()].sort((a, b) => b.topics.length - a.topics.length || a.label.localeCompare(b.label, "cs"));
  }

  function renderGestori(ctx) {
    const profiles = buildGestorProfiles(ctx.items, ctx.gestorDisplay, ctx.isLinked);
    const multiArea = profiles.filter((p) => p.oblasti.size >= 3).length;
    const heavy = profiles.filter((p) => p.topics.length >= 5).length;

    return `
      <div class="pcrAnalysisIntro">
        <p><strong>${profiles.length}</strong> gestorů · <strong>${multiArea}</strong> pokrývá ≥3 oblasti · <strong>${heavy}</strong> má ≥5 témat</p>
      </div>
      <div class="pcrGestorGrid">${profiles.map((p) => `
        <article class="pcrGestorCard">
          <header class="pcrGestorHead">
            <div>
              <strong>${html(p.label)}</strong>
              ${p.email ? `<div class="hint">${html(p.email)}</div>` : ""}
            </div>
            <span class="pcrBadge ${p.linked ? "pcrBadgeOk" : "pcrBadgeWarn"}">${p.linked ? "Osoba" : "Nepropojeno"}</span>
          </header>
          <p class="pcrGestorMeta"><strong>${p.topics.length}</strong> témat · ${p.fakulty.size} fak. · ${p.oblasti.size} oblastí</p>
          <p class="hint"><strong>Oblasti:</strong> ${html([...p.oblasti].sort((a, b) => a.localeCompare(b, "cs")).join(", "))}</p>
          <details class="pcrGestorDetails">
            <summary>Témata (${p.topics.length})</summary>
            <ul>${p.topics.map((t) => `<li>${html(t.tema)} <span class="hint">(${html(t.oblast)})</span></li>`).join("")}</ul>
          </details>
        </article>`).join("")}</div>`;
  }

  function tokenize(text) {
    return l(text)
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9áčďéěíňóřšťúůýž\s-]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  }

  function buildKeywords(items) {
    const freq = new Map();
    for (const item of items) {
      const tokens = [...tokenize(item.tema), ...tokenize(item.popis)];
      for (const token of tokens) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
  }

  function renderKeywords(ctx) {
    const words = buildKeywords(ctx.items).slice(0, 40);
    const max = words[0]?.[1] || 1;
    return `
      <section class="pcrAnalysisCard pcrAnalysisWide">
        <h3>Klíčová slova z názvů a popisů témat</h3>
        <p class="hint pcrAnalysisHint">Automatická extrakce (bez stop-slov). Pomáhá identifikovat společné výzkumné motivy pro prezentaci vůči PČR.</p>
        <div class="pcrKeywordCloud">${words.map(([word, count]) => {
          const size = 0.78 + (count / max) * 0.9;
          return `<span class="pcrKeyword" style="font-size:${size}rem" title="${count}×">${html(word)} <small>${count}</small></span>`;
        }).join("")}</div>
      </section>
      <section class="pcrAnalysisCard">
        <h3>Top slova</h3>
        ${renderBarChart(words.slice(0, 15), 15)}
      </section>`;
  }

  function renderCoverage(ctx) {
    const { items } = ctx;
    const areaFaculties = new Map();
    for (const item of items) {
      const area = n(item.oblast) || "—";
      const fac = n(item.zkr_fak) || "—";
      if (!areaFaculties.has(area)) areaFaculties.set(area, new Set());
      areaFaculties.get(area).add(fac);
    }

    const crossFaculty = [...areaFaculties.entries()]
      .filter(([, facs]) => facs.size >= 2)
      .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], "cs"));

    const singleTopicAreas = groupCount(items, "oblast").filter(([, c]) => c === 1);
    const thinAreas = groupCount(items, "oblast").filter(([, c]) => c <= 2);

    const facDiversity = groupCount(items, "zkr_fak").map(([fac, count]) => {
      const areas = new Set(items.filter((t) => n(t.zkr_fak) === fac).map((t) => n(t.oblast)));
      return [fac, count, areas.size];
    });

    return `
      <div class="pcrAnalysisGrid">
        <section class="pcrAnalysisCard">
          <h3>Mezioborové oblasti (≥2 fakulty)</h3>
          <p class="hint pcrAnalysisHint">Oblasti, kde UHK nabízí širší institucionální záběr.</p>
          ${crossFaculty.length
            ? `<ul class="pcrBulletList">${crossFaculty.map(([area, facs]) =>
              `<li><strong>${html(area)}</strong> — ${html([...facs].join(", "))}</li>`
            ).join("")}</ul>`
            : `<p class="hint">Žádná oblast není pokryta více fakultami.</p>`}
        </section>
        <section class="pcrAnalysisCard">
          <h3>Úzké oblasti (1–2 témata)</h3>
          <p class="hint pcrAnalysisHint">Potenciální mezery nebo specializované niche pro doplnění.</p>
          <ul class="pcrBulletList">${thinAreas.slice(0, 12).map(([area, count]) =>
            `<li>${html(area)} <span class="hint">(${count})</span></li>`
          ).join("")}</ul>
        </section>
        <section class="pcrAnalysisCard pcrAnalysisWide">
          <h3>Diverzita fakult (témata × oblasti)</h3>
          <div class="pcrTableWrap"><table class="pcrTable pcrTableCompact">
            <thead><tr><th>Fakulta</th><th>Témat</th><th>Oblastí</th><th>Průměr témat/oblast</th></tr></thead>
            <tbody>${facDiversity.map(([fac, count, areaCount]) => `
              <tr>
                <td><strong>${html(fac)}</strong></td>
                <td>${count}</td>
                <td>${areaCount}</td>
                <td>${areaCount ? (count / areaCount).toFixed(1) : "—"}</td>
              </tr>`).join("")}</tbody>
          </table></div>
        </section>
        <section class="pcrAnalysisCard pcrAnalysisWide">
          <h3>Izolovaná témata (jediné v oblasti)</h3>
          <ul class="pcrBulletList">${singleTopicAreas.slice(0, 15).map(([area]) => {
            const topic = items.find((t) => n(t.oblast) === area);
            return `<li><strong>${html(area)}</strong> — ${html(topic?.tema || "—")}</li>`;
          }).join("")}</ul>
        </section>
      </div>`;
  }

  function buildReportMarkdown(ctx) {
    const { items, gestorDisplay, isLinked, uniqueValues } = ctx;
    const date = new Date().toLocaleDateString("cs-CZ");
    const byOblast = groupCount(items, "oblast");
    const byFakulta = groupCount(items, "zkr_fak");
    const profiles = buildGestorProfiles(items, gestorDisplay, isLinked).slice(0, 10);
    const crossFaculty = [...buildFacultyAreaMatrix(items).areas].filter((area) => {
      const facs = new Set(items.filter((t) => n(t.oblast) === area).map((t) => n(t.zkr_fak)));
      return facs.size >= 2;
    });

    let md = `# Výzkumné směry UHK pro spolupráci s PČR\n\n`;
    md += `*Vygenerováno z KB Dashboardu · ${date} · ${items.length} témat*\n\n`;
    md += `## Shrnutí\n\n`;
    md += `- **${items.length}** výzkumných témat\n`;
    md += `- **${uniqueValues("oblast").length}** tematických oblastí\n`;
    md += `- **${uniqueValues("zkr_fak").length}** fakult\n`;
    md += `- **${items.filter(isLinked).length}** témat s gestorem propojeným v evidenci Osob\n\n`;

    md += `## Rozložení podle oblasti\n\n`;
    for (const [area, count] of byOblast) md += `- ${area}: **${count}**\n`;
    md += `\n## Rozložení podle fakulty\n\n`;
    for (const [fac, count] of byFakulta) md += `- ${fac}: **${count}**\n`;

    if (crossFaculty.length) {
      md += `\n## Mezioborové oblasti\n\n`;
      for (const area of crossFaculty) {
        const facs = [...new Set(items.filter((t) => n(t.oblast) === area).map((t) => n(t.zkr_fak)))];
        md += `- **${area}** (${facs.join(", ")})\n`;
      }
    }

    md += `\n## Klíčoví gestoři (top 10)\n\n`;
    for (const p of profiles) {
      md += `### ${p.label}${p.email ? ` (${p.email})` : ""}\n`;
      md += `- ${p.topics.length} témat, oblasti: ${[...p.oblasti].join(", ")}\n`;
      for (const t of p.topics.slice(0, 5)) md += `  - ${t.tema}\n`;
      if (p.topics.length > 5) md += `  - … a dalších ${p.topics.length - 5}\n`;
      md += `\n`;
    }

    md += `## Doporučení pro jednání\n\n`;
    md += `1. Prioritizovat mezioborové oblasti s pokrytím více fakult.\n`;
    md += `2. U specialistických oblastí s 1–2 tématy ověřit hloubku a dostupnost gestorů.\n`;
    md += `3. Doplnit propojení gestorů na centrální evidenci Osob UHK.\n`;

    return md;
  }

  function renderReport(ctx) {
    const md = buildReportMarkdown(ctx);
    return `
      <section class="pcrAnalysisCard pcrAnalysisWide">
        <div class="pcrReportHead">
          <div>
            <h3>Report pro jednání s PČR</h3>
            <p class="hint pcrAnalysisHint">Strukturovaný textový výstup — zkopírujte do e-mailu, Wordu nebo podkladů pro prezentaci.</p>
          </div>
          <button type="button" class="button small accent" id="pcrCopyReportBtn">Kopírovat report</button>
        </div>
        <textarea id="pcrReportText" class="pcrReportText" readonly rows="22">${html(md)}</textarea>
      </section>`;
  }

  const RENDERERS = {
    prehled: renderOverview,
    matice: renderMatrix,
    gestori: renderGestori,
    slova: renderKeywords,
    pokryti: renderCoverage,
    report: renderReport
  };

  function renderAnalysisPanel(ctx) {
    const tabs = VIEWS.map((v) =>
      `<button type="button" class="pcrAnalysisTab ${activeAnalysisId === v.id ? "active" : ""}" data-pcr-analysis="${v.id}">${v.icon} ${html(v.label)}</button>`
    ).join("");

    const body = (RENDERERS[activeAnalysisId] || renderOverview)(ctx);

    return `
      <div class="pcrAnalysisHub">
        <nav class="pcrAnalysisTabs" aria-label="Typ analýzy">${tabs}</nav>
        <div class="pcrAnalysisBody">${body}</div>
      </div>`;
  }

  function bindAnalysisEvents(root, ctx) {
    root.querySelectorAll("[data-pcr-analysis]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeAnalysisId = btn.dataset.pcrAnalysis;
        const host = root.querySelector(".pcrAnalysisHub");
        if (host) host.outerHTML = renderAnalysisPanel(ctx);
        bindAnalysisEvents(root, ctx);
      });
    });
    root.querySelector("#pcrCopyReportBtn")?.addEventListener("click", async () => {
      const text = root.querySelector("#pcrReportText")?.value;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const btn = root.querySelector("#pcrCopyReportBtn");
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
    if (document.getElementById("pcrAnalysisStyles")) return;
    const style = document.createElement("style");
    style.id = "pcrAnalysisStyles";
    style.textContent = `
      .pcrAnalysisHub { display: grid; gap: 1rem; }
      .pcrAnalysisTabs { display: flex; flex-wrap: wrap; gap: .4rem; }
      .pcrAnalysisTab {
        border: 1px solid var(--line); background: white; border-radius: 10px;
        padding: .4rem .7rem; font-size: .82rem; cursor: pointer; font-weight: 650;
      }
      .pcrAnalysisTab.active { background: #eff8ff; border-color: var(--accent); color: var(--accent-dark, #2446b5); }
      .pcrAnalysisHint { margin: -.35rem 0 .65rem; }
      .pcrAnalysisIntro { margin-bottom: .75rem; padding: .65rem .85rem; background: #f8fafc; border-radius: 10px; border: 1px solid var(--line); }
      .pcrMatrixWrap { overflow: auto; max-width: 100%; }
      .pcrMatrix { border-collapse: collapse; font-size: .8rem; min-width: 520px; }
      .pcrMatrix th, .pcrMatrix td { border: 1px solid var(--line); padding: .35rem .45rem; text-align: center; }
      .pcrMatrixCorner, .pcrMatrixRowHead { text-align: left; font-weight: 700; max-width: 180px; white-space: normal; }
      .pcrMatrixCellHot { background: rgba(49, 91, 232, calc(0.08 + var(--pcr-heat, 0) * 0.007)); font-weight: 700; }
      .pcrMatrixSum { background: #f8fafc; font-weight: 800; }
      .pcrMatrixFoot th, .pcrMatrixFoot td { background: #f2f4f7; }
      .pcrGestorGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .75rem; }
      .pcrGestorCard { border: 1px solid var(--line); border-radius: 12px; padding: .75rem; background: white; min-width: 0; }
      .pcrGestorHead { display: flex; justify-content: space-between; gap: .5rem; align-items: flex-start; margin-bottom: .35rem; }
      .pcrGestorMeta { margin: 0 0 .35rem; font-size: .88rem; }
      .pcrGestorDetails { margin-top: .5rem; font-size: .84rem; }
      .pcrGestorDetails ul { margin: .35rem 0 0; padding-left: 1.1rem; }
      .pcrBadge { font-size: .72rem; font-weight: 800; padding: .15rem .45rem; border-radius: 999px; white-space: nowrap; }
      .pcrBadgeOk { background: #ecfdf3; color: #027a48; }
      .pcrBadgeWarn { background: #fffaeb; color: #b54708; }
      .pcrKeywordCloud { display: flex; flex-wrap: wrap; gap: .45rem .65rem; line-height: 1.4; }
      .pcrKeyword { display: inline-block; padding: .15rem .4rem; background: #eef2ff; border-radius: 8px; font-weight: 650; color: #3730a3; }
      .pcrKeyword small { opacity: .7; font-size: .72em; font-weight: 800; }
      .pcrBulletList { margin: 0; padding-left: 1.1rem; line-height: 1.55; }
      .pcrTableCompact th, .pcrTableCompact td { font-size: .84rem; }
      .pcrReportHead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; align-items: flex-start; margin-bottom: .65rem; }
      .pcrReportText { width: 100%; font-family: ui-monospace, monospace; font-size: .82rem; line-height: 1.45; padding: .75rem; border: 1px solid var(--line); border-radius: 10px; resize: vertical; }
    `;
    document.head.appendChild(style);
  }

  function mount(container, ctx) {
    if (!container) return;
    injectStyles();
    container.innerHTML = renderAnalysisPanel(ctx);
    bindAnalysisEvents(container, ctx);
  }

  window.kbPcrAnalysis = {
    mount,
    buildReportMarkdown,
    VIEWS
  };
})();
