#!/usr/bin/env bash
# Nasadí Article Factory pipeline do Supabase Edge Functions.
# Předpoklady: SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens)

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-xrgdfghiwjyrdckpjzdj}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Chybí SUPABASE_ACCESS_TOKEN. Vytvořte token na https://supabase.com/dashboard/account/tokens"
  exit 1
fi

echo "Nasazuji article-pipeline do projektu ${PROJECT_REF}…"
npx supabase functions deploy article-pipeline --project-ref "$PROJECT_REF" --use-api

echo ""
echo "Hotovo. URL: https://${PROJECT_REF}.supabase.co/functions/v1/article-pipeline"
echo "V Article Factory: Pipeline → Test Edge Function (očekává version: 3)"
