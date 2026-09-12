@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js LTS e tente novamente.
  pause
  exit /b 1
)
start "IRON RAIN servidor" /D "%~dp0" "%ComSpec%" /k node serve.mjs
timeout /t 1 /nobreak >nul
start "" "http://localhost:4173/"
echo Iron Rain aberto em http://localhost:4173/
echo Feche a janela do servidor quando terminar.
endlocal
