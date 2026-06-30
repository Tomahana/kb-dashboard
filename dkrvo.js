// Modul DKRVO — evidence pracovišť, kódů a členů (stažení z webu UHK).

(function () {
  const SEED_URL = "data/pracoviste-seed.json";

  let workplaces = [];
  let useSupabase = false;
  let loading = false;
  let selectedKod = "";
  let activeTab = "prehled";
  let searchQuery = "";
  let pendingAiResult = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `wp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const TYP_LABELS = {
    fakulta: "Fakulta",
    katedra: "Katedra",
    ustav: "Ústav",
    jine: "Jiné"
  };

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? n(value) : d.toLocaleString("cs-CZ");
  }

  function memberLabel(m) {
    return [m.tituly, m.jmeno].filter(Boolean).join(" ").trim() || "Bez jména";
  }

  function getWorkplace(kod) {
    return workplaces.find((w) => w.kod === kod) || null;
  }

  function getWorkplaceById(id) {
    return workplaces.find((w) => w.id === id) || null;
  }

  function filteredWorkplaces() {
    const q = l(searchQuery);
    if (!q) return workplaces;
    return workplaces.filter((w) => {
      const hay = [w.kod, w.nazev, w.zkr_fak, w.typ, w.poznamka, TYP_LABELS[w.typ]].map(n).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function persistLocal() {
    window.kbSupabasePracoviste?.saveLocal?.({ workplaces });
  }

  function setStatus(text, isError) {
    const node = el("dkrvoStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("dkrvoStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function fetchUhkPage(url) {
    const base = window.KB_SUPABASE?.url?.replace(/\/$/, "");
    if (!base) throw new Error("Chybí Supabase URL.");
    const session = await window.kbAuth?.getSession?.();
    const token = session?.access_token;
    if (!token) throw new Error("Pro stažení stránky se přihlaste v Nastavení.");

    const res = await fetch(`${base}/functions/v1/uhk-page-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: window.KB_SUPABASE.anonKey
      },
      body: JSON.stringify({ url })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  function buildSeedWorkplace(seed, existing, parentId) {
    return {
      id: existing?.id || uuid(),
      kod: n(seed.kod).toUpperCase(),
      nazev: seed.nazev,
      typ: seed.typ || "katedra",
      zkr_fak: seed.zkr_fak || "",
      url: existing?.url || seed.url || "",
      web_text: existing?.web_text || "",
      web_stazeno_at: existing?.web_stazeno_at || null,
      parent_id: parentId || existing?.parent_id || null,
      poznamka: existing?.poznamka || "",
      poradi: existing?.poradi ?? seed.poradi ?? 0,
      members: existing?.members || [],
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: existing?.updated_at || new Date().toISOString()
    };
  }

  async function mergeSeedData() {
    let seed = { workplaces: [] };
    try {
      const res = await fetch(`${SEED_URL}?_${Date.now()}`);
      if (res.ok) seed = await res.json();
    } catch (_) { /* lokální fallback */ }

    const byKod = new Map(workplaces.map((w) => [w.kod, w]));
    const merged = [];
    const kodToId = new Map();

    for (const s of (seed.workplaces || [])) {
      if (s.typ === "fakulta" || !s.parent_kod) {
        const wp = buildSeedWorkplace(s, byKod.get(n(s.kod).toUpperCase()), null);
        merged.push(wp);
        kodToId.set(wp.kod, wp.id);
      }
    }
    for (const s of (seed.workplaces || [])) {
      if (s.parent_kod) {
        const parentId = kodToId.get(n(s.parent_kod).toUpperCase()) || byKod.get(n(s.parent_kod).toUpperCase())?.id || null;
        const wp = buildSeedWorkplace(s, byKod.get(n(s.kod).toUpperCase()), parentId);
        merged.push(wp);
        kodToId.set(wp.kod, wp.id);
      }
    }
    for (const w of workplaces) {
      if (!merged.find((m) => m.kod === w.kod)) merged.push(w);
    }
    workplaces = merged.sort((a, b) => a.poradi - b.poradi || a.nazev.localeCompare(b.nazev, "cs"));
    if (!selectedKod && workplaces.length) selectedKod = workplaces[0].kod;
    if (selectedKod && !getWorkplace(selectedKod) && workplaces.length) {
      selectedKod = workplaces[0].kod;
    }
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    setStatus("Načítám pracoviště…");
    try {
      const sb = window.kbSupabasePracoviste;
      useSupabase = !!(sb && await sb.probeTables());
      if (useSupabase && await ensureAuth()) {
        workplaces = await sb.loadAll();
      } else {
        workplaces = sb?.loadLocal?.().workplaces || [];
        useSupabase = false;
      }
      await mergeSeedData();
      if (useSupabase && workplaces.length) {
        for (const wp of workplaces) {
          if (!wp.__existing) {
            const saved = await sb.upsertWorkplace(wp);
            const idx = workplaces.findIndex((w) => w.kod === wp.kod);
            if (idx !== -1) workplaces[idx] = { ...saved, members: wp.members };
          }
        }
        persistLocal();
      } else if (!useSupabase) {
        persistLocal();
      }
      setStatus(useSupabase
        ? `Načteno ${workplaces.length} pracovišť ze Supabase.`
        : `Načteno ${workplaces.length} pracovišť lokálně.`);
      document.dispatchEvent(new CustomEvent("kb:dkrvo-loaded"));
      render();
    } catch (error) {
      console.error(error);
      setStatus("Chyba načítání: " + (error.message || error), true);
    } finally {
      loading = false;
    }
  }

  async function saveWorkplace(wp) {
    if (useSupabase && window.kbSupabasePracoviste && await ensureAuth()) {
      const saved = await window.kbSupabasePracoviste.upsertWorkplace(wp);
      const idx = workplaces.findIndex((w) => w.id === wp.id);
      if (idx !== -1) workplaces[idx] = { ...saved, members: wp.members };
    } else {
      const idx = workplaces.findIndex((w) => w.id === wp.id);
      if (idx !== -1) workplaces[idx] = { ...workplaces[idx], ...wp, updated_at: new Date().toISOString() };
      persistLocal();
    }
    document.dispatchEvent(new CustomEvent("kb:dkrvo-loaded"));
    render();
  }

  async function saveMember(wp, member) {
    if (useSupabase && window.kbSupabasePracoviste && await ensureAuth()) {
      const saved = await window.kbSupabasePracoviste.upsertMember(member);
      const idx = wp.members.findIndex((m) => m.id === saved.id);
      if (idx === -1) wp.members.push(saved);
      else wp.members[idx] = saved;
    } else {
      const idx = wp.members.findIndex((m) => m.id === member.id);
      if (idx === -1) wp.members.push(member);
      else wp.members[idx] = { ...wp.members[idx], ...member, updated_at: new Date().toISOString() };
      persistLocal();
    }
    render();
  }

  async function removeMember(wp, memberId) {
    if (useSupabase && window.kbSupabasePracoviste && await ensureAuth()) {
      await window.kbSupabasePracoviste.deleteMember(memberId);
    }
    wp.members = wp.members.filter((m) => m.id !== memberId);
    if (!useSupabase) persistLocal();
    render();
  }

  function linkMemberPerson(member) {
    const matched = window.kbPersons?.matchPersonFromRegistry?.({
      jmeno: member.jmeno,
      prijmeni: member.jmeno?.split(/\s+/).pop(),
      email: member.email
    });
    if (matched && window.kbPersonLinks) {
      return window.kbPersonLinks.applyPersonLink(member, matched, "clen");
    }
    return member;
  }

  function renderWorkplaceList() {
    const list = filteredWorkplaces();
    if (!list.length) {
      return `<p class="hint dkrvoEmpty">${searchQuery ? "Žádné pracoviště neodpovídá hledání." : "Zatím žádná pracoviště."}</p>`;
    }
    return list.map((w) => {
      const parent = w.parent_id ? getWorkplaceById(w.parent_id) : null;
      const memberCount = (w.members || []).filter((m) => m.aktivni !== false).length;
      return `
        <button type="button" class="dkrvoListItem ${w.kod === selectedKod ? "active" : ""}" data-workplace-kod="${html(w.kod)}">
          <span class="dkrvoListKod">${html(w.kod)}</span>
          <span class="dkrvoListNazev">${html(w.nazev)}</span>
          <span class="dkrvoListMeta">${html(w.zkr_fak || "")}${parent ? ` · ${html(parent.kod)}` : ""} · ${memberCount} členů</span>
        </button>
      `;
    }).join("");
  }

  function renderMembersTable(wp) {
    const members = (wp.members || []).slice().sort((a, b) => a.poradi - b.poradi || memberLabel(a).localeCompare(memberLabel(b), "cs"));
    if (!members.length) {
      return `<p class="hint">Zatím žádní členové. Přidejte ručně nebo stáhněte ze stránky pracoviště.</p>`;
    }
    return `
      <table class="dataTable dkrvoMembersTable">
        <thead>
          <tr><th>#</th><th>Jméno</th><th>Funkce</th><th>E-mail</th><th>Osoba</th><th></th></tr>
        </thead>
        <tbody>
          ${members.map((m) => {
            const person = m.osobni_cislo ? window.kbPersons?.getPersonByOsobniCislo?.(m.osobni_cislo) : null;
            return `
              <tr class="${m.aktivni === false ? "inactive" : ""}">
                <td>${m.poradi || "—"}</td>
                <td>${html(memberLabel(m))}${m.poznamka ? `<br><span class="hint">${html(m.poznamka)}</span>` : ""}</td>
                <td>${html(m.funkce || "—")}</td>
                <td>${m.email ? `<a href="mailto:${html(m.email)}">${html(m.email)}</a>` : "—"}</td>
                <td>${person ? `<a href="#osoby" class="link">${html(window.kbPersons?.personLabel?.(person) || m.osobni_cislo)}</a>` : (m.osobni_cislo ? html(m.osobni_cislo) : "—")}</td>
                <td><button type="button" class="button secondary small" data-edit-member="${html(m.id)}">Upravit</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function renderAiChanges(result) {
    if (!result) return "";
    const added = result.pridano || [];
    const removed = result.odebrano || [];
    const changed = result.zmeneno || [];
    return `
      <div class="dkrvoAiResult">
        <p class="dkrvoAiSummary">${html(result.shrnuti || "AI kontrola dokončena.")}</p>
        <div class="dkrvoAiGrid">
          <div><strong>Přidáno (${added.length})</strong><ul class="dkrvoChangeList dkrvoAdded">${added.map((x) => `<li>${html(x.jmeno)}${x.funkce ? ` — ${html(x.funkce)}` : ""}</li>`).join("") || "<li class='hint'>—</li>"}</ul></div>
          <div><strong>Odebráno (${removed.length})</strong><ul class="dkrvoChangeList dkrvoRemoved">${removed.map((x) => `<li>${html(x.jmeno)}</li>`).join("") || "<li class='hint'>—</li>"}</ul></div>
          <div><strong>Změněno (${changed.length})</strong><ul class="dkrvoChangeList dkrvoChanged">${changed.map((x) => `<li>${html(x.jmeno)}: ${html(x.stara_funkce || "?")} → ${html(x.nova_funkce || "?")}</li>`).join("") || "<li class='hint'>—</li>"}</ul></div>
        </div>
        ${(result.navrzeni_clenove || []).length ? `<button type="button" class="button" id="dkrvoApplyAiBtn">Aplikovat ${result.navrzeni_clenove.length} členů z webu</button>` : ""}
      </div>
    `;
  }

  function renderDetail() {
    const wp = getWorkplace(selectedKod);
    if (!wp) {
      return `<section class="panel dkrvoPanel"><p class="hint">Vyberte pracoviště ze seznamu nebo přidejte nové.</p></section>`;
    }
    const parent = wp.parent_id ? getWorkplaceById(wp.parent_id) : null;
  const tabs = [
      { id: "prehled", label: "Přehled" },
      { id: "clenove", label: `Členové (${(wp.members || []).length})` },
      { id: "web", label: "Web a členové" }
    ];

    return `
      <div class="dkrvoDetailHead">
        <div>
          <h2>${html(wp.nazev)}</h2>
          <p class="hint">
            <span class="tag tb">${html(wp.kod)}</span>
            <span class="tag tg">${html(TYP_LABELS[wp.typ] || wp.typ)}</span>
            ${wp.zkr_fak ? `<span class="tag tp">${html(wp.zkr_fak)}</span>` : ""}
            ${parent ? `<span class="hint">Nadřazené: ${html(parent.nazev)} (${html(parent.kod)})</span>` : ""}
          </p>
        </div>
        <button type="button" class="button secondary" id="dkrvoEditWorkplaceBtn">Upravit pracoviště</button>
      </div>
      <nav class="dkrvoTabs" aria-label="Záložky pracoviště">
        ${tabs.map((t) => `<button type="button" class="dkrvoTab ${activeTab === t.id ? "active" : ""}" data-tab="${t.id}">${html(t.label)}</button>`).join("")}
      </nav>

      ${activeTab === "prehled" ? `
        <section class="dkrvoPanel">
          <dl class="dkrvoMeta">
            <dt>Kód DKRVO</dt><dd><code>${html(wp.kod)}</code></dd>
            <dt>Typ</dt><dd>${html(TYP_LABELS[wp.typ] || wp.typ)}</dd>
            <dt>Fakulta</dt><dd>${html(wp.zkr_fak || "—")}</dd>
            <dt>Web</dt><dd>${wp.url ? `<a href="${html(wp.url)}" target="_blank" rel="noopener">${html(wp.url)}</a>` : "—"}</dd>
            <dt>Stránka stažena</dt><dd>${formatDate(wp.web_stazeno_at)}</dd>
            <dt>Členové</dt><dd>${(wp.members || []).filter((m) => m.aktivni !== false).length} aktivních</dd>
          </dl>
          <label>Poznámka
            <textarea id="dkrvoWorkplaceNote" rows="3" class="full">${html(wp.poznamka || "")}</textarea>
          </label>
          <button type="button" class="button secondary" id="dkrvoSaveNoteBtn">Uložit poznámku</button>
        </section>
      ` : ""}

      ${activeTab === "clenove" ? `
        <section class="dkrvoPanel">
          <div class="dkrvoPanelHead">
            <h3>Členové pracoviště</h3>
            <button type="button" class="button" id="dkrvoAddMemberBtn">Přidat člena</button>
          </div>
          <p class="hint">Propojte členy s modulem Osoby pro sledování v dalších částech aplikace.</p>
          ${renderMembersTable(wp)}
        </section>
      ` : ""}

      ${activeTab === "web" ? `
        <section class="dkrvoPanel">
          <h3>Stažení členů z webu</h3>
          <p class="hint">Stáhněte stránku pracoviště z uhk.cz nebo vložte text ručně. AI vytáhne seznam zaměstnanců a porovná ho s evidencí.</p>
          <label>URL stránky pracoviště
            <input type="url" id="dkrvoWebUrl" class="full" value="${html(wp.url || "")}" placeholder="https://www.uhk.cz/...">
          </label>
          <label>Text ze stránky
            <textarea id="dkrvoWebSourceText" rows="10" class="full" placeholder="Vložte text stránky s výpisem zaměstnanců…">${html(wp.web_text || "")}</textarea>
          </label>
          <div class="dkrvoWebActions">
            <button type="button" class="button secondary" id="dkrvoFetchPageBtn">Stáhnout stránku</button>
            <button type="button" class="button secondary" id="dkrvoSaveUrlBtn">Uložit URL</button>
            <button type="button" class="button" id="dkrvoRunAiBtn">Vytáhnout členy (AI)</button>
          </div>
          <div id="dkrvoAiResultHost">${renderAiChanges(pendingAiResult)}</div>
        </section>
      ` : ""}
    `;
  }

  function render() {
    const root = el("dkrvoRoot");
    if (!root) return;

    root.innerHTML = `
      <div class="dkrvoLayout">
        <aside class="panel dkrvoSidebar">
          <div class="sectionHeader">
            <h2>Pracoviště DKRVO</h2>
            <p class="hint">Kódy pracovišť, vyhledávání a členové</p>
          </div>
          <label class="dkrvoSearchLabel">Hledat
            <input type="search" id="dkrvoSearchInput" class="full" placeholder="Kód, název, fakulta…" value="${html(searchQuery)}">
          </label>
          <div class="dkrvoListActions">
            <button type="button" class="button" id="dkrvoAddWorkplaceBtn">Nové pracoviště</button>
          </div>
          <div class="dkrvoWorkplaceList">${renderWorkplaceList()}</div>
          <p class="hint dkrvoListCount">${filteredWorkplaces().length} / ${workplaces.length} pracovišť</p>
        </aside>
        <main class="dkrvoMain">${renderDetail()}</main>
      </div>
      <p id="dkrvoStatus" class="hint dkrvoStatus"></p>
    `;

    bindEvents();
  }

  async function runAiMemberExtraction(wp, sourceText) {
    if (!window.kbAiClassify?.callChat) {
      throw new Error("AI modul není k dispozici. Nastavte API klíč v Nastavení.");
    }
    if (!window.kbAiClassify.hasApiKey?.()) {
      throw new Error("Chybí API klíč. Nastavte ho v Nastavení → AI klasifikace.");
    }

    const currentMembers = (wp.members || []).map((m) => ({
      jmeno: memberLabel(m),
      funkce: m.funkce || "",
      email: m.email || ""
    }));

    const system = [
      "Jsi asistent pro evidenci pracovišť univerzity UHK (DKRVO).",
      "Z textu webové stránky pracoviště vytáhni seznam zaměstnanců / členů katedry nebo fakulty.",
      "Porovnej aktuální seznam s evidencí v aplikaci.",
      "Vrať POUZE validní JSON objekt v češtině s klíči:",
      "shrnuti (krátké shrnutí změn),",
      "pridano (pole objektů {jmeno, funkce, email}),",
      "odebrano (pole objektů {jmeno, funkce}),",
      "zmeneno (pole objektů {jmeno, stara_funkce, nova_funkce}),",
      "navrzeni_clenove (kompletní aktuální seznam z webu jako pole {jmeno, tituly, funkce, email}).",
      "Při porovnávání ignoruj drobné rozdíly v titulech a diakritice."
    ].join(" ");

    const user = JSON.stringify({
      pracoviste: wp.nazev,
      kod: wp.kod,
      evidence: currentMembers,
      web_text: sourceText.slice(0, 50000)
    }, null, 2);

    const content = await window.kbAiClassify.callChat([
      { role: "system", content: system },
      { role: "user", content: user }
    ], { json: true, temperature: 0.1 });

    let result;
    try {
      result = JSON.parse(content);
    } catch (_) {
      const match = content.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { shrnuti: content, pridano: [], odebrano: [], zmeneno: [] };
    }

    pendingAiResult = result;
    return result;
  }

  async function applyAiChanges(wp) {
    if (!pendingAiResult) return;
    const proposed = pendingAiResult.navrzeni_clenove || [];
    if (!proposed.length) {
      alert("AI nevrátila kompletní seznam členů. Zkontrolujte výsledek ručně.");
      return;
    }
    if (!confirm(`Aplikovat ${proposed.length} členů z webu? Stávající evidence bude nahrazena (poznámky u shodných jmen se pokusíme zachovat).`)) return;

    const noteByName = new Map((wp.members || []).map((m) => [l(memberLabel(m)), m.poznamka]));
    const cisloByName = new Map((wp.members || []).map((m) => [l(memberLabel(m)), m.osobni_cislo]));

    wp.members = proposed.map((p, i) => {
      const jmeno = n(p.jmeno) || n(p.name) || "";
      const key = l([p.tituly, jmeno].filter(Boolean).join(" ") || jmeno);
      let member = {
        id: uuid(),
        workplace_id: wp.id,
        jmeno,
        tituly: n(p.tituly),
        funkce: n(p.funkce || p.role),
        email: n(p.email),
        poznamka: noteByName.get(key) || "",
        osobni_cislo: cisloByName.get(key) || "",
        poradi: i + 1,
        aktivni: true
      };
      member = linkMemberPerson(member);
      return member;
    });

    if (useSupabase && window.kbSupabasePracoviste && await ensureAuth()) {
      const oldIds = (getWorkplaceById(wp.id)?.members || []).map((m) => m.id);
      for (const id of oldIds) {
        await window.kbSupabasePracoviste.deleteMember(id).catch(() => {});
      }
      for (const m of wp.members) {
        await window.kbSupabasePracoviste.upsertMember(m);
      }
    } else {
      persistLocal();
    }

    pendingAiResult = null;
    setStatus("Členové z webu aplikováni.");
    document.dispatchEvent(new CustomEvent("kb:dkrvo-loaded"));
    render();
  }

  function openWorkplaceDialog(wp) {
    const dlg = el("dkrvoWorkplaceDialog");
    if (!dlg) return;
    el("dkrvoWorkplaceEditId").value = wp?.id || "";
    el("dkrvoWorkplaceKod").value = wp?.kod || "";
    el("dkrvoWorkplaceNazev").value = wp?.nazev || "";
    el("dkrvoWorkplaceTyp").value = wp?.typ || "katedra";
    el("dkrvoWorkplaceZkrFak").value = wp?.zkr_fak || "";
    el("dkrvoWorkplaceUrl").value = wp?.url || "";
    el("dkrvoWorkplacePoradi").value = wp?.poradi ?? 0;
    const parentSelect = el("dkrvoWorkplaceParent");
    if (parentSelect) {
      const options = ['<option value="">— žádné —</option>']
        .concat(workplaces.filter((w) => w.id !== wp?.id).map((w) =>
          `<option value="${html(w.id)}" ${w.id === wp?.parent_id ? "selected" : ""}>${html(w.kod)} — ${html(w.nazev)}</option>`
        ));
      parentSelect.innerHTML = options.join("");
    }
    el("dkrvoWorkplaceDeleteBtn").hidden = !wp?.id;
    el("dkrvoWorkplaceDialogTitle").textContent = wp ? "Upravit pracoviště" : "Nové pracoviště";
    dlg.showModal();
  }

  async function saveWorkplaceForm(e) {
    e.preventDefault();
    const editId = el("dkrvoWorkplaceEditId").value;
    const kod = n(el("dkrvoWorkplaceKod").value).toUpperCase();
    if (!kod) {
      alert("Kód pracoviště je povinný.");
      return;
    }
    const duplicate = workplaces.find((w) => w.kod === kod && w.id !== editId);
    if (duplicate) {
      alert(`Kód ${kod} už existuje (${duplicate.nazev}).`);
      return;
    }

    let wp = editId ? getWorkplaceById(editId) : null;
    if (!wp) {
      wp = {
        id: uuid(),
        kod,
        members: [],
        created_at: new Date().toISOString()
      };
    }
    wp.kod = kod;
    wp.nazev = n(el("dkrvoWorkplaceNazev").value) || kod;
    wp.typ = el("dkrvoWorkplaceTyp").value || "katedra";
    wp.zkr_fak = n(el("dkrvoWorkplaceZkrFak").value).toUpperCase();
    wp.url = n(el("dkrvoWorkplaceUrl").value);
    wp.parent_id = n(el("dkrvoWorkplaceParent").value) || null;
    wp.poradi = Number(el("dkrvoWorkplacePoradi").value) || 0;

    try {
      await saveWorkplace(wp);
      if (!editId) {
        workplaces.push(wp);
        workplaces.sort((a, b) => a.poradi - b.poradi || a.nazev.localeCompare(b.nazev, "cs"));
        selectedKod = wp.kod;
      }
      el("dkrvoWorkplaceDialog").close();
      setStatus("Pracoviště uloženo.");
      render();
    } catch (error) {
      alert("Uložení se nepodařilo: " + (error.message || error));
    }
  }

  function openMemberDialog(member, wp) {
    const dlg = el("dkrvoMemberDialog");
    if (!dlg) return;
    el("dkrvoMemberEditId").value = member?.id || "";
    el("dkrvoMemberWorkplaceId").value = wp.id;
    el("dkrvoMemberJmeno").value = member?.jmeno || "";
    el("dkrvoMemberTituly").value = member?.tituly || "";
    el("dkrvoMemberFunkce").value = member?.funkce || "";
    el("dkrvoMemberEmail").value = member?.email || "";
    el("dkrvoMemberPoznamka").value = member?.poznamka || "";
    el("dkrvoMemberPoradi").value = member?.poradi ?? (wp.members.length + 1);
    el("dkrvoMemberAktivni").checked = member?.aktivni !== false;
    const personId = member?.osobni_cislo
      ? (window.kbPersons?.getPersonByOsobniCislo?.(member.osobni_cislo)?.id || "")
      : "";
    window.kbPersons?.fillSelect?.(el("dkrvoMemberPersonId"), personId);
    window.kbPersons?.setupSearchPicker?.(el("dkrvoMemberPersonId"), personId);
    el("dkrvoMemberDeleteBtn").hidden = !member?.id;
    el("dkrvoMemberDialogTitle").textContent = member ? "Upravit člena" : "Přidat člena";
    dlg.showModal();
  }

  async function saveMemberForm(e) {
    e.preventDefault();
    const wpId = el("dkrvoMemberWorkplaceId").value;
    const wp = getWorkplaceById(wpId) || getWorkplace(selectedKod);
    if (!wp) return;

    let member = {
      id: el("dkrvoMemberEditId").value || uuid(),
      workplace_id: wp.id,
      jmeno: n(el("dkrvoMemberJmeno").value),
      tituly: n(el("dkrvoMemberTituly").value),
      funkce: n(el("dkrvoMemberFunkce").value),
      email: n(el("dkrvoMemberEmail").value),
      poznamka: n(el("dkrvoMemberPoznamka").value),
      poradi: Number(el("dkrvoMemberPoradi").value) || 0,
      aktivni: el("dkrvoMemberAktivni").checked
    };

    const personId = el("dkrvoMemberPersonId")?.value;
    const person = personId ? window.kbPersons?.getPerson?.(personId) : null;
    if (person && window.kbPersonLinks) {
      member = window.kbPersonLinks.applyPersonLink(member, person, "clen");
    } else {
      member.osobni_cislo = "";
    }

    try {
      await saveMember(wp, member);
      el("dkrvoMemberDialog").close();
      setStatus("Člen uložen.");
      render();
    } catch (error) {
      alert("Uložení se nepodařilo: " + (error.message || error));
    }
  }

  function bindDialogs() {
    el("dkrvoWorkplaceForm")?.addEventListener("submit", saveWorkplaceForm);
    el("dkrvoWorkplaceDeleteBtn")?.addEventListener("click", async () => {
      const id = el("dkrvoWorkplaceEditId").value;
      const wp = getWorkplaceById(id);
      if (!wp || !confirm(`Smazat pracoviště ${wp.kod} — ${wp.nazev}?`)) return;
      if (useSupabase && window.kbSupabasePracoviste && await ensureAuth()) {
        await window.kbSupabasePracoviste.deleteWorkplace(id);
      }
      workplaces = workplaces.filter((w) => w.id !== id);
      if (selectedKod === wp.kod) selectedKod = workplaces[0]?.kod || "";
      if (!useSupabase) persistLocal();
      el("dkrvoWorkplaceDialog").close();
      document.dispatchEvent(new CustomEvent("kb:dkrvo-loaded"));
      setStatus("Pracoviště smazáno.");
      render();
    });

    el("dkrvoMemberForm")?.addEventListener("submit", saveMemberForm);
    el("dkrvoMemberDeleteBtn")?.addEventListener("click", async () => {
      const id = el("dkrvoMemberEditId").value;
      const wp = getWorkplaceById(el("dkrvoMemberWorkplaceId").value);
      if (!id || !wp || !confirm("Smazat tohoto člena?")) return;
      await removeMember(wp, id);
      el("dkrvoMemberDialog").close();
      setStatus("Člen smazán.");
    });
    el("dkrvoMemberPersonId")?.addEventListener("change", () => {
      const person = window.kbPersons?.getPerson?.(el("dkrvoMemberPersonId")?.value);
      if (!person) return;
      if (!n(el("dkrvoMemberJmeno").value)) {
        el("dkrvoMemberJmeno").value = [person.jmeno, person.prijmeni].filter(Boolean).join(" ");
      }
      if (!n(el("dkrvoMemberTituly").value) && person.tituly) el("dkrvoMemberTituly").value = person.tituly;
      if (!n(el("dkrvoMemberEmail").value) && person.email) el("dkrvoMemberEmail").value = person.email;
    });
    el("dkrvoMemberNewPersonBtn")?.addEventListener("click", () => {
      window.kbPersons?.openNewPersonDialog?.((p) => {
        if (!p) return;
        window.kbPersons.setSelectPersonValue?.(el("dkrvoMemberPersonId"), p.id);
        el("dkrvoMemberPersonId")?.dispatchEvent(new Event("change", { bubbles: true }));
        window.kbPersons.setupSearchPicker?.(el("dkrvoMemberPersonId"), p.id);
      });
    });
  }

  function bindEvents() {
    el("dkrvoSearchInput")?.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      render();
    });

    document.querySelectorAll("[data-workplace-kod]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedKod = btn.dataset.workplaceKod;
        pendingAiResult = null;
        render();
      });
    });

    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    el("dkrvoAddWorkplaceBtn")?.addEventListener("click", () => openWorkplaceDialog(null));
    el("dkrvoEditWorkplaceBtn")?.addEventListener("click", () => {
      const wp = getWorkplace(selectedKod);
      if (wp) openWorkplaceDialog(wp);
    });
    el("dkrvoAddMemberBtn")?.addEventListener("click", () => {
      const wp = getWorkplace(selectedKod);
      if (wp) openMemberDialog(null, wp);
    });

    document.querySelectorAll("[data-edit-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wp = getWorkplace(selectedKod);
        const member = wp?.members.find((m) => m.id === btn.dataset.editMember);
        if (wp && member) openMemberDialog(member, wp);
      });
    });

    el("dkrvoSaveNoteBtn")?.addEventListener("click", async () => {
      const wp = getWorkplace(selectedKod);
      if (!wp) return;
      wp.poznamka = el("dkrvoWorkplaceNote")?.value || "";
      await saveWorkplace(wp);
      setStatus("Poznámka uložena.");
    });

    el("dkrvoSaveUrlBtn")?.addEventListener("click", async () => {
      const wp = getWorkplace(selectedKod);
      if (!wp) return;
      wp.url = n(el("dkrvoWebUrl")?.value);
      await saveWorkplace(wp);
      setStatus("URL uložena.");
    });

    el("dkrvoFetchPageBtn")?.addEventListener("click", async () => {
      const wp = getWorkplace(selectedKod);
      const url = n(el("dkrvoWebUrl")?.value) || wp?.url;
      if (!url) return;
      const btn = el("dkrvoFetchPageBtn");
      const prev = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = "Stahuji…";
        const data = await fetchUhkPage(url);
        const text = data.text || "";
        if (el("dkrvoWebSourceText")) el("dkrvoWebSourceText").value = text;
        if (wp) {
          wp.url = url;
          wp.web_text = text;
          wp.web_stazeno_at = new Date().toISOString();
          await saveWorkplace(wp);
        }
        setStatus(`Stránka stažena (${(data.length || text.length || 0).toLocaleString("cs-CZ")} znaků).`);
      } catch (error) {
        setStatus(error.message || String(error), true);
        alert("Stažení se nepodařilo. Zkopírujte text stránky ručně.\n\n" + (error.message || error));
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("dkrvoRunAiBtn")?.addEventListener("click", async () => {
      const wp = getWorkplace(selectedKod);
      const sourceText = el("dkrvoWebSourceText")?.value || "";
      if (!wp || !n(sourceText)) {
        alert("Nejdříve stáhněte nebo vložte text stránky.");
        return;
      }
      const btn = el("dkrvoRunAiBtn");
      const prev = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = "Analyzuji…";
        await runAiMemberExtraction(wp, sourceText);
        setStatus("AI analýza dokončena.");
        render();
      } catch (error) {
        setStatus(error.message || String(error), true);
        alert("AI analýza selhala: " + (error.message || error));
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("dkrvoApplyAiBtn")?.addEventListener("click", async () => {
      const wp = getWorkplace(selectedKod);
      if (wp) await applyAiChanges(wp);
    });
  }

  function injectStyles() {
    if (el("dkrvoStyles")) return;
    const style = document.createElement("style");
    style.id = "dkrvoStyles";
    style.textContent = `
      .dkrvoLayout { display: grid; grid-template-columns: minmax(240px, 300px) 1fr; gap: 1rem; align-items: start; }
      @media (max-width: 900px) { .dkrvoLayout { grid-template-columns: 1fr; } }
      .dkrvoSidebar { position: sticky; top: .5rem; }
      .dkrvoSearchLabel { display: block; margin: .75rem 0; }
      .dkrvoListActions { margin-bottom: .5rem; }
      .dkrvoWorkplaceList { display: grid; gap: .35rem; max-height: 55vh; overflow: auto; }
      .dkrvoListItem { display: grid; gap: .15rem; text-align: left; padding: .55rem .65rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); cursor: pointer; }
      .dkrvoListItem:hover, .dkrvoListItem.active { border-color: var(--accent); background: #f0f9ff; }
      .dkrvoListKod { font-weight: 700; font-size: .85rem; font-family: monospace; }
      .dkrvoListNazev { font-size: .88rem; }
      .dkrvoListMeta { font-size: .75rem; color: var(--muted); }
      .dkrvoListCount { margin-top: .5rem; font-size: .78rem; }
      .dkrvoDetailHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .75rem; }
      .dkrvoTabs { display: flex; gap: .35rem; margin-bottom: .75rem; flex-wrap: wrap; }
      .dkrvoTab { padding: .4rem .75rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); cursor: pointer; font-size: .85rem; }
      .dkrvoTab.active { border-color: var(--accent); background: #eff6ff; font-weight: 600; }
      .dkrvoPanel { border: 1px solid var(--line); border-radius: 10px; padding: 1rem; background: var(--panel); }
      .dkrvoPanelHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
      .dkrvoMeta { display: grid; grid-template-columns: 140px 1fr; gap: .35rem .75rem; margin-bottom: 1rem; font-size: .88rem; }
      .dkrvoMeta dt { color: var(--muted); }
      .dkrvoWebActions { display: flex; gap: .5rem; flex-wrap: wrap; margin: .75rem 0; }
      .dkrvoAiGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin: .75rem 0; }
      @media (max-width: 800px) { .dkrvoAiGrid { grid-template-columns: 1fr; } }
      .dkrvoChangeList { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .85rem; }
      .dkrvoAdded li { color: #047857; }
      .dkrvoRemoved li { color: #b91c1c; }
      .dkrvoChanged li { color: #b45309; }
      .dkrvoAiSummary { font-weight: 600; margin-bottom: .5rem; }
      .dkrvoStatus { margin-top: .75rem; }
      .dkrvoStatusError { color: #b91c1c; }
      .dkrvoEmpty { padding: .5rem 0; }
      .dkrvoMembersTable tr.inactive { opacity: .55; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("dkrvoPageRoot");
    if (!host || el("dkrvoRoot")) return;
    host.innerHTML = `<div id="dkrvoRoot"></div>`;
  }

  function init() {
    injectStyles();
    injectPage();
    bindDialogs();
    loadData();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "modul-dkrvo") render();
    });
    document.addEventListener("kb:persons-loaded", () => {
      if (getWorkplace(selectedKod)) render();
    });
  }

  window.kbDkrvo = {
    loadData,
    getWorkplaces: () => workplaces.slice(),
    getWorkplace,
    searchWorkplaces: (q) => {
      const prev = searchQuery;
      searchQuery = q || "";
      const result = filteredWorkplaces();
      searchQuery = prev;
      return result;
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
