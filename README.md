# KB Dashboard – Agenda k jednání

Statický dashboard pro GitHub Pages nad JSON znalostní bází e-mailů a podkladů.

## Co umí

- načíst záznamy z `data/kb.json`,
- filtrovat podle období, agendy, typu, stavu a místa jednání,
- zobrazit plný text e-mailu/podkladu,
- ručně doplňovat metadata v prohlížeči,
- uložit změny do `localStorage`,
- exportovat aktualizovaný JSON,
- vygenerovat prompt pro AI analýzu aktuálně vyfiltrovaných záznamů.

## Verze aplikace

Číslo verze je v souboru `version.json` a zobrazuje se v postranním panelu (včetně data poslední změny).

Při každém commitu s úpravami kódu se verze **automaticky zvýší** (git hook). Po klonování repozitáře jednou spusťte:

```bash
sh scripts/setup-git-hooks.sh
```

Ruční zvýšení: `node scripts/bump-version.js`

Po merge do `main` verzi zvýší i GitHub Action (pro nasazení bez lokálních hooků).

## Nasazení na GitHub Pages

1. V repozitáři: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Po každém pushi na `main` běží workflow `.github/workflows/deploy-pages.yml`.
3. Web: `https://<uzivatel>.github.io/kb-dashboard/` (ověřte verzi v postranním panelu nebo v `version.json`).

**Když se verze v prohlížeči nemění** (např. stále 3.31 po merge):

- Otevřete **Actions** → poslední běh *Deploy static site to GitHub Pages* (nebo *pages build and deployment*).
- Pokud je červený (failed), zkontrolujte **Settings → Actions → General → Workflow permissions: Read and write**.
- Ruční nasazení: **Actions → Deploy static site to GitHub Pages → Run workflow**.
- V prohlížeči tvrdý refresh: Ctrl+Shift+R (Mac: Cmd+Shift+R), případně anonymní okno.

## Zabezpečení

Aplikace vyžaduje **přihlášení** (Supabase Auth) a doporučuje **Row Level Security** v databázi.

1. Vytvořte uživatele v Supabase → Authentication → Users
2. Spusťte `supabase/security-rls.sql` v SQL Editoru
3. Nastavte `supabase-config.js` (vzor: `supabase-config.example.js`)

Podrobný postup: **[SECURITY.md](SECURITY.md)**

Nevkládejte plné pracovní e-maily do veřejného repozitáře. Repozitář držte privátní, pokud je to možné.

## Formát dat

Soubor `data/kb.json` je pole objektů:

```json
[
  {
    "id": "unikatni-id",
    "title": "Předmět e-mailu",
    "datum_emailu": "2026-06-04T08:53:00+02:00",
    "datum_pridani": "2026-06-04T10:15:00+02:00",
    "odesilatel": "jmeno@domena.cz",
    "agenda": "Prestige",
    "typ": "Námět na jednání",
    "kam_patri": "Proděkani pro vědu",
    "stav": "Nové",
    "priorita": "Běžná",
    "shrnuti": "Krátké shrnutí...",
    "ukol_dalsi_krok": "Co udělat dál...",
    "text": "Plný text e-mailu..."
  }
]
```
