# Zabezpečení KB Dashboard

Interní aplikace pracuje s e-maily a metadata z univerzity. Tento dokument popisuje, jak ji zabezpečit.

## Co je chráněno

| Vrstva | Ochrana |
|--------|---------|
| **Přihlášení** | Supabase Auth — bez účtu nelze načíst data |
| **Databáze** | Row Level Security — anon klíč bez JWT nemá přístup |
| **API klíče (AI, ClickUp)** | Zůstávají v localStorage prohlížeče — neukládejte na sdíleném PC |
| **Git** | `supabase-config.js` je v `.gitignore` |

## Rychlý postup (15 min)

### 1. Vytvořte uživatele v Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → váš projekt
2. **Authentication** → **Users** → **Add user**
3. Zadejte e-mail (např. `@uhk.cz`) a heslo
4. Opakujte pro každého člena týmu

Volitelně: **Authentication** → **Providers** → zapněte pouze **Email** a vypněte veřejnou registraci.

### 2. Spusťte SQL zabezpečení

V **SQL Editor** spusťte celý soubor:

```
supabase/security-rls.sql
```

Tím se data zpřístupní **jen přihlášeným** uživatelům.

### 3. Nastavte konfiguraci

```bash
cp supabase-config.example.js supabase-config.js
```

Doplňte `url`, `anonKey` a v sekci `auth`:

- `requireAuth: true`
- `allowedEmailDomains: ["uhk.cz"]` — jen vaše doména

### 4. Nasazení

- Repozitář držte **privátní**, pokud je to možné
- GitHub Pages URL nesdílejte veřejně
- Po nasazení otestujte: bez přihlášení by nemělo jít načíst Supabase

## Doporučení navíc

1. **Rotace klíčů** — pokud byl anon klíč v historii veřejného gitu, v Supabase vygenerujte nový publishable key
2. **Cloudflare Access** nebo VPN před GitHub Pages URL (druhá vrstva)
3. **AI klasifikace** — e-mailové texty odcházejí k OpenAI; používejte firemní API účet s DPA
4. **ClickUp token** — držte v jednom prohlížeči; při odhlášení zvolte smazání lokálních dat
5. **Zálohy** — export JSON jen na šifrovaný disk

## Vypnutí přihlášení (vývoj)

V `supabase-config.js` nastavte `requireAuth: false`. **Nepoužívejte v produkci.**

## Řešení problémů

| Problém | Řešení |
|---------|--------|
| „Invalid login credentials“ | Ověřte uživatele v Supabase Auth |
| „nemá povolený e-mail“ | Přidejte doménu do `allowedEmailDomains` |
| Supabase 401 / prázdná data | Spusťte `security-rls.sql` a přihlaste se |
| Po RLS nejde načíst data | Uživatel musí být přihlášen před kliknutím na Načíst Supabase |
