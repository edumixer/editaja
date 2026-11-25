"""
EditaJá — worker de edição sob demanda (Modal).

Fluxo:  app (Next.js) --POST /editar {video_id}--> este worker
        worker baixa o bruto do Supabase Storage, roda editor.py (transcribe -> plan -> render),
        sobe o resultado em `editados/` e atualiza a linha em `videos` (status/etapa/progresso).
        A tela da fila acompanha em tempo real pelo Supabase Realtime.

Deploy (uma vez, no Windows): rode ligar-na-nuvem.bat (pacote editaja-nuvem.zip). Ele faz:
    pip install modal ; python -m modal setup
    python -m modal secret create SUPABASE --from-dotenv ../.env   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    python -m modal deploy modal_app.py
Depois disso a função "vigiar" roda sozinha a cada 1 min: pega a fila e edita, sem o PC ligado.
Opcional: EDITAJA_WORKER_URL (endpoint "enfileirar") + EDITAJA_WORKER_TOKEN na Vercel para começar na hora.
Custo: só cobra enquanto edita (~US$ 0,01 por vídeo de 1 min) + ~US$ 1/mês do vigia; o plano grátis dá US$ 30/mês.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

import modal

# editor.py e sons: na pasta "editor" ao lado deste arquivo (pacote de deploy) ou em <projeto>/sistema
_AQUI = pathlib.Path(__file__).resolve().parent
SISTEMA = _AQUI / "editor" if (_AQUI / "editor" / "editor.py").exists() else _AQUI.parent.parent / "sistema"
MODELO_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "fonts-dejavu-core", "fonts-noto-color-emoji", "fonts-inter", "curl")
    .pip_install("pywhispercpp", "Pillow", "supabase>=2.4", "fastapi[standard]", "anthropic")
    # modelo de voz baixado na montagem da imagem (não precisa subir 180 MB do seu PC)
    .run_commands(f"mkdir -p /editor/modelos && curl -L --fail -o /editor/modelos/ggml-small-q5_1.bin {MODELO_URL}")
    .add_local_file(str(SISTEMA / "editor.py"), "/editor/editor.py")
    .add_local_dir(str(SISTEMA / "sons"), "/editor/sons")
)

app = modal.App("editaja-worker", image=image)
secret = modal.Secret.from_name("SUPABASE")  # secret criado no site do Modal com esse nome

ETAPAS = ["upload", "transcricao", "cortes", "velocidade", "sons", "imagens", "render"]


def _editor_dir():
    """Pasta do editor.py: EDITOR_DIR (PC) se existir; na nuvem, /editor."""
    d = os.environ.get("EDITOR_DIR")
    return d if d and os.path.exists(os.path.join(d, "editor.py")) else "/editor"


def _db():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _status(db, video_id, **campos):
    db.table("videos").update(campos).eq("id", video_id).execute()


def _etapa(db, video_id, nome):
    i = ETAPAS.index(nome)
    _status(db, video_id, status="editando", etapa=i, progresso=round(i / len(ETAPAS) * 100, 1))


# ---------------------------------------------------------------- produto: imagens onde a pessoa aponta
GATILHOS = {
    "falso": ("falso", "falsa", "falsificado", "réplica", "replica", "pirata"),
    "original": ("original", "verdadeiro", "verdadeira", "oficial"),
    "print": ("clica", "clique", "clicar", "loja", "avaliação", "avaliações"),
}


def _baixar_imagens_produto(db, produto_id, pasta):
    """Baixa só as imagens do produto vinculado. Retorna {rotulo: [arquivos]}."""
    if not produto_id:
        return {}
    por_rotulo = {}
    rows = db.table("produto_imagens").select("*").eq("produto_id", produto_id).order("ordem").execute().data or []
    os.makedirs(pasta, exist_ok=True)
    for r in rows:
        nome = f"{r['id']}{pathlib.Path(r['storage_path']).suffix or '.png'}"
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(db.storage.from_("biblioteca").download(r["storage_path"]))
        por_rotulo.setdefault(r["rotulo"], []).append(nome)
    return por_rotulo


def _tempo_final(trechos, t_bruto, vel):
    """Converte um instante do bruto para o instante no vídeo final (depois dos cortes e da velocidade)."""
    acc = 0.0
    for sg in trechos:
        if sg["s"] <= t_bruto <= sg["e"]:
            return (acc + t_bruto - sg["s"]) / vel
        acc += sg["e"] - sg["s"]
    return None


def _sobreposicoes(trechos, frases, imagens, palavras_produto, vel):
    """1 imagem por gatilho falado, inclinada, sem animação, alternando o lado (esq/dir), com som de gota."""
    if not imagens:
        return []
    pontos, arquivos, usados, lado = [], [], {}, 0
    for fr in frases:
        txt = fr["texto"].lower()
        rot = next((r for r, ws in GATILHOS.items() if any(w in txt for w in ws)), None)
        if rot is None and any(w.lower() in txt for w in palavras_produto):
            rot = "produto"
        lista = imagens.get(rot) or (imagens.get("produto") or imagens.get("original") if rot in ("produto", "original") else None)
        if not lista:
            continue
        de = _tempo_final(trechos, fr["s"] + 0.05, vel)
        if de is None:
            continue
        k = usados.get(rot, 0); usados[rot] = k + 1
        arquivos.append(lista[k % len(lista)])
        pontos.append({"x": 0.05 if lado % 2 == 0 else 0.53, "y": 0.10, "de": round(de, 2),
                       "ate": round(de + 1.6, 2), "angulo": -7 if lado % 2 == 0 else 6})
        lado += 1
    if not pontos:
        return []
    return [{"tipo": "apontado", "arquivos": arquivos, "pontos": pontos, "largura": 0.42,
             "ate": max(p["ate"] for p in pontos), "som": "gota"}]


# ---------------------------------------------------------------- hooks × CTAs (só o que foi FALADO no vídeo)
PALAVRAS_CTA = ("link", "carrinho", "clica", "clique", "compra", "comenta", "garante", "corre", "segue", "bio",
                "aproveita", "promoção", "promocao", "desconto", "cupom", "frete", "pega o seu", "pega a sua")
PAUSA_ENTRE_TAKES = 1.3   # pausa (s) que separa duas tentativas/alternativas gravadas no mesmo bruto


def _casar_texto(frases, texto):
    """Acha o trecho (s, e) da fala mais parecido com o texto informado pelo usuário."""
    import difflib
    alvo = texto.lower().split()
    melhor, faixa = 0.0, None
    for i in range(len(frases)):
        for j in range(i, min(i + 4, len(frases))):
            cand = " ".join(f["texto"] for f in frases[i:j + 1]).lower().split()
            r = difflib.SequenceMatcher(None, alvo, cand).ratio()
            if r > melhor:
                melhor, faixa = r, (frases[i]["s"], frases[j]["e"])
    return faixa if melhor >= 0.45 else None


def _blocos(frases, pausa=PAUSA_ENTRE_TAKES):
    """Junta frases separadas por pausas curtas. Cada bloco = um take falado de uma vez."""
    out = []
    for f in frases:
        if out and f["s"] - out[-1]["e"] < pausa:
            out[-1]["e"] = f["e"]; out[-1]["texto"] += " " + f["texto"]
        else:
            out.append({"s": f["s"], "e": f["e"], "texto": f["texto"]})
    return out


def _parecidos(a, b):
    import difflib
    return difflib.SequenceMatcher(None, a.lower().split(), b.lower().split()).ratio() >= 0.75


def _sem_retakes(blocos):
    """Tentativa repetida (quase igual à seguinte) não é alternativa: fica só a última."""
    return [b for i, b in enumerate(blocos) if not (i + 1 < len(blocos) and _parecidos(b["texto"], blocos[i + 1]["texto"]))]


def _heuristica_hooks_ctas(frases, duracao):
    """Sem IA: ganchos = takes curtos no começo, separados por pausa longa, antes do corpo do vídeo;
    CTAs = takes do final que têm palavra de chamada. Na dúvida, devolve no máximo 1 de cada (nada inventado)."""
    bl = _blocos(frases)
    curta = lambda x: [dict(x)] if x and x["e"] - x["s"] <= 8.0 else []
    if len(bl) < 2:
        return curta(frases[0]), []
    hooks = []
    for b in bl:
        if b["s"] > duracao * 0.35 or b["e"] - b["s"] > 8.0:
            break
        hooks.append(b)
    hooks = _sem_retakes(hooks)[:4]
    if len(hooks) >= len(bl) - 1:          # sem corpo depois: não dá para afirmar que são ganchos alternativos
        hooks = hooks[:1]
    if len(hooks) <= 1:                    # um gancho só: mostra a primeira frase falada (se curta), sem variações
        hooks = curta(hooks[0]) if hooks else curta(frases[0])
    ctas = []
    for b in reversed(bl):
        if b["s"] < duracao * 0.6 or b in hooks or not any(w in b["texto"].lower() for w in PALAVRAS_CTA):
            break
        ctas.insert(0, b)
    ctas = _sem_retakes(ctas)[:4]
    return hooks, ctas


def _detectar_hooks_ctas(frases, duracao):
    """Marca ganchos (início) e CTAs (final) usando SÓ a transcrição do vídeo. Retorna (hooks, ctas, fonte).
    Com ANTHROPIC_API_KEY o Claude lê a fala; sem chave, heurística por pausas/palavras.
    Só devolve mais de 1 quando a pessoa realmente gravou alternativas."""
    if not frases:
        return [], [], "sem_fala"
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            linhas = "\n".join(f"{i}: [{f['s']:.1f}-{f['e']:.1f}] {f['texto']}" for i, f in enumerate(frases))
            msg = anthropic.Anthropic().messages.create(
                model="claude-sonnet-5-5", max_tokens=1500,
                messages=[{"role": "user", "content":
                    "Transcrição de um vídeo BRUTO de TikTok (sem edição), uma frase por linha (índice: [início-fim] texto).\n"
                    "Às vezes a pessoa grava VÁRIOS GANCHOS ALTERNATIVOS no começo (frases diferentes para abrir o vídeo, "
                    "das quais só uma vai ao ar) e/ou VÁRIAS CTAs ALTERNATIVAS no final (chamadas diferentes para fechar).\n"
                    "Regras: use só índices desta transcrição; não invente nada. Tentativa repetida da MESMA frase (errou e "
                    "refez) NÃO é alternativa: marque só a última. Se só existe um gancho, devolva só ele; o mesmo para a CTA. "
                    "Frase do meio do vídeo não é gancho nem CTA. Se não houver CTA falada, lista vazia.\n"
                    "Responda só JSON: {\"hooks\": [[i_ini, i_fim], ...], \"ctas\": [[i_ini, i_fim], ...]}\n\n" + linhas}])
            txt = msg.content[0].text
            d = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
            ok = lambda x: isinstance(x, list) and len(x) == 2 and 0 <= int(x[0]) <= int(x[1]) < len(frases)
            faixa = lambda a, b: {"texto": " ".join(f["texto"] for f in frases[a:b + 1]), "s": frases[a]["s"], "e": frases[b]["e"]}
            return ([faixa(int(x[0]), int(x[1])) for x in d.get("hooks", []) if ok(x)][:6],
                    [faixa(int(x[0]), int(x[1])) for x in d.get("ctas", []) if ok(x)][:6], "ia")
        except Exception as e:  # cai na heurística
            print("detecção por IA falhou:", e)
    h, c = _heuristica_hooks_ctas(frases, duracao)
    return h, c, "pausas"


def _subtrair(trechos, faixas):
    """Tira dos trechos as faixas de gancho/CTA (recorta em vez de jogar o trecho inteiro fora)."""
    out = []
    for t in trechos:
        partes = [(t["s"], t["e"])]
        for s, e in faixas:
            nova = []
            for a, b in partes:
                if e <= a or s >= b:
                    nova.append((a, b)); continue
                if s - a > 0.15: nova.append((a, s))
                if b - e > 0.15: nova.append((e, b))
            partes = nova
        out += [dict(t, s=round(a, 3), e=round(b, 3)) for a, b in partes]
    return out


FOLGA_INI, FOLGA_FIM = 0.08, 0.15   # nunca cortar o começo/fim das sílabas do gancho ou da CTA


def _dentro(trechos, s, e):
    return [dict(t, s=max(t["s"], s), e=min(t["e"], e)) for t in trechos if t["s"] < e and t["e"] > s]


def _faixa(trechos, x, total):
    """Trechos de um gancho/CTA. Se o plano tirou essa fala (achou que era repetição), usa a fala inteira
    com folga no fim para não cortar a última sílaba."""
    s, e = max(0.0, x["s"] - FOLGA_INI), min(total, x["e"] + FOLGA_FIM)
    dentro = _dentro(trechos, s, e)
    if sum(t["e"] - t["s"] for t in dentro) >= 0.5 * (x["e"] - x["s"]):
        return dentro
    return [{"s": round(s, 3), "e": round(e, 3), "texto": x.get("texto", ""), "zoom": 1.0}]


def _resolver(frases, lista):
    out = []
    for t in lista or []:
        if not (t.get("texto") or "").strip():
            continue
        faixa = (t["s"], t["e"]) if t.get("s") is not None and t.get("e") is not None else _casar_texto(frases, t["texto"])
        if faixa:
            out.append({"texto": t["texto"].strip(), "s": float(faixa[0]), "e": float(faixa[1])})
    return out


def _combinacoes(plano, frases, comb, duracao, deteccao=None):
    """Devolve ([(rotulo, hook_idx, cta_idx, trechos)], hooks, ctas). Sem ganchos/CTAs múltiplos, só o vídeo normal."""
    comb = comb or {}
    if comb.get("automatico", True):
        if (deteccao or {}).get("status") == "pronta":
            hooks, ctas = _resolver(frases, deteccao.get("hooks")), _resolver(frases, deteccao.get("ctas"))
        else:
            hooks, ctas, _ = _detectar_hooks_ctas(frases, duracao)
    else:
        hooks, ctas = _resolver(frases, comb.get("hooks")), _resolver(frases, comb.get("ctas"))
    if len(hooks) <= 1 and len(ctas) <= 1:
        return [(None, None, None, plano["trechos"])], hooks, ctas
    faixas = [(x["s"] - FOLGA_INI, x["e"] + FOLGA_FIM) for x in hooks + ctas]
    corpo = _subtrair(plano["trechos"], faixas)
    saida = []
    for i, h in enumerate(hooks or [None]):
        for j, c in enumerate(ctas or [None]):
            tr = (_faixa(plano["trechos"], h, duracao) if h else []) + corpo + (_faixa(plano["trechos"], c, duracao) if c else [])
            rot = " + ".join(x for x in (f"Gancho {i + 1}" if h and len(hooks) > 1 else "", f"CTA {j + 1}" if c and len(ctas) > 1 else "") if x)
            saida.append((rot, i if h else None, j if c else None, tr))
    return saida, hooks, ctas


def _transcrever(db, v, bruto, editor):
    """Transcreve uma vez só: guarda brutos/<dono>/<id>/transcricao.json e reaproveita (prévia de ganchos e edição)."""
    tr_path = editor.paths(bruto)[0]
    cache = str(pathlib.PurePosixPath(v["bruto_path"]).parent / "transcricao.json")
    try:
        with open(tr_path, "wb") as f:
            f.write(db.storage.from_("brutos").download(cache))
    except Exception:
        editor.transcribe(bruto)
        try:
            with open(tr_path, "rb") as f:
                db.storage.from_("brutos").upload(cache, f.read(), {"content-type": "application/json", "upsert": "true"})
        except Exception as e:
            print("transcrição não guardada:", e)
    return (json.load(open(tr_path)).get("frases") or []) if os.path.exists(tr_path) else []


@app.function(secrets=[secret], cpu=4.0, memory=4096, timeout=60 * 15)
def detectar_falas(video_id: str):
    """Prévia de "Hooks e CTAs": transcreve o bruto e marca os ganchos e CTAs que a pessoa FALOU (com tempos)."""
    import datetime
    db = _db()
    v = db.table("videos").select("*").eq("id", video_id).single().execute().data
    sys.path.insert(0, _editor_dir())
    import editor  # noqa: E402
    try:
        with tempfile.TemporaryDirectory() as tmp:
            bruto = os.path.join(tmp, "bruto" + (pathlib.Path(v["bruto_path"]).suffix or ".mp4"))
            with open(bruto, "wb") as f:
                f.write(db.storage.from_("brutos").download(v["bruto_path"]))
            frases = _transcrever(db, v, bruto, editor)
            hooks, ctas, fonte = _detectar_hooks_ctas(frases, editor.duration(bruto))
        r = lambda xs, p: [{"id": f"{p}{k + 1}", "texto": x["texto"].strip(), "s": round(x["s"], 2), "e": round(x["e"], 2)} for k, x in enumerate(xs)]
        det = {"status": "pronta", "hooks": r(hooks, "h"), "ctas": r(ctas, "c"), "fonte": fonte, "frases": len(frases),
               "em": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    except Exception as e:
        det = {"status": "erro", "erro": str(e)[:300]}
    _status(db, video_id, deteccao=det)
    return det


@app.function(secrets=[secret], cpu=4.0, memory=8192, timeout=60 * 45)
def editar(video_id: str):
    db = _db()
    v = db.table("videos").select("*").eq("id", video_id).single().execute().data
    opcoes = v.get("opcoes") or {}
    perfil = db.table("profiles").select("regras").eq("id", v["owner_id"]).single().execute().data or {}
    regras = perfil.get("regras") or {}
    # estilo escolhido no envio (ou o padrão da conta): versão atual vira o perfil da edição
    q = db.table("estilo_atual").select("*").eq("owner_id", v["owner_id"])
    q = q.eq("estilo_id", v["estilo_id"]) if v.get("estilo_id") else q.eq("slug", "clean")
    estilo = (q.limit(1).execute().data or [{}])[0]
    perfil_estilo = estilo.get("perfil") or {}
    regras = {**regras, **perfil_estilo}
    produto_id = v.get("produto_id") or opcoes.get("produto_id")
    produto = {}
    if produto_id:
        # o app pode mandar o id do banco (uuid) ou o apelido local do produto (ex.: "camisas-gremio")
        import re as _re
        campo = "id" if _re.fullmatch(r"[0-9a-fA-F-]{36}", str(produto_id)) else "slug"
        produto = (db.table("produtos").select("*").eq("owner_id", v["owner_id"]).eq(campo, produto_id)
                   .limit(1).execute().data or [{}])[0]
        produto_id = produto.get("id")
    sys.path.insert(0, _editor_dir())
    import editor  # noqa: E402  (o mesmo editor.py usado hoje, com as regras fixas)

    with tempfile.TemporaryDirectory() as tmp:
        try:
            _etapa(db, video_id, "upload")
            ext = pathlib.Path(v["bruto_path"]).suffix or ".mp4"
            bruto = os.path.join(tmp, f"bruto{ext}")
            with open(bruto, "wb") as f:
                f.write(db.storage.from_("brutos").download(v["bruto_path"]))
            pasta_imgs = os.path.join(tmp, "imagens")
            imagens = _baixar_imagens_produto(db, produto_id, pasta_imgs)   # só as imagens DESTE produto

            _etapa(db, video_id, "transcricao")
            frases = _transcrever(db, v, bruto, editor)
            tr_path, plano_path, saida_padrao = editor.paths(bruto)

            _etapa(db, video_id, "cortes")
            editor.plan(bruto)
            plano = json.load(open(plano_path))
            vel = float(regras.get("velocidade", 1.1))
            plano["velocidade"] = vel
            # headline OPCIONAL: "sem" = nenhum texto na tela; "manual" = texto e posição da pessoa;
            # "auto" = a IA usa o gancho falado (primeira frase) se a pessoa não escreveu nada.
            hl = opcoes.get("headline") or {}
            modo = hl.get("modo") or ("sem" if v.get("headline_ativa") is False else "auto")
            tit = dict(plano.get("titulo") or {})
            if modo == "sem" or v.get("headline_ativa") is False:
                tit.update(texto="", ativo=False)
            else:
                texto = (v.get("headline") or hl.get("texto") or "").strip()
                if not texto and modo == "auto" and frases:
                    texto = frases[0]["texto"].strip()
                tit.update(texto=texto, ativo=bool(texto))
                x, y = v.get("headline_x", hl.get("x")), v.get("headline_y", hl.get("y"))
                if x is not None: tit["x"] = float(x)
                if y is not None: tit["y"] = float(y)
                if texto and not v.get("headline"):
                    _status(db, video_id, headline=texto)
            plano["titulo"] = tit
            plano["estilo"] = {"nome": estilo.get("nome"), "versao": estilo.get("n"), "perfil": perfil_estilo,
                               "regras": estilo.get("regras") or []}
            # reação de surpresa no início: só quando pedida para este vídeo (ou o estilo manda "sempre")
            surpresa = bool(opcoes.get("surpresa") or opcoes.get("unboxing")
                            or perfil_estilo.get("surpresa_no_inicio", perfil_estilo.get("uau_no_inicio")) in (True, "sempre"))
            if plano.get("momentos_surpresa") and not surpresa:
                _status(db, video_id, surpresas=plano["momentos_surpresa"][:3])   # só sugere na Aprovação
            combos, ganchos, _ctas = _combinacoes(plano, frases, v.get("combinacoes") or opcoes.get("combinacoes"),
                                                  plano["duracao_original"], v.get("deteccao"))
            # headline automática: cada versão usa o SEU gancho falado (não o primeiro da gravação)
            hl_auto = (modo == "auto" and v.get("headline_ativa") is not False
                       and not (v.get("headline") or hl.get("texto") or "").strip())
            if v.get("origem_id"):   # refazendo UMA versão (recusada): só a combinação dela
                combos = [c for c in combos if c[1] == v.get("hook_idx") and c[2] == v.get("cta_idx")][:1] or combos[:1]
            elif len(combos) > 1 and (db.table("videos").select("id").eq("origem_id", video_id).limit(1).execute().data):
                combos = combos[:1]   # as outras versões já existem: refaz só a deste vídeo
            if len(combos) > 1:
                _status(db, video_id, variante=f"{len(combos)} combinações")

            _etapa(db, video_id, "render")
            for k, (rotulo, hi, ci, trechos) in enumerate(combos):
                p = dict(plano, trechos=trechos)
                if hl_auto and hi is not None and hi < len(ganchos):
                    p["titulo"] = dict(plano["titulo"], texto=ganchos[hi]["texto"], ativo=True)
                p["sobreposicoes"] = _sobreposicoes(trechos, frases, imagens, produto.get("palavras") or [], vel)
                json.dump(p, open(plano_path, "w"), ensure_ascii=False, indent=1)
                saida = saida_padrao.replace(".mp4", f"_{k + 1}.mp4")
                editor.render(bruto, saida, images_root=pasta_imgs, surpresa=surpresa)

                alvo_id = video_id
                if k > 0:  # cada combinação extra vira um vídeo próprio na tela de aprovação
                    novo = {kk: v[kk] for kk in ("owner_id", "titulo", "produto", "headline", "opcoes", "bruto_path", "estilo_id")}
                    novo.update(titulo=f"{v['titulo']} · {rotulo}", origem_id=video_id, produto_id=produto_id,
                                hook_idx=hi, cta_idx=ci, variante=rotulo, status="editando", versao=1)
                    alvo_id = db.table("videos").insert(novo).execute().data[0]["id"]
                versao = v["versao"] if k == 0 else 1
                destino = f"{v['owner_id']}/{alvo_id}/v{versao}.mp4"
                with open(saida, "rb") as f:
                    db.storage.from_("editados").upload(destino, f.read(), {"content-type": "video/mp4", "upsert": "true"})
                extra = {"variante": rotulo, "hook_idx": hi, "cta_idx": ci} if rotulo else {}
                # qual gancho este vídeo usou: alimenta o ranking "Em alta" (views por gancho e por época)
                gtxt = (ganchos[hi]["texto"] if hi is not None and hi < len(ganchos) else None) or p["titulo"].get("texto") or (frases[0]["texto"] if frases else None)
                if gtxt: extra["gancho_texto"] = gtxt.strip()[:300]
                if hl_auto and p["titulo"].get("texto"): extra["headline"] = p["titulo"]["texto"].strip()[:300]
                _status(db, alvo_id, status="aprovacao", etapa=len(ETAPAS) - 1, progresso=100, editado_path=destino,
                        estilo_id=estilo.get("estilo_id"), estilo_versao=estilo.get("n"), produto_id=produto_id,
                        duracao_bruto=editor.duration(bruto), duracao_final=editor.duration(saida),
                        stats={"cortes": len(trechos), "imagens": len((p["sobreposicoes"] or [{}])[0].get("arquivos", [])) if p["sobreposicoes"] else 0,
                               "sons": len((p["sobreposicoes"] or [{}])[0].get("pontos", [])) if p["sobreposicoes"] else 0},
                        erro=None, **extra)
                try:  # legenda/descrição/hashtags no jeito das referências de "Ganchos e Legendas"
                    fala = " ".join(f["texto"] for f in frases if any(t["s"] <= f["s"] < t["e"] for t in trechos))
                    _status(db, alvo_id, **_escrever_textos(db, v, produto, fala))
                except Exception as e:
                    print("textos não gerados:", e)
        except Exception as e:  # deixa o erro visível na tela da fila
            _status(db, video_id, status="erro", erro=str(e)[:500])
            raise


# ---------------------------------------------------------------- legendas no jeito das referências

def _referencias_texto(db, owner_id, produto_id, tipo, n=8):
    """Exemplos de 'Ganchos e Legendas': do produto primeiro, com estrela antes, depois os gerais."""
    q = db.table("textos_referencia").select("texto, produto_id, destaque").eq("owner_id", owner_id).eq("tipo", tipo)
    linhas = q.order("destaque", desc=True).order("created_at", desc=True).limit(60).execute().data or []
    peso = lambda r: (4 if produto_id and r["produto_id"] == produto_id else 2 if r["produto_id"] is None else 0) + (1 if r["destaque"] else 0)
    return [r["texto"] for r in sorted((r for r in linhas if r["produto_id"] in (None, produto_id)), key=peso, reverse=True)[:n]]


def _escrever_textos(db, v, produto, fala):
    """Legenda, descrição e hashtags escritas com as referências do Eduardo como exemplo (few-shot)."""
    refs = {t: _referencias_texto(db, v["owner_id"], produto.get("id"), t) for t in ("legenda", "descricao", "hashtags", "cta", "gancho")}
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            exemplos = "\n".join(f"<{t}>\n" + "\n---\n".join(xs) + f"\n</{t}>" for t, xs in refs.items() if xs)
            msg = anthropic.Anthropic().messages.create(model="claude-sonnet-5-5", max_tokens=1200, messages=[{"role": "user", "content":
                f"Você escreve os textos de posts de TikTok/Reels para o criador abaixo. Produto: {produto.get('nome') or v.get('produto')}.\n"
                f"Gancho do vídeo: {v.get('headline')}\nFala do vídeo: {fala[:2500]}\n\n"
                "Exemplos reais do criador (copie o JEITO: tamanho, emojis, caixa alta, perguntas, abertura, quantidade e tipo de hashtags; "
                "não copie as frases):\n" + exemplos + "\n\nNada genérico: cite detalhes reais que aparecem na fala. "
                "Responda só JSON: {\"legenda\": \"...\", \"descricao\": \"...\", \"hashtags\": [\"#...\"]}"}])
            txt = msg.content[0].text
            d = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
            return {"legenda": d["legenda"], "descricao": d["descricao"], "hashtags": d["hashtags"][:10]}
        except Exception as e:
            print("textos por IA falharam:", e)
    tags = []
    for linha in refs["hashtags"]:
        tags += [w for w in linha.split() if w.startswith("#") and w not in tags]
    cta = (refs["cta"] or [""])[0]   # só CTA cadastrada pela pessoa; nada inventado
    return {"legenda": v.get("headline") or produto.get("nome", ""), "descricao": f"{fala[:180].strip()}..." + (f" {cta}." if cta else ""),
            "hashtags": tags[:6]}


@app.function(secrets=[secret], timeout=120)
def escrever_roteiro(roteiro_id: str):
    """Roteiros (opcional): escreve o meio do vídeo com as palavras e as imagens do produto."""
    db = _db()
    r = db.table("roteiros").select("*").eq("id", roteiro_id).single().execute().data
    produto = db.table("produtos").select("nome, descricao, palavras").eq("id", r["produto_id"]).single().execute().data
    rotulos = [x["rotulo"] for x in db.table("produto_imagens").select("rotulo").eq("produto_id", r["produto_id"]).execute().data or []]
    corpo = r.get("corpo") or ""
    if os.environ.get("ANTHROPIC_API_KEY") and not corpo:
        import anthropic
        msg = anthropic.Anthropic().messages.create(model="claude-sonnet-5-5", max_tokens=800, messages=[{"role": "user", "content":
            f"Escreva o MEIO de um roteiro de vídeo curto (entre o gancho e o CTA) para {produto['nome']} ({produto.get('descricao') or ''}). "
            f"Palavras do produto: {', '.join(produto.get('palavras') or [])}. Imagens disponíveis: {', '.join(sorted(set(rotulos))) or 'nenhuma'}. "
            "Se houver imagens 'falso', inclua o momento de apontar para os lados dizendo 'falso'. 4 passos curtos numerados, em português, "
            "do jeito que se fala. Ganchos que serão usados: " + " | ".join(r["ganchos"]) + ". CTAs: " + " | ".join(r["ctas"])}])
        corpo = msg.content[0].text.strip()
    db.table("roteiros").update({"corpo": corpo}).eq("id", roteiro_id).execute()
    return corpo


# ---------------------------------------------------------------- análise completa de referência
def _cortes_de_cena(video, limiar=0.3):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-vf", f"select='gt(scene,{limiar})',showinfo",
                        "-f", "null", "-"], capture_output=True, text=True)
    import re
    return [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]


def _frames(video, duracao, pasta, n=8):
    os.makedirs(pasta, exist_ok=True)
    out = []
    for i in range(n):
        t = duracao * (i + 0.5) / n
        f = os.path.join(pasta, f"f{i}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-vf", "scale=540:-2", f, "-y"])
        if os.path.exists(f):
            out.append((t, f))
    return out


@app.function(secrets=[secret], cpu=4.0, memory=8192, timeout=60 * 20)
def analisar_referencia(referencia_id: str):
    """Registra tudo do vídeo de referência: fala, cortes, pausas, legendas (fonte, tamanho, cor, posição),
    headline, imagens e sons. Grava em referencias.analise e cria sugestões de regra para o estilo."""
    import base64
    db = _db()
    r = db.table("referencias").select("*").eq("id", referencia_id).single().execute().data
    sys.path.insert(0, _editor_dir())
    import editor  # noqa: E402
    with tempfile.TemporaryDirectory() as tmp:
        video = os.path.join(tmp, "ref" + (pathlib.Path(r["storage_path"]).suffix or ".mp4"))
        with open(video, "wb") as f:
            f.write(db.storage.from_("referencias").download(r["storage_path"]))
        dur = editor.duration(video)
        editor.transcribe(video)
        tr_path = editor.paths(video)[0]
        frases = (json.load(open(tr_path)).get("frases") or []) if os.path.exists(tr_path) else []
        cortes = _cortes_de_cena(video)
        pausas = [round(e - s, 2) for s, e in editor.silences(video)] if hasattr(editor, "silences") else []
        analise = {
            "duracao_s": round(dur, 1),
            "transcricao": [{"t": round(f["s"], 1), "texto": f["texto"]} for f in frases],
            "ritmo": {"cortes_por_min": round(len(cortes) / max(dur / 60, 0.01), 1), "pausa_max_s": max(pausas or [0]),
                      "plano_medio_s": round(dur / max(len(cortes) + 1, 1), 2), "velocidade": "medir"},
            "cortes_em": [round(c, 2) for c in cortes],
        }
        if os.environ.get("ANTHROPIC_API_KEY"):   # visão: fonte, posição, cor, imagens sobrepostas, sons implícitos
            import anthropic
            conteudo = []
            for t, f in _frames(video, dur, os.path.join(tmp, "frames")):
                conteudo += [{"type": "text", "text": f"Frame em {t:.1f}s"},
                             {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                          "data": base64.b64encode(open(f, "rb").read()).decode()}}]
            conteudo.append({"type": "text", "text":
                "Estes são frames de um vídeo de referência de TikTok. Transcrição:\n"
                + "\n".join(f"[{x['t']}s] {x['texto']}" for x in analise["transcricao"])
                + f"\nCortes de cena em: {analise['cortes_em']}\n"
                "Descreva o estilo de edição. Responda só JSON com as chaves: resumo, legendas{usa,fonte,tamanho,cor,contorno,"
                "posicao,palavras_por_tela,estilo}, headline{texto,ate_s,posicao,emoji}, imagens[{t,lado,inclinacao,duracao_s,o_que}], "
                "sons[{t,som,gatilho}], camera, regras[] (regras curtas em português que um editor deve seguir para imitar este estilo)."})
            msg = anthropic.Anthropic().messages.create(model="claude-sonnet-5-5", max_tokens=3000,
                                                        messages=[{"role": "user", "content": conteudo}])
            txt = msg.content[0].text
            try:
                analise.update(json.loads(txt[txt.index("{"): txt.rindex("}") + 1]))
            except ValueError:
                analise["resumo"] = txt[:500]
        analise["status"] = "pronta"
        db.table("referencias").update({"analise": analise, "transcricao": " ".join(f["texto"] for f in frases),
                                        "analisado_em": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(), "modelo": "whisper + ffmpeg" + (" + claude" if os.environ.get("ANTHROPIC_API_KEY") else "")}
                                       ).eq("id", referencia_id).execute()
        if r.get("estilo_id"):
            for k, regra in enumerate(analise.get("regras") or []):
                db.table("sugestoes").insert({
                    "owner_id": r["owner_id"], "estilo_id": r["estilo_id"], "referencia_id": referencia_id, "tipo": "aprovacao",
                    "comentario": f"Nova referência analisada: {r['nome']}",
                    "proposta": {"texto": regra, "regra": {"id": f"ref-{referencia_id[:8]}-{k}", "texto": regra,
                                                           "tipo": "preferencia", "origem": r["nome"]}}}).execute()


@app.function(secrets=[secret], cpu=0.25, memory=512, timeout=120, schedule=modal.Period(minutes=1))
def vigiar():
    """A cada 1 min: avisa que o editor está ligado (tela Fila mostra "Ligado") e manda editar
    cada vídeo que estiver na fila, cada um na sua máquina. Funciona junto com o editor do PC:
    cada vídeo é pego por um só (troca fila -> editando só se ninguém pegou antes)."""
    import time
    db = _db()
    agora = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    db.table("config_robo").upsert({"chave": "editor_visto_em", "valor": agora}, on_conflict="chave").execute()
    fila = (db.table("videos").select("id,status").in_("status", ["fila", "recusado"])
            .order("created_at").limit(20).execute().data or [])
    for v in fila:
        pegou = (db.table("videos").update({"status": "editando", "etapa": 0, "progresso": 0})
                 .eq("id", v["id"]).eq("status", v["status"]).execute().data)
        if pegou:
            editar.spawn(v["id"])
    # prévia de ganchos/CTAs pedida na tela de envio: transcreve e marca o que foi falado
    pedidos = (db.table("videos").select("id").eq("deteccao->>status", "pedida").limit(20).execute().data or [])
    for d in pedidos:
        pegou = (db.table("videos").update({"deteccao": {"status": "lendo"}}).eq("id", d["id"])
                 .eq("deteccao->>status", "pedida").execute().data)
        if pegou:
            detectar_falas.spawn(d["id"])
    return len(fila)


@app.function(secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def enfileirar(body: dict):
    """Chamado pelo app quando o upload termina ou quando o vídeo é recusado com comentário."""
    from fastapi import HTTPException
    token = (body or {}).get("token")
    if token != os.environ["WORKER_TOKEN"]:
        raise HTTPException(status_code=401, detail="token inválido")
    video_id = body["video_id"]
    _status(_db(), video_id, status="fila", etapa=0, progresso=0)
    vigiar.spawn()   # o vigia pega o vídeo da fila (marca "editando") e começa na hora
    return {"ok": True}


@app.function(secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def analisar(body: dict):
    """Chamado pelo app quando uma referência termina de subir."""
    from fastapi import HTTPException
    if (body or {}).get("token") != os.environ["WORKER_TOKEN"]:
        raise HTTPException(status_code=401, detail="token inválido")
    call = analisar_referencia.spawn(body["referencia_id"])
    return {"ok": True, "call_id": call.object_id}


@app.function(secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def roteiro(body: dict):
    """Chamado pelo app quando um roteiro é salvo sem o meio escrito."""
    from fastapi import HTTPException
    if (body or {}).get("token") != os.environ["WORKER_TOKEN"]:
        raise HTTPException(status_code=401, detail="token inválido")
    return {"ok": True, "corpo": escrever_roteiro.remote(body["roteiro_id"])}
