/**
 * KB záznamy — modul pro tabulku kb_items (Supabase REST + úpravy + ClickUp).
 */
import { supabaseFetch } from "./supabase-client.js";

const KB_ITEMS_PATH = "kb_items";
const KB_ITEMS_SELECT =
  "id,item_type,title,content,status,priority,evidence,topics,owner,deadline,confidence,source_notion_page_url,notion_page_id,created_at,updated_at";

let cachedItems = [];
let dialogBound = false;

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSupabaseClient() {
  if (window.kbAuth?.getClient) return window.kbAuth.getClient();
  throw new Error("Supabase klient není k dispozici — přihlaste se.");
}

async function requireSession() {
  const supa = getSupabaseClient();
  const { data: { session } } = await supa.auth.getSession();
  if (!session) throw new Error("Pro úpravu záznamů je nutné přihlášení.");
  return supa;
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

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

function topicsToInputValue(topics) {
  return formatTopics(topics).join(", ");
}

function parseTopicsInput(value) {
  return formatTopics(value);
}

function mapKbItemPriorityClickUp(priority) {
  const p = String(priority || "").toUpperCase();
  if (p === "CRITICAL") return { clickup: 1, label: "Critical" };
  if (p === "HIGH") return { clickup: 2, label: "High" };
  if (p === "LOW") return { clickup: 4, label: "Low" };
  return { clickup: 3, label: "Medium" };
}

function buildClickUpTaskFromKbItem(item) {
  const notionUrl = String(item.source_notion_page_url || "").trim();
  const description = [
    String(item.content || "").trim(),
    String(item.evidence || "").trim() && `**Evidence:** ${item.evidence}`,
    String(item.owner || "").trim() && `**Vlastník:** ${item.owner}`,
    formatTopics(item.topics).length && `**Témata:** ${formatTopics(item.topics).join(", ")}`,
    notionUrl && `**Zdroj:** ${notionUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title: String(item.title || "KB záznam").slice(0, 500),
    description,
    dueDateMs: item.deadline ? new Date(item.deadline).getTime() : null,
    priority: mapKbItemPriorityClickUp(item.priority),
  };
}

function setDialogStatus(message, isError = false) {
  const el = document.getElementById("kbItemDialogStatus");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("kbItemDialogStatus--error", isError);
}

function readKbItemFormValues() {
  const confidenceRaw = document.getElementById("kbItemEditConfidence")?.value;
  let confidence = null;
  if (confidenceRaw !== "" && confidenceRaw != null) {
    const n = Number(confidenceRaw);
    confidence = Number.isFinite(n) ? n : null;
  }

  return {
    item_type: document.getElementById("kbItemEditItemType")?.value || "KNOWLEDGE",
    title: String(document.getElementById("kbItemEditTitle")?.value || "").trim(),
    content: String(document.getElementById("kbItemEditContent")?.value || "").trim() || null,
    evidence: String(document.getElementById("kbItemEditEvidence")?.value || "").trim() || null,
    status: document.getElementById("kbItemEditStatus")?.value || "open",
    priority: document.getElementById("kbItemEditPriority")?.value || "MEDIUM",
    topics: parseTopicsInput(document.getElementById("kbItemEditTopics")?.value),
    owner: String(document.getElementById("kbItemEditOwner")?.value || "").trim() || null,
    deadline: fromDatetimeLocalValue(document.getElementById("kbItemEditDeadline")?.value),
    confidence,
  };
}

function fillKbItemForm(item) {
  const isNew = !item?.id;
  document.getElementById("kbItemEditId").value = item?.id || "";
  document.getElementById("kbItemEditItemType").value = item?.item_type || "KNOWLEDGE";
  document.getElementById("kbItemEditTitle").value = item?.title || "";
  document.getElementById("kbItemEditContent").value = item?.content || "";
  document.getElementById("kbItemEditEvidence").value = item?.evidence || "";
  document.getElementById("kbItemEditStatus").value = item?.status || "open";
  document.getElementById("kbItemEditPriority").value = item?.priority || "MEDIUM";
  document.getElementById("kbItemEditTopics").value = topicsToInputValue(item?.topics);
  document.getElementById("kbItemEditOwner").value = item?.owner || "";
  document.getElementById("kbItemEditDeadline").value = toDatetimeLocalValue(item?.deadline);
  document.getElementById("kbItemEditConfidence").value =
    item?.confidence == null || item?.confidence === "" ? "" : String(item.confidence);

  const typeEl = document.getElementById("kbItemDialogType");
  const titleEl = document.getElementById("kbItemDialogTitle");
  if (typeEl) typeEl.textContent = isNew ? "NOVÝ" : (item.item_type || "—");
  if (titleEl) titleEl.textContent = isNew ? "Nový KB záznam" : (item.title || "(bez názvu)");

  const notionEl = document.getElementById("kbItemEditNotion");
  const createdEl = document.getElementById("kbItemEditCreated");
  const notionUrl = String(item?.source_notion_page_url || "").trim();
  if (notionEl) {
    notionEl.innerHTML = notionUrl
      ? `Notion: <a class="kbItemDetailLink" href="${escapeHtml(notionUrl)}" target="_blank" rel="noopener noreferrer">Otevřít →</a>`
      : isNew
        ? "Ručně vytvořený záznam (bez Notion zdroje)."
        : "Bez odkazu na Notion.";
  }
  if (createdEl) {
    createdEl.textContent = item?.created_at
      ? `Vytvořeno: ${formatDate(item.created_at)}${item.updated_at ? ` · Upraveno: ${formatDate(item.updated_at)}` : ""}`
      : "";
  }

  setDialogStatus("");
}

function getEditingItemFromForm() {
  const id = document.getElementById("kbItemEditId")?.value || "";
  const formValues = readKbItemFormValues();
  const cached = id ? cachedItems.find((row) => String(row.id) === String(id)) : null;
  return {
    ...(cached || {}),
    ...formValues,
    id: id || cached?.id,
  };
}

async function saveKbItemFromForm() {
  const id = document.getElementById("kbItemEditId")?.value || "";
  const payload = readKbItemFormValues();
  if (!payload.title) throw new Error("Vyplňte název záznamu.");

  const supa = await requireSession();

  if (id) {
    const { data, error } = await supa
      .from(KB_ITEMS_PATH)
      .update(payload)
      .eq("id", id)
      .select(KB_ITEMS_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  const insertPayload = {
    ...payload,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supa
    .from(KB_ITEMS_PATH)
    .insert(insertPayload)
    .select(KB_ITEMS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function exportKbItemToClickUp(item) {
  const exportApi = window.kbTaskExport;
  if (!exportApi?.exportToClickUp) {
    throw new Error("Modul exportu úkolů není načten.");
  }
  const settings = exportApi.loadSettings?.() || {};
  if (!settings.clickup?.apiToken || !settings.clickup?.listId) {
    exportApi.openSettingsDialog?.();
    throw new Error("Nejdříve doplňte ClickUp token a List ID v Nastavení.");
  }
  return exportApi.exportToClickUp(buildClickUpTaskFromKbItem(item), settings);
}

function bindKbItemDialog() {
  if (dialogBound) return;

  const saveBtn = document.getElementById("kbItemSaveBtn");
  const clickUpBtn = document.getElementById("kbItemClickUpBtn");
  const form = document.getElementById("kbItemForm");

  saveBtn?.addEventListener("click", async () => {
    saveBtn.disabled = true;
    setDialogStatus("Ukládám…");
    try {
      const saved = await saveKbItemFromForm();
      const idx = cachedItems.findIndex((row) => String(row.id) === String(saved.id));
      if (idx >= 0) cachedItems[idx] = saved;
      else cachedItems.unshift(saved);
      renderKbItems(cachedItems);
      fillKbItemForm(saved);
      document.getElementById("kbItemEditId").value = saved.id;
      setDialogStatus("Uloženo.");
    } catch (err) {
      setDialogStatus(err.message || String(err), true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  clickUpBtn?.addEventListener("click", async () => {
    clickUpBtn.disabled = true;
    setDialogStatus("Odesílám do ClickUp…");
    try {
      const item = getEditingItemFromForm();
      if (!item.title) throw new Error("Vyplňte název před exportem do ClickUp.");
      const result = await exportKbItemToClickUp(item);
      const msg = result?.message || "Úkol vytvořen v ClickUp.";
      setDialogStatus(msg);
      if (result?.url) window.open(result.url, "_blank", "noopener");
    } catch (err) {
      setDialogStatus(err.message || String(err), true);
    } finally {
      clickUpBtn.disabled = false;
    }
  });

  form?.addEventListener("submit", (e) => {
    const submitter = e.submitter;
    if (submitter?.value !== "cancel") e.preventDefault();
  });

  document.getElementById("btnNewKbItem")?.addEventListener("click", () => {
    openKbItemDetail(null);
  });

  dialogBound = true;
}

export function openKbItemDetail(item) {
  const dialog = document.getElementById("kbItemDialog");
  if (!dialog) return;

  bindKbItemDialog();
  fillKbItemForm(item || {});

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
  try {
    const supa = getSupabaseClient();
    let query = supa.from(KB_ITEMS_PATH).select(KB_ITEMS_SELECT).order("created_at", { ascending: false });

    if (filters.item_type) query = query.eq("item_type", filters.item_type);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.priority) query = query.eq("priority", filters.priority);
    if (filters.search && String(filters.search).trim()) {
      query = query.ilike("title", `%${String(filters.search).trim()}%`);
    }
    if (filters.owner && String(filters.owner).trim()) {
      query = query.ilike("owner", `%${String(filters.owner).trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const params = new URLSearchParams();
    params.set("select", KB_ITEMS_SELECT);
    params.set("order", "created_at.desc");
    if (filters.item_type) params.set("item_type", `eq.${filters.item_type}`);
    if (filters.status) params.set("status", `eq.${filters.status}`);
    if (filters.priority) params.set("priority", `eq.${filters.priority}`);
    if (filters.search && String(filters.search).trim()) {
      params.set("title", `ilike.*${String(filters.search).trim()}*`);
    }
    if (filters.owner && String(filters.owner).trim()) {
      params.set("owner", `ilike.*${String(filters.owner).trim()}*`);
    }
    const path = `${KB_ITEMS_PATH}?${params.toString()}`;
    const data = await supabaseFetch(path);
    if (err?.message && !Array.isArray(data)) throw err;
    return Array.isArray(data) ? data : [];
  }
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
  bindKbItemDialog();
  window.kbItems = {
    loadKbItems,
    renderKbItems,
    getItems: getKbItems,
    getCount: getKbItemsCount,
    getOpenCount: getKbItemsOpenCount,
    openDetail: openKbItemDetail,
    exportToClickUp: exportKbItemToClickUp,
  };
}
