/**
 * KB Agent — Deno Edge Function
 * Notion databáze → Claude klasifikace → Supabase kb_items / kb_pending
 *
 * Env: NOTION_TOKEN, NOTION_DATABASE_ID, ANTHROPIC_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Nasazení (Supabase CLI): zkopírujte do supabase/functions/kb-agent/index.ts
 *   supabase functions deploy kb-agent --project-ref <ref>
 */

const NOTION_VERSION = "2022-06-28";
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CONFIDENCE_THRESHOLD = 0.7;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type EnvConfig = {
  notionToken: string;
  notionDatabaseId: string;
  anthropicApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type Stats = {
  saved: number;
  pending: number;
  skipped: number;
  errors: string[];
  pagesProcessed: number;
  pagesTotal: number;
};

type ClassifiedItem = {
  item_type: string;
  title: string;
  content: string;
  status?: string;
  priority?: string;
  confidence: number;
  evidence?: string;
};

type NotionRichText = { plain_text?: string };
type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readEnv(): EnvConfig {
  const notionToken = Deno.env.get("NOTION_TOKEN")?.trim() || "";
  const notionDatabaseId = Deno.env.get("NOTION_DATABASE_ID")?.trim() || "";
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim() || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const supabaseServiceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

  const missing = [
    !notionToken && "NOTION_TOKEN",
    !notionDatabaseId && "NOTION_DATABASE_ID",
    !anthropicApiKey && "ANTHROPIC_API_KEY",
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Chybí env proměnné: ${missing.join(", ")}`);
  }

  return {
    notionToken,
    notionDatabaseId: normalizeNotionId(notionDatabaseId),
    anthropicApiKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabaseServiceRoleKey,
  };
}

function normalizeNotionId(raw: string): string {
  const input = raw.trim();
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

function supabaseHeaders(serviceRoleKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseGet(
  config: EnvConfig,
  path: string,
): Promise<unknown> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    headers: supabaseHeaders(config.supabaseServiceRoleKey),
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function supabasePost(
  config: EnvConfig,
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
  prefer = "return=minimal",
): Promise<void> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: supabaseHeaders(config.supabaseServiceRoleKey, {
      Prefer: prefer,
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(
      `Supabase POST ${table}: ${res.status} ${await res.text()}`,
    );
  }
}

async function loadProcessedPageIds(config: EnvConfig): Promise<Set<string>> {
  try {
    const data = (await supabaseGet(
      config,
      "notion_pages_processed?select=page_id",
    )) as { page_id?: string }[];
    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => normalizeNotionId(row.page_id || ""))
        .filter(Boolean),
    );
  } catch (err) {
    console.warn("notion_pages_processed unreadable:", err);
    return new Set();
  }
}

async function notionFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
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

async function queryNotionDatabase(
  token: string,
  databaseId: string,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 3 };
    if (cursor) body.start_cursor = cursor;

    const res = await notionFetch(token, `/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(
        `Notion database query: ${res.status} ${await res.text()}`,
      );
    }

    const payload = await res.json();
    pages.push(...((payload.results || []) as NotionPage[]));
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function richTextToPlain(richText: unknown): string {
  if (!Array.isArray(richText)) return "";
  return (richText as NotionRichText[])
    .map((part) => part.plain_text || "")
    .join("");
}

function blockToPlainText(block: NotionBlock): string {
  const payload = block[block.type] as { rich_text?: unknown; text?: unknown } | undefined;
  if (!payload) return "";

  if (payload.rich_text) return richTextToPlain(payload.rich_text);
  if (payload.text) return richTextToPlain(payload.text);
  return "";
}

async function fetchBlockChildren(
  token: string,
  blockId: string,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);

    const res = await notionFetch(
      token,
      `/blocks/${blockId}/children?${query.toString()}`,
    );

    if (!res.ok) {
      throw new Error(
        `Notion blocks ${blockId}: ${res.status} ${await res.text()}`,
      );
    }

    const payload = await res.json();
    const results = (payload.results || []) as NotionBlock[];

    for (const block of results) {
      blocks.push(block);
      if (block.has_children) {
        const nested = await fetchBlockChildren(token, block.id);
        blocks.push(...nested);
      }
    }

    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function extractPagePlainText(
  token: string,
  pageId: string,
): Promise<string> {
  const blocks = await fetchBlockChildren(token, pageId);
  const lines = blocks
    .map((block) => blockToPlainText(block).trim())
    .filter(Boolean);
  return lines.join("\n").slice(0, MAX_PAGE_TEXT);
}

function extractPageTitle(page: NotionPage): string {
  const props = page.properties || {};
  for (const value of Object.values(props)) {
    const prop = value as { type?: string; title?: NotionRichText[] };
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const title = richTextToPlain(prop.title).trim();
      if (title) return title;
    }
  }
  return "Bez názvu";
}

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

async function classifyWithClaude(
  apiKey: string,
  pageTitle: string,
  pageText: string,
): Promise<ClassifiedItem[]> {
  const userContent = [
    `Název stránky Notion: ${pageTitle}`,
    "",
    "Text stránky:",
    pageText || "(prázdná stránka)",
  ].join("\n");

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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json();
  const textBlocks = (payload.content || [])
    .filter((part: { type?: string }) => part.type === "text")
    .map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();

  const parsed = parseClaudeJson(textBlocks);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return items
    .map(normalizeClassifiedItem)
    .filter((item): item is ClassifiedItem => item !== null);
}

function parseClaudeJson(raw: string): { items?: unknown[] } {
  const trimmed = raw.trim();
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

function normalizeClassifiedItem(raw: unknown): ClassifiedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const itemType = String(item.item_type || "").trim().toUpperCase();
  const title = String(item.title || "").trim();
  const content = String(item.content || "").trim();
  const confidence = Number(item.confidence);

  if (!VALID_ITEM_TYPES.has(itemType) || !title) return null;
  if (!Number.isFinite(confidence)) return null;

  return {
    item_type: itemType,
    title,
    content: content || title,
    status: String(item.status || "open").trim() || "open",
    priority: String(item.priority || "medium").trim() || "medium",
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence: String(item.evidence || "").trim() || undefined,
  };
}

async function saveClassifiedItems(
  config: EnvConfig,
  page: NotionPage,
  items: ClassifiedItem[],
  stats: Stats,
): Promise<{ saved: number; pending: number }> {
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
      evidence: item.evidence || null,
      source_notion_page_url: pageUrl,
      notion_page_id: pageId,
      created_at: now,
    };

    if (item.confidence >= CONFIDENCE_THRESHOLD) {
      await supabasePost(config, "kb_items", row);
      saved += 1;
      stats.saved += 1;
    } else {
      await supabasePost(config, "kb_pending", {
        ...row,
        confidence: item.confidence,
        raw_classification: item,
      });
      pending += 1;
      stats.pending += 1;
    }
  }

  return { saved, pending };
}

