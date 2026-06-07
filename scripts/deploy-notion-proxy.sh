#!/usr/bin/env bash
# Nasadí Notion proxy do Supabase Edge Functions.
# Předpoklady: nainstalovaný Supabase CLI (npx supabase) a přihlášení (supabase login).

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-xrgdfghiwjyrdckpjzdj}"

echo "Nasazuji notion-proxy do projektu ${PROJECT_REF}…"
npx supabase functions deploy notion-proxy --project-ref "$PROJECT_REF" --no-verify-jwt=false

echo ""
echo "Hotovo. V KB Dashboardu otestujte Notion v Nastavení."
echo "Funkce URL: https://${PROJECT_REF}.supabase.co/functions/v1/notion-proxy"
