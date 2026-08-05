@echo off
REM Background start (no console windows)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-up.ps1" -Background %*
