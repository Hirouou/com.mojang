@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js 24 ou mais recente e tente novamente.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo O Iron Rain precisa de Node.js 24 ou mais recente para salvar a guerra local.
  pause
  exit /b 1
)
start "IRON RAIN local" /D "%~dp0" "%ComSpec%" /k node serve.mjs
timeout /t 1 /nobreak >nul
start "" "http://localhost:4173/"
echo Iron Rain aberto em http://localhost:4173/
echo A guerra e salva automaticamente neste computador.
echo Na janela IRON RAIN local, use Ctrl+C antes de fechar para encerrar.
endlocal
