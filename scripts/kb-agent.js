#!/usr/bin/env node
/**
 * KB Agent — Notion → Claude → Supabase kb_items (Node.js, fetch + REST).
 *
 * Env: NOTION_TOKEN, NOTION_DATABASE_ID, ANTHROPIC_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *      CLICKUP_API_KEY, CLICKUP_LIST_ID (volitelné — export TASK do ClickUp)
 */

const NOTION_VERSION = "2022-06-28";
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const NOTION_PAGE_SIZE = 5;
const CLAUDE_RATE_LIMIT_MS = 500;
const CLAUDE_CHUNK_MAX_CHARS = 1500;
const MAX_PAGE_TEXT = 120_000;
const MAX_CLAUDE_TOKENS = 8192;

const VALID_ITEM_TYPES = new Set([
  "TASK",
  "KNOWLEDGE",
  "DECISION",
  "QUESTION",
  "IDEA",
  "RISK_OR_WARNING",
  "REFERENCE",
]);

const SYSTEM_PROMPT = `Jsi KB agent pro znalostní bázi UHK. Z plain-textu stránky Notion extrahuj strukturované záznamy.

Každý záznam klasifikuj do právě jednoho typu:
TASK, KNOWLEDGE, DECISION, QUESTION, IDEA, RISK_OR_WARNING, REFERENCE

Vrať POUZE validní JSON (bez markdown, bez komentářů) ve tvaru:
{
  "items": [
    {
      "item_type": "TASK",
      "title": "stručný název",
      "content": "podrobný obsah záznamu",
      "status": "open",
      "priority": "low|medium|high",
      "confidence": 0.0,
      "evidence": "citace nebo odůvodnění z textu",
      "topics": ["Věda a výzkum"],
      "owner": "jméno nebo role, nebo null"
    }
  ]
}

topics: pole stringů — vyber relevantní témata z tohoto seznamu 17 oblastí:
Věda a výzkum, DKRVO, Interní soutěže, Doktorské studium, Open Science / RDM, Bezpečnost výzkumu, Transfer znalostí, Knihovna, CARDS, IRIS / prověrky spoluprací, OBD / RIV / výsledky, Mezinárodní projekty, Legislativa / věcný záměr VŠ, AI automatizace, Výuka, Osobní organizace práce, Lidé / personální návaznosti.
Můžeš přidat i vlastní téma, pokud žádné z výše uvedených nevyhovuje.

owner: string nebo null — odhadni vlastníka z kontextu (jméno, role, zkratka). Pokud nelze určit, vrať null.

Pravidla:
- item_type musí být jedna z povolených hodnot
- confidence je 0.0–1.0 (jistota klasifikace)
- Pokud stránka neobsahuje nic užitečného, vrať {"items":[]}
- Rozděl stránku na více záznamů, pokud obsahuje více témat
- status výchozí "open", priority odhadni z kontextu

DŮLEŽITÉ: Všechny string hodnoty v JSON musí být na jednom řádku. Nikdy nepoužívej skutečné zalomení řádku uvnitř JSON stringu — místo toho použij \\n jako escaped sekvenci.`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Rozdělí text na části max maxChars znaků.
 * Preferuje konec odstavce, věty nebo slova — ne střed slova.
 */
