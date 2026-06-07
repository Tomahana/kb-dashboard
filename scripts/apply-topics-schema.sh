#!/usr/bin/env bash
# Spustí topics-schema.sql proti Supabase Postgresu.
#
# Potřebujete connection string z:
#   Supabase Dashboard → Project Settings → Database → Connection string (URI)
#
# Použití:
#   export DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres'
#   ./scripts/apply-topics-schema.sh
#
# Nebo ručně v SQL Editoru zkopírujte obsah supabase/topics-schema.sql.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/supabase/topics-schema.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Chybí DATABASE_URL."
  echo "Získejte ho v Supabase → Project Settings → Database → Connection string."
  echo "Alternativa: otevřete supabase/topics-schema.sql v SQL Editoru a spusťte ručně."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Chybí psql. Nainstalujte PostgreSQL klienta nebo použijte SQL Editor v Supabase."
  exit 1
fi

echo "Aplikuji $SQL_FILE …"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "Hotovo. V dashboardu klikněte na Obnovit témata."
