@echo off
title Delta Warranty + Service Demo - SOLARTIVE TECHNO INDUSTRIES PVT LTD
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
  node server\server.js
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\delta-server.ps1"
)

if errorlevel 1 (
  echo.
  echo   The demo could not start. Please send the message above to Delta Infosoft.
  echo.
  pause
)
