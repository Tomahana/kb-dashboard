# Notion — propojení zápisů ze schůzek

## Proč selhává přímo z prohlížeče

Notion API **nepovoluje volání z GitHub Pages** (CORS). Proto KB Dashboard používá **Supabase Edge Function** `notion-proxy` jako most.

## Postup nastavení

### 1. Notion integrace

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Zkopírujte **Internal Integration Secret** (`secret_…`)
3. V Notion u databáze zápisů: **⋯ → Connections** → přidejte integraci

### 2. Nasazení proxy (jednorázově)

```bash
# Supabase CLI
npm install -g supabase
supabase login

# z kořene repozitáře
chmod +x scripts/deploy-notion-proxy.sh
./scripts/deploy-notion-proxy.sh
```

Nebo ručně:

```bash
npx supabase functions deploy notion-proxy --project-ref xrgdfghiwjyrdckpjzdj
```

### 3. V KB Dashboardu

1. **Přihlaste se** (Supabase Auth — proxy vyžaduje session)
2. **Nastavení → Nastavení Notion**
3. Token + odkaz/ID databáze schůzek
4. **Otestovat Notion** — mělo by ukázat název databáze a sloupce

## Časté chyby

| Chyba | Řešení |
|-------|--------|
| `proxy není nasazená` | Spusťte `deploy-notion-proxy.sh` |
| `Nejdříve přihlaste se` | Přihlášení v KB Dashboardu |
| `nemá přístup` / 403 | Přidejte Connection k integraci u databáze v Notion |
| `nenalezena` / 404 | Špatné ID databáze — vložte celý odkaz z Notion |
| `Invalid token` | Zkontrolujte `secret_…` token |

## ID databáze

Z URL `https://www.notion.so/…/XXXXXXXX?v=…` — použijte 32 znaků před `?v=`, nebo vložte celý odkaz.
