@echo off
title MMESCHOOLS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org ^(version 22 or newer^), then run this again.
  pause
  exit /b 1
)
node --disable-warning=ExperimentalWarning launch.js
pause
