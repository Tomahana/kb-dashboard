/**
 * Article Pipeline — Supabase Edge Function (MVP)
 *
 * Env secrets: OPENAI_API_KEY, ANTHROPIC_API_KEY_article (nebo ANTHROPIC_API_KEY), XAI_API_KEY
 * Deploy: supabase functions deploy article-pipeline --project-ref <ref>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_ROLES, type AiRole } from "./types.ts";
import { ROLE_CONFIGS, aiKeysStatus } from "./config.ts";
import { runSingleStep } from "./orchestrator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "ping");

    if (action === "ping") {
      return json({
        ok: true,
        service: "article-pipeline",
        version: 4,
        phase: "approval-gated",
        user: user.email,
        ai_keys: aiKeysStatus(),
        roles: AI_ROLES,
        role_configs: Object.fromEntries(
          AI_ROLES.map((r) => [r, {
            provider: ROLE_CONFIGS[r].provider,
            model: ROLE_CONFIGS[r].model,
            temperature: ROLE_CONFIGS[r].temperature,
            max_tokens: ROLE_CONFIGS[r].max_tokens,
          }]),
        ),
      });
    }

    if (action === "status") {
      return json({
        ok: true,
        ai_keys: aiKeysStatus(),
        manuscript_language: "en",
        comment_language: "cs",
      });
    }

    if (action === "run_step") {
      const projectId = String(payload.project_id || "");
      const step = String(payload.step || "") as AiRole;
      if (!projectId) return json({ error: "Chybí project_id." }, 400);
      if (!AI_ROLES.includes(step)) return json({ error: `Neznámý krok: ${step}` }, 400);
      const priorOutputs = (payload.prior_outputs || {}) as Record<string, unknown>;
      const result = await runSingleStep(supabase, projectId, step, priorOutputs);
      return json({ ok: result.ok || result.skipped, result });
    }

    if (action === "run_pipeline") {
      return json({
        error: "Souvislé spuštění celé pipeline je zakázáno. Použijte řízené etapy v KB a schvalovací body.",
      }, 409);
    }

    return json({ error: `Neznámá akce: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});