function splitTextToChunks(text, maxChars = CLAUDE_CHUNK_MAX_CHARS) {
  const input = String(text || "").trim();
  if (!input) return [];
  if (input.length <= maxChars) return [input];

  const chunks = [];
  let rest = input;
  const minBreak = Math.max(200, Math.floor(maxChars * 0.35));

  function findBreakIndex(slice) {
    let idx = slice.lastIndexOf("\n\n");
    if (idx >= minBreak) return idx + 2;

    idx = slice.lastIndexOf("\n");
    if (idx >= minBreak) return idx + 1;

    for (let i = slice.length - 1; i >= minBreak; i--) {
      const ch = slice[i];
      if ((ch === "." || ch === "!" || ch === "?") && i + 1 < slice.length && /\s/.test(slice[i + 1])) {
        let end = i + 1;
        while (end < slice.length && /\s/.test(slice[end])) end += 1;
        return end;
      }
    }

    idx = slice.lastIndexOf(" ");
    if (idx >= minBreak) return idx + 1;

    return maxChars;
  }

  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars);
    const breakAt = findBreakIndex(slice);
    const chunk = rest.slice(0, breakAt).trim();
    if (!chunk) break;
    chunks.push(chunk);
    rest = rest.slice(breakAt).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function normalizeNotionId(raw) {
  const input = String(raw || "").trim();
  const dashed = input.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (dashed) return dashed[0].replace(/-/g, "").toLowerCase();

  const beforeV = input.match(/([0-9a-f]{32})\?v=/i);
  if (beforeV) return beforeV[1].toLowerCase();

  const fromUrl = input.match(/(?:^|\/|-)([0-9a-f]{32})(?:[/?#]|$)/i);
  if (fromUrl) return fromUrl[1].toLowerCase();

  if (/^[0-9a-f]{32}$/i.test(input)) return input.toLowerCase();

  const hexRuns = input.match(/[0-9a-f]{32}/gi);
  if (hexRuns?.length) return hexRuns[hexRuns.length - 1].toLowerCase();

  return input;
}

function readEnv() {
  const notionToken = process.env.NOTION_TOKEN?.trim() || "";
  const notionDatabaseId = process.env.NOTION_DATABASE_ID?.trim() || "";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY?.trim() || "";

  const missing = [
    !notionToken && "NOTION_TOKEN",
    !notionDatabaseId && "NOTION_DATABASE_ID",
    !anthropicApiKey && "ANTHROPIC_API_KEY",
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceKey && "SUPABASE_SERVICE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Chybí env proměnné: ${missing.join(", ")}`);
  }

  return {
    notionToken,
    notionDatabaseId: normalizeNotionId(notionDatabaseId),
    anthropicApiKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabaseServiceKey,
    startCursor: process.env.KB_AGENT_START_CURSOR?.trim() || undefined,
  };
}

async function supabaseGet(path) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function supabasePost(table, row, prefer = "return=minimal") {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase POST ${table}: ${res.status} ${await res.text()}`);
  }
}

async function notionFetch(token, path, init = {}) {
  return fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function queryNotionDatabase(config) {
  const body = { page_size: NOTION_PAGE_SIZE };
  if (config.startCursor) body.start_cursor = config.startCursor;

  const res = await notionFetch(
    config.notionToken,
    `/databases/${config.notionDatabaseId}/query`,
    { method: "POST", body: JSON.stringify(body) },
  );

  if (!res.ok) {
    throw new Error(`Notion database query: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

function richTextToPlain(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((part) => part.plain_text || "").join("");
}

function blockToPlainText(block) {
  const payload = block[block.type];
  if (!payload) return "";
  if (payload.rich_text) return richTextToPlain(payload.rich_text);
  if (payload.text) return richTextToPlain(payload.text);
  return "";
}

async function fetchBlockChildren(token, blockId) {
  const blocks = [];
  let cursor;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);

    const res = await notionFetch(
      token,
      `/blocks/${blockId}/children?${query.toString()}`,
    );

    if (!res.ok) {
      throw new Error(`Notion blocks ${blockId}: ${res.status} ${await res.text()}`);
    }

    const payload = await res.json();
    for (const block of payload.results || []) {
      blocks.push(block);
      if (block.has_children) {
        blocks.push(...(await fetchBlockChildren(token, block.id)));
      }
    }

    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function extractPagePlainText(token, pageId) {
  const blocks = await fetchBlockChildren(token, pageId);
  return blocks
    .map((block) => blockToPlainText(block).trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PAGE_TEXT);
}

function extractPageTitle(page) {
  for (const value of Object.values(page.properties || {})) {
    if (value?.type === "title" && Array.isArray(value.title)) {
      const title = richTextToPlain(value.title).trim();
      if (title) return title;
    }
  }
  return "Bez názvu";
}

function cleanClaudeJson(text) {
  text = text
    .replace(/```json/g, "").replace(/```/g, "")
    .replace(/„/g, '"').replace(/"/g, '"').replace(/"/g, '"')
    .replace(/‚/g, "'").replace(/'/g, "'");

  // Oprav newlines uvnitř JSON stringů
  text = text.replace(/:\s*"([\s\S]*?)"/g, (match, p1) => {
    return ': "' + p1.replace(/\n/g, "\\n").replace(/\r/g, "") + '"';
  });

  return text
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
}

function parseClaudeJson(raw) {
  const trimmed = String(raw || "").trim();
  console.log("Claude raw response:", trimmed.slice(0, 200));

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fenced ? fenced[1] : trimmed).trim();
  candidate = cleanClaudeJson(candidate);

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleanClaudeJson(candidate.slice(start, end + 1)));
    }
    throw new Error("Claude nevrátil validní JSON.");
  }
}

function normalizeClassifiedItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const itemType = String(raw.item_type || "").trim().toUpperCase();
  const title = String(raw.title || "").trim();
  const content = String(raw.content || "").trim();

  if (!VALID_ITEM_TYPES.has(itemType) || !title) return null;

  const ownerRaw = raw.owner == null ? null : String(raw.owner).trim();
  const statusRaw = String(raw.status || "open")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const status =
    statusRaw === "closed" || statusRaw === "cancelled" || statusRaw === "canceled"
      ? "archived"
      : ["open", "in_progress", "done", "archived"].includes(statusRaw)
        ? statusRaw
        : statusRaw === "complete" || statusRaw === "completed" || statusRaw === "resolved"
          ? "done"
          : "open";

  return {
    item_type: itemType,
    title,
    content: content || title,
    status,
    priority: (String(raw.priority || "UNSPECIFIED").trim() || "UNSPECIFIED").toUpperCase(),
    evidence: String(raw.evidence || "").trim() || null,
    topics: Array.isArray(raw.topics)
      ? raw.topics.map((t) => String(t || "").trim()).filter(Boolean)
      : [],
    owner: ownerRaw || null,
  };
}

async function classifyWithClaude(apiKey, pageTitle, pageText) {
  const text = pageText || "";
  console.log("Délka textu:", text.length, "znaků");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_CLAUDE_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Název stránky Notion: ${pageTitle}`,
            "",
            "Text stránky:",
            pageText || "(prázdná stránka)",
          ].join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json();
  const responseText = (payload.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  const parsed = parseClaudeJson(responseText);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map(normalizeClassifiedItem).filter(Boolean);
}

async function classifyPageWithClaude(apiKey, pageTitle, pageText, beforeChunkCall) {
  const chunks = splitTextToChunks(pageText, CLAUDE_CHUNK_MAX_CHARS);
  const allItems = [];

  for (let i = 0; i < chunks.length; i++) {
    if (beforeChunkCall) await beforeChunkCall();

    if (chunks.length > 1) {
      console.log("Chunk:", i + 1, "/", chunks.length);
    }

    const chunkText = chunks.length > 1
      ? `${chunks[i]}\n\n(Část ${i + 1}/${chunks.length} textu stránky)`
      : chunks[i];

    const items = await classifyWithClaude(apiKey, pageTitle, chunkText);
    allItems.push(...items);
  }

  return allItems;
}

async function loadProcessedPageIds() {
  try {
    const data = await supabaseGet("notion_pages_processed?select=page_id");
    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => normalizeNotionId(row.page_id))
        .filter(Boolean),
    );
  } catch (err) {
    console.warn("notion_pages_processed unreadable:", err.message);
    return new Set();
  }
}

async function markPageProcessed(pageId, page, itemsSaved) {
  await supabasePost(
    "notion_pages_processed",
    {
      page_id: pageId,
      notion_page_id: pageId,
      notion_last_edited: page.last_edited_time || null,
      processed_at: new Date().toISOString(),
      items_saved: itemsSaved,
      items_pending: 0,
    },
    "resolution=merge-duplicates",
  );
}

async function createClickUpTask({ name, description, priority, due_date, assignees = [] }) {
  const apiKey = process.env.CLICKUP_API_KEY?.trim() || "";
  const listId = process.env.CLICKUP_LIST_ID?.trim() || "";

  if (!apiKey || !listId) {
    throw new Error("Chybí CLICKUP_API_KEY nebo CLICKUP_LIST_ID");
  }

  const body = {
    name,
    description,
    priority,
    assignees,
  };
  if (due_date != null) body.due_date = due_date;

  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`ClickUp API: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

function clickUpPriority(priority) {
  const p = String(priority || "").toUpperCase();
  if (p === "CRITICAL") return 1;
  if (p === "HIGH") return 2;
  if (p === "MEDIUM") return 3;
  return 4;
}

async function saveItemsToKbItems(page, items) {
  const pageId = normalizeNotionId(page.id);
  const pageUrl = page.url || `https://www.notion.so/${pageId}`;
  const now = new Date().toISOString();

  for (const item of items) {
    await supabasePost("kb_items", {
      item_type: item.item_type,
      title: item.title,
      content: item.content,
      status: (item.status || "open").toLowerCase(),
      priority: (item.priority || "UNSPECIFIED").toUpperCase(),
      evidence: item.evidence,
      topics: item.topics || [],
      owner: item.owner || null,
      source_notion_page_url: pageUrl,
      notion_page_id: pageId,
      created_at: now,
    });

    if (item.item_type === "TASK") {
      try {
        await createClickUpTask({
          name: item.title,
          description: `${item.content}\n\nZdroj: ${pageUrl}`,
          priority: clickUpPriority(item.priority),
          due_date: item.deadline ? new Date(item.deadline).getTime() : null,
          assignees: [],
        });
      } catch (err) {
        console.error(`ClickUp [${item.title}]:`, err.message || String(err));
      }
    }
  }

  return items.length;
}

async function main() {
  const config = readEnv();
  const stats = { saved: 0, skipped: 0, errors: [] };

  const processedIds = await loadProcessedPageIds();
  const query = await queryNotionDatabase(config);
  const pages = query.results || [];

  let claudeCalls = 0;

  for (const page of pages) {
    const pageId = normalizeNotionId(page.id);
    const pageTitle = extractPageTitle(page);

    if (processedIds.has(pageId)) {
      stats.skipped += 1;
      continue;
    }

    try {
      const pageText = await extractPagePlainText(config.notionToken, page.id);

      if (!pageText.trim()) {
        await markPageProcessed(pageId, page, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      let items;
      try {
        items = await classifyPageWithClaude(
          config.anthropicApiKey,
          pageTitle,
          pageText,
          async () => {
            if (claudeCalls > 0) await sleep(CLAUDE_RATE_LIMIT_MS);
            claudeCalls += 1;
          },
        );
      } catch (err) {
        const message = `[${pageId}] Claude: ${err.message || String(err)}`;
        console.error(message);
        stats.errors.push(message);
        stats.skipped += 1;
        continue;
      }

      if (!items.length) {
        await markPageProcessed(pageId, page, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      const count = await saveItemsToKbItems(page, items);
      await markPageProcessed(pageId, page, count);
      processedIds.add(pageId);
      stats.saved += count;
    } catch (err) {
      const message = `[${pageId}] ${err.message || String(err)}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  console.log(JSON.stringify(stats, null, 2));

  if (stats.saved > 0) {
    process.exit(0);
  }
  if (stats.errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
