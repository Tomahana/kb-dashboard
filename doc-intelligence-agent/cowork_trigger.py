#!/usr/bin/env python3
"""Wrapper pro spuštění agenta z Cowork — zachytí výstup a zapíše do logu."""

import subprocess
import sys
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
if sys.platform == "win32":
    PYTHON = AGENT_DIR / "venv" / "Scripts" / "pythonw.exe"
    if not PYTHON.is_file():
        PYTHON = AGENT_DIR / "venv" / "Scripts" / "python.exe"
else:
    PYTHON = AGENT_DIR / "venv" / "bin" / "python"
AGENT = AGENT_DIR / "doc_agent.py"
LOG = AGENT_DIR / "logs" / "agent.log"

print("Spouštím Document Intelligence Agent...")

run_kwargs = {
    "capture_output": True,
    "text": True,
    "cwd": str(AGENT_DIR),
    "encoding": "utf-8",
}
if sys.platform == "win32":
    run_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

result = subprocess.run([str(PYTHON), str(AGENT)], **run_kwargs)

LOG.parent.mkdir(parents=True, exist_ok=True)
with open(LOG, "a", encoding="utf-8") as f:
    f.write(result.stdout)
    if result.stderr:
        f.write("STDERR: " + result.stderr)

print(result.stdout[-2000:])
if result.returncode == 0:
    print("✓ Agent dokončil práci úspěšně.")
else:
    print(f"✗ Agent skončil s chybou (kód {result.returncode})")
    print(result.stderr)
    sys.exit(result.returncode)
