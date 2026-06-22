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

## Automatizace (Windows)

Spusťte jednou jako administrátor:

```bat
install_scheduler.bat
```

## Cowork / ruční spuštění

```bash
cd doc-intelligence-agent
venv/Scripts/python.exe doc_agent.py
```

Logy: `logs/agent.log`
