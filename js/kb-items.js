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
