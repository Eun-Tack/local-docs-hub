Set shell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c cd /d """ & appDir & """ && start """" http://127.0.0.1:4120 && node server.js", 0, False
