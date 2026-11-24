@echo off
setlocal
cd /d "%~dp0"
set "RELIC_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "RELIC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo To play Relic Run, install Node.js 22.12 or newer, then reopen Play.cmd.
    pause
    exit /b 1
  )
)
"%RELIC_NODE%" tools\static-server.mjs --open
if errorlevel 1 pause
