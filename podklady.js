// Modul Podklady k jednáním — evidence podkladů, termíny, témata (Supabase).

(function () {
  const STAVY = ["K projednání", "Projednat znovu", "Projednáno", "Archiv"];

  let podklady = [];
  let useSupabase = false;
  let loading = false;

  const el = (id) => document.getElementById(id);
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const uuid = () => crypto.randomUUID?.() || `podklad-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = parseDate(value);
    return d ? d.toLocaleDateString("cs-CZ") : "";
  }

  function stavClass(stav) {
    const map = {
      "K projednání": "stav-k-projednani",
      "Projednat znovu": "stav-projednat-znovu",
      "Projednáno": "stav-projednano",
      "Archiv": "stav-archiv"
    };
    return map[stav] || "";
  }

  function previewText(text, max = 160) {
    const flat = n(text).replace(/\s+/g, " ");
    if (!flat) return "";
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  function persistLocal() {
    window.kbSupabasePodklady?.saveLocalPodklady?.(podklady);
  }

  function setStatus(text, isError) {
    const node = el("podkladyStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("podkladyStatusError", !!isError);
  }

  async function ensureAuth() {
    if (!window.kbAuth?.requireAuth?.()) return true;
    const session = await window.kbAuth.getSession();
    if (session) return true;
    setStatus("Pro Supabase se nejdříve přihlaste v Nastavení.", true);
    return false;
  }

  async function ensureTopicsLoaded() {
    if (window.kbTopics?.loadTopics) {
      try { await window.kbTopics.loadTopics(); } catch (_) {}
    }
  }

  function topicsList() {
    return window.kbTopics?.topics || [];
  }

  function topicName(topicId) {
    if (!topicId) return "";
    return topicsList().find((t) => t.id === topicId)?.name || "";
  }

  function currentFilters() {
    return {
      stav: n(el("podkladyStavFilter")?.value),
      tema: n(el("podkladyTemaFilter")?.value),
      fulltext: n(el("podkladySearch")?.value)
    };
  }

  async function loadPodklady() {
    loading = true;
    render();
    try {
      await ensureTopicsLoaded();
      if (!window.kbSupabasePodklady) {
        useSupabase = false;
        podklady = [];
        setStatus("Datová vrstva není načtená. Zkontrolujte supabase-podklady.js.");
        return;
      }
      const available = await window.kbSupabasePodklady.probeTables();
      if (!available) {
        useSupabase = false;
        podklady = window.kbSupabasePodklady.loadLocalPodklady();
        setStatus("Tabulka podklady_jednani v Supabase zatím neexistuje. Spusťte supabase/podklady-schema.sql.");
        return;
      }
      useSupabase = true;
      if (await ensureAuth()) {
        podklady = await window.kbSupabasePodklady.getAll(currentFilters());
        setStatus(`Načteno ze Supabase: ${podklady.length} podkladů.`);
      }
    } catch (error) {
      console.error(error);
      useSupabase = false;
      podklady = window.kbSupabasePodklady?.loadLocalPodklady?.() || [];
      setStatus(`Chyba načtení: ${error.message || error}`, true);
    } finally {
      loading = false;
      render();
      document.dispatchEvent(new CustomEvent("kb:podklady-loaded"));
    }
  }

  function filteredPodklady() {
    const filters = currentFilters();
    return podklady.filter((item) => {
      if (filters.stav && item.stav !== filters.stav) return false;
      if (filters.tema && item.topic_id !== filters.tema) return false;
      if (filters.fulltext) {
        const q = l(filters.fulltext);
        const hay = l([item.nazev, item.obsah, item.tagy, item.tema_nazev || topicName(item.topic_id)].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function nearestTermin(items) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = items
      .map((item) => parseDate(item.termin_jednani))
      .filter((d) => d && d >= now)
      .sort((a, b) => a - b);
    return future[0] || null;
  }

  function populateTopicFilter() {
    const select = el("podkladyTemaFilter");
    if (!select) return;
    const current = select.value;
    const topics = [...topicsList()].sort((a, b) => (a.name || "").localeCompare(b.name || "", "cs"));
    select.innerHTML = `<option value="">Vše</option>${topics.map((t) =>
      `<option value="${html(t.id)}">${html(t.name)}</option>`
    ).join("")}`;
    select.value = current;
  }

  function populateDialogTopicSelect(selectedId) {
    const select = el("podkladTema");
    if (!select) return;
    const topics = [...topicsList()].sort((a, b) => (a.name || "").localeCompare(b.name || "", "cs"));
    select.innerHTML = `<option value="">— bez tématu —</option>${topics.map((t) =>
      `<option value="${html(t.id)}">${html(t.name)}</option>`
    ).join("")}`;
    select.value = selectedId || "";
  }

  function renderMetrics(items) {
    const total = items.length;
    const kProjednani = items.filter((p) => p.stav === "K projednání").length;
    const znovu = items.filter((p) => p.stav === "Projednat znovu").length;
    const nearest = nearestTermin(items);
    if (el("podkladyTotal")) el("podkladyTotal").textContent = String(total);
    if (el("podkladyKProjednani")) el("podkladyKProjednani").textContent = String(kProjednani);
    if (el("podkladyZnovu")) el("podkladyZnovu").textContent = String(znovu);
    if (el("podkladyNearest")) el("podkladyNearest").textContent = nearest ? formatDate(nearest) : "—";
  }

  function renderCard(item) {
    const tema = item.tema_nazev || topicName(item.topic_id) || "—";
    const tags = n(item.tagy)
      ? item.tagy.split(",").map((t) => `<span class="badge">${html(t.trim())}</span>`).join("")
      : "";
    return `
      <article class="podkladCard" data-podklad-id="${html(item.id)}" tabindex="0" role="button">
        <header class="podkladCardHead">
          <div>
            <h3 class="podkladCardTitle">${html(item.nazev)}</h3>
            <span class="podkladCardMeta">${html(tema)} · ${item.termin_jednani ? formatDate(item.termin_jednani) : "bez termínu"}</span>
          </div>
          <span class="badge podkladStav ${stavClass(item.stav)}">${html(item.stav)}</span>
        </header>
        ${item.obsah ? `<p class="podkladCardPreview">${html(previewText(item.obsah))}</p>` : ""}
        ${tags ? `<div class="podkladCardTags">${tags}</div>` : ""}
        <div class="podkladCardActions">
          <button type="button" class="button small secondary" data-podklad-action="projednano" data-podklad-id="${html(item.id)}">✅ Projednáno</button>
          <button type="button" class="button small secondary" data-podklad-action="znovu" data-podklad-id="${html(item.id)}">🔄 Projednat znovu</button>
          <button type="button" class="button small secondary" data-podklad-action="archiv" data-podklad-id="${html(item.id)}">📦 Archiv</button>
        </div>
      </article>`;
  }

  function renderList() {
    const box = el("podkladyList");
    if (!box) return;
    if (loading) {
      box.innerHTML = `<p class="hint">Načítám podklady…</p>`;
      return;
    }
    const items = filteredPodklady().sort((a, b) => {
      const da = parseDate(a.termin_jednani);
      const db = parseDate(b.termin_jednani);
      if (!da && !db) return n(a.nazev).localeCompare(n(b.nazev), "cs");
      if (!da) return 1;
      if (!db) return -1;
      return da - db || n(a.nazev).localeCompare(n(b.nazev), "cs");
    });
    renderMetrics(podklady);
    if (!items.length) {
      box.innerHTML = `<p class="hint">${podklady.length ? "Žádný podklad nevyhovuje filtrům." : "Zatím žádné podklady — klikněte „Nový podklad“."}</p>`;
      return;
    }
    box.innerHTML = `<div class="podkladyCards">${items.map(renderCard).join("")}</div>`;
  }

  function render() {
    populateTopicFilter();
    renderList();
  }

  function getPodklad(id) {
    return podklady.find((p) => p.id === id) || null;
  }

  function openDialog(existing) {
    const item = existing || {
      nazev: "",
      obsah: "",
      stav: "K projednání",
      termin_jednani: "",
      topic_id: "",
      tagy: ""
    };
    el("podkladEditId").value = existing?.id || "";
    el("podkladNazev").value = item.nazev || "";
    el("podkladObsah").value = item.obsah || "";
    el("podkladStav").value = item.stav || "K projednání";
    el("podkladTermin").value = item.termin_jednani ? String(item.termin_jednani).slice(0, 10) : "";
    populateDialogTopicSelect(item.topic_id);
    el("podkladTagy").value = item.tagy || "";
    el("podkladDialogTitle").textContent = existing ? "Upravit podklad" : "Nový podklad";
    el("podkladDeleteBtn").hidden = !existing;
    el("podkladDialog").showModal();
  }

  function readFormPayload(id, existing) {
    return {
      id,
      nazev: n(el("podkladNazev").value),
      obsah: el("podkladObsah").value || "",
      stav: n(el("podkladStav").value) || "K projednání",
      termin_jednani: el("podkladTermin").value || null,
      topic_id: n(el("podkladTema").value) || null,
      tagy: n(el("podkladTagy").value),
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tema_nazev: topicName(n(el("podkladTema").value))
    };
  }

  async function savePodkladForm(e) {
    e.preventDefault();
    const id = el("podkladEditId").value || uuid();
    const existing = getPodklad(id);
    const payload = readFormPayload(id, existing);
    if (!payload.nazev) {
      alert("Vyplňte název podkladu.");
      return;
    }
    const btn = el("podkladSaveBtn");
    const prev = btn?.textContent;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = useSupabase ? "Ukládám do Supabase…" : "Ukládám…";
      }
      let saved;
      if (useSupabase && window.kbSupabasePodklady && await ensureAuth()) {
        saved = existing
          ? await window.kbSupabasePodklady.update(id, payload)
          : await window.kbSupabasePodklady.create(payload);
      } else {
        saved = { ...payload };
        const idx = podklady.findIndex((p) => p.id === id);
        if (idx === -1) podklady.unshift(saved);
        else podklady[idx] = { ...podklady[idx], ...saved };
        persistLocal();
      }
      const idx = podklady.findIndex((p) => p.id === saved.id);
      if (idx === -1) podklady.unshift(saved);
      else podklady[idx] = { ...podklady[idx], ...saved };
      el("podkladDialog").close();
      setStatus(useSupabase ? "Podklad uložen v Supabase." : "Podklad uložen lokálně.");
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

  async function deletePodklad() {
    const id = el("podkladEditId").value;
    if (!id || !confirm("Opravdu smazat tento podklad?")) return;
    try {
      if (useSupabase && window.kbSupabasePodklady && await ensureAuth()) {
        await window.kbSupabasePodklady.delete(id);
      }
      podklady = podklady.filter((p) => p.id !== id);
      if (!useSupabase) persistLocal();
      el("podkladDialog").close();
      setStatus("Podklad smazán.");
      render();
    } catch (error) {
      alert("Smazání se nepodařilo: " + (error.message || error));
    }
  }

  async function quickSetStav(id, stav) {
    const item = getPodklad(id);
    if (!item || item.stav === stav) return;
    try {
      let saved;
      if (useSupabase && window.kbSupabasePodklady && await ensureAuth()) {
        saved = await window.kbSupabasePodklady.update(id, { ...item, stav });
      } else {
        saved = { ...item, stav, updated_at: new Date().toISOString() };
        const idx = podklady.findIndex((p) => p.id === id);
        if (idx !== -1) podklady[idx] = saved;
        persistLocal();
      }
      const idx = podklady.findIndex((p) => p.id === id);
      if (idx !== -1) podklady[idx] = { ...podklady[idx], ...saved };
      setStatus(`Stav změněn na „${stav}“.`);
      render();
    } catch (error) {
      alert("Změna stavu selhala: " + (error.message || error));
    }
  }

  function bindEvents() {
    el("podkladyNewBtn")?.addEventListener("click", () => openDialog());
    el("podkladyReloadBtn")?.addEventListener("click", loadPodklady);
    el("podkladyStavFilter")?.addEventListener("change", render);
    el("podkladyTemaFilter")?.addEventListener("change", render);
    el("podkladySearch")?.addEventListener("input", () => {
      clearTimeout(bindEvents._searchTimer);
      bindEvents._searchTimer = setTimeout(render, 220);
    });
    el("podkladSaveBtn")?.addEventListener("click", savePodkladForm);
    el("podkladDeleteBtn")?.addEventListener("click", deletePodklad);

    document.addEventListener("click", (e) => {
      const actionBtn = e.target.closest?.("[data-podklad-action]");
      if (actionBtn?.closest("#page-podklady")) {
        e.stopPropagation();
        const id = actionBtn.dataset.podkladId;
        const action = actionBtn.dataset.podkladAction;
        if (action === "projednano") quickSetStav(id, "Projednáno");
        else if (action === "znovu") quickSetStav(id, "Projednat znovu");
        else if (action === "archiv") quickSetStav(id, "Archiv");
        return;
      }
      const card = e.target.closest?.(".podkladCard[data-podklad-id]");
      if (!card || !card.closest("#page-podklady")) return;
      if (e.target.closest("button, input, a, label")) return;
      const item = getPodklad(card.dataset.podkladId);
      if (item) openDialog(item);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest?.(".podkladCard[data-podklad-id]");
      if (!card || !card.closest("#page-podklady")) return;
      const item = getPodklad(card.dataset.podkladId);
      if (item) {
        e.preventDefault();
        openDialog(item);
      }
    });
  }

  function injectPage() {
    const root = el("podkladyRoot");
    if (!root || el("podkladyList")) return;
    root.innerHTML = `
      <section class="panel">
        <div class="sectionHeader">
          <div>
            <h2>Podklady k jednáním</h2>
            <p class="hint">Evidence podkladů, bodů a poznámek k jednáním — vazba na témata a termíny. SQL schéma: <code>supabase/podklady-schema.sql</code>.</p>
          </div>
        </div>
        <div class="podkladyToolbar">
          <button type="button" id="podkladyNewBtn" class="button accent">Nový podklad</button>
          <button type="button" id="podkladyReloadBtn" class="button secondary">Načíst ze Supabase</button>
          <label class="podkladySearchWrap">
            Hledat
            <input id="podkladySearch" type="search" placeholder="Název, obsah, tagy, téma…" />
          </label>
          <label>
            Stav
            <select id="podkladyStavFilter">
              <option value="">Vše</option>
              ${STAVY.map((s) => `<option value="${html(s)}">${html(s)}</option>`).join("")}
            </select>
          </label>
          <label>
            Téma
            <select id="podkladyTemaFilter"><option value="">Vše</option></select>
          </label>
        </div>
        <p id="podkladyStatus" class="podkladyStatus hint">Načítám…</p>
        <div class="podkladyOverview">
          <article class="metric">
            <span id="podkladyTotal">0</span>
            <small>Celkem podkladů</small>
          </article>
          <article class="metric">
            <span id="podkladyKProjednani">0</span>
            <small>K projednání</small>
          </article>
          <article class="metric">
            <span id="podkladyZnovu">0</span>
            <small>Projednat znovu</small>
          </article>
          <article class="metric">
            <span id="podkladyNearest">—</span>
            <small>Nejbližší termín</small>
          </article>
        </div>
        <div id="podkladyList"></div>
      </section>
      <dialog id="podkladDialog">
        <form method="dialog" id="podkladForm">
          <div class="dialogHeader">
            <h2 id="podkladDialogTitle">Nový podklad</h2>
            <button class="iconButton" value="cancel" type="submit">×</button>
          </div>
          <input type="hidden" id="podkladEditId" />
          <label>Název<input id="podkladNazev" required /></label>
          <label>Obsah<textarea id="podkladObsah" rows="10" placeholder="Poznámky, body jednání, text podkladu…"></textarea></label>
          <div class="grid2">
            <label>Stav
              <select id="podkladStav">
                ${STAVY.map((s) => `<option value="${html(s)}">${html(s)}</option>`).join("")}
              </select>
            </label>
            <label>Termín jednání<input id="podkladTermin" type="date" /></label>
          </div>
          <label>Téma
            <select id="podkladTema"><option value="">— bez tématu —</option></select>
          </label>
          <label>Tagy<input id="podkladTagy" placeholder="např. VR, rozpočet, OP JAK" /></label>
          <p class="hint">Tagy oddělte čárkou.</p>
          <div class="dialogActions">
            <button type="button" id="podkladDeleteBtn" class="button danger">Smazat</button>
            <button value="cancel" class="button secondary" type="submit">Zavřít</button>
            <button type="button" id="podkladSaveBtn" class="button accent">Uložit</button>
          </div>
        </form>
      </dialog>
    `;
    bindEvents();
  }

  function injectStyles() {
    if (el("podkladyStyles")) return;
    const style = document.createElement("style");
    style.id = "podkladyStyles";
    style.textContent = `
      .podkladyToolbar { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; margin-bottom: .75rem; }
      .podkladyToolbar label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; min-width: 140px; }
      .podkladySearchWrap { flex: 1; min-width: 220px; }
      .podkladyToolbar input, .podkladyToolbar select { padding: .45rem .6rem; border-radius: 8px; border: 1px solid var(--line); }
      .podkladyStatus { margin: .35rem 0 .75rem; font-size: .88rem; color: var(--muted); }
      .podkladyStatusError { color: #b42318; }
      .podkladyOverview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .9rem; margin-bottom: 1rem; }
      .podkladyCards { display: grid; gap: .65rem; }
      .podkladCard { border: 1px solid var(--line); border-radius: 10px; padding: .75rem .85rem; background: white; cursor: pointer; }
      .podkladCard:hover { background: #f8fafc; border-color: var(--accent); }
      .podkladCardHead { display: flex; justify-content: space-between; gap: .75rem; align-items: start; margin-bottom: .35rem; }
      .podkladCardTitle { margin: 0 0 .15rem; font-size: 1rem; }
      .podkladCardMeta { display: block; font-size: .82rem; color: var(--muted); }
      .podkladCardPreview { margin: .35rem 0; font-size: .9rem; color: var(--muted); line-height: 1.45; }
      .podkladCardTags { display: flex; flex-wrap: wrap; gap: .25rem; margin-bottom: .45rem; }
      .podkladCardActions { display: flex; flex-wrap: wrap; gap: .35rem; }
      .podkladStav.stav-k-projednani { background: #eff8ff; color: #175cd3; }
      .podkladStav.stav-projednat-znovu { background: #fef0c7; color: #b54708; }
      .podkladStav.stav-projednano { background: #ecfdf3; color: #067647; }
      .podkladStav.stav-archiv { background: #f2f4f7; color: #475467; }
      #podkladDialog { max-width: 720px; }
      #podkladDialog form { max-height: 85vh; overflow-y: auto; }
      #podkladObsah { min-height: 180px; resize: vertical; }
      @media (max-width: 900px) {
        .podkladyOverview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    injectPage();
    setTimeout(loadPodklady, 120);
    document.addEventListener("kb:page-changed", async (e) => {
      if (e.detail?.page !== "podklady") return;
      await ensureTopicsLoaded();
      populateTopicFilter();
      if (!podklady.length && !loading) loadPodklady();
      else render();
    });
  }

  window.kbPodklady = {
    loadPodklady,
    getPodklady: () => podklady
  };

  document.addEventListener("DOMContentLoaded", init);
})();
