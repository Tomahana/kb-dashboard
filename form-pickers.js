// Vlastní rozbalovací seznamy – fungují uvnitř dialogu na jedno kliknutí.

(function () {
  const PICKER_SELECTOR = "#recordForm select, #topicForm select, #topicAgenda";

  function el(id) {
    return document.getElementById(id);
  }

  function closeAllPickers(except) {
    document.querySelectorAll(".kb-picker-menu").forEach(menu => {
      if (except && menu === except) return;
      menu.hidden = true;
    });
  }

  function buildMenu(select, menu) {
    menu.innerHTML = "";
    [...select.options].forEach(opt => {
      const li = document.createElement("li");
      li.className = "kb-picker-option";
      li.setAttribute("role", "option");
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncPicker(select);
        menu.hidden = true;
      });
      menu.appendChild(li);
    });
  }

  function syncPicker(select) {
    const wrap = select.closest(".kb-picker");
    if (!wrap) return;
    const btn = wrap.querySelector(".kb-picker-btn");
    const valueEl = wrap.querySelector(".kb-picker-value");
    const menu = wrap.querySelector(".kb-picker-menu");
    const opt = select.options[select.selectedIndex];
    const label = opt && n(opt.textContent) ? opt.textContent : "— vyberte —";
    if (valueEl) valueEl.textContent = label;
    if (menu) {
      menu.querySelectorAll(".kb-picker-option").forEach(li => {
        li.classList.toggle("selected", li.dataset.value === select.value);
        li.setAttribute("aria-selected", li.dataset.value === select.value ? "true" : "false");
      });
    }
    if (btn) btn.setAttribute("aria-expanded", menu && !menu.hidden ? "true" : "false");
    wrap.classList.toggle("ai-filled", select.classList.contains("ai-filled"));
  }

  function n(s) {
    return (s || "").toString().trim();
  }

  function enhanceSelect(select) {
    if (!select || select.closest(".kb-picker")) return;

    const wrap = document.createElement("div");
    wrap.className = "kb-picker";
    select.classList.add("kb-picker-native");
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kb-picker-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span class="kb-picker-value">— vyberte —</span><span class="kb-picker-chevron" aria-hidden="true">▾</span>';

    const menu = document.createElement("ul");
    menu.className = "kb-picker-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    wrap.insertBefore(btn, select);
    wrap.appendChild(menu);
    buildMenu(select, menu);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = menu.hidden;
      closeAllPickers(willOpen ? menu : null);
      menu.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) {
        const selected = menu.querySelector(".kb-picker-option.selected");
        (selected || menu.firstElementChild)?.scrollIntoView({ block: "nearest" });
      }
    });

    select.addEventListener("change", () => syncPicker(select));
    syncPicker(select);
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll(PICKER_SELECTOR).forEach(enhanceSelect);
  }

  function refresh(selectId) {
    const select = typeof selectId === "string" ? el(selectId) : selectId;
    if (!select) return;
    if (!select.closest(".kb-picker")) {
      enhanceSelect(select);
      return;
    }
    const menu = select.closest(".kb-picker")?.querySelector(".kb-picker-menu");
    if (menu) buildMenu(select, menu);
    syncPicker(select);
  }

  document.addEventListener("click", () => closeAllPickers());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPickers();
  });

  window.kbPickers = { enhanceAll, refresh, syncPicker };

  document.addEventListener("DOMContentLoaded", () => {
    enhanceAll();
    setTimeout(enhanceAll, 250);
  });
})();
