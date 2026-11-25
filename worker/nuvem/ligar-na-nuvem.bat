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
echo.
echo Abra https://supabase.com/dashboard/project/rvzgtkfownxlperiwoob/settings/api-keys
echo Na parte "service_role" (ou "Secret keys"), clique em Reveal / copiar.
set /p CHAVE=Cole a chave aqui (botao direito cola) e aperte Enter: 
python -m modal secret create editaja-supabase --force SUPABASE_URL=https://rvzgtkfownxlperiwoob.supabase.co SUPABASE_SERVICE_ROLE_KEY=%CHAVE% || (pause & exit /b)
set CHAVE=
echo [4/4] Publicando o editor (a 1a vez leva uns 5 minutos)...
python -m modal deploy modal_app.py || (pause & exit /b)
echo.
echo PRONTO! O editor agora roda na nuvem 24h. Em ate 1 minuto a tela "Fila de edicao" mostra "Ligado".
echo Pode desligar o computador. Copie o texto desta janela e mande para o Claude (sem a chave).
pause
