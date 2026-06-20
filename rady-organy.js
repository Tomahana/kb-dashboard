// Modul Rady a orgány UHK — evidence orgánů, členů, jednacích řádů, aktualit a AI kontrola personálních změn.

(function () {
  const SEED_URL = "data/organs-seed.json";

  let organs = [];
  let useSupabase = false;
  let loading = false;
  let selectedSlug = "";
  let activeTab = "prehled";
  let pendingAiResult = null;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `organ-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? n(value) : d.toLocaleString("cs-CZ");
  }

  function memberLabel(m) {
    return [m.tituly, m.jmeno].filter(Boolean).join(" ").trim() || "Bez jména";
  }

  function getOrgan(slug) {
    return organs.find((o) => o.slug === slug) || null;
  }

  function getOrganById(id) {
    return organs.find((o) => o.id === id) || null;
  }

  function pendingChecksCount() {
    return organs.reduce((sum, o) => sum + (o.checks || []).filter((c) => c.status === "pending").length, 0);
  }

  function persistLocal() {
    window.kbSupabaseRadyOrgany?.saveLocal?.({ organs });
  }

  function setStatus(text, isError) {
    const node = el("radyOrganyStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("radyOrganyStatusError", !!isError);
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

  function buildSeedOrgan(seed, existing) {
    return {
      id: existing?.id || uuid(),
      slug: seed.slug,
      nazev: seed.nazev,
      url: seed.url,
      ucel_summary: existing?.ucel_summary || seed.ucel_summary || "",
      jednaci_rad_url: existing?.jednaci_rad_url || seed.jednaci_rad_url || seed.url,
      jednaci_rad_text: existing?.jednaci_rad_text || "",
      jednaci_rad_stazeno_at: existing?.jednaci_rad_stazeno_at || null,
      aktuality_url: existing?.aktuality_url || seed.aktuality_url || seed.url,
      aktuality_text: existing?.aktuality_text || "",
      aktuality_stazeno_at: existing?.aktuality_stazeno_at || null,
      poznamka: existing?.poznamka || "",
      members: existing?.members || [],
      checks: existing?.checks || [],
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: existing?.updated_at || new Date().toISOString()
    };
  }

  async function mergeSeedData() {
    let seed = { organs: [] };
    try {
      const res = await fetch(`${SEED_URL}?_${Date.now()}`);
      if (res.ok) seed = await res.json();
    } catch (_) { /* lokální fallback */ }

    const bySlug = new Map(organs.map((o) => [o.slug, o]));
    const merged = (seed.organs || []).map((s) => buildSeedOrgan(s, bySlug.get(s.slug)));
    for (const o of organs) {
      if (!merged.find((m) => m.slug === o.slug)) merged.push(o);
    }
    organs = merged.sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));
    if (!selectedSlug && organs.length) selectedSlug = organs[0].slug;
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    setStatus("Načítám rady a orgány…");
    try {
      const sb = window.kbSupabaseRadyOrgany;
      useSupabase = !!(sb && await sb.probeTables());
      if (useSupabase && await ensureAuth()) {
        organs = await sb.loadAll();
      } else {
        organs = sb?.loadLocal?.().organs || [];
        useSupabase = false;
      }
      await mergeSeedData();
      if (useSupabase && organs.length) {
        for (const organ of organs) {
          if (!organ.__existing) {
            const saved = await sb.upsertOrgan(organ);
            const idx = organs.findIndex((o) => o.slug === organ.slug);
            if (idx !== -1) organs[idx] = { ...saved, members: organ.members, checks: organ.checks };
          }
        }
        persistLocal();
      } else if (!useSupabase) {
        persistLocal();
      }
      setStatus(useSupabase ? `Načteno ${organs.length} orgánů ze Supabase.` : `Načteno ${organs.length} orgánů lokálně.`);
      document.dispatchEvent(new CustomEvent("kb:rady-organy-loaded"));
      window.kbLayout?.updateBadges?.();
      render();
    } catch (error) {
      console.error(error);
      setStatus("Chyba načítání: " + (error.message || error), true);
    } finally {
      loading = false;
    }
  }

  async function saveOrgan(organ) {
    if (useSupabase && window.kbSupabaseRadyOrgany && await ensureAuth()) {
      const saved = await window.kbSupabaseRadyOrgany.upsertOrgan(organ);
      const idx = organs.findIndex((o) => o.id === organ.id);
      if (idx !== -1) organs[idx] = { ...saved, members: organ.members, checks: organ.checks };
    } else {
      const idx = organs.findIndex((o) => o.id === organ.id);
      if (idx !== -1) organs[idx] = { ...organs[idx], ...organ, updated_at: new Date().toISOString() };
      persistLocal();
    }
    document.dispatchEvent(new CustomEvent("kb:rady-organy-loaded"));
    render();
  }

  async function saveMember(organ, member) {
    if (useSupabase && window.kbSupabaseRadyOrgany && await ensureAuth()) {
      const saved = await window.kbSupabaseRadyOrgany.upsertMember(member);
      const idx = organ.members.findIndex((m) => m.id === saved.id);
      if (idx === -1) organ.members.push(saved);
      else organ.members[idx] = saved;
    } else {
      const idx = organ.members.findIndex((m) => m.id === member.id);
      if (idx === -1) organ.members.push(member);
      else organ.members[idx] = { ...organ.members[idx], ...member, updated_at: new Date().toISOString() };
      persistLocal();
    }
    render();
  }

  async function removeMember(organ, memberId) {
    if (useSupabase && window.kbSupabaseRadyOrgany && await ensureAuth()) {
      await window.kbSupabaseRadyOrgany.deleteMember(memberId);
    }
    organ.members = organ.members.filter((m) => m.id !== memberId);
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
      return window.kbPersonLinks.applyPersonLink({ ...member }, matched, "clen");
    }
    return member;
  }

  function memberDisplay(member) {
    return window.kbPersonLinks?.personDisplay?.(member, "clen") || memberLabel(member);
  }

  function renderOrganList() {
    return organs.map((o) => {
      const pending = (o.checks || []).filter((c) => c.status === "pending").length;
      const memberCount = (o.members || []).filter((m) => m.aktivni !== false).length;
      return `
        <button type="button" class="radyOrganItem ${o.slug === selectedSlug ? "active" : ""}" data-organ-slug="${html(o.slug)}">
          <span class="radyOrganItemTitle">${html(o.nazev)}</span>
          <span class="radyOrganItemMeta">${memberCount} členů${pending ? ` · <strong>${pending} AI</strong>` : ""}</span>
        </button>
      `;
    }).join("");
  }

  function renderDocBlock(organ, type) {
    const isJednaci = type === "jednaci";
    const url = isJednaci ? organ.jednaci_rad_url : organ.aktuality_url;
    const text = isJednaci ? organ.jednaci_rad_text : organ.aktuality_text;
    const stazeno = isJednaci ? organ.jednaci_rad_stazeno_at : organ.aktuality_stazeno_at;
    const label = isJednaci ? "Jednací řád" : "Aktuality";
    const field = isJednaci ? "jednaci_rad_text" : "aktuality_text";
    const preview = text ? text.slice(0, 600) + (text.length > 600 ? "…" : "") : "Zatím nestaženo — použijte tlačítko „Stáhnout ze stránky UHK“ nebo vložte text ručně.";

    return `
      <div class="radyDocBlock">
        <div class="radyDocHead">
          <h4>${label}</h4>
          ${url ? `<a href="${html(url)}" target="_blank" rel="noopener" class="radyDocLink">Otevřít na uhk.cz ↗</a>` : ""}
        </div>
        <p class="hint radyDocMeta">Staženo: ${stazeno ? formatDate(stazeno) : "—"} · ${text ? `${text.length.toLocaleString("cs-CZ")} znaků` : "bez obsahu"}</p>
        <div class="radyDocPreview">${html(preview)}</div>
        <div class="radyDocActions">
          <button type="button" class="button secondary" data-fetch-doc="${html(type)}" data-organ-id="${html(organ.id)}">Stáhnout ze stránky UHK</button>
          <button type="button" class="button secondary" data-edit-doc="${html(type)}" data-organ-id="${html(organ.id)}">Upravit / vložit text</button>
        </div>
        <textarea class="radyDocEditor" id="radyDocEditor_${type}_${organ.id}" hidden data-field="${field}" rows="8" placeholder="Vložte text ${label.toLowerCase()}…">${html(text)}</textarea>
        <div class="radyDocEditorActions" id="radyDocEditorActions_${type}_${organ.id}" hidden>
          <button type="button" class="button" data-save-doc="${html(type)}" data-organ-id="${html(organ.id)}">Uložit text</button>
          <button type="button" class="button secondary" data-cancel-doc="${html(type)}" data-organ-id="${html(organ.id)}">Zrušit</button>
        </div>
      </div>
    `;
  }

  function renderMembersTable(organ) {
    const rows = (organ.members || []).slice().sort((a, b) => a.poradi - b.poradi || memberLabel(a).localeCompare(memberLabel(b), "cs"));
    const asMode = window.kbRadyOrganyAnalysis?.isAcademicSenate?.(organ);
    if (!rows.length) {
      return `<p class="hint radyEmpty">Zatím žádní členové. Přidejte je ručně nebo použijte AI kontrolu personálních změn.</p>`;
    }
    return `
      <table class="radyTable">
        <thead>
          <tr>
            <th>Jméno</th>
            <th>Funkce</th>
            ${asMode ? "<th>Fakulta / katedra</th>" : "<th>Pracoviště</th>"}
            <th>Poznámka</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((m) => {
            const profile = window.kbRadyOrganyAnalysis?.resolveMemberProfile?.(m, organ);
            const workCol = asMode
              ? `${profile?.zkr_fak || profile?.fakulta || "—"}${profile?.katedra ? ` · ${profile.katedra}` : ""}`
              : [profile?.pusobiste, profile?.kmenove_pracoviste].filter(Boolean).join(" · ") || "—";
            return `
            <tr data-member-id="${html(m.id)}" class="${m.aktivni === false ? "radyMemberInactive" : ""}${profile && !profile.complete ? " radyRowIncomplete" : ""}">
              <td>
                <strong>${html(memberDisplay(m))}</strong>
                ${m.email ? `<br><span class="hint">${html(m.email)}</span>` : ""}
              </td>
              <td>${html(m.funkce || "—")}</td>
              <td class="${profile && !profile.complete ? "radyCellMissing" : ""}">${html(workCol)}</td>
              <td class="radyNoteCell">${m.poznamka ? html(m.poznamka) : `<span class="hint">—</span>`}</td>
              <td><button type="button" class="button secondary radySmallBtn" data-edit-member="${html(m.id)}">Upravit</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function renderAiChanges(result) {
    if (!result) return "";
    const added = result.pridano || result.added || [];
    const removed = result.odebrano || result.removed || [];
    const changed = result.zmeneno || result.changed || [];
    const summary = result.shrnuti || result.summary || "";

    const list = (items, cls) => items.length
      ? `<ul class="radyChangeList ${cls}">${items.map((i) => `<li>${html(typeof i === "string" ? i : [i.jmeno, i.funkce].filter(Boolean).join(" — "))}</li>`).join("")}</ul>`
      : `<p class="hint">Žádné změny.</p>`;

    return `
      <div class="radyAiResult">
        ${summary ? `<p class="radyAiSummary">${html(summary)}</p>` : ""}
        <div class="radyAiGrid">
          <div><h4>Přidáno (${added.length})</h4>${list(added, "radyAdded")}</div>
          <div><h4>Odebráno (${removed.length})</h4>${list(removed, "radyRemoved")}</div>
          <div><h4>Změna funkce (${changed.length})</h4>${list(changed, "radyChanged")}</div>
        </div>
        ${pendingAiResult ? `
          <div class="radyAiApply">
            <button type="button" class="button" id="radyApplyAiBtn">Aplikovat navržené změny do evidence</button>
            <button type="button" class="button secondary" id="radyDismissAiBtn">Označit jako zkontrolované</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderChecksHistory(organ) {
    const checks = (organ.checks || []).slice(0, 8);
    if (!checks.length) return `<p class="hint">Zatím žádná AI kontrola.</p>`;
    return `
      <ul class="radyChecksList">
        ${checks.map((c) => {
          const r = c.ai_result || {};
          const added = (r.pridano || r.added || []).length;
          const removed = (r.odebrano || r.removed || []).length;
          return `
            <li class="radyCheckItem ${c.status === "pending" ? "pending" : ""}">
              <span>${formatDate(c.checked_at)}</span>
              <span>+${added} / −${removed}</span>
              <span class="radyCheckStatus">${html(c.status)}</span>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function renderDetail() {
    const organ = getOrgan(selectedSlug);
    if (!organ) return `<p class="hint">Vyberte orgán vlevo.</p>`;

    const tabs = [
      { id: "prehled", label: "Přehled" },
      { id: "clenove", label: `Členové (${(organ.members || []).length})` },
      { id: "analyza", label: "Analýza" },
      { id: "ai", label: "AI kontrola změn" }
    ];

    return `
      <div class="radyDetail">
        <div class="radyDetailHead">
          <div>
            <h2>${html(organ.nazev)}</h2>
            ${organ.url ? `<a href="${html(organ.url)}" target="_blank" rel="noopener" class="radyDocLink">Oficiální stránka ↗</a>` : ""}
          </div>
        </div>

        <div class="radyTabs">
          ${tabs.map((t) => `<button type="button" class="radyTab ${activeTab === t.id ? "active" : ""}" data-tab="${t.id}">${html(t.label)}</button>`).join("")}
        </div>

        ${activeTab === "prehled" ? `
          <section class="radyPanel">
            <h3>Účel orgánu</h3>
            <p class="radyPurpose">${html(organ.ucel_summary || "Doplňte stručný popis účelu orgánu.")}</p>
            <button type="button" class="button secondary radySmallBtn" data-edit-purpose="${html(organ.id)}">Upravit popis</button>
          </section>
          <section class="radyPanel radyDocsGrid">
            ${renderDocBlock(organ, "jednaci")}
            ${renderDocBlock(organ, "aktuality")}
          </section>
          <section class="radyPanel">
            <h3>Interní poznámka k orgánu</h3>
            <textarea id="radyOrganNote" rows="3" class="full" placeholder="Vaše poznámky k orgánu…">${html(organ.poznamka)}</textarea>
            <button type="button" class="button secondary" id="radySaveOrganNoteBtn">Uložit poznámku</button>
          </section>
        ` : ""}

        ${activeTab === "clenove" ? `
          <section class="radyPanel">
            <div class="radyPanelHead">
              <h3>Členové a poznámky</h3>
              <button type="button" class="button" id="radyAddMemberBtn">+ Přidat člena</button>
            </div>
            <p class="hint">U každé osoby můžete evidovat poznámku, pracoviště a síťové info. Propojte s modulem Osoby pro automatické kmenové pracoviště.</p>
            ${renderMembersTable(organ)}
          </section>
        ` : ""}

        ${activeTab === "analyza" ? `
          <section class="radyPanel">
            <div id="radyAnalysisMount"></div>
          </section>
        ` : ""}

        ${activeTab === "ai" ? `
          <section class="radyPanel">
            <h3>AI kontrola personálních změn</h3>
            <p class="hint">Stáhněte aktuální obsah stránky orgánu na uhk.cz nebo vložte text ručně. AI porovná seznam členů s vaší evidencí a navrhne změny.</p>
            <label>Text ze stránky orgánu
              <textarea id="radyAiSourceText" rows="10" class="full" placeholder="Vložte text stránky s výpisem členů…">${html(organ.aktuality_text || "")}</textarea>
            </label>
            <div class="radyAiActions">
              <button type="button" class="button secondary" id="radyFetchPageBtn">Stáhnout stránku orgánu</button>
              <button type="button" class="button" id="radyRunAiBtn">Spustit AI kontrolu</button>
            </div>
            <div id="radyAiResultHost">${renderAiChanges(pendingAiResult)}</div>
          </section>
          <section class="radyPanel">
            <h3>Historie kontrol</h3>
            ${renderChecksHistory(organ)}
          </section>
        ` : ""}
      </div>
    `;
  }

  function render() {
    const root = el("radyOrganyRoot");
    if (!root) return;

    const pending = pendingChecksCount();
    root.innerHTML = `
      <div class="radyLayout">
        <aside class="panel radySidebar">
          <div class="sectionHeader">
            <h2>Orgány UHK</h2>
            <p class="hint">Vědecká rada, Správní rada, AS, MPK, Etická komise, Rada pro komercializaci</p>
          </div>
          <div class="radyOrganList">${renderOrganList()}</div>
          ${pending ? `<p class="radyPendingBadge">${pending} AI kontrol čeká na vyřízení</p>` : ""}
        </aside>
        <main class="radyMain">${renderDetail()}</main>
      </div>
      <p id="radyOrganyStatus" class="hint radyStatus"></p>
    `;

    bindEvents();
    if (activeTab === "analyza") mountAnalysis();
  }

  function mountAnalysis() {
    const organ = getOrgan(selectedSlug);
    const mount = el("radyAnalysisMount");
    if (!organ || !mount || !window.kbRadyOrganyAnalysis?.mount) return;
    window.kbRadyOrganyAnalysis.mount(mount, {
      organ,
      onEditMember: (memberId) => {
        const m = organ.members.find((x) => x.id === memberId);
        if (m) openMemberDialog(m, organ);
      },
      onSaveMember: (org, member) => saveMember(org, member),
      onRefresh: () => render(),
      onStatus: (text, isError) => setStatus(text, isError)
    });
  }

  async function runAiPersonnelCheck(organ, sourceText) {
    if (!window.kbAiClassify?.callChat) {
      throw new Error("AI modul není k dispozici. Nastavte API klíč v Nastavení.");
    }
    if (!window.kbAiClassify.hasApiKey?.()) {
      throw new Error("Chybí API klíč. Nastavte ho v Nastavení → AI klasifikace.");
    }

    const currentMembers = (organ.members || []).map((m) => ({
      jmeno: memberLabel(m),
      funkce: m.funkce || "",
      email: m.email || "",
      poznamka: m.poznamka || ""
    }));

    const system = [
      "Jsi asistent pro evidenci univerzitních orgánů UHK.",
      "Porovnej aktuální seznam členů z webové stránky s evidencí v aplikaci.",
      "Vrať POUZE validní JSON objekt v češtině s klíči:",
      "shrnuti (krátké shrnutí změn),",
      "pridano (pole objektů {jmeno, funkce, email}),",
      "odebrano (pole objektů {jmeno, funkce}),",
      "zmeneno (pole objektů {jmeno, stara_funkce, nova_funkce}),",
      "navrzeni_clenove (kompletní aktuální seznam z webu jako pole {jmeno, tituly, funkce, email, fakulta, zkr_fak, katedra, pusobiste, kmenove_pracoviste}).",
      "U Akademického senátu vždy vyplň fakultu a katedru, pokud jsou na stránce uvedeny.",
      "Při porovnávání ignoruj drobné rozdíly v titulech a diakritice."
    ].join(" ");

    const user = JSON.stringify({
      organ: organ.nazev,
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

    const check = {
      id: uuid(),
      organ_id: organ.id,
      checked_at: new Date().toISOString(),
      source_text: sourceText.slice(0, 20000),
      ai_result: result,
      status: "pending"
    };

    if (useSupabase && window.kbSupabaseRadyOrgany && await ensureAuth()) {
      const saved = await window.kbSupabaseRadyOrgany.saveCheck(check);
      organ.checks = [saved, ...(organ.checks || [])];
    } else {
      organ.checks = [check, ...(organ.checks || [])];
      persistLocal();
    }

    pendingAiResult = { ...result, checkId: check.id };
    document.dispatchEvent(new CustomEvent("kb:rady-organy-loaded"));
    window.kbLayout?.updateBadges?.();
    return result;
  }

  async function applyAiChanges(organ) {
    if (!pendingAiResult) return;
    const proposed = pendingAiResult.navrzeni_clenove || [];
    if (!proposed.length) {
      alert("AI nevrátila kompletní seznam členů. Zkontrolujte výsledek ručně.");
      return;
    }
    if (!confirm(`Aplikovat ${proposed.length} členů z webu? Stávající evidence bude nahrazena (poznámky u shodných jmen se pokusíme zachovat).`)) return;

    const noteByName = new Map((organ.members || []).map((m) => [l(memberLabel(m)), m.poznamka]));
    const cisloByName = new Map((organ.members || []).map((m) => [l(memberLabel(m)), m.osobni_cislo]));
    const workplaceByName = new Map((organ.members || []).map((m) => [l(memberLabel(m)), m]));

    organ.members = proposed.map((p, i) => {
      const jmeno = n(p.jmeno) || n(p.name) || "";
      const key = l([p.tituly, jmeno].filter(Boolean).join(" ") || jmeno);
      const prev = workplaceByName.get(key) || {};
      let member = {
        id: uuid(),
        organ_id: organ.id,
        jmeno,
        tituly: n(p.tituly),
        funkce: n(p.funkce || p.role),
        email: n(p.email),
        poznamka: noteByName.get(key) || "",
        fakulta: n(p.fakulta) || n(prev.fakulta),
        zkr_fak: n(p.zkr_fak) || n(prev.zkr_fak),
        katedra: n(p.katedra) || n(prev.katedra),
        pusobiste: n(p.pusobiste) || n(prev.pusobiste),
        kmenove_pracoviste: n(p.kmenove_pracoviste) || n(prev.kmenove_pracoviste),
        sitove_info: n(prev.sitove_info),
        osobni_cislo: cisloByName.get(key) || "",
        poradi: i + 1,
        aktivni: true
      };
      member = linkMemberPerson(member);
      member = enrichMemberFromPerson(member);
      return member;
    });

    if (useSupabase && window.kbSupabaseRadyOrgany && await ensureAuth()) {
      const oldIds = (getOrganById(organ.id)?.members || []).map((m) => m.id);
      for (const id of oldIds) {
        await window.kbSupabaseRadyOrgany.deleteMember(id).catch(() => {});
      }
      for (const m of organ.members) {
        await window.kbSupabaseRadyOrgany.upsertMember(m);
      }
    } else {
      persistLocal();
    }

    if (pendingAiResult.checkId) {
      if (useSupabase && window.kbSupabaseRadyOrgany) {
        await window.kbSupabaseRadyOrgany.updateCheckStatus(pendingAiResult.checkId, "applied");
      } else {
        const c = organ.checks.find((x) => x.id === pendingAiResult.checkId);
        if (c) c.status = "applied";
        persistLocal();
      }
    }

    pendingAiResult = null;
    setStatus("Personální změny aplikovány.");
    document.dispatchEvent(new CustomEvent("kb:rady-organy-loaded"));
    render();
  }

  function enrichMemberFromPerson(member) {
    const person = window.kbPersonLinks?.resolvePerson?.(member, "clen")
      || window.kbPersons?.matchPersonFromRegistry?.({ jmeno: member.jmeno, email: member.email, osobni_cislo: member.osobni_cislo });
    if (!person?.pracoviste || !window.kbRadyOrganyAnalysis) return member;
    const parsed = window.kbRadyOrganyAnalysis.parsePracoviste(person.pracoviste);
    const next = { ...member };
    if (!n(next.fakulta) && parsed.fakulta) next.fakulta = parsed.fakulta;
    if (!n(next.zkr_fak) && parsed.zkr_fak) next.zkr_fak = parsed.zkr_fak;
    if (!n(next.katedra) && parsed.katedra) next.katedra = parsed.katedra;
    if (!n(next.kmenove_pracoviste)) next.kmenove_pracoviste = parsed.kmenove_pracoviste;
    return next;
  }

  function openMemberDialog(member, organ) {
    const dlg = el("radyMemberDialog");
    if (!dlg) return;
    el("radyMemberEditId").value = member?.id || "";
    el("radyMemberOrganId").value = organ.id;
    el("radyMemberJmeno").value = member?.jmeno || "";
    el("radyMemberTituly").value = member?.tituly || "";
    el("radyMemberFunkce").value = member?.funkce || "";
    el("radyMemberEmail").value = member?.email || "";
    el("radyMemberPoznamka").value = member?.poznamka || "";
    el("radyMemberFakulta").value = member?.fakulta || "";
    el("radyMemberZkrFak").value = member?.zkr_fak || "";
    el("radyMemberKatedra").value = member?.katedra || "";
    el("radyMemberPusobiste").value = member?.pusobiste || "";
    el("radyMemberKmen").value = member?.kmenove_pracoviste || "";
    el("radyMemberSitove").value = member?.sitove_info || "";
    el("radyMemberPoradi").value = member?.poradi ?? (organ.members.length + 1);
    el("radyMemberAktivni").checked = member?.aktivni !== false;
    const personId = member?.osobni_cislo
      ? (window.kbPersons?.getPersonByOsobniCislo?.(member.osobni_cislo)?.id || "")
      : "";
    window.kbPersons?.fillSelect?.(el("radyMemberPersonId"), personId);
    window.kbPersons?.setupSearchPicker?.(el("radyMemberPersonId"), personId);
    el("radyMemberDeleteBtn").hidden = !member?.id;
    el("radyMemberDialogTitle").textContent = member ? "Upravit člena" : "Přidat člena";
    dlg.showModal();
  }

  async function saveMemberForm(e) {
    e.preventDefault();
    const organId = el("radyMemberOrganId").value;
    const organ = getOrganById(organId) || getOrgan(selectedSlug);
    if (!organ) return;

    let member = {
      id: el("radyMemberEditId").value || uuid(),
      organ_id: organ.id,
      jmeno: n(el("radyMemberJmeno").value),
      tituly: n(el("radyMemberTituly").value),
      funkce: n(el("radyMemberFunkce").value),
      email: n(el("radyMemberEmail").value),
      poznamka: n(el("radyMemberPoznamka").value),
      fakulta: n(el("radyMemberFakulta").value),
      zkr_fak: n(el("radyMemberZkrFak").value),
      katedra: n(el("radyMemberKatedra").value),
      pusobiste: n(el("radyMemberPusobiste").value),
      kmenove_pracoviste: n(el("radyMemberKmen").value),
      sitove_info: n(el("radyMemberSitove").value),
      poradi: Number(el("radyMemberPoradi").value) || 0,
      aktivni: el("radyMemberAktivni").checked
    };

    const personId = el("radyMemberPersonId")?.value;
    const person = personId ? window.kbPersons?.getPerson?.(personId) : null;
    if (person && window.kbPersonLinks) {
      member = window.kbPersonLinks.applyPersonLink(member, person, "clen");
    } else {
      member.osobni_cislo = "";
    }
    member = enrichMemberFromPerson(member);

    try {
      await saveMember(organ, member);
      el("radyMemberDialog").close();
      setStatus("Člen uložen.");
      render();
    } catch (error) {
      alert("Uložení se nepodařilo: " + (error.message || error));
    }
  }

  function bindDialogs() {
    el("radyMemberForm")?.addEventListener("submit", saveMemberForm);
    el("radyMemberDeleteBtn")?.addEventListener("click", async () => {
      const id = el("radyMemberEditId").value;
      const organ = getOrganById(el("radyMemberOrganId").value);
      if (!id || !organ || !confirm("Smazat tohoto člena?")) return;
      await removeMember(organ, id);
      el("radyMemberDialog").close();
      setStatus("Člen smazán.");
    });
    el("radyMemberPersonId")?.addEventListener("change", () => {
      const person = window.kbPersons?.getPerson?.(el("radyMemberPersonId")?.value);
      if (!person) return;
      if (!n(el("radyMemberJmeno").value)) {
        el("radyMemberJmeno").value = [person.jmeno, person.prijmeni].filter(Boolean).join(" ");
      }
      if (!n(el("radyMemberTituly").value) && person.tituly) el("radyMemberTituly").value = person.tituly;
      if (!n(el("radyMemberEmail").value) && person.email) el("radyMemberEmail").value = person.email;
      const enriched = enrichMemberFromPerson({
        jmeno: el("radyMemberJmeno").value,
        email: person.email,
        osobni_cislo: person.osobni_cislo,
        fakulta: el("radyMemberFakulta").value,
        zkr_fak: el("radyMemberZkrFak").value,
        katedra: el("radyMemberKatedra").value,
        kmenove_pracoviste: el("radyMemberKmen").value
      });
      if (!n(el("radyMemberFakulta").value) && enriched.fakulta) el("radyMemberFakulta").value = enriched.fakulta;
      if (!n(el("radyMemberZkrFak").value) && enriched.zkr_fak) el("radyMemberZkrFak").value = enriched.zkr_fak;
      if (!n(el("radyMemberKatedra").value) && enriched.katedra) el("radyMemberKatedra").value = enriched.katedra;
      if (!n(el("radyMemberKmen").value) && enriched.kmenove_pracoviste) el("radyMemberKmen").value = enriched.kmenove_pracoviste;
    });
    el("radyMemberNewPersonBtn")?.addEventListener("click", () => {
      window.kbPersons?.openNewPersonDialog?.((p) => {
        if (!p) return;
        window.kbPersons.setSelectPersonValue?.(el("radyMemberPersonId"), p.id);
        el("radyMemberPersonId")?.dispatchEvent(new Event("change", { bubbles: true }));
        window.kbPersons.setupSearchPicker?.(el("radyMemberPersonId"), p.id);
      });
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-organ-slug]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedSlug = btn.dataset.organSlug;
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

    el("radyAddMemberBtn")?.addEventListener("click", () => {
      const organ = getOrgan(selectedSlug);
      if (organ) openMemberDialog(null, organ);
    });

    document.querySelectorAll("[data-edit-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const organ = getOrgan(selectedSlug);
        const member = organ?.members.find((m) => m.id === btn.dataset.editMember);
        if (organ && member) openMemberDialog(member, organ);
      });
    });

    el("radySaveOrganNoteBtn")?.addEventListener("click", async () => {
      const organ = getOrgan(selectedSlug);
      if (!organ) return;
      organ.poznamka = el("radyOrganNote")?.value || "";
      await saveOrgan(organ);
      setStatus("Poznámka uložena.");
    });

    el("radyFetchPageBtn")?.addEventListener("click", async () => {
      const organ = getOrgan(selectedSlug);
      if (!organ?.url) return;
      const btn = el("radyFetchPageBtn");
      const prev = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = "Stahuji…";
        const data = await fetchUhkPage(organ.url);
        if (el("radyAiSourceText")) el("radyAiSourceText").value = data.text || "";
        setStatus(`Stránka stažena (${(data.length || 0).toLocaleString("cs-CZ")} znaků).`);
      } catch (error) {
        setStatus(error.message || String(error), true);
        alert("Stažení se nepodařilo. Zkopírujte text stránky ručně do pole výše.\n\n" + (error.message || error));
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("radyRunAiBtn")?.addEventListener("click", async () => {
      const organ = getOrgan(selectedSlug);
      const text = el("radyAiSourceText")?.value || "";
      if (!organ || !n(text)) {
        alert("Vložte nebo stáhněte text stránky orgánu.");
        return;
      }
      const btn = el("radyRunAiBtn");
      const prev = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = "AI analyzuje…";
        await runAiPersonnelCheck(organ, text);
        setStatus("AI kontrola dokončena.");
        render();
      } catch (error) {
        setStatus(error.message || String(error), true);
        alert("AI kontrola selhala: " + (error.message || error));
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("radyApplyAiBtn")?.addEventListener("click", () => {
      const organ = getOrgan(selectedSlug);
      if (organ) applyAiChanges(organ);
    });

    el("radyDismissAiBtn")?.addEventListener("click", async () => {
      const organ = getOrgan(selectedSlug);
      if (!organ || !pendingAiResult?.checkId) return;
      if (useSupabase && window.kbSupabaseRadyOrgany) {
        await window.kbSupabaseRadyOrgany.updateCheckStatus(pendingAiResult.checkId, "reviewed");
      } else {
        const c = organ.checks.find((x) => x.id === pendingAiResult.checkId);
        if (c) c.status = "reviewed";
        persistLocal();
      }
      pendingAiResult = null;
      setStatus("Kontrola označena jako zkontrolovaná.");
      document.dispatchEvent(new CustomEvent("kb:rady-organy-loaded"));
      render();
    });

    document.querySelectorAll("[data-fetch-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const organ = getOrganById(btn.dataset.organId);
        if (!organ) return;
        const type = btn.dataset.fetchDoc;
        const url = type === "jednaci" ? organ.jednaci_rad_url : organ.aktuality_url;
        if (!url) return alert("Chybí URL.");
        btn.disabled = true;
        try {
          const data = await fetchUhkPage(url);
          const now = new Date().toISOString();
          if (type === "jednaci") {
            organ.jednaci_rad_text = data.text || "";
            organ.jednaci_rad_stazeno_at = now;
          } else {
            organ.aktuality_text = data.text || "";
            organ.aktuality_stazeno_at = now;
          }
          await saveOrgan(organ);
          setStatus(`${type === "jednaci" ? "Jednací řád" : "Aktuality"} staženy.`);
        } catch (error) {
          alert("Stažení se nepodařilo: " + (error.message || error));
        } finally {
          btn.disabled = false;
          render();
        }
      });
    });

    document.querySelectorAll("[data-edit-doc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.editDoc;
        const organId = btn.dataset.organId;
        const editor = el(`radyDocEditor_${type}_${organId}`);
        const actions = el(`radyDocEditorActions_${type}_${organId}`);
        if (editor) editor.hidden = false;
        if (actions) actions.hidden = false;
      });
    });

    document.querySelectorAll("[data-cancel-doc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.cancelDoc;
        const organId = btn.dataset.organId;
        el(`radyDocEditor_${type}_${organId}`).hidden = true;
        el(`radyDocEditorActions_${type}_${organId}`).hidden = true;
        render();
      });
    });

    document.querySelectorAll("[data-save-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const organ = getOrganById(btn.dataset.organId);
        if (!organ) return;
        const type = btn.dataset.saveDoc;
        const text = el(`radyDocEditor_${type}_${organ.id}`)?.value || "";
        const now = new Date().toISOString();
        if (type === "jednaci") {
          organ.jednaci_rad_text = text;
          organ.jednaci_rad_stazeno_at = now;
        } else {
          organ.aktuality_text = text;
          organ.aktuality_stazeno_at = now;
        }
        await saveOrgan(organ);
        setStatus("Text uložen.");
        render();
      });
    });

    document.querySelectorAll("[data-edit-purpose]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const organ = getOrganById(btn.dataset.editPurpose);
        if (!organ) return;
        const next = prompt("Stručný popis účelu orgánu:", organ.ucel_summary || "");
        if (next == null) return;
        organ.ucel_summary = n(next);
        await saveOrgan(organ);
        setStatus("Popis účelu uložen.");
        render();
      });
    });
  }

  function injectStyles() {
    if (el("radyOrganyStyles")) return;
    const style = document.createElement("style");
    style.id = "radyOrganyStyles";
    style.textContent = `
      .radyLayout { display: grid; grid-template-columns: minmax(220px, 280px) 1fr; gap: 1rem; align-items: start; }
      @media (max-width: 900px) { .radyLayout { grid-template-columns: 1fr; } }
      .radySidebar { position: sticky; top: .5rem; }
      .radyOrganList { display: grid; gap: .45rem; }
      .radyOrganItem {
        text-align: left; border: 1px solid var(--line); background: white; border-radius: 10px;
        padding: .6rem .75rem; cursor: pointer;
      }
      .radyOrganItem.active { border-color: var(--accent); background: #f5f8ff; }
      .radyOrganItemTitle { display: block; font-weight: 800; font-size: .9rem; }
      .radyOrganItemMeta { display: block; font-size: .78rem; color: var(--muted); margin-top: .15rem; }
      .radyPendingBadge { margin-top: .75rem; font-size: .82rem; font-weight: 700; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: .45rem .6rem; }
      .radyDetailHead { margin-bottom: .75rem; }
      .radyTabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
      .radyTab { border: 1px solid var(--line); background: white; border-radius: 999px; padding: .35rem .85rem; cursor: pointer; font-size: .85rem; }
      .radyTab.active { background: var(--accent); color: white; border-color: var(--accent); }
      .radyPanel { border: 1px solid var(--line); border-radius: 12px; padding: 1rem; background: white; margin-bottom: .85rem; }
      .radyPanelHead { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .5rem; }
      .radyPurpose { line-height: 1.55; margin: .5rem 0 1rem; }
      .radyDocsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; }
      @media (max-width: 800px) { .radyDocsGrid { grid-template-columns: 1fr; } }
      .radyDocBlock { border: 1px solid var(--line); border-radius: 10px; padding: .75rem; background: #f8fafc; }
      .radyDocHead { display: flex; justify-content: space-between; gap: .5rem; align-items: start; }
      .radyDocLink { font-size: .82rem; }
      .radyDocMeta { margin: .35rem 0; }
      .radyDocPreview { font-size: .82rem; color: #344054; max-height: 140px; overflow: auto; white-space: pre-wrap; margin-bottom: .5rem; }
      .radyDocActions, .radyDocEditorActions, .radyAiActions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; }
      .radyDocEditor { width: 100%; margin-top: .5rem; font-family: inherit; }
      .radyTable { width: 100%; border-collapse: collapse; font-size: .88rem; }
      .radyTable th, .radyTable td { border-bottom: 1px solid var(--line); padding: .5rem .4rem; vertical-align: top; }
      .radyNoteCell { max-width: 280px; white-space: pre-wrap; }
      .radyMemberInactive { opacity: .55; }
      .radySmallBtn { font-size: .8rem; padding: .25rem .55rem; }
      .radyAiGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin: .75rem 0; }
      @media (max-width: 800px) { .radyAiGrid { grid-template-columns: 1fr; } }
      .radyChangeList { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .85rem; }
      .radyAdded li { color: #047857; }
      .radyRemoved li { color: #b91c1c; }
      .radyChanged li { color: #b45309; }
      .radyAiSummary { font-weight: 600; margin-bottom: .5rem; }
      .radyChecksList { list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem; }
      .radyCheckItem { display: flex; gap: .75rem; font-size: .82rem; padding: .4rem .55rem; border: 1px solid var(--line); border-radius: 8px; }
      .radyCheckItem.pending { border-color: #fbbf24; background: #fffbeb; }
      .radyStatus { margin-top: .75rem; }
      .radyOrganyStatusError { color: #b91c1c; }
      .radyEmpty { padding: 1rem 0; }
      .radyRowIncomplete { background: #fffbeb; }
      .radyCellMissing { color: #b45309; font-style: italic; }
      .radyAnalysisWrap { display: grid; gap: .85rem; }
      .radyAnalysisTabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .5rem; }
      .radyAnalysisTab { border: 1px solid var(--line); background: white; border-radius: 999px; padding: .35rem .75rem; cursor: pointer; font-size: .82rem; }
      .radyAnalysisTab.active { background: #eef2ff; border-color: var(--accent); font-weight: 700; }
      .radyAnalysisGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .85rem; }
      .radyAnalysisCard { border: 1px solid var(--line); border-radius: 12px; padding: 1rem; background: #f8fafc; }
      .radyAnalysisWide { grid-column: 1 / -1; }
      .radyAnalysisTable { font-size: .82rem; }
      .radyBarChart { display: grid; gap: .35rem; }
      .radyBarRow { display: grid; grid-template-columns: minmax(80px, 1fr) 1fr auto; gap: .45rem; align-items: center; font-size: .82rem; }
      .radyBarLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .radyBarTrack { height: 8px; background: #e4e7ec; border-radius: 999px; overflow: hidden; }
      .radyBarFill { height: 100%; background: var(--accent); border-radius: 999px; }
      .radyBarCount { font-weight: 700; min-width: 1.5rem; text-align: right; }
      .radyFacBlock { margin-bottom: 1rem; }
      .radyKatGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .65rem; margin-top: .5rem; }
      .radyKatBlock { border: 1px solid var(--line); border-radius: 8px; padding: .55rem .65rem; background: white; }
      .radyMemberMiniList { margin: .35rem 0 0; padding-left: 1rem; font-size: .82rem; }
      .radyGapList { list-style: none; padding: 0; margin: 0; display: grid; gap: .65rem; }
      .radyGapItem { border: 1px solid #fde68a; background: #fffbeb; border-radius: 10px; padding: .65rem .75rem; }
      .radyGapTip { margin: .35rem 0 .5rem; }
      .radySrcBadge { font-size: .72rem; font-weight: 700; padding: .1rem .35rem; border-radius: 999px; background: #f2f4f7; }
      .radySrcPerson { background: #dbeafe; color: #1e40af; }
      .radySrcLocal { background: #dcfce7; color: #166534; }
      .radySrcBoth { background: #ede9fe; color: #5b21b6; }
      .radySrcMissing { background: #fee2e2; color: #991b1b; }
      .radyBulletList { margin: .5rem 0; padding-left: 1.2rem; font-size: .88rem; }
      .radyEnrichList { font-size: .85rem; padding-left: 1.1rem; }
      .radyExportArea { font-family: ui-monospace, monospace; font-size: .78rem; }
    `;
    document.head.appendChild(style);
  }

  function injectPage() {
    const host = el("radyOrganyPageRoot");
    if (!host || el("radyOrganyRoot")) return;
    host.innerHTML = `<div id="radyOrganyRoot"></div>`;
  }

  function init() {
    injectStyles();
    injectPage();
    bindDialogs();
    loadData();
    document.addEventListener("kb:page-changed", (e) => {
      if (e.detail?.page === "rady-organy") render();
    });
    document.addEventListener("kb:persons-loaded", () => {
      if (getOrgan(selectedSlug)) render();
    });
  }

  window.kbRadyOrgany = {
    loadData,
    getOrgans: () => organs.slice(),
    getOrgan,
    pendingChecksCount
  };

  document.addEventListener("DOMContentLoaded", init);
})();
