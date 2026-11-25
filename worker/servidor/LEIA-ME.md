# EditaJá: editor ligado 24h, sem depender do seu PC

O editor é um programa que fica olhando a fila do EditaJá (Supabase) e edita os vídeos.
Ele não precisa de porta aberta nem de domínio: só de internet. Por isso roda em qualquer servidor Linux.
Se o PC e o servidor ficarem ligados ao mesmo tempo, não tem problema: cada vídeo é pego por um só.

## Quanto ele precisa (medido em 25/11/2026, vídeo vertical 1080x1920 de 1 min)

| Servidor | Tempo por vídeo de 1 min | Memória usada |
| --- | --- | --- |
| 2 núcleos | ~7,5 min (47 s voz + 6,5 min render) | ~750 MB no pico |
| 4 núcleos | ~4 min (estimado) | ~750 MB |

Mínimo: 2 núcleos, 2 GB de RAM (+2 GB de swap, o instalador cria), 8 GB de disco livre, Ubuntu/Debian.
Recomendado: 4 núcleos e 4 GB de RAM.

## Passo 1: ver se a sua VPS aguenta (2 minutos)

1. Copie esta pasta `servidor` (o zip `editaja-editor-servidor.zip`) para a VPS. Jeito mais fácil: no Windows,
   abra o PowerShell na pasta onde está o zip e rode
   `scp editaja-editor-servidor.zip root@IP_DA_VPS:/root/`
2. Entre na VPS: `ssh root@IP_DA_VPS`
3. Rode:
   ```
   apt-get update && apt-get install -y unzip
   unzip editaja-editor-servidor.zip -d editaja && cd editaja
   bash verificar_vps.sh
   ```
4. Se aparecer **"este servidor AGUENTA"**, vá para o passo 2. Se não, mande o texto para o Claude.

## Passo 2: instalar e ligar

```
sudo bash instalar.sh        # 1ª vez: cria o .env e para
nano .env                    # cole a SUPABASE_SERVICE_ROLE_KEY (Supabase > Project Settings > API Keys)
sudo bash instalar.sh        # agora monta e liga (5 a 10 min na 1ª vez)
```

Pronto. Na tela **Fila de edição** do EditaJá deve aparecer **Editor ligado**.
Ele volta sozinho se a VPS reiniciar.

Comandos úteis:
- ver o que está fazendo: `docker logs -f editaja-editor`
- desligar: `docker compose down`   religar: `docker compose up -d`
- atualizar depois de mudanças no editor: copie os arquivos novos e rode `docker compose up -d --build`

## Se a chave do Supabase vazar
Ela dá acesso total ao banco. Nunca mande o `.env` para ninguém. Se vazar, gere outra no Supabase e troque no `.env`.
