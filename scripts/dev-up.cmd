@echo off
REM Window mode (default): scripts\dev-up.cmd
REM Background:            scripts\dev-up.cmd -Background
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-up.ps1" %*
