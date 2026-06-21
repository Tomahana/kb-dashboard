#!/usr/bin/env node
/**
 * KB Agent — Notion → Claude → Supabase kb_items (Node.js, fetch + REST).
 *
 * Env: NOTION_TOKEN, NOTION_DATABASE_ID, ANTHROPIC_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const NOTION_VERSION = "2022-06-28";
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const NOTION_PAGE_SIZE = 5;
const CLAUDE_RATE_LIMIT_MS = 500;
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
      "evidence": "citace nebo odůvodnění z textu"
    }
  ]
}

Pravidla:
- item_type musí být jedna z povolených hodnot
- confidence je 0.0–1.0 (jistota klasifikace)
- Pokud stránka neobsahuje nic užitečného, vrať {"items":[]}
- Rozděl stránku na více záznamů, pokud obsahuje více témat
- status výchozí "open", priority odhadni z kontextu`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function parseClaudeJson(raw) {
  const trimmed = String(raw || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
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

  return {
    item_type: itemType,
    title,
    content: content || title,
    status: String(raw.status || "open").trim() || "open",
    priority: String(raw.priority || "medium").trim() || "medium",
    evidence: String(raw.evidence || "").trim() || null,
  };
}

async function classifyWithClaude(apiKey, pageTitle, pageText) {
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
  const text = (payload.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  const parsed = parseClaudeJson(text);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map(normalizeClassifiedItem).filter(Boolean);
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

async function markPageProcessed(page, itemsSaved) {
  await supabasePost(
    "notion_pages_processed",
    {
      page_id: normalizeNotionId(page.id),
      notion_last_edited: page.last_edited_time || null,
      processed_at: new Date().toISOString(),
      items_saved: itemsSaved,
      items_pending: 0,
    },
    "resolution=merge-duplicates",
  );
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
      status: item.status,
      priority: item.priority,
      evidence: item.evidence,
      source_notion_page_url: pageUrl,
      notion_page_id: pageId,
      created_at: now,
    });
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
        await markPageProcessed(page, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      if (claudeCalls > 0) {
        await sleep(CLAUDE_RATE_LIMIT_MS);
      }

      const items = await classifyWithClaude(
        config.anthropicApiKey,
        pageTitle,
        pageText,
      );
      claudeCalls += 1;

      if (!items.length) {
        await markPageProcessed(page, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      const count = await saveItemsToKbItems(page, items);
      await markPageProcessed(page, count);
      processedIds.add(pageId);
      stats.saved += count;
    } catch (err) {
      const message = `[${pageId}] ${err.message || String(err)}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  console.log(JSON.stringify(stats, null, 2));

  if (stats.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
