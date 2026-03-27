@echo off
setlocal

cd /d "%~dp0"

echo Building Kanban...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Kanban was not started.
  exit /b %errorlevel%
)

set "KANBAN_CONFIG=%USERPROFILE%\.cline\kanban\config.json"
set "KANBAN_CONFIG_DIR=%USERPROFILE%\.cline\kanban"

echo Selecting Codex for the Kanban home agent...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$configDir = $env:KANBAN_CONFIG_DIR; " ^
  "$configPath = $env:KANBAN_CONFIG; " ^
  "if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Force -Path $configDir | Out-Null }; " ^
  "$config = @{}; " ^
  "if (Test-Path $configPath) { try { $config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable } catch { $config = @{} } }; " ^
  "$config['selectedAgentId'] = 'codex'; " ^
  "$config | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8"
if errorlevel 1 (
  echo.
  echo Could not update %KANBAN_CONFIG%.
  exit /b %errorlevel%
)

echo.
echo Starting Kanban...
echo.
node dist\cli.js %*
exit /b %errorlevel%
