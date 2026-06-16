# Notion — propojení zápisů ze schůzek

## ⚠️ Důležité: co kam patří

| Kde | Co se tam spouští |
|-----|-------------------|
| **Supabase → SQL Editor** | Jen soubory `.sql` (`security-rls.sql`, `topics-schema.sql`) |
| **Terminál v počítači** | `npx supabase functions deploy …` (nasazení proxy) |
| **Supabase → Edge Functions** | Ruční vytvoření funkce v prohlížeči (bez terminálu) |

Příkaz `npx supabase functions deploy …` **NEPATŘÍ do SQL Editoru** — proto vznikla chyba `syntax error at or near "npx"`.

---

## Proč je potřeba proxy

Notion API nefunguje přímo z GitHub Pages (CORS). KB Dashboard proto volá **Supabase Edge Function** `notion-proxy`.

---

## Varianta A — Supabase Dashboard (bez terminálu)

1. Otevřete [Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/xrgdfghiwjyrdckpjzdj/functions)
2. **Deploy a new function** / **Create function**
3. Název funkce: **`notion-proxy`** (přesně tak)
4. Zkopírujte celý obsah souboru `supabase/functions/notion-proxy/index.ts` z repozitáře
5. Vložte do editoru a klikněte **Deploy**
6. Ověřte, že funkce běží na adrese:  
   `https://xrgdfghiwjyrdckpjzdj.supabase.co/functions/v1/notion-proxy`

---

## Varianta B — Terminál v počítači

Na **svém počítači** (PowerShell, Terminal, bash) — ne v SQL Editoru:

```bash
npx supabase login
npx supabase functions deploy notion-proxy --project-ref xrgdfghiwjyrdckpjzdj
```

Nebo ze složky repozitáře:

```bash
./scripts/deploy-notion-proxy.sh
```

---

## Notion integrace

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Zkopírujte token `secret_…`
3. V Notion u databáze zápisů: **⋯ → Connections** → přidejte integraci

---

## V KB Dashboardu

1. Tvrdý refresh (`Ctrl+Shift+R`)
2. **Přihlásit se** (proxy vyžaduje Supabase session)
3. V Supabase SQL Editoru spusťte **`supabase/notion-link-migrate.sql`** — propojení s Notion se pak ukládá trvale u záznamu (sloupec `notion_link`)

### Hned teď — bez proxy

V dialogu e-mailu → panel **Notion**:
- **Ruční propojení odkazem** — vložte URL zápisu ze schůzky → Propojit
- **Kopírovat shrnutí pro Notion** — vložte do Notion ručně

### Plná integrace (vyhledávání v Notion)

3. **Nastavení → Nastavení Notion** → nasadit proxy (kód lze zkopírovat v dialogu)
4. Token + odkaz/ID databáze → **Otestovat Notion API**

---

## Časté chyby

| Chyba | Řešení |
|-------|--------|
| `syntax error at or near "npx"` | Příkaz jste vložili do SQL Editoru — použijte terminál nebo Edge Functions |
| `proxy není nasazená` | Nasajte funkci `notion-proxy` (varianta A nebo B) |
| `Nejdříve přihlaste se` | Přihlášení v KB Dashboardu |
| 403 v Notion | Přidejte Connection k integraci u databáze |
| 404 v Notion | Špatné ID databáze — vložte celý odkaz z Notion |

## ID databáze

Z URL `https://www.notion.so/…/XXXXXXXX?v=…` použijte 32 znaků před `?v=`, nebo vložte celý odkaz.
