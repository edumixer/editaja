#!/usr/bin/env bash
# EditaJá — verifica se este servidor aguenta o editor. Uso:  bash verificar_vps.sh
ok(){ echo "  [OK]  $*"; }; ruim(){ echo "  [X]   $*"; FALHAS=$((FALHAS+1)); }; aviso(){ echo "  [!]   $*"; }
FALHAS=0
echo "== EditaJá: verificando este servidor =="
CPU=$(nproc); RAM=$(free -m | awk '/Mem:/{print $2}'); DISCO=$(df -m / | awk 'NR==2{print $4}')
ARQ=$(uname -m); SO=$(. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME")
echo "Sistema: $SO ($ARQ) | CPU: $CPU núcleos | RAM: ${RAM} MB | Disco livre: $((DISCO/1024)) GB"
[ "$CPU" -ge 2 ] && ok "CPU: $CPU núcleos" || ruim "CPU: só $CPU núcleo (mínimo 2; com 1 cada vídeo leva ~10+ min)"
if   [ "$RAM" -ge 3500 ]; then ok "RAM: ${RAM} MB"
elif [ "$RAM" -ge 1800 ]; then aviso "RAM: ${RAM} MB (dá, mas crie 2 GB de swap: veja o LEIA-ME)"
else ruim "RAM: ${RAM} MB (mínimo 2 GB; recomendado 4 GB)"; fi
[ "$DISCO" -ge 8000 ] && ok "Disco livre: $((DISCO/1024)) GB" || ruim "Disco livre: $((DISCO/1024)) GB (mínimo 8 GB)"
case "$ARQ" in x86_64|aarch64) ok "Processador $ARQ compatível";; *) ruim "Processador $ARQ não testado";; esac
command -v docker >/dev/null && ok "Docker instalado ($(docker --version | cut -d, -f1))" || aviso "Docker não instalado (o instalar.sh instala)"
curl -s -m 10 -o /dev/null -w "%{http_code}" https://rvzgtkfownxlperiwoob.supabase.co/rest/v1/ | grep -qE "200|401" \
  && ok "Internet chega no Supabase do EditaJá" || ruim "Não consegui acessar o Supabase (firewall/internet)"
curl -s -m 10 -o /dev/null -I https://huggingface.co && ok "Internet chega no Hugging Face (modelo de voz)" || aviso "Hugging Face inacessível: mande o modelo junto no zip"
echo "-- Teste rápido de velocidade (ffmpeg, 10 s de vídeo vertical) --"
if command -v ffmpeg >/dev/null; then
  T0=$(date +%s%N)
  ffmpeg -v error -f lavfi -i testsrc2=size=1080x1920:rate=30 -t 10 -c:v libx264 -preset slow -crf 16 -f null - 2>/dev/null
  T=$(( ($(date +%s%N) - T0) / 1000000000 ))
  echo "  10 s de vídeo renderizados em ${T} s (no PC de teste com 2 núcleos: ~20 s)"
else aviso "ffmpeg não instalado aqui fora (não precisa: ele vem dentro do Docker). Pulei o teste."; fi
echo
if [ "$FALHAS" -eq 0 ]; then echo "RESULTADO: este servidor AGUENTA o editor. Próximo passo: bash instalar.sh"
else echo "RESULTADO: $FALHAS problema(s) acima. Mande este texto para o Claude."; fi
