import { supabaseFetch } from './supabase-client.js';

const SELECT_FIELDS = [
  'id',
  'item_type',
  'title',
  'content',
  'evidence',
  'topics',
  'priority',
  'status',
  'deadline',
  'owner',
  'source_notion_page_url',
  'created_at',
  'updated_at'
].join(',');

function html(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function formatTopics(topics) {
  if (!topics) return [];
  if (Array.isArray(topics)) return topics.map((t) => n(t)).filter(Boolean);
  return n(topics).split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
}

function n(s) {
  return (s ?? '').toString().trim();
}

function formatDeadline(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? n(value) : d.toLocaleDateString('cs-CZ');
}

export async function loadKbItems(filters = {}) {
  const params = {
    select: SELECT_FIELDS,
    order: 'created_at.desc',
    limit: '200'
  };
  if (filters.item_type) params.item_type = `eq.${filters.item_type}`;
  if (filters.status) params.status = `eq.${filters.status}`;
  if (filters.priority) params.priority = `eq.${filters.priority}`;
  if (filters.search) params.title = `ilike.*${filters.search}*`;
  return supabaseFetch('kb_items', params);
}

export function renderKbItem(item) {
  const topics = formatTopics(item.topics);
  const deadline = formatDeadline(item.deadline);
  const owner = n(item.owner);
  const notionUrl = n(item.source_notion_page_url);

  return `
    <article class="kbItemCard" data-kb-item-id="${html(item.id)}">
      <header class="kbItemCardHead">
        <span class="typeBadge">${html(item.item_type || '—')}</span>
        ${item.priority ? `<span class="priorityBadge priority-${html(item.priority)}">${html(item.priority)}</span>` : ''}
        ${item.status ? `<span class="statusBadge">${html(item.status)}</span>` : ''}
      </header>
      <h3 class="kbItemTitle">${html(item.title || 'Bez názvu')}</h3>
      ${n(item.content) ? `<p class="kbItemContent">${html(item.content)}</p>` : ''}
      ${n(item.evidence) ? `<blockquote class="kbItemEvidence">${html(item.evidence)}</blockquote>` : ''}
      ${topics.length ? `<div class="kbItemTopics">${topics.map((t) => `<span class="topicTag">${html(t)}</span>`).join('')}</div>` : ''}
      <footer class="kbItemMeta">
        ${deadline ? `<span class="kbItemDeadline">Termín: ${html(deadline)}</span>` : ''}
        ${owner ? `<span class="kbItemOwner">Vlastník: ${html(owner)}</span>` : ''}
        ${notionUrl ? `<a class="kbItemNotionLink" href="${html(notionUrl)}" target="_blank" rel="noopener">Notion →</a>` : ''}
      </footer>
    </article>`;
}

export function renderKbItems(items) {
  const list = document.getElementById('kbItemsList');
  if (!list) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = '<p class="hint">Žádné položky kb_items.</p>';
    return;
  }
  list.innerHTML = rows.map(renderKbItem).join('');
}

function readKbItemsFilters() {
  const item_type = n(document.getElementById('kbItemsFilterType')?.value);
  const status = n(document.getElementById('kbItemsFilterStatus')?.value);
  const search = n(document.getElementById('kbItemsFilterSearch')?.value);
  const filters = {};
  if (item_type) filters.item_type = item_type;
  if (status) filters.status = status;
  if (search) filters.search = search;
  return filters;
}

async function handleLoadKbItems() {
  const btn = document.getElementById('btnLoadKbItems');
  const list = document.getElementById('kbItemsList');
  if (!list) return;
  const prev = btn?.textContent;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Načítám…';
    }
    list.innerHTML = '<p class="hint">Načítám záznamy…</p>';
    const items = await loadKbItems(readKbItemsFilters());
    renderKbItems(items);
  } catch (err) {
    list.innerHTML = `<p class="hint">Chyba načtení: ${html(err.message || err)}</p>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || 'Načíst záznamy';
    }
  }
}

function bindKbItemsPage() {
  document.getElementById('btnLoadKbItems')?.addEventListener('click', handleLoadKbItems);
  document.getElementById('kbItemsFilterSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLoadKbItems();
  });
}

document.addEventListener('DOMContentLoaded', bindKbItemsPage);
