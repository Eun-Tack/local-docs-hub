@echo off
cd /d "%~dp0"

:: Find node.exe
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if "%NODE%"=="" if exist "C:\Program Files (x86)\HncTools\McpServers\Node\node.exe" set "NODE=C:\Program Files (x86)\HncTools\McpServers\Node\node.exe"
if "%NODE%"=="" if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"

if "%NODE%"=="" (
    echo [Error] node.exe not found.
    pause
    exit /b 1
)

:: Start server in background
start /b "" "%NODE%" server.js

:: Wait for server to be ready
timeout /t 2 /nobreak >nul

:: Open in browser (Edge app mode - no address bar)
set "URL=http://127.0.0.1:4120"
set "EDGE="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if not "%EDGE%"=="" (
    start "" "%EDGE%" --app=%URL%
) else (
    start "" %URL%
)
