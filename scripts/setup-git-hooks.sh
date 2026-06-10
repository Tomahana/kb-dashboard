#!/bin/sh
# Jednorázové nastavení git hooků (spusťte po klonování repozitáře).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
echo "Git hooky aktivní (.githooks/pre-commit — automatické zvýšení verze při commitu)."
