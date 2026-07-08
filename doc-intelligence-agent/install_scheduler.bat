@echo off
REM Nastavení denního spuštění Document Intelligence agenta v 7:00 (Windows Task Scheduler).
REM Agent běží na pozadí přes run_hidden.vbs — bez vyskakování okna terminálu.
REM Spusťte jako administrátor.

set AGENT_DIR=%~dp0
set VBS=%AGENT_DIR%run_hidden.vbs
set TASK_NAME=DocumentIntelligenceAgent

if not exist "%VBS%" (
  echo Chyba: chybí run_hidden.vbs v %AGENT_DIR%
  exit /b 1
)

schtasks /Create /TN "%TASK_NAME%" /TR "wscript.exe \"%VBS%\"" /SC DAILY /ST 07:00 /F

if %ERRORLEVEL% EQU 0 (
  echo Úloha "%TASK_NAME%" vytvořena — agent poběží každý den v 7:00 na pozadí.
  echo Logy: %AGENT_DIR%logs\agent.log
) else (
  echo Chyba při vytváření úlohy. Spusťte jako administrátor.
  exit /b 1
)
