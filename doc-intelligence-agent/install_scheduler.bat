@echo off
REM Nastavení denního spuštění Document Intelligence agenta v 7:00 (Windows Task Scheduler).
REM Spusťte jako administrátor.

set AGENT_DIR=%~dp0
set PYTHON=%AGENT_DIR%venv\Scripts\python.exe
set SCRIPT=%AGENT_DIR%doc_agent.py
set TASK_NAME=DocumentIntelligenceAgent

schtasks /Create /TN "%TASK_NAME%" /TR "\"%PYTHON%\" \"%SCRIPT%\"" /SC DAILY /ST 07:00 /F

if %ERRORLEVEL% EQU 0 (
  echo Úloha "%TASK_NAME%" vytvořena — agent poběží každý den v 7:00.
) else (
  echo Chyba při vytváření úlohy. Spusťte jako administrátor.
  exit /b 1
)
