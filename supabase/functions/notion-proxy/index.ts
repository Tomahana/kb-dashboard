// Supabase Edge Function — proxy pro Notion API (obchází CORS z prohlížeče).
// Nasazení: supabase functions deploy notion-proxy --project-ref xrgdfghiwjyrdckpjzdj

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTION_VERSION = "2022-06-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Chybí Authorization — přihlaste se v KB Dashboardu." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Neplatná session — přihlaste se znovu." }, 401);
    }

    const payload = await req.json();
    const notionToken = (payload.notionToken || "").toString().trim();
    const path = (payload.path || "").toString().trim();
    const method = (payload.method || "GET").toString().toUpperCase();
    const body = payload.body ?? null;

    if (!notionToken) return json({ error: "Chybí notionToken." }, 400);
    if (!path || !path.startsWith("/")) return json({ error: "Chybí platná Notion API cesta (path)." }, 400);

    const notionRes = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: body != null ? JSON.stringify(body) : undefined
    });

    const text = await notionRes.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: text };
    }

    return new Response(JSON.stringify(parsed), {
      status: notionRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return json({ error: error?.message || "Proxy error" }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
