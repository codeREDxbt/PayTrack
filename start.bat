@echo off
REM ============================================================
REM  PayTrack - start the API (port 4000) and the client (5173)
REM  Double-click this file. Close both windows to stop.
REM ============================================================
setlocal
title PayTrack launcher
cd /d "%~dp0"
set "PORT=4000"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on PATH.
  echo   Install Node 22.5 or newer from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo   Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. Fix the error above and run this again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting PayTrack...
echo     API    http://127.0.0.1:4000/api
echo     Client http://localhost:5173
echo.
echo   The browser opens in a few seconds. Close both windows to stop.
echo.

start "PayTrack API - port 4000" /D "%~dp0" cmd /k node server/index.js
start "PayTrack Client - port 5173" /D "%~dp0" cmd /k npm run dev

REM Give Vite time to boot before opening the browser.
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"

echo   Launched. This window can be closed.
timeout /t 3 /nobreak >nul
endlocal
