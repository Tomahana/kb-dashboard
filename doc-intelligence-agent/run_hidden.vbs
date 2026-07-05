' Spustí doc_agent.py na pozadí bez viditelného okna terminálu (Windows Task Scheduler / ruční spuštění).
Set fso = CreateObject("Scripting.FileSystemObject")
agentDir = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = agentDir & "\venv\Scripts\pythonw.exe"
script = agentDir & "\doc_agent.py"

If Not fso.FileExists(pythonw) Then
  pythonw = agentDir & "\venv\Scripts\python.exe"
End If

CreateObject("WScript.Shell").Run """" & pythonw & """ """ & script & """", 0, False
