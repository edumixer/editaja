"""
EditaJá — editor rodando no computador do Eduardo (alternativa ao Modal).

O que faz: a cada 15 s olha no Supabase se tem vídeo na fila (status "fila" ou "recusado"),
baixa o bruto, edita com o mesmo editor.py (cortes, 1.1x, capa, sons, imagens do produto),
sobe o resultado em editados/<dono>/<id>/v<versao>.mp4 e manda o vídeo para a Aprovação.
Só edita enquanto este programa estiver aberto e o computador ligado.

Como rodar (uma vez por sessão, numa janela do Prompt de Comando, dentro da pasta do projeto):
    python plataforma\\worker\\editor_local.py

Precisa do arquivo plataforma\\worker\\.env com:
    SUPABASE_URL=https://rvzgtkfownxlperiwoob.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<chave service_role do Supabase, nunca compartilhe>
    EDITOR_DIR=<pasta onde está o editor.py, ex.: ...\\sistema>
"""
import os
import pathlib
import sys
import threading
import time
import traceback
import types

AQUI = pathlib.Path(__file__).resolve().parent

# lê o .env ao lado deste arquivo (sem dependência extra)
env = AQUI / ".env"
if env.exists():
    for linha in env.read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.strip().startswith("#"):
            k, v = linha.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
os.environ.setdefault("EDITOR_DIR", str(AQUI.parent.parent / "sistema"))

# modal_app.py usa decoradores do Modal; aqui eles não fazem nada e a função roda direto no PC.
_m = types.ModuleType("modal")
class _Nada:
    def __init__(self, *a, **k): pass
    def __getattr__(self, _): return lambda *a, **k: self
    def function(self, *a, **k): return lambda f: f
_m.Image = _Nada(); _m.App = _Nada; _m.Secret = _Nada()
_m.fastapi_endpoint = lambda *a, **k: (lambda f: f)
_Nada.from_name = staticmethod(lambda *a, **k: None)
sys.modules["modal"] = _m
sys.path.insert(0, str(AQUI))
import modal_app  # noqa: E402

INTERVALO = 15


def pegar_proximo(db):
    """Pega 1 vídeo da fila e marca como 'editando' (se outro editor pegou antes, tenta o próximo)."""
    fila = (db.table("videos").select("id,status").in_("status", ["fila", "recusado"])
            .order("created_at").limit(5).execute().data or [])
    for v in fila:
        r = (db.table("videos").update({"status": "editando", "etapa": 0, "progresso": 0})
             .eq("id", v["id"]).eq("status", v["status"]).execute().data)
        if r:
            return v["id"]
    return None


def avisar_ligado(db):
    """A cada 20 s grava a hora em config_robo.editor_visto_em: a tela "Fila de edição" mostra Ligado/Desligado."""
    while True:
        try:
            agora = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
            db.table("config_robo").upsert({"chave": "editor_visto_em", "valor": agora}, on_conflict="chave").execute()
        except Exception as e:  # sem internet por um instante: tenta de novo no próximo ciclo
            print("aviso: não consegui avisar que estou ligado:", e)
        time.sleep(20)


def main():
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        sys.exit("Falta o arquivo .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o topo deste arquivo).")
    if not (pathlib.Path(os.environ["EDITOR_DIR"]) / "editor.py").exists():
        sys.exit(f"Não achei o editor.py em {os.environ['EDITOR_DIR']}. Ajuste EDITOR_DIR no .env.")
    db = modal_app._db()
    threading.Thread(target=avisar_ligado, args=(db,), daemon=True).start()
    print("EditaJá: editor local ligado. Deixe esta janela aberta. (Ctrl+C para parar)")
    while True:
        try:
            vid = pegar_proximo(db)
            if vid:
                print(time.strftime("%H:%M"), "editando", vid)
                modal_app.editar(vid)
                print(time.strftime("%H:%M"), "pronto, foi para a Aprovação")
                continue
        except KeyboardInterrupt:
            break
        except Exception:
            traceback.print_exc()
        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
