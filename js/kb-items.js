/**
 * KB záznamy — modul pro tabulku kb_items (Supabase REST).
 */
import { supabaseFetch } from "./supabase-client.js";

const KB_ITEMS_PATH = "kb_items";
const KB_ITEMS_SELECT = "id,item_type,title,content,status,priority,created_at";

let cachedItems = [];

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("cs-CZ");
  } catch {
    return iso;
  }
}

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text).trim();
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/**
 * Načte záznamy z kb_items.
 * @param {{ item_type?: string, status?: string, priority?: string, search?: string }} filters
 */
export async function loadKbItems(filters = {}) {
  const params = new URLSearchParams();
  params.set("select", KB_ITEMS_SELECT);
  params.set("order", "created_at.desc");

  if (filters.item_type) params.set("item_type", `eq.${filters.item_type}`);
  if (filters.status) params.set("status", `eq.${filters.status}`);
  if (filters.priority) params.set("priority", `eq.${filters.priority}`);
  if (filters.search && String(filters.search).trim()) {
    const q = encodeURIComponent(`*${String(filters.search).trim()}*`);
    params.set("or", `(title.ilike.${q},content.ilike.${q})`);
  }

  const path = `${KB_ITEMS_PATH}?${params.toString()}`;
  const data = await supabaseFetch(path);
  return Array.isArray(data) ? data : [];
}

export function renderKbItem(item) {
  const type = escapeHtml(item.item_type || "—");
  const title = escapeHtml(item.title || "(bez názvu)");
  const status = escapeHtml(item.status || "—");
  const priority = escapeHtml(item.priority || "—");
  const preview = escapeHtml(truncate(item.content, 180));
  const created = formatDate(item.created_at);

  return `
    <article class="kbItemCard" data-id="${escapeHtml(item.id)}">
      <div class="kbItemCardHead">
        <span class="kbItemType">${type}</span>
        <span class="kbItemStatus kbItemStatus--${escapeHtml(String(item.status || "").replace(/\s+/g, "-"))}">${status}</span>
      </div>
      <h3 class="kbItemTitle">${title}</h3>
      ${preview ? `<p class="kbItemPreview">${preview}</p>` : ""}
      <div class="kbItemMeta">
        <span>Priorita: ${priority}</span>
        <span>Vytvořeno: ${created}</span>
      </div>
    </article>
  `;
}

export function renderKbItems(items) {
  const el = document.getElementById("kbItemsList");
  if (!el) return;

  setKbItemsCache(items);

  if (!items || items.length === 0) {
    el.innerHTML = '<p class="muted">Žádné záznamy. Zkontrolujte filtry nebo připojení k Supabase (tabulka kb_items).</p>';
    return;
  }

  el.innerHTML = items.map(renderKbItem).join("");
}

function setKbItemsCache(items) {
  cachedItems = Array.isArray(items) ? items.slice() : [];
  try {
    window.dispatchEvent(new CustomEvent("kb:kb-items-loaded", { detail: { count: cachedItems.length } }));
  } catch (_) {}
}

export function getKbItems() {
  return cachedItems.slice();
}

export function getKbItemsCount() {
  return cachedItems.length;
}

export function getKbItemsOpenCount() {
  return cachedItems.filter((i) => {
    const s = String(i.status || "").toLowerCase();
    return !["done", "archived", "closed"].includes(s);
  }).length;
}

function injectKbItemsStyles() {
  if (document.getElementById("kb-items-styles")) return;
  const style = document.createElement("style");
  style.id = "kb-items-styles";
  style.textContent = `
    .kbItemsFilters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin-bottom: 16px; }
    .kbItemsFilters label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; min-width: 160px; }
    .kbItemsFilters select, .kbItemsFilters input[type="search"] { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #ccc); }
    .kbItemsList { display: flex; flex-direction: column; gap: 12px; }
    .kbItemCard { padding: 14px 16px; border: 1px solid var(--border, #ddd); border-radius: 10px; background: var(--card-bg, #fff); }
    .kbItemCardHead { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
    .kbItemType { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted, #666); }
    .kbItemStatus { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip-bg, #eee); }
    .kbItemTitle { margin: 0 0 8px; font-size: 16px; }
    .kbItemPreview { margin: 0 0 8px; font-size: 13px; color: var(--muted, #555); line-height: 1.45; }
    .kbItemMeta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--muted, #777); }
  `;
  document.head.appendChild(style);
}

if (typeof window !== "undefined") {
  injectKbItemsStyles();
  window.kbItems = {
    loadKbItems,
    renderKbItems,
    getItems: getKbItems,
    getCount: getKbItemsCount,
    getOpenCount: getKbItemsOpenCount,
  };
}
