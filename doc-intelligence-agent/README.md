# Document Intelligence Agent

Python agent pro skenování složky OneDrive, AI analýzu dokumentů (Claude) a ukládání do Supabase.

## Instalace

```bash
cd doc-intelligence-agent
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # doplňte API klíče
```

## Spuštění

```bash
python doc_agent.py
```

Na Windows bez vyskakování okna terminálu (doporučeno pro plánovač úloh):

```bat
wscript.exe run_hidden.vbs
```

## Automatizace (Windows)

Spusťte jednou jako administrátor — agent poběží **na pozadí** (žádné okno terminálu přes ostatní aplikace):

```bat
install_scheduler.bat
```

Pokud už máte starší úlohu s `python.exe`, přeinstalujte ji stejným příkazem (`/F` přepíše nastavení).

## Cowork / ruční spuštění

```bash
cd doc-intelligence-agent
wscript.exe run_hidden.vbs
```

Logy: `logs/agent.log`
