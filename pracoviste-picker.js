// Vyhledávací výběr pracoviště z kb_pracoviste — sdíleno mezi Osoby a Rady a orgány.

(function () {
  const n = (s) => (s || "").toString().trim();
  const html = (s) => n(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function bindPicker(root) {
    if (!root || root.dataset.pracovistePickerBound === "1") return;
    root.dataset.pracovistePickerBound = "1";

    const kodInput = root.querySelector("[data-pracoviste-kod]");
    const labelInput = root.querySelector("[data-pracoviste-label]");
    const searchInput = root.querySelector("[data-pracoviste-search]");
    const results = root.querySelector("[data-pracoviste-results]");
    const chip = root.querySelector("[data-pracoviste-chip]");
    const clearBtn = root.querySelector("[data-pracoviste-clear]");
    const hint = root.querySelector("[data-pracoviste-hint]");

    function renderChip() {
      const kod = n(kodInput?.value);
      if (!kod) {
        if (chip) chip.innerHTML = `<span class="kb-pracoviste-empty">Pracoviště není vybráno z číselníku</span>`;
        return;
      }
      const label = window.kbPracoviste?.displayLabel?.(kod, labelInput?.value) || labelInput?.value || kod;
      if (labelInput && !n(labelInput.value)) labelInput.value = label;
      if (chip) {
        chip.innerHTML = `
          <span class="kb-pracoviste-chip">
            <code>${html(kod)}</code>
            <span>${html(label)}</span>
          </span>`;
      }
    }

    function renderResults(list) {
      if (!results) return;
      if (!list.length) {
        results.innerHTML = `<li class="kb-pracoviste-none">Nic nenalezeno — zkuste název, katedru nebo kodorg</li>`;
        results.hidden = false;
        return;
      }
      results.innerHTML = list.map((item) => `
        <li>
          <button type="button" class="kb-pracoviste-option" data-kodorg="${html(item.kodorg)}">
            <strong>${html(item.nazev)}</strong>
            <span class="hint">${html(item.kodorg)} · ${html(item.cesta || item.nazev_rodic || "")}</span>
          </button>
        </li>`).join("");
      results.hidden = false;
      results.querySelectorAll(".kb-pracoviste-option").forEach((btn) => {
        btn.addEventListener("click", () => selectKodorg(btn.dataset.kodorg));
      });
    }

    function selectKodorg(kodorg) {
      const item = window.kbPracoviste?.getByKodorg?.(kodorg);
      if (kodInput) kodInput.value = kodorg;
      if (labelInput && item) labelInput.value = item.cesta || item.nazev;
      if (searchInput) searchInput.value = item?.nazev || "";
      if (results) results.hidden = true;
      renderChip();
      root.dispatchEvent(new CustomEvent("kb:pracoviste-selected", {
        bubbles: true,
        detail: { kodorg, item }
      }));
      kodInput?.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function clearSelection() {
      if (kodInput) kodInput.value = "";
      if (searchInput) searchInput.value = "";
      if (results) results.hidden = true;
      renderChip();
      root.dispatchEvent(new CustomEvent("kb:pracoviste-cleared", { bubbles: true }));
      kodInput?.dispatchEvent(new Event("change", { bubbles: true }));
    }

    searchInput?.addEventListener("input", () => {
      const q = n(searchInput.value);
      if (q.length < 2) {
        if (results) results.hidden = true;
        return;
      }
      renderResults(window.kbPracoviste?.search?.(q, 15) || []);
    });

    clearBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      clearSelection();
    });

    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) {
        if (results) results.hidden = true;
      }
    });

    document.addEventListener("kb:pracoviste-loaded", () => {
      renderChip();
      if (hint) {
        const count = window.kbPracoviste?.getAll?.().length || 0;
        hint.textContent = count
          ? `${count} pracovišť v číselníku — hledejte podle názvu nebo kodorg`
          : "Číselník pracovišť je prázdný — importujte kb_pracoviste v Supabase.";
      }
    });

    renderChip();
  }

  function createPickerHtml({ kodInputId, labelInputId, labelFieldName = "Kmenové pracoviště (číselník)" } = {}) {
    return `
      <div class="kb-pracoviste-picker" data-pracoviste-picker>
        <label>${html(labelFieldName)}
          <input type="hidden" id="${html(kodInputId)}" data-pracoviste-kod />
          <input type="search" data-pracoviste-search placeholder="Hledat pracoviště (min. 2 znaky)…" autocomplete="off" />
        </label>
        <p class="hint kb-pracoviste-hint" data-pracoviste-hint">Načítám číselník…</p>
        <div data-pracoviste-chip></div>
        <ul class="kb-pracoviste-results" data-pracoviste-results hidden></ul>
        <input type="hidden" id="${html(labelInputId)}" data-pracoviste-label />
        <button type="button" class="button secondary small" data-pracoviste-clear>Vymazat výběr</button>
      </div>`;
  }

  async function setupPicker(root, kodorg) {
    if (!root) return;
    bindPicker(root);
    await window.kbPracoviste?.ensureLoaded?.();
    const kodInput = root.querySelector("[data-pracoviste-kod]");
    const searchInput = root.querySelector("[data-pracoviste-search]");
    const labelInput = root.querySelector("[data-pracoviste-label]");
    if (kodInput) kodInput.value = n(kodorg);
    const item = window.kbPracoviste?.getByKodorg?.(kodorg);
    if (searchInput && item) searchInput.value = item.nazev;
    if (labelInput && item) labelInput.value = item.cesta || item.nazev;
    root.querySelector("[data-pracoviste-chip]")?.dispatchEvent(new Event("refresh"));
    bindPicker(root);
    const chipHost = root.querySelector("[data-pracoviste-chip]");
    if (chipHost && kodInput) {
      const kod = n(kodInput.value);
      if (kod) {
        const label = window.kbPracoviste?.displayLabel?.(kod) || kod;
        chipHost.innerHTML = `<span class="kb-pracoviste-chip"><code>${html(kod)}</code><span>${html(label)}</span></span>`;
      }
    }
  }

  function injectStyles() {
    if (document.getElementById("pracovistePickerStyles")) return;
    const style = document.createElement("style");
    style.id = "pracovistePickerStyles";
    style.textContent = `
      .kb-pracoviste-picker { display: grid; gap: .45rem; margin: .5rem 0; }
      .kb-pracoviste-results { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
      .kb-pracoviste-option { display: grid; gap: .15rem; width: 100%; text-align: left; padding: .45rem .6rem; border: 0; border-bottom: 1px solid var(--line); background: transparent; cursor: pointer; }
      .kb-pracoviste-option:hover { background: #f2f4f7; }
      .kb-pracoviste-option .hint { font-size: .78rem; }
      .kb-pracoviste-none { padding: .5rem .6rem; color: var(--muted); font-size: .85rem; }
      .kb-pracoviste-chip { display: inline-flex; align-items: center; gap: .45rem; padding: .3rem .55rem; background: #ecfdf3; border: 1px solid #abefc6; border-radius: 999px; font-size: .82rem; }
      .kb-pracoviste-chip code { font-size: .75rem; background: #d1fadf; padding: .05rem .3rem; border-radius: 4px; }
      .kb-pracoviste-empty { font-size: .82rem; color: var(--muted); }
    `;
    document.head.appendChild(style);
  }

  window.kbPracovistePicker = {
    createPickerHtml,
    bindPicker,
    setupPicker,
    injectStyles
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    document.querySelectorAll("[data-pracoviste-picker]").forEach(bindPicker);
  });
})();
