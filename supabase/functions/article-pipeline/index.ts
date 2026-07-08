/**
 * Article Pipeline — Supabase Edge Function
 * Orchestrace AI rolí pro Article Factory (Fáze 1: ping/status; AI kroky ve Fázi 3+).
 *
 * Env secrets:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY (Grok)
 *   SUPABASE_URL, SUPABASE_ANON_KEY (auto)
 *
 * Deploy: supabase functions deploy article-pipeline --project-ref <ref>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_ROLES = [
  "research_strategist",
  "literature_scout",
  "methodology_designer",
  "manuscript_writer",
  "critical_reviewer",
  "journal_fit_reviewer",
  "integrity_reviewer",
  "final_revision_assistant",
] as const;

type AiRole = (typeof AI_ROLES)[number];

const ROLE_MODEL_MAP: Record<AiRole, { provider: string; model: string }> = {
  research_strategist: { provider: "anthropic", model: "claude-sonnet-4-6" },
  literature_scout: { provider: "openai", model: "gpt-4o-mini" },
  methodology_designer: { provider: "anthropic", model: "claude-sonnet-4-6" },
  manuscript_writer: { provider: "anthropic", model: "claude-sonnet-4-6" },
  critical_reviewer: { provider: "xai", model: "grok-3" },
  journal_fit_reviewer: { provider: "openai", model: "gpt-4o-mini" },
  integrity_reviewer: { provider: "anthropic", model: "claude-sonnet-4-6" },
  final_revision_assistant: { provider: "openai", model: "gpt-4o-mini" },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ error: "Chybí Authorization — přihlaste se v KB Dashboardu." }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: json({ error: "Neplatná session — přihlaste se znovu." }, 401) };
  }

  return { supabase, user: userData.user };
}

function aiKeysStatus() {
  return {
    openai: !!Deno.env.get("OPENAI_API_KEY"),
    anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
    xai: !!Deno.env.get("XAI_API_KEY"),
  };
}

async function probeArticleTables(supabase: ReturnType<typeof createClient>) {
  const tables = [
    "kb_article_publications",
    "kb_article_topics",
    "kb_article_target_journals",
    "kb_article_projects",
    "kb_article_versions",
    "kb_article_pipeline_runs",
  ];
  const result: Record<string, boolean> = {};
  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    result[table] = !error || error.code !== "PGRST205";
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const { supabase, user } = auth;
    const payload = await req.json().catch(() => ({}));
    const action = (payload.action || "ping").toString();

    if (action === "ping") {
      return json({
        ok: true,
        service: "article-pipeline",
        version: 1,
        phase: 1,
        user: user.email,
        ai_keys: aiKeysStatus(),
        roles: AI_ROLES,
        role_model_map: ROLE_MODEL_MAP,
        message: "Edge Function je připravena. AI kroky budou dostupné ve Fázi 3.",
      });
    }

    if (action === "status") {
      const tables = await probeArticleTables(supabase);
      const keys = aiKeysStatus();
      const readyForAi = keys.openai && keys.anthropic && keys.xai &&
        Object.values(tables).every(Boolean);

      const { count: pubCount } = await supabase
        .from("kb_article_publications")
        .select("id", { count: "exact", head: true });
      const { count: topicCount } = await supabase
        .from("kb_article_topics")
        .select("id", { count: "exact", head: true });
      const { count: journalCount } = await supabase
        .from("kb_article_target_journals")
        .select("id", { count: "exact", head: true });

      return json({
        ok: true,
        tables,
        ai_keys: keys,
        ready_for_ai_pipeline: readyForAi,
        counts: {
          publications: pubCount ?? 0,
          topics: topicCount ?? 0,
          journals: journalCount ?? 0,
        },
        manuscript_language: "en",
        comment_language: "cs",
      });
    }

    if (action === "run_step") {
      const step = (payload.step || "").toString() as AiRole;
      if (!AI_ROLES.includes(step)) {
        return json({ error: `Neznámý krok pipeline: ${step}` }, 400);
      }
      const keys = aiKeysStatus();
      const mapping = ROLE_MODEL_MAP[step];
      const providerKey = mapping.provider === "openai"
        ? keys.openai
        : mapping.provider === "anthropic"
        ? keys.anthropic
        : keys.xai;
      if (!providerKey) {
        return json({
          error: `Chybí API klíč pro provider ${mapping.provider}. Nastavte secret v Supabase.`,
        }, 503);
      }
      return json({
        ok: false,
        error: "not_implemented",
        message: `Krok ${step} bude implementován ve Fázi 3. Provider: ${mapping.provider}, model: ${mapping.model}.`,
        step,
        provider: mapping.provider,
        model: mapping.model,
      }, 501);
    }

    return json({ error: `Neznámá akce: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});
