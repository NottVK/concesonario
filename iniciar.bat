@echo off
cd /d "%~dp0"
set LOG=%~dp0iniciar.log
echo === %date% %time% === > "%LOG%"
where node >> "%LOG%" 2>&1 || (echo FALTA_NODE >> "%LOG%" & goto fin)
node -v >> "%LOG%" 2>&1
where docker >> "%LOG%" 2>&1 || (echo FALTA_DOCKER >> "%LOG%" & goto fin)
docker info >nul 2>&1 || (echo DOCKER_APAGADO >> "%LOG%" & goto fin)
echo [1] docker compose >> "%LOG%"
docker compose up -d >> "%LOG%" 2>&1 || (echo ERROR_COMPOSE >> "%LOG%" & goto fin)
set N=0
:espera
set /a N+=1
docker exec automax-db pg_isready -U concesionario -d concesionario >nul 2>&1 && goto lista
if %N% GEQ 30 (echo BD_NO_RESPONDE >> "%LOG%" & goto fin)
timeout /t 2 /nobreak >nul
goto espera
:lista
rem La precarga usa el MISMO num_ctx que el chat (OLLAMA_NUM_CTX): con otro valor Ollama recarga el modelo en la primera pregunta.
echo [1b] ollama + precarga de gpt-oss:20b >> "%LOG%"
docker start ollama >> "%LOG%" 2>&1
start "" /min curl -s -m 300 http://localhost:11434/api/generate -d "{\"model\":\"gpt-oss:20b\",\"keep_alive\":\"30m\",\"options\":{\"num_ctx\":8192}}"
rem Cierra una API o una web que hayan quedado encendidas de antes (puertos 8000 y 5173).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING" /c:":5173 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
echo [2] backend npm ci >> "%LOG%"
cd backend
if not exist node_modules call npm ci --no-audit --no-fund >> "%LOG%" 2>&1
echo [3] migraciones >> "%LOG%"
call npm run migration:run >> "%LOG%" 2>&1 || (echo ERROR_MIGRACION >> "%LOG%" & goto fin)
echo [4] seed >> "%LOG%"
call npm run seed >> "%LOG%" 2>&1 || (echo ERROR_SEED >> "%LOG%" & goto fin)
start "AutoMax API" cmd /k "npm run start"
cd ..\frontend
echo [5] frontend npm ci >> "%LOG%"
if not exist node_modules call npm ci --no-audit --no-fund >> "%LOG%" 2>&1
start "AutoMax Web" cmd /k "npm run dev"
echo LISTO >> "%LOG%"
:fin
echo FIN >> "%LOG%"
