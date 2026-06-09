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
  let competitions = [];
  let useSupabase = false;
  let loading = false;
  let activeProgram = PROGRAMS[0].slug;
  let activeCompetitionId = null;
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
        setStatus("Data v prohlížeči. Pro Supabase spusťte supabase/competitions-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseCompetitions.probeTables();
      if (!available) {
        useSupabase = false;
        competitions = window.kbSupabaseCompetitions.loadLocal();
        setStatus("Tabulky v Supabase zatím neexistují. Spusťte supabase/competitions-schema.sql.");
        return;
      }
      useSupabase = true;
      competitions = await window.kbSupabaseCompetitions.loadAll();
      setStatus(`Načteno ze Supabase: ${competitions.length} běhů soutěží.`);
    } catch (e) {
      console.error(e);
      useSupabase = false;
      competitions = window.kbSupabaseCompetitions?.loadLocal?.() || [];
      setStatus(`Chyba: ${e.message || e}`, true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:competitions-loaded"));
    }
  }

  async function saveCompetition(comp) {
    if (useSupabase && window.kbSupabaseCompetitions) {
      const saved = await window.kbSupabaseCompetitions.saveCompetition(comp);
      const idx = competitions.findIndex(c => c.id === saved.id);
      if (idx === -1) competitions.unshift(saved);
      else competitions[idx] = saved;
      return saved;
    }
    const idx = competitions.findIndex(c => c.id === comp.id);
    if (idx === -1) competitions.unshift(comp);
    else competitions[idx] = comp;
    persistLocal();
    return comp;
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
      box.innerHTML = `<p class="hint">Zatím žádný běh pro ${html(prog.title)}. Klikněte „Nový běh / výzva“.</p>`;
      return;
    }
    box.innerHTML = `<div class="competitionCards">${items.map(c => {
      const used = sumSupported(c);
      const alloc = Number(c.alokovana_castka) || 0;
      const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
      const active = c.id === activeCompetitionId ? "active" : "";
      return `<article class="competitionCard ${active}" data-comp-id="${html(c.id)}" tabindex="0" role="button">
        <strong>${html(c.nazev)}</strong>
        <span class="competitionCardMeta">${c.rok || "—"} · běh ${c.beh_cislo || 1} · ${(c.applications || []).length} přihlášek</span>
        <span class="competitionCardMoney">${fmtMoney(alloc)} alokace · ${fmtMoney(used)} čerpáno (${pct}%)</span>
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
    const alloc = Number(c.alokovana_castka) || 0;
    const used = sumSupported(c);
    const requested = sumApplications(c);
    const remaining = alloc - used;
    const behCount = competitionsForProgram(c.program_slug).length;

    box.innerHTML = `
      <div class="competitionDetailHead">
        <div>
          <h2>${html(c.nazev)}</h2>
          <p class="hint">${html(getProgram(c.program_slug).title)} · rok ${c.rok || "—"} · běh ${c.beh_cislo || 1} · celkem běhů programu: ${behCount}</p>
        </div>
        <div class="competitionDetailActions">
          <button type="button" class="button small secondary" id="editCompetitionBtn">Upravit běh</button>
          <button type="button" class="button small danger" id="deleteCompetitionBtn">Smazat</button>
        </div>
      </div>
      <div class="competitionMetrics">
        <article class="metric"><span>${fmtMoney(alloc)}</span><small>alokovaná částka</small></article>
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
        <table class="competitionTable">
          <tr><td>Alokovaná částka</td><td class="money">${fmtMoney(alloc)}</td></tr>
          <tr><td>Celkem požadováno v přihláškách</td><td class="money">${fmtMoney(requested)}</td></tr>
          <tr><td>Celkem podpořeno</td><td class="money">${fmtMoney(used)}</td></tr>
          <tr><td><strong>Zbývá / přebytek</strong></td><td class="money"><strong>${fmtMoney(remaining)}</strong></td></tr>
          <tr><td>Využití alokace</td><td>${alloc > 0 ? `${Math.round((used / alloc) * 100)} %` : "—"}</td></tr>
        </table>
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
  }

  function renderApplicationsTable(c) {
    const apps = c.applications || [];
    if (!apps.length) return `<p class="hint">Žádné přihlášky.</p>`;
    return `<div class="competitionTableWrap"><table class="competitionTable">
      <thead><tr><th>Projekt</th><th>Řešitel</th><th>Fakulta</th><th>Požadavek</th><th>Hodnocení</th><th>Stav</th><th></th></tr></thead>
      <tbody>${apps.map(a => `<tr>
        <td><strong>${html(a.nazev_projektu)}</strong></td>
        <td>${html(a.resitel)}</td>
        <td>${html(a.fakulta)}</td>
        <td class="money">${fmtMoney(a.financni_pozadavek)}</td>
        <td>${html(a.hodnoceni)}</td>
        <td>${html(a.stav)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-app="${html(a.id)}">Upravit</button>
          <button type="button" class="button small accent" data-promote-app="${html(a.id)}">Podpořit</button>
          <button type="button" class="button small secondary" data-del-app="${html(a.id)}">×</button>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderSupportedTable(c) {
    const items = c.supported || [];
    if (!items.length) return `<p class="hint">Žádné podpořené projekty.</p>`;
    return `<div class="competitionTableWrap"><table class="competitionTable">
      <thead><tr><th>Projekt</th><th>Řešitel</th><th>Fakulta</th><th>Částka podpory</th><th></th></tr></thead>
      <tbody>${items.map(s => `<tr>
        <td><strong>${html(s.nazev_projektu)}</strong></td>
        <td>${html(s.resitel)}</td>
        <td>${html(s.fakulta)}</td>
        <td class="money">${fmtMoney(s.castka_podpory)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-supp="${html(s.id)}">Upravit</button>
          <button type="button" class="button small secondary" data-del-supp="${html(s.id)}">×</button>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function openCompetitionDialog(existing) {
    const c = existing || {
      id: uuid(),
      program_slug: activeProgram,
      nazev: `${getProgram(activeProgram).title} – běh ${competitionsForProgram(activeProgram).length + 1}`,
      rok: new Date().getFullYear(),
      beh_cislo: competitionsForProgram(activeProgram).length + 1,
      alokovana_castka: 0,
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
    el("compAlokace").value = c.alokovana_castka || "";
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
    const comp = {
      id,
      program_slug: el("compProgram").value || activeProgram,
      nazev: n(el("compNazev").value) || "Bez názvu",
      rok: Number(el("compRok").value) || null,
      beh_cislo: Number(el("compBeh").value) || 1,
      alokovana_castka: Number(el("compAlokace").value) || 0,
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
      alert("Uložení selhalo: " + (err.message || err));
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

  function openApplicationDialog(compId, appId) {
    const comp = getCompetition(compId);
    if (!comp) return;
    const existing = appId ? (comp.applications || []).find(a => a.id === appId) : null;
    el("appEditId").value = existing?.id || "";
    el("appCompId").value = compId;
    el("appNazev").value = existing?.nazev_projektu || "";
    el("appResitel").value = existing?.resitel || "";
    el("appFakulta").value = existing?.fakulta || "";
    el("appCastka").value = existing?.financni_pozadavek || "";
    el("appHodnoceni").value = existing?.hodnoceni || "";
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
    const app = {
      id,
      nazev_projektu: n(el("appNazev").value) || "Bez názvu",
      resitel: n(el("appResitel").value),
      fakulta: n(el("appFakulta").value),
      financni_pozadavek: Number(el("appCastka").value) || 0,
      hodnoceni: n(el("appHodnoceni").value),
      stav: n(el("appStav").value) || "Přihláška",
      poznamka: n(el("appPoznamka").value),
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    };
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

  function openSupportedDialog(compId, suppId) {
    const comp = getCompetition(compId);
    if (!comp) return;
    const existing = suppId ? (comp.supported || []).find(s => s.id === suppId) : null;
    el("suppEditId").value = existing?.id || "";
    el("suppCompId").value = compId;
    el("suppNazev").value = existing?.nazev_projektu || "";
    el("suppResitel").value = existing?.resitel || "";
    el("suppFakulta").value = existing?.fakulta || "";
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
    const item = {
      id,
      nazev_projektu: n(el("suppNazev").value) || "Bez názvu",
      resitel: n(el("suppResitel").value),
      fakulta: n(el("suppFakulta").value),
      castka_podpory: Number(el("suppCastka").value) || 0,
      poznamka: n(el("suppPoznamka").value),
      application_id: existing?.application_id || null,
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    };
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
    const item = {
      id: uuid(),
      application_id: app.id,
      nazev_projektu: app.nazev_projektu,
      resitel: app.resitel,
      fakulta: app.fakulta,
      castka_podpory: app.financni_pozadavek,
      poznamka: `Z přihlášky: ${app.stav || ""}`,
      created_at: new Date().toISOString()
    };
    await saveCompetition({ ...comp, supported: [...(comp.supported || []), item], __existing: true });
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
            <p class="hint">Programy UHK Connect, Prestige, Horizon, Rega, Návraty a PhD Seed — běhy, přihlášky, hodnocení a finance.</p>
          </div>
          <div class="sectionActions">
            <button type="button" id="competitionsReloadBtn" class="button small secondary">Načíst ze Supabase</button>
            <button type="button" id="newCompetitionBtn" class="button accent">Nový běh / výzva</button>
          </div>
        </div>
        <p id="competitionsStatus" class="competitionsStatus hint">Načítám…</p>
        <div id="competitionProgramTabs" class="competitionProgramTabs"></div>
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
            <label>Alokovaná částka (Kč)<input id="compAlokace" type="number" min="0" step="1000" /></label>
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
          <label>Název projektu<input id="appNazev" required /></label>
          <div class="grid2">
            <label>Řešitel<input id="appResitel" /></label>
            <label>Fakulta / součást<input id="appFakulta" /></label>
            <label>Finanční požadavek (Kč)<input id="appCastka" type="number" min="0" step="1000" /></label>
            <label>Stav<select id="appStav"><option>Přihláška</option><option>Hodnoceno</option><option>Podpořeno</option><option>Zamítnuto</option></select></label>
          </div>
          <label>Hodnocení (proděkan)<textarea id="appHodnoceni" rows="2"></textarea></label>
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
          <label>Název projektu<input id="suppNazev" required /></label>
          <div class="grid2">
            <label>Řešitel<input id="suppResitel" /></label>
            <label>Fakulta<input id="suppFakulta" /></label>
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
      .competitionTable .money { text-align: right; font-variant-numeric: tabular-nums; }
      .rowActions { white-space: nowrap; }
      .competitionDetailHead { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .competitionSummary table { max-width: 480px; }
      .competitionsStatus { margin: .35rem 0 .75rem; }
      .competitionsStatusError { color: #b42318; }
      @media (max-width: 900px) {
        .competitionLayout, .competitionDocs, .competitionMetrics { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function render() {
    renderProgramTabs();
    renderCompetitionList();
    renderCompetitionDetail();
  }

  function init() {
    injectStyles();
    injectPage();
    injectDialogs();
    setTimeout(loadCompetitions, 150);
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "interni-souteze" && !competitions.length && !loading) loadCompetitions();
    });
  }

  window.kbCompetitions = { PROGRAMS, loadCompetitions, getCompetitions: () => competitions };

  document.addEventListener("DOMContentLoaded", init);
})();
