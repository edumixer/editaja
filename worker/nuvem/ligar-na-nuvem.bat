@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== EditaJa: ligando o editor na nuvem (Modal) =====
echo.
python --version >nul 2>&1 || (echo Falta o Python. Instale em https://www.python.org/downloads/ marcando "Add to PATH" e rode de novo. & pause & exit /b)
echo [1/4] Instalando o Modal...
python -m pip install -q -U modal || (echo Nao consegui instalar o Modal. & pause & exit /b)
echo [2/4] Entrando na sua conta Modal (vai abrir o navegador, clique em Approve)...
python -m modal setup || (pause & exit /b)
echo [3/4] Guardando a chave do Supabase no Modal...
if exist "..\.env" (
  findstr /b "SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY" "..\.env" > "%TEMP%\editaja-nuvem.env"
  python -m modal secret create editaja-supabase --force --from-dotenv "%TEMP%\editaja-nuvem.env" || (del "%TEMP%\editaja-nuvem.env" & pause & exit /b)
  del "%TEMP%\editaja-nuvem.env"
) else (
  set /p CHAVE=Cole a SUPABASE_SERVICE_ROLE_KEY e aperte Enter: 
  call python -m modal secret create editaja-supabase --force SUPABASE_URL=https://rvzgtkfownxlperiwoob.supabase.co SUPABASE_SERVICE_ROLE_KEY=%%CHAVE%% || (pause & exit /b)
)
echo [4/4] Publicando o editor (a 1a vez leva uns 5 minutos)...
python -m modal deploy modal_app.py || (pause & exit /b)
echo.
echo PRONTO! O editor agora roda na nuvem 24h. Em ate 1 minuto a tela "Fila de edicao" mostra "Ligado".
echo Pode desligar o computador. Mande para o Claude o texto acima.
pause
