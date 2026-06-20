// Analýza členů orgánů — fakulty/katedry (AS), působiště a kmenová pracoviště, mezery, AI doplnění, síťový export.

(function () {
  const FAKULTA_ZKR = {
    fim: "FIM",
    "fakulta informatiky": "FIM",
    "informatiky a managementu": "FIM",
    ff: "FF",
    filozofick: "FF",
    fsv: "FSV",
    "sociálních věd": "FSV",
    pdf: "PdF",
    pedagogick: "PdF",
    fhk: "FHK",
    humanitní: "FHK",
    rektor: "Rektorát",
    celouniverzit: "CU"
  };

  const VIEWS = [
    { id: "prehled", label: "Přehled", icon: "📊" },
    { id: "struktura", label: "Struktura", icon: "🧩" },
    { id: "mezery", label: "Mezery", icon: "🎯" },
    { id: "sit", label: "Síťování", icon: "🔗" }
  ];

  let activeView = "prehled";
  let pendingEnrichment = null;

  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function inferZkrFak(text) {
    const t = l(text);
    if (!t) return "";
    if (/^[A-Z]{2,5}$/.test(n(text))) return n(text).toUpperCase();
    for (const [key, zkr] of Object.entries(FAKULTA_ZKR)) {
      if (t.includes(key)) return zkr;
    }
    return "";
  }

  function parsePracoviste(text) {
    const raw = n(text);
    if (!raw) return { fakulta: "", zkr_fak: "", katedra: "", kmenove_pracoviste: "" };
    const parts = raw.split(/\s*[·/|]\s*/).map(n).filter(Boolean);
    const fakulta = parts[0] || "";
    const katedra = parts.slice(1).join(" · ") || "";
    const zkr = inferZkrFak(fakulta) || inferZkrFak(raw);
    return {
      fakulta,
      zkr_fak: zkr,
      katedra: katedra || (parts.length === 1 && !zkr ? raw : katedra),
      kmenove_pracoviste: raw
    };
  }

  function isAcademicSenate(organ) {
    return organ?.slug === "akademicky-senat";
  }

  function memberLabel(member) {
    return [member.tituly, member.jmeno].filter(Boolean).join(" ").trim() || "Bez jména";
  }

  function resolveLinkedPerson(member) {
    return window.kbPersonLinks?.resolvePerson?.(member, "clen")
      || window.kbPersons?.matchPersonFromRegistry?.({
        jmeno: member.jmeno,
        email: member.email,
        osobni_cislo: member.osobni_cislo
      })
      || null;
  }

  function resolveMemberProfile(member, organ) {
    const person = resolveLinkedPerson(member);
    const fromPerson = parsePracoviste(person?.pracoviste || "");
    const explicit = {
      fakulta: n(member.fakulta),
      zkr_fak: n(member.zkr_fak),
      katedra: n(member.katedra),
      pusobiste: n(member.pusobiste),
      kmenove_pracoviste: n(member.kmenove_pracoviste),
      sitove_info: n(member.sitove_info)
    };

    const fakulta = explicit.fakulta || fromPerson.fakulta || "";
    const zkr_fak = explicit.zkr_fak || inferZkrFak(fakulta) || fromPerson.zkr_fak || "";
    const katedra = explicit.katedra || fromPerson.katedra || "";
    const kmenove = explicit.kmenove_pracoviste || fromPerson.kmenove_pracoviste || "";
    const pusobiste = explicit.pusobiste || n(member.funkce) || "";

    const sources = [];
    if (explicit.fakulta || explicit.katedra || explicit.pusobiste || explicit.kmenove_pracoviste) sources.push("evidence");
    if (person?.pracoviste) sources.push("osoby");
    if (!sources.length) sources.push("chybi");

    const asMode = isAcademicSenate(organ);
    const missing = [];
    if (asMode) {
      if (!zkr_fak && !fakulta) missing.push("fakulta");
      if (!katedra) missing.push("katedra");
    } else {
      if (!pusobiste) missing.push("působiště");
      if (!kmenove) missing.push("kmenové pracoviště");
    }

    return {
      member,
      person,
      label: memberLabel(member),
      email: n(member.email) || n(person?.email),
      funkce: n(member.funkce),
      fakulta,
      zkr_fak: zkr_fak || inferZkrFak(fakulta),
      katedra,
      pusobiste,
      kmenove_pracoviste: kmenove,
      sitove_info: explicit.sitove_info || n(member.poznamka),
      sources,
      missing,
      complete: missing.length === 0,
      linkedPerson: !!person,
      personHasPracoviste: !!n(person?.pracoviste)
    };
  }

  function analyzeOrgan(organ) {
    const members = (organ.members || []).filter((m) => m.aktivni !== false);
    const profiles = members.map((m) => resolveMemberProfile(m, organ));
    const complete = profiles.filter((p) => p.complete);
    const incomplete = profiles.filter((p) => !p.complete);
    const byFaculty = new Map();

    for (const p of profiles) {
      const facKey = p.zkr_fak || p.fakulta || "— nezařazeno";
      if (!byFaculty.has(facKey)) byFaculty.set(facKey, new Map());
      const katMap = byFaculty.get(facKey);
      const katKey = p.katedra || "— bez katedry";
      if (!katMap.has(katKey)) katMap.set(katKey, []);
      katMap.get(katKey).push(p);
    }

    return {
      organ,
      asMode: isAcademicSenate(organ),
      profiles,
      complete,
      incomplete,
      byFaculty,
      total: profiles.length,
      completeCount: complete.length,
      incompleteCount: incomplete.length
    };
  }

  function renderBarChart(groups, maxBars = 12) {
    const top = groups.slice(0, maxBars);
    const max = top[0]?.[1] || 1;
    return `<div class="radyBarChart">${top.map(([label, count]) => `
      <div class="radyBarRow">
        <div class="radyBarLabel" title="${html(label)}">${html(label)}</div>
        <div class="radyBarTrack"><div class="radyBarFill" style="width:${Math.round((count / max) * 100)}%"></div></div>
        <div class="radyBarCount">${count}</div>
      </div>`).join("")}</div>`;
  }

  function sourceBadge(profile) {
    if (profile.sources.includes("evidence") && profile.sources.includes("osoby")) {
      return `<span class="radySrcBadge radySrcBoth">Evidence + Osoby</span>`;
    }
    if (profile.sources.includes("osoby")) return `<span class="radySrcBadge radySrcPerson">Osoby</span>`;
    if (profile.sources.includes("evidence")) return `<span class="radySrcBadge radySrcLocal">Evidence</span>`;
    return `<span class="radySrcBadge radySrcMissing">Chybí data</span>`;
  }

  function renderOverview(analysis) {
    const { profiles, asMode, completeCount, total, incompleteCount } = analysis;
    const byFac = new Map();
    const byKat = new Map();
    for (const p of profiles) {
      const f = p.zkr_fak || p.fakulta || "—";
      byFac.set(f, (byFac.get(f) || 0) + 1);
      if (p.katedra) byKat.set(p.katedra, (byKat.get(p.katedra) || 0) + 1);
    }

    return `
      <div class="radyAnalysisGrid">
        <section class="radyAnalysisCard">
          <h3>Stav dat</h3>
          <ul class="radyBulletList">
            <li>Celkem aktivních členů: <strong>${total}</strong></li>
            <li>Kompletní profil: <strong>${completeCount}</strong></li>
            <li>Chybí údaje: <strong>${incompleteCount}</strong></li>
            <li>Propojeno na Osoby: <strong>${profiles.filter((p) => p.linkedPerson).length}</strong></li>
          </ul>
          <p class="hint">${asMode
            ? "U AS UHK se vyžaduje fakulta a katedra pro strukturovaný přehled zastoupení."
            : "U ostatních orgánů sledujeme působiště v orgánu a kmenové pracoviště — vhodné pro networking a mapu kontaktů."}</p>
        </section>
        ${asMode ? `
          <section class="radyAnalysisCard">
            <h3>Podle fakulty</h3>
            ${renderBarChart([...byFac.entries()].sort((a, b) => b[1] - a[1]))}
          </section>
          <section class="radyAnalysisCard">
            <h3>Podle katedry</h3>
            ${renderBarChart([...byKat.entries()].sort((a, b) => b[1] - a[1]), 14)}
          </section>
        ` : `
          <section class="radyAnalysisCard radyAnalysisWide">
            <h3>Působiště vs. kmen</h3>
            <p class="hint">U orgánu ${html(analysis.organ.nazev)} jsou klíčové sloupce působiště (role/zastoupení) a kmenové pracoviště.</p>
            ${renderWorkplaceTable(profiles, false)}
          </section>
        `}
      </div>`;
  }

  function renderWorkplaceTable(profiles, showFaculty = true) {
    if (!profiles.length) return `<p class="hint">Žádní členové k analýze.</p>`;
    return `
      <table class="radyTable radyAnalysisTable">
        <thead>
          <tr>
            <th>Jméno</th>
            <th>Funkce</th>
            ${showFaculty ? "<th>Fakulta</th><th>Katedra</th>" : ""}
            <th>Působiště</th>
            <th>Kmenové pracoviště</th>
            <th>Zdroj</th>
          </tr>
        </thead>
        <tbody>
          ${profiles.map((p) => `
            <tr class="${p.complete ? "" : "radyRowIncomplete"}">
              <td><strong>${html(p.label)}</strong>${p.email ? `<br><span class="hint">${html(p.email)}</span>` : ""}</td>
              <td>${html(p.funkce || "—")}</td>
              ${showFaculty ? `<td>${html(p.zkr_fak || p.fakulta || "—")}</td><td>${html(p.katedra || "—")}</td>` : ""}
              <td class="${!p.pusobiste ? "radyCellMissing" : ""}">${html(p.pusobiste || "—")}</td>
              <td class="${!p.kmenove_pracoviste ? "radyCellMissing" : ""}">${html(p.kmenove_pracoviste || "—")}</td>
              <td>${sourceBadge(p)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  }

  function renderStructure(analysis) {
    if (analysis.asMode) {
      const blocks = [...analysis.byFaculty.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "cs"))
        .map(([fac, katMap]) => {
          const members = [...katMap.values()].flat();
          const katBlocks = [...katMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], "cs"))
            .map(([kat, list]) => `
              <div class="radyKatBlock">
                <h4>${html(kat)} <span class="hint">(${list.length})</span></h4>
                <ul class="radyMemberMiniList">
                  ${list.map((p) => `<li>${html(p.label)}${p.funkce ? ` — <span class="hint">${html(p.funkce)}</span>` : ""}</li>`).join("")}
                </ul>
              </div>`).join("");
          return `
            <section class="radyFacBlock">
              <h3>${html(fac)} <span class="hint">(${members.length} členů)</span></h3>
              <div class="radyKatGrid">${katBlocks}</div>
            </section>`;
        }).join("");

      return `
        <section class="radyAnalysisCard radyAnalysisWide">
          <h3>Akademický senát — struktura podle fakult a kateder</h3>
          <p class="hint">Přehled zastoupení jednotlivých součástí UHK v AS. Data lze doplnit ručně, z modulu Osoby nebo AI.</p>
          ${blocks || `<p class="hint">Zatím nelze seskupit — doplňte fakultu a katedru u členů.</p>`}
        </section>
        <section class="radyAnalysisCard radyAnalysisWide">
          <h3>Tabulka členů</h3>
          ${renderWorkplaceTable(analysis.profiles, true)}
        </section>`;
    }

    return `
      <section class="radyAnalysisCard radyAnalysisWide">
        <h3>${html(analysis.organ.nazev)} — působiště a kmenová pracoviště</h3>
        <p class="hint">Pro networking a orientaci v orgánu: kde osoba působí v radě/komisi a odkud na UHK pochází.</p>
        ${renderWorkplaceTable(analysis.profiles, false)}
      </section>`;
  }

  function renderGaps(analysis) {
    const { incomplete, asMode } = analysis;
    if (!incomplete.length) {
      return `<section class="radyAnalysisCard"><p><strong>Všechny profily jsou kompletní.</strong> Můžete exportovat síťový přehled v záložce Síťování.</p></section>`;
    }

    const suggestions = incomplete.map((p) => {
      const tips = [];
      if (!p.linkedPerson) tips.push("Propojte člena s modulem Osoby (dialog Upravit člena).");
      else if (!p.personHasPracoviste) tips.push("V modulu Osoby doplňte sloupec Pracoviště u propojené osoby.");
      if (p.missing.length) tips.push(`Chybí: ${p.missing.join(", ")}.`);
      tips.push("Nebo použijte AI doplnění níže.");
      return `
        <li class="radyGapItem">
          <strong>${html(p.label)}</strong>
          <span class="hint">${html(p.missing.join(", ") || "neúplná data")}</span>
          <p class="hint radyGapTip">${html(tips.join(" "))}</p>
          <button type="button" class="button secondary radySmallBtn" data-edit-member-gap="${html(p.member.id)}">Upravit člena</button>
        </li>`;
    }).join("");

    return `
      <section class="radyAnalysisCard radyAnalysisWide">
        <h3>Neúplné profily (${incomplete.length})</h3>
        <p class="hint">${asMode
          ? "U AS doplněte fakultu a katedru — ideálně z webu AS nebo modulu Osoby."
          : "U ostatních orgánů doplňte působiště (role v orgánu) a kmenové pracoviště."}</p>
        <ul class="radyGapList">${suggestions}</ul>
      </section>
      <section class="radyAnalysisCard">
        <h3>AI doplnění chybějících údajů</h3>
        <p class="hint">AI navrhne fakultu, katedru, působiště a kmen podle jména, e-mailu, funkce, textu stránky orgánu a modulu Osoby. Návrhy zkontrolujte před uložením.</p>
        <div class="radyAiActions">
          <button type="button" class="button" id="radyAiEnrichBtn">AI doplnit pracoviště (${incomplete.length})</button>
        </div>
        <div id="radyAiEnrichResult">${renderEnrichmentPreview(pendingEnrichment)}</div>
      </section>`;
  }

  function renderEnrichmentPreview(data) {
    if (!data?.clenove?.length) return "";
    return `
      <div class="radyAiResult">
        <p class="radyAiSummary">${html(data.shrnuti || `Návrhy pro ${data.clenove.length} členů`)}</p>
        <ul class="radyEnrichList">
          ${data.clenove.map((c) => `
            <li>
              <strong>${html(c.jmeno || c.label || "—")}</strong>
              ${c.zkr_fak || c.fakulta ? ` · ${html(c.zkr_fak || c.fakulta)}` : ""}
              ${c.katedra ? ` · ${html(c.katedra)}` : ""}
              ${c.pusobiste ? ` · působiště: ${html(c.pusobiste)}` : ""}
              ${c.kmenove_pracoviste ? ` · kmen: ${html(c.kmenove_pracoviste)}` : ""}
              ${c.duvera ? ` <span class="hint">(${html(c.duvera)})</span>` : ""}
            </li>`).join("")}
        </ul>
        <div class="radyAiApply">
          <button type="button" class="button" id="radyApplyEnrichBtn">Uložit AI návrhy do evidence</button>
          <button type="button" class="button secondary" id="radyDismissEnrichBtn">Zrušit</button>
        </div>
      </div>`;
  }

  function buildNetworkingReport(analysis) {
    const lines = [
      `# Síťový přehled — ${analysis.organ.nazev}`,
      `Export: ${new Date().toLocaleString("cs-CZ")}`,
      "",
      "Jméno\tE-mail\tFunkce\tFakulta\tKatedra\tPůsobiště\tKmenové pracoviště\tSíťové poznámky"
    ];
    for (const p of analysis.profiles) {
      lines.push([
        p.label,
        p.email || "",
        p.funkce || "",
        p.zkr_fak || p.fakulta || "",
        p.katedra || "",
        p.pusobiste || "",
        p.kmenove_pracoviste || "",
        p.sitove_info || ""
      ].join("\t"));
    }
    return lines.join("\n");
  }

  function renderNetworking(analysis) {
    const report = buildNetworkingReport(analysis);
    return `
      <section class="radyAnalysisCard radyAnalysisWide">
        <h3>Export pro networking</h3>
        <p class="hint">Tabulkový přehled pro kopírování do Excelu, poznámek nebo CRM. Sloupec „Síťové poznámky“ doplňte u člena v dialogu (pole Síťové info).</p>
        <textarea id="radyNetworkingExport" class="full radyExportArea" rows="14" readonly>${html(report)}</textarea>
        <div class="radyAiActions">
          <button type="button" class="button secondary" id="radyCopyNetworkBtn">Kopírovat do schránky</button>
        </div>
      </section>
      <section class="radyAnalysisCard">
        <h3>Tipy pro síťování</h3>
        <ul class="radyBulletList">
          <li>Propojte členy s modulem <strong>Osoby</strong> — automaticky se doplní kmenové pracoviště.</li>
          <li>U AS sledujte <strong>pokrytí fakult</strong> — kdo chybí v záložce Struktura.</li>
          <li>Pole <strong>Síťové info</strong> u člena: společné projekty, eventy, kdo vás seznámil.</li>
          <li>Po importu z webu spusťte <strong>AI doplnění</strong> v záložce Mezery.</li>
        </ul>
      </section>`;
  }

  function renderAnalysisView(analysis) {
    const tabs = VIEWS.map((v) =>
      `<button type="button" class="radyAnalysisTab ${activeView === v.id ? "active" : ""}" data-rady-analysis-view="${v.id}">${v.icon} ${html(v.label)}</button>`
    ).join("");

    let body = "";
    if (activeView === "prehled") body = renderOverview(analysis);
    else if (activeView === "struktura") body = renderStructure(analysis);
    else if (activeView === "mezery") body = renderGaps(analysis);
    else if (activeView === "sit") body = renderNetworking(analysis);

    return `
      <div class="radyAnalysisWrap">
        <div class="radyAnalysisTabs">${tabs}</div>
        ${body}
      </div>`;
  }

  async function runAiEnrichment(organ, analysis) {
    if (!window.kbAiClassify?.callChat) throw new Error("AI modul není k dispozici.");
    if (!window.kbAiClassify.hasApiKey?.()) throw new Error("Nastavte API klíč v Nastavení → AI nastavení.");

    const targets = analysis.incomplete.map((p) => ({
      id: p.member.id,
      jmeno: p.label,
      email: p.email,
      funkce: p.funkce,
      fakulta: p.fakulta,
      katedra: p.katedra,
      pusobiste: p.pusobiste,
      kmenove_pracoviste: p.kmenove_pracoviste,
      osoby_pracoviste: p.person?.pracoviste || ""
    }));

    const personsSample = (window.kbPersons?.getPersons?.() || [])
      .slice(0, 80)
      .map((p) => ({ jmeno: `${p.jmeno} ${p.prijmeni}`, email: p.email, pracoviste: p.pracoviste }));

    const asMode = analysis.asMode;
    const system = [
      "Jsi expert na strukturu UHK (Univerzita Hradec Králové).",
      asMode
        ? "Doplň u členů Akademického senátu fakultu (zkr. FIM, FF, FSV, PdF, FHK…) a katedru/ústav."
        : "Doplň u členů orgánu působiště (role/zastoupení v orgánu) a kmenové pracoviště (katedra, ústav).",
      "Vrať POUZE JSON: { shrnuti, clenove: [{ id, jmeno, fakulta, zkr_fak, katedra, pusobiste, kmenove_pracoviste, sitove_info, duvera, poznamka_zdroje }] }.",
      "Použij modul Osoby a text stránky orgánu. Nevymýšlej — u nejistoty nastav duvera na nizka a krátkou poznamka_zdroje.",
      "sitove_info nech prázdné, pokud nemáš podklad."
    ].join(" ");

    const user = JSON.stringify({
      organ: organ.nazev,
      slug: organ.slug,
      web_text: (organ.aktuality_text || organ.jednaci_rad_text || "").slice(0, 40000),
      clenove_k_doplneni: targets,
      registry_osob_vzorek: personsSample
    }, null, 2);

    const content = await window.kbAiClassify.callChat([
      { role: "system", content: system },
      { role: "user", content: user }
    ], { json: true, temperature: 0.15 });

    let result;
    try {
      result = JSON.parse(content);
    } catch (_) {
      const match = content.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { shrnuti: content, clenove: [] };
    }
    pendingEnrichment = result;
    return result;
  }

  async function applyEnrichment(organ, onSaveMember) {
    if (!pendingEnrichment?.clenove?.length) return 0;
    let count = 0;
    for (const proposal of pendingEnrichment.clenove) {
      const member = organ.members.find((m) => m.id === proposal.id);
      if (!member) continue;
      const patch = {};
      ["fakulta", "zkr_fak", "katedra", "pusobiste", "kmenove_pracoviste", "sitove_info"].forEach((field) => {
        if (n(proposal[field]) && !n(member[field])) patch[field] = n(proposal[field]);
      });
      if (!n(member.zkr_fak) && n(proposal.fakulta)) patch.zkr_fak = inferZkrFak(proposal.fakulta);
      if (Object.keys(patch).length) {
        Object.assign(member, patch);
        if (onSaveMember) await onSaveMember(organ, member);
        count += 1;
      }
    }
    pendingEnrichment = null;
    return count;
  }

  function mount(container, ctx) {
    if (!container || !ctx?.organ) return;
    const analysis = analyzeOrgan(ctx.organ);
    container.innerHTML = renderAnalysisView(analysis);

    container.querySelectorAll("[data-rady-analysis-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.radyAnalysisView;
        mount(container, ctx);
      });
    });

    container.querySelectorAll("[data-edit-member-gap]").forEach((btn) => {
      btn.addEventListener("click", () => ctx.onEditMember?.(btn.dataset.editMemberGap));
    });

    container.querySelector("#radyAiEnrichBtn")?.addEventListener("click", async () => {
      const btn = container.querySelector("#radyAiEnrichBtn");
      const prev = btn?.textContent;
      try {
        if (btn) { btn.disabled = true; btn.textContent = "AI analyzuje…"; }
        await runAiEnrichment(ctx.organ, analysis);
        activeView = "mezery";
        mount(container, ctx);
        ctx.onStatus?.("AI návrhy pracovišť připraveny ke kontrole.");
      } catch (error) {
        ctx.onStatus?.(error.message || String(error), true);
        alert("AI doplnění selhalo: " + (error.message || error));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = prev; }
      }
    });

    container.querySelector("#radyApplyEnrichBtn")?.addEventListener("click", async () => {
      const count = await applyEnrichment(ctx.organ, ctx.onSaveMember);
      ctx.onStatus?.(`Uloženo ${count} doplnění z AI.`);
      mount(container, { ...ctx, organ: ctx.organ });
      ctx.onRefresh?.();
    });

    container.querySelector("#radyDismissEnrichBtn")?.addEventListener("click", () => {
      pendingEnrichment = null;
      mount(container, ctx);
    });

    container.querySelector("#radyCopyNetworkBtn")?.addEventListener("click", async () => {
      const text = container.querySelector("#radyNetworkingExport")?.value || "";
      try {
        await navigator.clipboard.writeText(text);
        ctx.onStatus?.("Síťový export zkopírován.");
      } catch (_) {
        alert("Kopírování se nepodařilo — vyberte text ručně.");
      }
    });
  }

  window.kbRadyOrganyAnalysis = {
    analyzeOrgan,
    resolveMemberProfile,
    parsePracoviste,
    inferZkrFak,
    isAcademicSenate,
    buildNetworkingReport,
    runAiEnrichment,
    applyEnrichment,
    mount,
    getPendingEnrichment: () => pendingEnrichment,
    clearPendingEnrichment: () => { pendingEnrichment = null; }
  };
})();
