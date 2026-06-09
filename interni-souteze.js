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
  const PERSONS_KEY = "kb-dashboard-competition-persons-v1";
  let competitions = [];
  let persons = [];
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

  function personLabel(p) {
    if (!p) return "";
    return [p.titul_pred, p.jmeno, p.prijmeni, p.titul_za].map(n).filter(Boolean).join(" ").trim();
  }

  function getPerson(id) {
    return persons.find(p => p.id === id) || null;
  }

  function resitelDisplay(item) {
    if (item?.resitel_id) {
      const p = getPerson(item.resitel_id);
      if (p) return personLabel(p);
    }
    return item?.resitel || "";
  }

  function suggestProjektId(comp) {
    const prog = getProgram(comp.program_slug);
    const prefix = prog.slug.toUpperCase().replace(/-/g, "");
    const year = comp.rok || new Date().getFullYear();
    const seq = (comp.applications?.length || 0) + 1;
    return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
  }

  function persistLocalPersons() {
    localStorage.setItem(PERSONS_KEY, JSON.stringify(persons, null, 2));
    if (window.kbSupabaseCompetitions?.saveLocalPersons) window.kbSupabaseCompetitions.saveLocalPersons(persons);
  }

  function renderPersonOptions(selectedId) {
    const sorted = [...persons].sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
    const opts = sorted.map(p => {
      const label = `${personLabel(p)}${p.fakulta ? ` · ${p.fakulta}` : ""}`;
      return `<option value="${html(p.id)}" ${p.id === selectedId ? "selected" : ""}>${html(label)}</option>`;
    }).join("");
    return `<option value="">— vyberte osobu —</option>${opts}`;
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
        persons = JSON.parse(localStorage.getItem(PERSONS_KEY) || "[]");
        if (!Array.isArray(competitions)) competitions = [];
        if (!Array.isArray(persons)) persons = [];
        setStatus("Data v prohlížeči. Pro Supabase spusťte supabase/competitions-schema.sql.");
        return;
      }
      const available = await window.kbSupabaseCompetitions.probeTables();
      if (!available) {
        useSupabase = false;
        competitions = window.kbSupabaseCompetitions.loadLocal();
        persons = window.kbSupabaseCompetitions.loadLocalPersons?.() || [];
        setStatus("Tabulky v Supabase zatím neexistují. Spusťte supabase/competitions-schema.sql.");
        return;
      }
      useSupabase = true;
      competitions = await window.kbSupabaseCompetitions.loadAll();
      try {
        persons = await window.kbSupabaseCompetitions.loadPersons();
      } catch (_) {
        persons = window.kbSupabaseCompetitions.loadLocalPersons?.() || [];
      }
      setStatus(`Načteno ze Supabase: ${competitions.length} běhů, ${persons.length} osob.`);
    } catch (e) {
      console.error(e);
      useSupabase = false;
      competitions = window.kbSupabaseCompetitions?.loadLocal?.() || [];
      persons = window.kbSupabaseCompetitions?.loadLocalPersons?.() || [];
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

  async function importRegaSeed() {
    let seed;
    try {
      const seedRes = await fetch("data/competitions/rega-seed.json");
      if (!seedRes.ok) throw new Error("Soubor rega-seed.json nenalezen.");
      seed = await seedRes.json();
    } catch (err) {
      alert("Šablonu ReGa se nepodařilo načíst: " + (err.message || err));
      return;
    }
    const s = seed.competition;
    const existing = competitions.find(c => c.program_slug === "rega" && c.rok === s.rok && c.beh_cislo === s.beh_cislo);
    if (existing?.applications?.length) {
      if (!confirm("Běh ReGa 2026 už obsahuje přihlášky. Aktualizovat metadata a PDF (pokyn, výzva)? Projekty zůstanou.")) return;
    } else if (existing && !confirm("Běh ReGa 2026 už existuje. Nahradit pokynem a výzvou ze šablony?")) {
      return;
    }
    setStatus("Načítám šablonu UHK ReGa a PDF…");
    loading = true;
    render();
    try {
      const compId = existing?.id || uuid();
      const pokynFile = await fetchPdfAsFile(s.pokyn_file, "pokyn-rega-2026.pdf");
      const vyvzaFile = await fetchPdfAsFile(s.vyvza_file, "vyvza-rega-2026.pdf");
      const api = window.kbSupabaseCompetitions;
      let pokyn = "";
      let vyvza = "";
      if (api?.uploadPdf) {
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
        alokovana_castka: Number(s.alokovana_castka) || 0,
        pokyn,
        pokyn_nazev: s.pokyn_nazev,
        vyvza,
        vyvza_nazev: s.vyvza_nazev,
        poznamka: s.poznamka,
        stav: s.stav || "Aktivní",
        hodnoceni_prodekanu: existing?.hodnoceni_prodekanu || "",
        rozhodnuti_prorektorky: existing?.rozhodnuti_prorektorky || "",
        applications: existing?.applications || [],
        supported: existing?.supported || [],
        created_at: existing?.created_at || new Date().toISOString(),
        __existing: !!existing
      };
      const saved = await saveCompetition(comp);
      activeProgram = "rega";
      activeCompetitionId = saved.id;
      setStatus("Šablona UHK ReGa 2026 načtena včetně PDF pokynu a výzvy. Nyní doplňte projekty.");
    } catch (err) {
      console.error(err);
      alert("Import ReGa selhal: " + (err.message || err));
      setStatus("Import ReGa selhal.", true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:competitions-loaded"));
    }
  }

  function renderRegaBanner() {
    const box = el("competitionRegaBanner");
    if (!box) return;
    if (activeProgram !== "rega") {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const hasRun = competitions.some(c => c.program_slug === "rega" && c.rok === 2026 && c.beh_cislo === 1);
    const sourceUrl = "https://www.uhk.cz/cs/univerzita-hradec-kralove/veda-a-vyzkum/programy-projekty-a-souteze/interni-celouniverzitni-projekty/re_ga_uhk";
    box.innerHTML = `
      <div class="competitionRegaSeedBox">
        <p><strong>UHK ReGa</strong> — interní soutěž pro dopracování nezafinancovaných projektů základního výzkumu.
          Údaje a PDF podle <a href="${sourceUrl}" target="_blank" rel="noopener">oficiální stránky UHK</a>
          (pokyn prorektorky č. 5/2026, výzva č. 1/2026). Projekty doplníte v aplikaci.</p>
        <button type="button" id="importRegaSeedBtn" class="button small accent">${hasRun ? "Aktualizovat šablonu ReGa 2026" : "Načíst šablonu ReGa 2026"}</button>
      </div>`;
    el("importRegaSeedBtn")?.addEventListener("click", importRegaSeed);
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
      const hint = activeProgram === "rega"
        ? `<p class="hint">Zatím žádný běh ReGa. Použijte <strong>Načíst šablonu ReGa 2026</strong> výše (pokyn + výzva v PDF), nebo vytvořte běh ručně.</p>`
        : `<p class="hint">Zatím žádný běh pro ${html(prog.title)}. Klikněte „Nový běh / výzva“.</p>`;
      box.innerHTML = hint;
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
      <thead><tr><th>ID</th><th>Projekt</th><th>Řešitel</th><th>Fakulta</th><th>Katedra</th><th>Požadavek</th><th>Stav</th><th></th></tr></thead>
      <tbody>${apps.map(a => `<tr>
        <td><code class="projektId">${html(a.projekt_id) || "—"}</code></td>
        <td><strong>${html(a.nazev_projektu)}</strong></td>
        <td>${html(resitelDisplay(a))}</td>
        <td>${html(a.fakulta)}</td>
        <td>${html(a.katedra)}</td>
        <td class="money">${fmtMoney(a.financni_pozadavek)}</td>
        <td>${html(a.stav)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-app="${html(a.id)}">Upravit</button>
          <button type="button" class="button small accent" data-promote-app="${html(a.id)}">Podpořit</button>
          <button type="button" class="button small secondary" data-del-app="${html(a.id)}">×</button>
        </td>
      </tr>${a.hodnoceni || a.hodnoceni_komise ? `<tr class="appEvalRow"><td colspan="8">
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

  function fillResitelFromPerson(selectEl) {
    const p = getPerson(selectEl.value);
    if (!p) return;
    if (el("appFakulta")) el("appFakulta").value = p.fakulta || "";
    if (el("appKatedra")) el("appKatedra").value = p.katedra || "";
  }

  function fillSuppResitelFromPerson(selectEl) {
    const p = getPerson(selectEl.value);
    if (!p) return;
    if (el("suppFakulta")) el("suppFakulta").value = p.fakulta || "";
    if (el("suppKatedra")) el("suppKatedra").value = p.katedra || "";
  }

  function openApplicationDialog(compId, appId) {
    const comp = getCompetition(compId);
    if (!comp) return;
    const existing = appId ? (comp.applications || []).find(a => a.id === appId) : null;
    el("appEditId").value = existing?.id || "";
    el("appCompId").value = compId;
    el("appProjektId").value = existing?.projekt_id || suggestProjektId(comp);
    el("appNazev").value = existing?.nazev_projektu || "";
    el("appResitelId").innerHTML = renderPersonOptions(existing?.resitel_id);
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
    const app = {
      id,
      projekt_id: n(el("appProjektId").value),
      nazev_projektu: n(el("appNazev").value) || "Bez názvu",
      resitel_id: resitelId,
      resitel: person ? personLabel(person) : "",
      fakulta: n(el("appFakulta").value),
      katedra: n(el("appKatedra").value),
      financni_pozadavek: Number(el("appCastka").value) || 0,
      hodnoceni: n(el("appHodnoceni").value),
      hodnoceni_komise: n(el("appHodnoceniKomise").value),
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
    el("suppProjektId").value = existing?.projekt_id || "";
    el("suppNazev").value = existing?.nazev_projektu || "";
    el("suppResitelId").innerHTML = renderPersonOptions(existing?.resitel_id);
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
    const item = {
      id,
      projekt_id: n(el("suppProjektId").value),
      nazev_projektu: n(el("suppNazev").value) || "Bez názvu",
      resitel_id: resitelId,
      resitel: person ? personLabel(person) : "",
      fakulta: n(el("suppFakulta").value),
      katedra: n(el("suppKatedra").value),
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
      projekt_id: app.projekt_id,
      nazev_projektu: app.nazev_projektu,
      resitel_id: app.resitel_id,
      resitel: resitelDisplay(app),
      fakulta: app.fakulta,
      katedra: app.katedra,
      castka_podpory: app.financni_pozadavek,
      poznamka: `Z přihlášky: ${app.stav || ""}`,
      created_at: new Date().toISOString()
    };
    await saveCompetition({ ...comp, supported: [...(comp.supported || []), item], __existing: true });
    render();
  }

  function renderPersonsPanel() {
    const box = el("competitionPersonsList");
    if (!box) return;
    if (!persons.length) {
      box.innerHTML = `<p class="hint">Zatím žádné osoby. Přidejte řešitele do databáze — pak je vyberete u přihlášek.</p>`;
      return;
    }
    const sorted = [...persons].sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
    box.innerHTML = `<div class="competitionTableWrap"><table class="competitionTable">
      <thead><tr><th>ID</th><th>Jméno</th><th>E-mail</th><th>Fakulta</th><th>Katedra</th><th></th></tr></thead>
      <tbody>${sorted.map(p => `<tr>
        <td><code class="projektId">${html(p.osobni_cislo) || "—"}</code></td>
        <td><strong>${html(personLabel(p))}</strong></td>
        <td>${html(p.email)}</td>
        <td>${html(p.fakulta)}</td>
        <td>${html(p.katedra)}</td>
        <td class="rowActions">
          <button type="button" class="button small secondary" data-edit-person="${html(p.id)}">Upravit</button>
          <button type="button" class="button small secondary" data-del-person="${html(p.id)}">×</button>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
    box.querySelectorAll("[data-edit-person]").forEach(btn => btn.addEventListener("click", () => openPersonDialog(btn.dataset.editPerson)));
    box.querySelectorAll("[data-del-person]").forEach(btn => btn.addEventListener("click", () => deletePerson(btn.dataset.delPerson)));
  }

  function openPersonDialog(personId) {
    const existing = personId ? getPerson(personId) : null;
    el("personEditId").value = existing?.id || "";
    el("personCislo").value = existing?.osobni_cislo || "";
    el("personTitulPred").value = existing?.titul_pred || "";
    el("personJmeno").value = existing?.jmeno || "";
    el("personPrijmeni").value = existing?.prijmeni || "";
    el("personTitulZa").value = existing?.titul_za || "";
    el("personEmail").value = existing?.email || "";
    el("personTelefon").value = existing?.telefon || "";
    el("personFakulta").value = existing?.fakulta || "";
    el("personKatedra").value = existing?.katedra || "";
    el("personPoznamka").value = existing?.poznamka || "";
    el("personDialogTitle").textContent = existing ? "Upravit osobu" : "Nová osoba";
    el("personDialog").showModal();
  }

  async function savePersonDialog(e) {
    e.preventDefault();
    const id = el("personEditId").value || uuid();
    const existing = getPerson(id);
    const person = {
      id,
      osobni_cislo: n(el("personCislo").value),
      titul_pred: n(el("personTitulPred").value),
      jmeno: n(el("personJmeno").value),
      prijmeni: n(el("personPrijmeni").value),
      titul_za: n(el("personTitulZa").value),
      email: n(el("personEmail").value),
      telefon: n(el("personTelefon").value),
      fakulta: n(el("personFakulta").value),
      katedra: n(el("personKatedra").value),
      poznamka: n(el("personPoznamka").value),
      created_at: existing?.created_at || new Date().toISOString(),
      __existing: !!existing
    };
    if (!person.jmeno || !person.prijmeni) {
      alert("Vyplňte jméno a příjmení.");
      return;
    }
    try {
      if (useSupabase && window.kbSupabaseCompetitions?.savePerson) {
        const saved = await window.kbSupabaseCompetitions.savePerson(person);
        const idx = persons.findIndex(p => p.id === saved.id);
        if (idx === -1) persons.push(saved);
        else persons[idx] = saved;
      } else {
        const idx = persons.findIndex(p => p.id === id);
        if (idx === -1) persons.push(person);
        else persons[idx] = person;
        persistLocalPersons();
      }
      el("personDialog").close();
      renderPersonsPanel();
      render();
    } catch (err) {
      alert("Uložení osoby selhalo: " + (err.message || err));
    }
  }

  async function deletePerson(id) {
    if (!confirm("Smazat osobu z databáze? (Přihlášky si ponechají text řešitele.)")) return;
    try {
      if (useSupabase && window.kbSupabaseCompetitions?.deletePerson) {
        await window.kbSupabaseCompetitions.deletePerson(id);
      }
      persons = persons.filter(p => p.id !== id);
      if (!useSupabase) persistLocalPersons();
      renderPersonsPanel();
      render();
    } catch (err) {
      alert("Smazání selhalo: " + (err.message || err));
    }
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
        <div id="competitionRegaBanner" hidden></div>
      </section>
      <section class="panel competitionPersonsPanel">
        <div class="sectionHeader">
          <div>
            <h3>Databáze osob</h3>
            <p class="hint">Řešitelé projektů — jméno, fakulta, katedra. Vyberete je u přihlášek.</p>
          </div>
          <button type="button" id="newPersonBtn" class="button small accent">+ Osoba</button>
        </div>
        <div id="competitionPersonsList"></div>
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
    el("newPersonBtn").addEventListener("click", () => openPersonDialog());
    renderPersonsPanel();
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
      <dialog id="personDialog">
        <form method="dialog">
          <div class="dialogHeader"><h2 id="personDialogTitle">Nová osoba</h2><button class="iconButton" value="cancel">×</button></div>
          <input type="hidden" id="personEditId" />
          <div class="grid2">
            <label>ID / osobní číslo<input id="personCislo" placeholder="např. OV-001" /></label>
            <label>Titul před<input id="personTitulPred" placeholder="doc., prof." /></label>
            <label>Jméno<input id="personJmeno" required /></label>
            <label>Příjmení<input id="personPrijmeni" required /></label>
            <label>Titul za<input id="personTitulZa" placeholder="Ph.D., CSc." /></label>
            <label>E-mail<input id="personEmail" type="email" /></label>
            <label>Telefon<input id="personTelefon" /></label>
            <label>Fakulta<input id="personFakulta" /></label>
            <label>Katedra<input id="personKatedra" /></label>
          </div>
          <label>Poznámka<textarea id="personPoznamka" rows="2"></textarea></label>
          <div class="dialogActions">
            <button value="cancel" class="button secondary">Zavřít</button>
            <button id="savePersonBtn" type="button" class="button accent">Uložit</button>
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
          <label>Řešitel (z databáze osob)<select id="appResitelId"></select></label>
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
          <label>Řešitel<select id="suppResitelId"></select></label>
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
    el("appResitelId")?.addEventListener("change", (e) => fillResitelFromPerson(e.target));
    el("suppResitelId")?.addEventListener("change", (e) => fillSuppResitelFromPerson(e.target));
    el("saveCompBtn").addEventListener("click", saveCompetitionDialog);
    el("savePersonBtn").addEventListener("click", savePersonDialog);
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
      .projektId { font-size: .82rem; background: #f2f4f7; padding: .1rem .35rem; border-radius: 4px; }
      .appEvalRow td { background: #f8fafc; font-size: .88rem; }
      .appKomiseBlock { margin-top: .5rem; }
      .competitionPersonsPanel { margin-bottom: 1rem; }
      .competitionRegaSeedBox { margin: .75rem 0 0; padding: .85rem 1rem; border: 1px solid var(--line); border-radius: 10px; background: #f0f9ff; }
      .competitionRegaSeedBox p { margin: 0 0 .6rem; line-height: 1.5; }
      @media (max-width: 900px) {
        .competitionLayout, .competitionDocs, .competitionMetrics { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function render() {
    renderProgramTabs();
    renderRegaBanner();
    renderCompetitionList();
    renderCompetitionDetail();
    renderPersonsPanel();
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

  window.kbCompetitions = { PROGRAMS, loadCompetitions, getCompetitions: () => competitions, getPersons: () => persons };

  document.addEventListener("DOMContentLoaded", init);
})();
