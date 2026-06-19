// Supabase Edge Function — načtení veřejné stránky UHK (obchází CORS).
// Nasazení: supabase functions deploy uhk-page-fetch --project-ref <ref>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Chybí Authorization — přihlaste se v KB Dashboardu." }, 401);
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Neplatná session — přihlaste se znovu." }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const url = (payload.url || "").toString().trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: "Zadejte platnou URL (http/https)." }, 400);
    }

    const host = new URL(url).hostname.toLowerCase();
    if (!host.endsWith("uhk.cz")) {
      return json({ error: "Povoleny jsou pouze domény uhk.cz." }, 400);
    }

    const pageRes = await fetch(url, {
      headers: { "User-Agent": "KB-Dashboard/1.0 (+UHK OVV)" }
    });

    if (!pageRes.ok) {
      return json({ error: `Stránka vrátila HTTP ${pageRes.status}.` }, 502);
    }

    const html = await pageRes.text();
    const text = stripHtml(html).slice(0, 120000);

    return json({ url, text, fetchedAt: new Date().toISOString(), length: text.length });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
});
