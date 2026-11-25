#!/usr/bin/env bash
# EditaJá — instala e liga o editor 24h neste servidor. Uso (dentro desta pasta):  sudo bash instalar.sh
set -e
cd "$(dirname "$0")"
if ! command -v docker >/dev/null; then
  echo "Instalando Docker..."; curl -fsSL https://get.docker.com | sh
fi
if [ ! -f .env ]; then
  cp .env.exemplo .env
  echo; echo "Criei o arquivo .env. Abra com:  nano .env   cole a chave SUPABASE_SERVICE_ROLE_KEY, salve (Ctrl+O, Enter, Ctrl+X)"
  echo "e rode de novo:  sudo bash instalar.sh"; exit 0
fi
grep -q "cole_aqui" .env && { echo "Falta colar a chave no .env (nano .env)."; exit 1; }
# memória pequena? cria 2 GB de swap para o Whisper não travar
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 3500 ] && ! swapon --show | grep -q .; then
  echo "Criando 2 GB de swap..."; fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
docker compose up -d --build
echo; echo "Pronto! O editor está ligado e volta sozinho se o servidor reiniciar."
echo "Ver o que ele está fazendo:  docker logs -f editaja-editor     (Ctrl+C sai sem desligar)"
echo "Na tela 'Fila de edição' do EditaJá deve aparecer: Editor Ligado."
