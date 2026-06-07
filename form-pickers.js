// Vlastní rozbalovací seznamy – fungují uvnitř dialogu, výběr bez mazání textu.

(function () {
  const PICKER_SELECTOR = "#recordForm select, #topicForm select, #topicAgenda";
  let openMenuState = null;

  function el(id) {
    return document.getElementById(id);
  }

  function n(s) {
    return (s || "").toString().trim();
  }

  function closeOpenMenu() {
    if (!openMenuState) return;
    const { menu, wrap, btn } = openMenuState;
    menu.hidden = true;
    menu.style.position = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.width = "";
    menu.style.zIndex = "";
    if (wrap && menu.parentNode !== wrap) wrap.appendChild(menu);
    if (btn) btn.setAttribute("aria-expanded", "false");
    openMenuState = null;
  }

  function positionMenu(btn, menu) {
    const rect = btn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.zIndex = "10000";
  }

  function chooseOption(select, menu, index) {
    if (index < 0 || index >= select.options.length) return;
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncPicker(select);
    closeOpenMenu();
  }

  function buildMenu(select, menu) {
    menu.innerHTML = "";
    [...select.options].forEach((opt, index) => {
      const li = document.createElement("li");
      li.className = "kb-picker-option";
      li.setAttribute("role", "option");
      li.dataset.index = String(index);
      li.textContent = opt.textContent;

      li.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        chooseOption(select, menu, index);
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
        const selected = Number(li.dataset.index) === select.selectedIndex;
        li.classList.toggle("selected", selected);
        li.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }
    wrap.classList.toggle("ai-filled", select.classList.contains("ai-filled"));
  }

  function openMenu(wrap, select, menu, btn) {
    closeOpenMenu();
    document.body.appendChild(menu);
    positionMenu(btn, menu);
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    openMenuState = { menu, wrap, btn, select };

    const selected = menu.querySelector(".kb-picker-option.selected");
    (selected || menu.firstElementChild)?.scrollIntoView({ block: "nearest" });
  }

  function enhanceSelect(select) {
    if (!select || select.closest(".kb-picker")) return;

    const wrap = document.createElement("div");
    wrap.className = "kb-picker";
    select.classList.add("kb-picker-native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");
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

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (openMenuState?.btn === btn) {
        closeOpenMenu();
        return;
      }
      openMenu(wrap, select, menu, btn);
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

  document.addEventListener("pointerdown", (e) => {
    if (!openMenuState) return;
    if (e.target.closest(".kb-picker-menu") || e.target.closest(".kb-picker-btn")) return;
    closeOpenMenu();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOpenMenu();
  });

  window.addEventListener("resize", closeOpenMenu);
  window.addEventListener("scroll", closeOpenMenu, true);

  window.kbPickers = { enhanceAll, refresh, syncPicker, closeOpenMenu };

  document.addEventListener("DOMContentLoaded", () => {
    enhanceAll();
    setTimeout(enhanceAll, 250);
  });
})();
