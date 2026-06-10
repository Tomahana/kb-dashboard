#!/bin/sh
# Nasazení edge funkce pro sync Google Sheets (výzkumné směry PČR).
set -e
PROJECT_REF="${1:-}"
if [ -z "$PROJECT_REF" ]; then
  echo "Použití: sh scripts/deploy-google-sheets-fetch.sh <project-ref>"
  echo "Project ref najdete v Supabase Dashboard → Settings → General."
  exit 1
fi
supabase functions deploy google-sheets-fetch --project-ref "$PROJECT_REF"