async function markPageProcessed(
  config: EnvConfig,
  page: NotionPage,
  saved: number,
  pending: number,
): Promise<void> {
  await supabasePost(
    config,
    "notion_pages_processed",
    {
      page_id: normalizeNotionId(page.id),
      notion_last_edited: page.last_edited_time || null,
      processed_at: new Date().toISOString(),
      items_saved: saved,
      items_pending: pending,
    },
    "resolution=merge-duplicates",
  );
}

async function processNotionPages(config: EnvConfig): Promise<Stats> {
  const stats: Stats = {
    saved: 0,
    pending: 0,
    skipped: 0,
    errors: [],
    pagesProcessed: 0,
    pagesTotal: 0,
  };

  const processedIds = await loadProcessedPageIds(config);
  const pages = await queryNotionDatabase(
    config.notionToken,
    config.notionDatabaseId,
  );
  stats.pagesTotal = pages.length;

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
        await markPageProcessed(config, page, 0, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      await new Promise((r) => setTimeout(r, 300));
      const items = await classifyWithClaude(
        config.anthropicApiKey,
        pageTitle,
        pageText,
      );

      if (!items.length) {
        await markPageProcessed(config, page, 0, 0);
        processedIds.add(pageId);
        stats.skipped += 1;
        continue;
      }

      const counts = await saveClassifiedItems(config, page, items, stats);
      await markPageProcessed(
        config,
        page,
        counts.saved,
        counts.pending,
      );
      processedIds.add(pageId);
      stats.pagesProcessed += 1;
    } catch (err) {
      const message = `[${pageId}] ${(err as Error).message || String(err)}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const config = readEnv();
    const stats = await processNotionPages(config);

    return json({
      ok: true,
      saved: stats.saved,
      pending: stats.pending,
      skipped: stats.skipped,
      errors: stats.errors,
      pagesProcessed: stats.pagesProcessed,
      pagesTotal: stats.pagesTotal,
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: (err as Error).message || String(err),
        saved: 0,
        pending: 0,
        skipped: 0,
        errors: [(err as Error).message || String(err)],
      },
      500,
    );
  }
});
