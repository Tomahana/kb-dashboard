// Supabase Edge Function — příjem e-mailů z Power Automate / přeposílání.
// Nasazení: supabase functions deploy kb-ingest --project-ref <ref>
// Secrets: INGEST_SECRET (sdílený klíč pro webhook)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ATTACH_BUCKET = "kb-knowledge-attachments";
const MAX_BODY = 500_000;
const MAX_ATTACH = 15 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function toArray(value: unknown) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value;
  return [String(value)];
}

function normalizeMessageId(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.replace(/^<|>$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const secret = Deno.env.get("INGEST_SECRET") || "";
    const headerSecret = req.headers.get("x-ingest-secret") || "";
    const authHeader = req.headers.get("Authorization") || "";

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (!serviceKey || !supabaseUrl) return json({ error: "Chybí Supabase konfigurace." }, 500);

    const payload = await req.json().catch(() => ({}));

    let authorized = false;
    if (secret && headerSecret === secret) authorized = true;
    if (!authorized && authHeader.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) authorized = true;
    }
    if (!authorized) return json({ error: "Neautorizovaný požadavek." }, 401);

    const supa = createClient(supabaseUrl, serviceKey);
    const kbId = crypto.randomUUID();
    const now = new Date().toISOString();
    const subject = String(payload.subject || payload.title || "Bez názvu").trim();
    const from = String(payload.from || payload.odesilatel || "").trim();
    const bodyText = String(payload.body_text || payload.body || payload.text || "").slice(0, MAX_BODY);
    const messageId = normalizeMessageId(payload.message_id || payload.messageId);
    const emailDate = payload.date || payload.datum_emailu || now;

    if (messageId) {
      const { data: existing } = await supa
        .from("kb_records")
        .select("KB_ID")
        .eq("message_id", messageId)
        .maybeSingle();
      if (existing?.KB_ID) {
        return json({ ok: true, duplicate: true, kb_id: existing.KB_ID });
      }
    }

    const meta = {
      KB_ID: kbId,
      Title: subject,
      "Datum e-mailu": emailDate,
      "Datum přidání": now,
      "Odesílatel": from || null,
      "Agenda": toArray("Nezařazeno"),
      "Stav": "K roztřídění",
      "Odkaz na e-mail": payload.link || payload.odkaz_na_email || null,
      source: "email_forward",
      message_id: messageId,
      received_at: now
    };

    const { error: metaErr } = await supa.from("kb_records").insert(meta);
    if (metaErr) throw metaErr;

    if (bodyText.trim()) {
      const { error: bodyErr } = await supa.from("kb_record_bodies").upsert(
        { KB_ID: kbId, body_text: bodyText },
        { onConflict: "KB_ID" }
      );
      if (bodyErr) throw bodyErr;
    }

    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const savedAttachments: string[] = [];

    for (const att of attachments) {
      const filename = String(att.filename || att.name || "priloha").trim();
      const b64 = String(att.content_base64 || att.base64 || "");
      if (!b64) continue;
      const binary = Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0));
      if (binary.length > MAX_ATTACH) continue;
      const attId = crypto.randomUUID();
      const path = `${kbId}/${attId}-${filename.replace(/[^\w.\-()+ ]/g, "_")}`;
      const mime = att.mime_type || att.mime || "application/octet-stream";
      const { error: upErr } = await supa.storage.from(ATTACH_BUCKET).upload(path, binary, {
        contentType: mime,
        upsert: true
      });
      if (upErr) {
        console.warn("Attachment upload failed:", upErr.message);
        continue;
      }
      await supa.from("kb_record_attachments").insert({
        id: attId,
        kb_id: kbId,
        filename,
        storage_path: path,
        mime_type: mime,
        size_bytes: binary.length
      });
      savedAttachments.push(filename);
    }

    return json({
      ok: true,
      kb_id: kbId,
      attachments: savedAttachments,
      classify_hint: "Stav K roztřídění — spusťte Auto-klasifikaci v KB Dashboardu."
    });
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});
