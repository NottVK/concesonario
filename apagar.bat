@echo off
rem Apaga AutoMax: la API (8000), la web (5173), la base de datos y Ollama. No borra datos ni modelos.
cd /d "%~dp0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING" /c:":5173 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
docker compose stop
docker stop ollama
taskkill /FI "WINDOWTITLE eq AutoMax API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AutoMax Web*" /T /F >nul 2>&1
echo AutoMax apagado. > "%~dp0apagar.log"
docker ps --format "{{.Names}}" >> "%~dp0apagar.log" 2>&1
