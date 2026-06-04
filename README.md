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

## Nasazení na GitHub Pages

1. Vytvořte na GitHubu nový repozitář, např. `kb-dashboard`.
2. Nahrajte do něj soubory:
   - `index.html`
   - `styles.css`
   - `app.js`
   - složku `data/kb.json`
3. V repozitáři otevřete `Settings → Pages`.
4. Nastavte `Deploy from a branch`, branch `main`, folder `/root`.
5. Web bude typicky na adrese `https://<uzivatel>.github.io/kb-dashboard/`.

## Bezpečnostní poznámka

Nevkládejte plné pracovní e-maily do veřejného repozitáře. Pro ostré nasazení použijte soukromý repozitář / interní úložiště a zvažte, zda se mají na webu zobrazovat plné texty, nebo jen anonymizované/extrahované záznamy.

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
