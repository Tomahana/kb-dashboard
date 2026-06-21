/**
 * KB záznamy — modul pro tabulku kb_items (Supabase REST).
 */
import { supabaseFetch } from "./supabase-client.js";

const KB_ITEMS_PATH = "kb_items";
const KB_ITEMS_SELECT =
  "id,item_type,title,content,status,priority,evidence,topics,owner,deadline,confidence,source_notion_page_url,created_at";

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

function formatTopics(topics) {
  if (!topics) return [];
  if (Array.isArray(topics)) return topics.map((t) => String(t).trim()).filter(Boolean);
  return String(topics)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatConfidence(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return escapeHtml(String(value));
  return `${Math.round(n * 100)} %`;
}

function detailRow(label, valueHtml) {
  return `
    <div class="kbItemDetailRow">
      <dt>${escapeHtml(label)}</dt>
      <dd>${valueHtml}</dd>
    </div>
  `;
}

function detailTextBlock(text) {
  const value = String(text || "").trim();
  if (!value) return "—";
  return `<pre class="kbItemDetailText">${escapeHtml(value)}</pre>`;
}

function openKbItemDetail(item) {
  const dialog = document.getElementById("kbItemDialog");
  const typeEl = document.getElementById("kbItemDialogType");
  const titleEl = document.getElementById("kbItemDialogTitle");
  const bodyEl = document.getElementById("kbItemDialogBody");
  if (!dialog || !bodyEl) return;

  if (typeEl) typeEl.textContent = item.item_type || "—";
  if (titleEl) titleEl.textContent = item.title || "(bez názvu)";

  const topics = formatTopics(item.topics);
  const topicsHtml = topics.length
    ? `<div class="kbItemDetailTags">${topics.map((t) => `<span class="kbItemDetailTag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "—";

  const notionUrl = String(item.source_notion_page_url || "").trim();
  const notionHtml = notionUrl
    ? `<a class="kbItemDetailLink" href="${escapeHtml(notionUrl)}" target="_blank" rel="noopener noreferrer">Otevřít v Notion →</a>`
    : "—";

  bodyEl.innerHTML = [
    detailRow("Obsah", detailTextBlock(item.content)),
    detailRow("Evidence", detailTextBlock(item.evidence)),
    detailRow("Témata", topicsHtml),
    detailRow("Vlastník", escapeHtml(item.owner || "—")),
    detailRow("Termín", escapeHtml(formatDate(item.deadline))),
    detailRow("Confidence", formatConfidence(item.confidence)),
    detailRow("Notion", notionHtml),
    detailRow("Stav", escapeHtml(item.status || "—")),
    detailRow("Priorita", escapeHtml(item.priority || "—")),
    detailRow("Vytvořeno", escapeHtml(formatDate(item.created_at))),
  ].join("");

  if (typeof dialog.showModal === "function") dialog.showModal();
}

function bindKbItemListClicks() {
  const list = document.getElementById("kbItemsList");
  if (!list || list.__kbItemsBound) return;

  list.addEventListener("click", (e) => {
    const card = e.target.closest(".kbCard");
    if (!card) return;
    const id = card.dataset.id;
    const item = cachedItems.find((row) => String(row.id) === String(id));
    if (item) openKbItemDetail(item);
  });

  list.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".kbCard");
    if (!card) return;
    e.preventDefault();
    const id = card.dataset.id;
    const item = cachedItems.find((row) => String(row.id) === String(id));
    if (item) openKbItemDetail(item);
  });

  list.__kbItemsBound = true;
}

/**
 * Načte záznamy z kb_items.
 * @param {{ item_type?: string, status?: string, priority?: string, search?: string, owner?: string }} filters
 */
export async function loadKbItems(filters = {}) {
  const params = new URLSearchParams();
  params.set("select", KB_ITEMS_SELECT);
  params.set("order", "created_at.desc");

  if (filters.item_type) params.set("item_type", `eq.${filters.item_type}`);
  if (filters.status) params.set("status", `eq.${filters.status}`);
  if (filters.priority) params.set("priority", `eq.${filters.priority}`);
  if (filters.search && String(filters.search).trim()) {
    const term = String(filters.search).trim();
    params.set("title", `ilike.*${term}*`);
  }
  if (filters.owner && String(filters.owner).trim()) {
    const term = String(filters.owner).trim();
    params.set("owner", `ilike.*${term}*`);
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
  const topics = formatTopics(item.topics);
  const topicsHtml = topics.length
    ? `<div class="kbItemTopics">${topics.map((t) => `<span class="topic">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const ownerRaw = String(item.owner || "").trim();
  const ownerHtml = ownerRaw ? `<span class="kbItemOwner">👤 ${escapeHtml(ownerRaw)}</span>` : "";

  return `
    <article
      class="kbCard kbItemCard"
      data-id="${escapeHtml(item.id)}"
      tabindex="0"
      role="button"
      aria-label="Detail záznamu: ${title}"
    >
      <div class="kbItemCardHead">
        <span class="kbItemType">${type}</span>
        <span class="kbItemStatus kbItemStatus--${escapeHtml(String(item.status || "").replace(/\s+/g, "-"))}">${status}</span>
      </div>
      <h3 class="kbItemTitle">${title}</h3>
      ${preview ? `<p class="kbItemPreview">${preview}</p>` : ""}
      ${topicsHtml}
      <div class="kbItemMeta">
        <span>Priorita: ${priority}</span>
        ${ownerHtml}
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
  bindKbItemListClicks();
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
  `;
  document.head.appendChild(style);
}

if (typeof window !== "undefined") {
  injectKbItemsStyles();
  bindKbItemListClicks();
  window.kbItems = {
    loadKbItems,
    renderKbItems,
    getItems: getKbItems,
    getCount: getKbItemsCount,
    getOpenCount: getKbItemsOpenCount,
    openDetail: openKbItemDetail,
  };
}
