// Supabase Edge Function — načtení CSV z veřejného Google Sheets (obchází CORS).
// Nasazení: supabase functions deploy google-sheets-fetch --project-ref <ref>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_SHEET_ID = "1iHbmMsSAMFFuo1euzeT5JEknD2XDFASPGXgSwZgaGrM";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
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
    const sheetId = (payload.sheetId || DEFAULT_SHEET_ID).toString().trim();
    const gid = (payload.gid ?? "0").toString().trim();

    if (!/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
      return json({ error: "Neplatné ID tabulky." }, 400);
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const sheetRes = await fetch(exportUrl, {
      headers: { "User-Agent": "KB-Dashboard/1.0" }
    });

    if (!sheetRes.ok) {
      return json({
        error: `Google Sheets vrátilo HTTP ${sheetRes.status}. Tabulka musí být sdílená pro čtení (kdokoli s odkazem).`
      }, 502);
    }

    const csv = await sheetRes.text();
    return json({ csv, sheetId, gid, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});
