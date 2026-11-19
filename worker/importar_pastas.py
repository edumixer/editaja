"""Envia o conteúdo inicial (pastas atuais) para o Supabase e semeia os estilos.

Uso (uma vez, depois das migrations 001 e 002):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python importar_pastas.py <uid-do-eduardo> /mnt/project-files
"""
import mimetypes, pathlib, sys, os
from supabase import create_client

uid, raiz = sys.argv[1], pathlib.Path(sys.argv[2])
db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

PASTAS = {  # pasta local -> (bucket, prefixo)
    "referencias": ("referencias", "inicial/referencias"),
    "sistema/sons": ("referencias", "inicial/sons"),
    "biblioteca": ("biblioteca", "inicial/biblioteca"),
}
for local, (bucket, prefixo) in PASTAS.items():
    for f in sorted((raiz / local).rglob("*")):
        if not f.is_file():
            continue
        destino = f"{uid}/{prefixo}/{f.relative_to(raiz / local).as_posix()}"
        tipo = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        db.storage.from_(bucket).upload(destino, f.read_bytes(), {"content-type": tipo, "upsert": "true"})
        print("enviado", bucket, destino)

db.rpc("semear_estilos", {"p_owner": uid, "p_com_arquivos": True}).execute()
db.rpc("semear_produtos", {"p_owner": uid}).execute()
db.rpc("semear_textos", {"p_owner": uid}).execute()
print("estilos, referências e produtos iniciais criados")
