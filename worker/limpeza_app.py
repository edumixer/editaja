"""
EditaJá — autoexclusão dos vídeos brutos (Modal, app separado do editor).

Os brutos (arquivo original enviado) ficam guardados por 3 dias depois do envio. Depois disso este vigia
apaga SÓ o arquivo do bruto (R2 ou Supabase). Os vídeos editados, a capa e a transcrição ficam.
Nunca apaga enquanto o editor ainda precisa dele: se o original ou alguma versão (ganchos × CTAs) estiver
"enviando", "fila", "editando" ou "recusado" (vai ser refeito), espera a edição terminar.
Marca opcoes.bruto_excluido_em no original e nas versões; o site usa isso para tirar o vídeo do Material bruto
e para não deixar pedir "refazer" sem o bruto.

O site faz a mesma limpeza quando a pessoa abre a conta; este vigia cobre quando ninguém abre o site.
É um app à parte ("editaja-limpeza") para não mexer no editor (modal_app.py).

Deploy (no PC, na pasta do worker, com os mesmos secrets SUPABASE e R2 do editor):
    python -m modal deploy limpeza_app.py
Teste sem apagar nada:
    python -m modal run limpeza_app.py --so-mostrar
"""
import datetime as dt
import os

import modal

PRAZO_DIAS = int(os.environ.get("PRAZO_BRUTO_DIAS") or 3)
# vídeos enviados antes da autoexclusão existir contam os 3 dias a partir daqui (igual ao site, lib/bruto.ts)
INICIO = dt.datetime(2026, 11, 27, 15, 0, tzinfo=dt.timezone.utc)
USANDO = {"enviando", "fila", "editando", "recusado"}

image = modal.Image.debian_slim(python_version="3.12").pip_install("supabase>=2.4", "boto3")
app = modal.App("editaja-limpeza", image=image)
segredos = [modal.Secret.from_name("SUPABASE"), modal.Secret.from_name("R2")]


def _db():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _r2():
    import boto3
    from botocore.config import Config
    return boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                        region_name="auto", config=Config(signature_version="s3v4", retries={"max_attempts": 6, "mode": "standard"}))


def _apagar_arquivo(db, caminho: str):
    """Só o arquivo do bruto. "r2:<dono>/<id>/x.mov" = R2 (chave "brutos/<dono>/<id>/x.mov"); sem prefixo = Supabase."""
    if caminho.startswith("r2:"):
        _r2().delete_object(Bucket=os.environ["R2_BUCKET"], Key=f"brutos/{caminho[3:]}")
    else:
        db.storage.from_("brutos").remove([caminho])


def limpar(so_mostrar: bool = False) -> list[str]:
    db = _db()
    agora = dt.datetime.now(dt.timezone.utc)
    if agora < INICIO + dt.timedelta(days=PRAZO_DIAS):
        return []
    limite = (agora - dt.timedelta(days=PRAZO_DIAS)).isoformat()
    candidatos = (db.table("videos").select("id,titulo,status,bruto_path,opcoes,created_at")
                  .is_("origem_id", "null").not_.is_("bruto_path", "null").lt("created_at", limite)
                  .order("created_at").limit(200).execute().data or [])
    feitos = []
    for v in candidatos:
        if (v.get("opcoes") or {}).get("bruto_excluido_em"):
            continue
        versoes = db.table("videos").select("id,status,opcoes").eq("origem_id", v["id"]).execute().data or []
        if v["status"] in USANDO or any(x["status"] in USANDO for x in versoes):
            print(f"esperando a edição terminar: {v['titulo']} ({v['id']})")
            continue
        print(f"{'(teste) ' if so_mostrar else ''}apagando bruto: {v['titulo']} ({v['id']}) {v['bruto_path']}")
        if so_mostrar:
            feitos.append(v["id"]); continue
        try:
            _apagar_arquivo(db, v["bruto_path"])
        except Exception as e:   # tenta de novo na próxima rodada
            print(f"  falhou: {e}")
            continue
        quando = dt.datetime.now(dt.timezone.utc).isoformat()
        for x in [v, *versoes]:
            db.table("videos").update({"opcoes": {**(x.get("opcoes") or {}), "bruto_excluido_em": quando}}).eq("id", x["id"]).execute()
        feitos.append(v["id"])
    return feitos


@app.function(secrets=segredos, cpu=0.25, memory=256, timeout=300, schedule=modal.Period(hours=1))
def vigiar_brutos():
    """De hora em hora: apaga os brutos com mais de 3 dias que o editor não está usando."""
    n = limpar()
    print(f"{len(n)} bruto(s) apagado(s)")
    return len(n)


@app.function(secrets=segredos, cpu=0.25, memory=256, timeout=300)
def rodar_agora(so_mostrar: bool = False):
    return limpar(so_mostrar)


@app.local_entrypoint()
def main(so_mostrar: bool = False):
    print(f"{len(rodar_agora.remote(so_mostrar))} bruto(s) {'que seriam apagados' if so_mostrar else 'apagados'}")
