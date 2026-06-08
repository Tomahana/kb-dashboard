#!/usr/bin/env bash
# Spustí deadlines-schema.sql proti Supabase Postgresu.
#
# export DATABASE_URL='postgresql://postgres:[HESLO]@db.xrgdfghiwjyrdckpjzdj.supabase.co:5432/postgres'
# ./scripts/apply-deadlines-schema.sh
#
# Alternativa: zkopírujte supabase/deadlines-schema.sql do SQL Editoru v Supabase.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/supabase/deadlines-schema.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Chybí DATABASE_URL."
  echo "Alternativa: otevřete supabase/deadlines-schema.sql v SQL Editoru a spusťte ručně."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Chybí psql. Použijte SQL Editor v Supabase."
  exit 1
fi

echo "Aplikuji $SQL_FILE …"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "Hotovo. V aplikaci otevřete Termíny → Načíst ze Supabase."
