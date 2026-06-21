#!/usr/bin/env node
/**
 * KB Agent — přímý běh v Node.js (GitHub Actions nebo lokálně).
 *
 * Env:
 *   NOTION_TOKEN, NOTION_DATABASE_ID, ANTHROPIC_API_KEY,
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Volitelné:
 *   KB_AGENT_START_CURSOR — pokračování stránkování Notion DB
 */

const { Client: NotionClient } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const CLAUDE_MODEL = "claude-sonnet-4-6";
const CONFIDENCE_THRESHOLD = 0.7;
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

async function fetchAllBlockText(notion, blockId) {
  const lines = [];

  async function walk(id) {
    let cursor;
    do {
      const res = await notion.blocks.children.list({
        block_id: id,
        page_size: 100,
        start_cursor: cursor,
      });

      for (const block of res.results) {
        const text = blockToPlainText(block).trim();
        if (text) lines.push(text);
        if (block.has_children) await walk(block.id);
      }

      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
  }

  await walk(blockId);
  return lines.join("\n").slice(0, MAX_PAGE_TEXT);
}

function extractPageTitle(page) {
  const props = page.properties || {};
  for (const value of Object.values(props)) {
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
  const confidence = Number(raw.confidence);

  if (!VALID_ITEM_TYPES.has(itemType) || !title) return null;
  if (!Number.isFinite(confidence)) return null;

  return {
    item_type: itemType,
    title,
    content: content || title,
    status: String(raw.status || "open").trim() || "open",
    priority: String(raw.priority || "medium").trim() || "medium",
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence: String(raw.evidence || "").trim() || null,
  };
}

async function classifyWithClaude(client, pageTitle, pageText) {
  const message = await client.messages.create({
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
  });

  const text = (message.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  const parsed = parseClaudeJson(text);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map(normalizeClassifiedItem).filter(Boolean);
}

async function loadProcessedPageIds(supabase) {
  const { data, error } = await supabase
    .from("notion_pages_processed")
    .select("page_id");

  if (error) {
    console.warn("notion_pages_processed unreadable:", error.message);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row) => normalizeNotionId(row.page_id))
      .filter(Boolean),
  );
}

async function markPageProcessed(supabase, page, saved, pending) {
  const { error } = await supabase.from("notion_pages_processed").upsert(
    {
      page_id: normalizeNotionId(page.id),
      notion_last_edited: page.last_edited_time || null,
      processed_at: new Date().toISOString(),
      items_saved: saved,
      items_pending: pending,
    },
    { onConflict: "page_id" },
  );

  if (error) throw new Error(`notion_pages_processed: ${error.message}`);
}

async function saveClassifiedItems(supabase, page, items, stats) {
  const pageId = normalizeNotionId(page.id);
  const pageUrl = page.url || `https://www.notion.so/${pageId}`;
  const now = new Date().toISOString();

  let saved = 0;
  let pending = 0;

  for (const item of items) {
    const row = {
      item_type: item.item_type,
      title: item.title,
      content: item.content,
      status: item.status || "open",
      priority: item.priority || "medium",
      evidence: item.evidence,
      source_notion_page_url: pageUrl,
      notion_page_id: pageId,
      created_at: now,
    };

    if (item.confidence >= CONFIDENCE_THRESHOLD) {
      const { error } = await supabase.from("kb_items").insert(row);
      if (error) throw new Error(`kb_items: ${error.message}`);
      saved += 1;
      stats.saved += 1;
    } else {
      const { error } = await supabase.from("kb_pending").insert({
        ...row,
        confidence: item.confidence,
        raw_classification: item,
      });
      if (error) throw new Error(`kb_pending: ${error.message}`);
      pending += 1;
      stats.pending += 1;
    }
  }

  return { saved, pending };
}

async function main() {
  const config = readEnv();
  const notion = new NotionClient({ auth: config.notionToken });
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

  const stats = {
    saved: 0,
    pending: 0,
    skipped: 0,
    errors: [],
    pagesProcessed: 0,
    pagesTotal: 0,
  };

  const processedIds = await loadProcessedPageIds(supabase);

  const query = await notion.databases.query({
    database_id: config.notionDatabaseId,
    page_size: NOTION_PAGE_SIZE,
    start_cursor: config.startCursor,
  });

  const pages = query.results || [];
  stats.pagesTotal = pages.length;

  let claudeCalls = 0;

  for (const page of pages) {
    const pageId = normalizeNotionId(page.id);
    const pageTitle = extractPageTitle(page);

    if (processedIds.has(pageId)) {
      stats.skipped += 1;
      continue;
    }

    try {
      const pageText = await fetchAllBlockText(notion, page.id);

      if (!pageText.trim()) {
        await markPageProcessed(supabase, page, 0, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      if (claudeCalls > 0) {
        await sleep(CLAUDE_RATE_LIMIT_MS);
      }

      const items = await classifyWithClaude(anthropic, pageTitle, pageText);
      claudeCalls += 1;

      if (!items.length) {
        await markPageProcessed(supabase, page, 0, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      const counts = await saveClassifiedItems(supabase, page, items, stats);
      await markPageProcessed(supabase, page, counts.saved, counts.pending);
      processedIds.add(pageId);
      stats.pagesProcessed += 1;
    } catch (err) {
      const message = `[${pageId}] ${err.message || String(err)}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  const result = {
    ok: stats.errors.length === 0,
    ...stats,
  };

  if (query.has_more && query.next_cursor) {
    result.next_cursor = query.next_cursor;
  }

  console.log(JSON.stringify(result, null, 2));

  if (stats.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
