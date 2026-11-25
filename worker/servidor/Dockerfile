# EditaJá — editor rodando 24h num servidor (VPS, Oracle grátis, etc.)
# Funciona em Intel/AMD (x86) e ARM (Oracle Ampere).
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg fonts-dejavu-core fonts-noto-color-emoji fonts-inter curl ca-certificates \
        build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pywhispercpp Pillow "supabase>=2.4" anthropic

WORKDIR /app
# editor.py, sons e o worker (copiados pelo preparar_pacote / já dentro do zip)
COPY editor/ /app/sistema/
COPY worker/ /app/worker/

# modelo de voz (Whisper small, ~180 MB) baixado direto na montagem, se não veio junto
RUN mkdir -p /app/sistema/modelos && [ -s /app/sistema/modelos/ggml-small-q5_1.bin ] || \
    curl -L --fail -o /app/sistema/modelos/ggml-small-q5_1.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin

ENV EDITOR_DIR=/app/sistema PYTHONUNBUFFERED=1
CMD ["python", "/app/worker/editor_local.py"]
