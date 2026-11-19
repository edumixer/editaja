"""
EditaJá — robô de tendências do TikTok (o "Kalodata" da plataforma).

Roda sozinho no Modal toda madrugada (3h de Brasília) e grava no Supabase (SQL 006):
  1. hashtags em alta no Brasil (TikTok Creative Center, 7/30/90 dias)      -> hashtags_mercado
  2. vídeos mais vistos de cada nicho (hashtags + buscas de nichos_mercado) -> videos_mercado / metricas_mercado
  3. mediana de views de cada perfil (nota de viral = views ÷ mediana)       -> perfis_mercado
  4. Claude lê legenda + fala inicial e final (legenda automática do TikTok) e tira gancho, CTA, tipo, produto
     e agrupa frases parecidas num "modelo"                                -> ganchos_mercado / ctas_mercado
  5. comentários dos vídeos mais fortes: % de comentários com intenção de compra ("onde compra", "link"...)
  6. todo dia re-mede os vídeos novos para achar os que estão "prestes a viralizar"
  7. endpoint `pesquisar`: o usuário digita um produto/tema na plataforma e recebe os vídeos, ganchos e CTAs
     dos últimos 30 dias, ordenados por velocidade (cache de 24 h por tema, limite diário por usuário)

Ideias aproveitadas da skill last30days (github.com/mvanhorn/last30days-skill, licença MIT), só a parte do TikTok:
  - nota de engajamento 0–100 em escala log (views 45%, curtidas 27%, comentários 18%, 10% extra);
  - velocidade = engajamento × 1/√(idade em dias + 1), com bônus de 1,5× na primeira semana;
  - piso de 1.000 views (abaixo disso é ruído) e "nada sólido" em vez de inventar tendência;
  - confirmação cruzada: gancho/CTA só entra no ranking se aparecer em 2 ou mais perfis diferentes;
  - buscas expandidas por intenção de produto (review, unboxing, achadinho) e comentários como sinal.

Dados vêm do Apify (paga por resultado, sem login no TikTok):
  automation-lab/tiktok-trends-scraper  ~US$ 0,002 por hashtag
  clockworks/tiktok-scraper             ~US$ 1,70 por 1.000 vídeos

Deploy (uma vez):
    modal secret create editaja-apify APIFY_TOKEN=apify_api_...   (ponha um limite de gasto no painel do Apify)
    modal deploy worker/tendencias.py
Rodar na mão:   modal run worker/tendencias.py::coletar
Frequência: hashtags todo dia; vídeos nos dias de DIAS_VIDEOS (0=seg … 6=dom). Padrão "0,3" = seg e qui.
"""
import json
import os
import statistics
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import modal

image = modal.Image.debian_slim(python_version="3.12").pip_install("supabase>=2.4", "anthropic")
app = modal.App("editaja-tendencias", image=image)
secrets = [modal.Secret.from_name("editaja-supabase"), modal.Secret.from_name("editaja-apify")]

PAIS = "BR"
VIDEOS_POR_BUSCA = int(os.environ.get("VIDEOS_POR_BUSCA", "30"))
ANALISAR_POR_DIA = int(os.environ.get("ANALISAR_POR_DIA", "50"))
TIPOS = ("alerta", "preco", "teste", "surpresa", "pergunta", "antes_depois", "outro")
TIPOS_CTA = ("carrinho", "cupom", "urgencia", "comentar", "seguir", "link_bio", "outro")
PISO_VIEWS = 1000                      # last30days: abaixo de 1.000 views é ruído
COMENTARIOS_POR_COLETA = int(os.environ.get("COMENTARIOS_POR_COLETA", "20"))   # vídeos que têm os comentários lidos
REMEDIR_POR_DIA = int(os.environ.get("REMEDIR_POR_DIA", "60"))                  # vídeos novos re-medidos todo dia
PESQUISAS_POR_DIA = int(os.environ.get("PESQUISAS_POR_DIA", "5"))               # por usuário
INTENCAO = ("onde compr", "onde acho", "link", "quanto", "qual o preço", "qual o valor", "comprei", "chegou", "quero", "carrinho",
            "cupom", "tem pra vender", "vende", "manda o link", "cadê o link", "qual loja")


# ---------------------------------------------------------------- notas (ideia da last30days)
def _log1p(x) -> float:
    import math
    return math.log1p(max(0, x or 0))


def nota_engajamento(v: dict) -> int:
    """0–100 comparável entre vídeos. ~1 mil views ≈ 10, ~130 mil ≈ 70, 1 milhão+ ≈ 90–100."""
    bruto = (0.45 * _log1p(v.get("views")) + 0.27 * _log1p(v.get("curtidas")) + 0.18 * _log1p(v.get("comentarios"))
             + 0.10 * _log1p((v.get("compartilhamentos") or 0) + (v.get("salvos") or 0)))
    return int(round(100 * max(0.0, min(1.0, (bruto - 2.1) / (11.5 - 2.1)))))


def _horas(v: dict) -> float:
    try:
        t = datetime.fromisoformat(str(v.get("postado_em")).replace("Z", "+00:00"))
    except ValueError:
        return 24 * 30
    return max(1.0, (datetime.now(timezone.utc) - t).total_seconds() / 3600)


def velocidade(v: dict) -> float:
    """Engajamento pesado pela idade: vídeo novo com muito engajamento sobe na frente."""
    dias = _horas(v) / 24
    peso = 1 / (int(dias) + 1) ** 0.5 * (1.5 if dias < 7 else 1.0)
    return round(nota_engajamento(v) * peso, 2)


def ritmo(v: dict, mediana: int, views_ontem: int | None = None) -> float:
    """Quantas vezes o vídeo está andando mais rápido que o normal do perfil.
    Com 2 medições usa o ganho real das últimas 24 h; com 1, views por hora desde a postagem.
    O "normal" é a mediana do perfil espalhada em 3 dias."""
    normal_hora = max(mediana, 1) / 72
    if views_ontem is not None:
        return round(max(0, v["views"] - views_ontem) / 24 / normal_hora, 2)
    return round(v["views"] / _horas(v) / normal_hora, 2)


def prestes(v: dict) -> bool:
    """Postado há até 3 dias, passou do piso e anda 3× mais rápido que o normal do perfil."""
    return _horas(v) <= 72 and (v.get("views") or 0) >= PISO_VIEWS and (v.get("ritmo") or 0) >= 3


def _db():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _apify(ator: str, entrada: dict, timeout=600) -> list[dict]:
    """Roda um ator do Apify e devolve os itens do dataset (uma chamada só)."""
    url = (f"https://api.apify.com/v2/acts/{ator.replace('/', '~')}/run-sync-get-dataset-items"
           f"?token={urllib.parse.quote(os.environ['APIFY_TOKEN'])}&timeout={timeout}")
    req = urllib.request.Request(url, data=json.dumps(entrada).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout + 30) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------- 1. hashtags em alta
def coletar_hashtags(db):
    hoje = datetime.now(timezone.utc).date().isoformat()
    for periodo in (7, 30, 90):
        itens = _apify("automation-lab/tiktok-trends-scraper", {"trendType": "hashtag", "countryCode": PAIS, "period": periodo, "maxResults": 100})
        linhas = [{
            "coletado_em": hoje, "periodo": periodo, "pais": PAIS, "hashtag": (i.get("name") or "").lstrip("#").lower(),
            "posicao": i.get("rank"), "posts": i.get("publishedVideoCount"), "views": i.get("videoViews"),
            "tendencia": i.get("trend"), "estagio": i.get("trendStage"), "momento_pct": i.get("momentumPct"),
            "curva": i.get("popularityCurve"), "setores": [s if isinstance(s, str) else s.get("name") for s in (i.get("industries") or [])],
        } for i in itens if i.get("name")]
        if linhas:
            db.table("hashtags_mercado").upsert(linhas).execute()
        print(f"hashtags {periodo}d: {len(linhas)}")


# ---------------------------------------------------------------- 2. vídeos virais por nicho
def _linha_video(i: dict, nicho_id: str) -> dict | None:
    vid = str(i.get("id") or "")
    if not vid:
        return None
    a, m, vm = i.get("authorMeta") or {}, i.get("musicMeta") or {}, i.get("videoMeta") or {}
    return {
        "tiktok_id": vid, "url": i.get("webVideoUrl") or "", "perfil": "@" + (a.get("name") or ""), "nicho_id": nicho_id,
        "legenda": i.get("text"), "hashtags": [h.get("name") if isinstance(h, dict) else h for h in (i.get("hashtags") or []) if h],
        "musica": m.get("musicName"), "capa_url": vm.get("coverUrl"), "duracao_s": vm.get("duration"),
        "postado_em": i.get("createTimeISO"), "views": i.get("playCount") or 0, "curtidas": i.get("diggCount") or 0,
        "compartilhamentos": i.get("shareCount") or 0, "comentarios": i.get("commentCount") or 0, "salvos": i.get("collectCount") or 0,
        "_seguidores": a.get("fans"), "_legenda_auto": next((s.get("downloadLink") for s in (vm.get("subtitleLinks") or [])
                                                             if str(s.get("language", "")).lower().startswith("por")), None),
    }


def coletar_videos(db) -> list[dict]:
    nichos = db.table("nichos_mercado").select("*").eq("ativo", True).execute().data or []
    desde = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    vistos: dict[str, dict] = {}
    for n in nichos:
        entrada = {"hashtags": n["hashtags"], "searchQueries": n["buscas"], "resultsPerPage": VIDEOS_POR_BUSCA,
                   "proxyCountryCode": PAIS, "shouldDownloadVideos": False, "shouldDownloadCovers": False, "shouldDownloadSubtitles": False}
        for i in _apify("clockworks/tiktok-scraper", entrada):
            l = _linha_video(i, n["id"])
            if l and (l["postado_em"] or "") >= desde and l["tiktok_id"] not in vistos:
                vistos[l["tiktok_id"]] = l
        print(f"nicho {n['id']}: {len(vistos)} vídeos até agora")
    return list(vistos.values())


# ---------------------------------------------------------------- 3. nota de viral
def _medianas(db, perfis: list[str]) -> dict[str, int]:
    """Mediana de views dos últimos 10 vídeos de cada perfil; reaproveita o que tiver menos de 7 dias."""
    limite = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    salvos = {r["perfil"]: r for r in (db.table("perfis_mercado").select("*").in_("perfil", perfis).execute().data or [])}
    faltam = [p for p in perfis if p not in salvos or salvos[p]["atualizado_em"] < limite]
    if faltam:
        itens = _apify("clockworks/tiktok-scraper", {"profiles": [p.lstrip("@") for p in faltam], "resultsPerPage": 10,
                                                    "profileScrapeSections": ["videos"], "profileSorting": "latest", "shouldDownloadVideos": False})
        por_perfil: dict[str, list[int]] = {}
        segs: dict[str, int] = {}
        for i in itens:
            p = "@" + ((i.get("authorMeta") or {}).get("name") or "")
            por_perfil.setdefault(p, []).append(i.get("playCount") or 0)
            segs[p] = (i.get("authorMeta") or {}).get("fans") or 0
        novos = [{"perfil": p, "seguidores": segs.get(p), "mediana_views": int(statistics.median(v)), "atualizado_em": datetime.now(timezone.utc).isoformat()}
                 for p, v in por_perfil.items() if v]
        if novos:
            db.table("perfis_mercado").upsert(novos).execute()
            salvos.update({r["perfil"]: r for r in novos})
    return {p: r["mediana_views"] for p, r in salvos.items() if r.get("mediana_views")}


# ---------------------------------------------------------------- 4. gancho, produto e nicho (Claude)
def _falas(link: str | None) -> tuple[str, str]:
    """(primeiros ~4 s, últimos ~6 s) da legenda automática do TikTok (WebVTT). O fim é onde fica o CTA."""
    if not link:
        return "", ""
    try:
        vtt = urllib.request.urlopen(link, timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return "", ""
    def seg(ts: str) -> float:   # "00:00:01.200" ou "00:01.200"
        partes = [float(x) for x in ts.strip().replace(",", ".").split(":")]
        return sum(x * 60 ** i for i, x in enumerate(reversed(partes)))
    deixas = []
    for bloco in vtt.replace("\r", "").split("\n\n"):
        linhas = [x for x in bloco.strip().splitlines() if x and not x.startswith("WEBVTT")]
        if len(linhas) >= 2 and "-->" in linhas[0]:
            ini, fim = linhas[0].split("-->")
            deixas.append((seg(ini), seg(fim.split()[0]), " ".join(linhas[1:])))
    if not deixas:
        return "", ""
    total = deixas[-1][1]
    inicio = " ".join(t for a, _, t in deixas if a <= 4)[:300]
    final = " ".join(t for a, b, t in deixas if b >= total - 6 and a > 4)[:300]
    return inicio, final


def _fala_inicial(link: str | None) -> str:
    return _falas(link)[0]


def _modelo(t: str | None) -> str:
    t = " ".join((t or "").split()).rstrip(".!").strip()
    return t[:1].upper() + t[1:]


def _claude_json(prompt: str, max_tokens=2000):
    import anthropic
    txt = anthropic.Anthropic().messages.create(model="claude-haiku-5-5", max_tokens=max_tokens,
                                                messages=[{"role": "user", "content": prompt}]).content[0].text
    i = min((txt.find(c) for c in "[{" if c in txt), default=-1)
    if i < 0:
        raise ValueError("resposta sem JSON")
    return json.loads(txt[i: txt.rindex("]" if txt[i] == "[" else "}") + 1])


def analisar(db, videos: list[dict]):
    """Manda os vídeos mais fortes para o Claude em lotes e grava gancho/produto/tipo; agrupa ganchos parecidos."""
    if not os.environ.get("ANTHROPIC_API_KEY") or not videos:
        return
    import anthropic
    cli = anthropic.Anthropic()
    modelos = [g["texto"] for g in (db.table("ganchos_mercado").select("texto").order("created_at", desc=True).limit(300).execute().data or [])]
    modelos_cta = [g["texto"] for g in (db.table("ctas_mercado").select("texto").order("created_at", desc=True).limit(200).execute().data or [])]
    for k in range(0, len(videos), 10):
        lote = videos[k:k + 10]
        entrada = []
        for v in lote:
            ini, fim = _falas(v.get("_legenda_auto"))
            entrada.append({"id": v["tiktok_id"], "legenda": (v.get("legenda") or "")[:400], "fala_inicial": ini, "fala_final": fim})
        msg = cli.messages.create(model="claude-haiku-5-5", max_tokens=2000, messages=[{"role": "user", "content":
            "Você analisa vídeos virais de TikTok de vendas no Brasil. Para cada vídeo, diga:\n"
            "- gancho: a frase de abertura que prende (use a fala inicial; sem ela, a 1ª frase da legenda), curta, sem emojis\n"
            "- modelo: a forma geral do gancho, sem o nome do produto (ex.: \"Não compre X antes de ver isso\" -> \"Não compre antes de ver isso\"). "
            "Se for igual em sentido a um destes modelos existentes, repita o existente: " + json.dumps(modelos[:150], ensure_ascii=False) + "\n"
            f"- tipo: um de {list(TIPOS)}\n- produto: o que está sendo vendido, em 2 a 4 palavras\n"
            "- cta: a chamada para ação (use a fala final; sem ela, a da legenda); vazio se não houver\n"
            "- cta_modelo: a forma geral do CTA, sem produto nem preço (ex.: \"Clica no carrinho laranja antes que acabe\"). "
            "Se for igual em sentido a um destes, repita o existente: " + json.dumps(modelos_cta[:100], ensure_ascii=False) + "\n"
            f"- cta_tipo: um de {list(TIPOS_CTA)}\n\n"
            "Vídeos: " + json.dumps(entrada, ensure_ascii=False) +
            "\nResponda só JSON: [{\"id\": \"...\", \"gancho\": \"...\", \"modelo\": \"...\", \"tipo\": \"...\", \"produto\": \"...\", "
            "\"cta\": \"...\", \"cta_modelo\": \"...\", \"cta_tipo\": \"...\"}]"}])
        txt = msg.content[0].text
        try:
            res = json.loads(txt[txt.index("["): txt.rindex("]") + 1])
        except ValueError:
            print("resposta sem JSON, lote pulado"); continue
        por_id = {v["tiktok_id"]: v for v in lote}
        for r in res:
            v = por_id.get(str(r.get("id")))
            if not v or not r.get("modelo"):
                continue
            modelo = _modelo(r["modelo"])
            g = db.table("ganchos_mercado").upsert({"texto": modelo, "tipo": r.get("tipo") if r.get("tipo") in TIPOS else "outro", "nicho_id": v["nicho_id"]},
                                                   on_conflict="texto", ignore_duplicates=False).execute().data
            gid = g[0]["id"] if g else None
            if modelo not in modelos:
                modelos.insert(0, modelo)
            cid = None
            cta_modelo = _modelo(r.get("cta_modelo"))
            if cta_modelo:
                c = db.table("ctas_mercado").upsert({"texto": cta_modelo, "tipo": r.get("cta_tipo") if r.get("cta_tipo") in TIPOS_CTA else "outro",
                                                     "nicho_id": v["nicho_id"]}, on_conflict="texto", ignore_duplicates=False).execute().data
                cid = c[0]["id"] if c else None
                if cta_modelo not in modelos_cta:
                    modelos_cta.insert(0, cta_modelo)
            db.table("videos_mercado").update({"gancho_falado": r.get("gancho"), "produto": r.get("produto"), "gancho_id": gid,
                                               "cta_falado": r.get("cta") or None, "cta_id": cid,
                                               "analisado_em": datetime.now(timezone.utc).isoformat()}).eq("tiktok_id", v["tiktok_id"]).execute()


# ---------------------------------------------------------------- 5. comentários: intenção de compra
def intencao_compra(textos: list[str]) -> float | None:
    """% de comentários que perguntam onde comprar, preço, link, ou dizem que compraram."""
    textos = [t.lower() for t in textos if t]
    if len(textos) < 5:
        return None
    return round(100 * sum(any(p in t for p in INTENCAO) for t in textos) / len(textos), 1)


def ler_comentarios(db, videos: list[dict]):
    if COMENTARIOS_POR_COLETA <= 0 or not videos:
        return
    alvo = videos[:COMENTARIOS_POR_COLETA]
    try:
        itens = _apify("clockworks/tiktok-comments-scraper", {"postURLs": [v["url"] for v in alvo], "commentsPerPost": 40})
    except Exception as e:
        print("comentários indisponíveis:", e); return
    por_url: dict[str, list[str]] = {}
    for c in itens:
        u = (c.get("videoWebUrl") or c.get("postUrl") or "").split("?")[0]
        por_url.setdefault(u, []).append(c.get("text") or "")
    for v in alvo:
        pct = intencao_compra(por_url.get(v["url"].split("?")[0], []))
        if pct is not None:
            db.table("videos_mercado").update({"intencao_compra_pct": pct}).eq("tiktok_id", v["tiktok_id"]).execute()


# ---------------------------------------------------------------- 6. re-medir vídeos novos (prestes a viralizar)
def remedir(db):
    """Todo dia: mede de novo os vídeos postados nos últimos 4 dias e recalcula ritmo com o ganho real de 24 h."""
    desde = (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()
    jovens = (db.table("videos_mercado").select("tiktok_id,url,perfil,views,postado_em").gte("postado_em", desde)
              .gte("views", PISO_VIEWS).order("velocidade", desc=True).limit(REMEDIR_POR_DIA).execute().data or [])
    if not jovens:
        return
    novos = {str(i.get("id")): i for i in _apify("clockworks/tiktok-scraper", {"postURLs": [j["url"] for j in jovens], "resultsPerPage": 1,
                                                                             "shouldDownloadVideos": False})}
    med = _medianas(db, sorted({j["perfil"] for j in jovens}))
    hoje = datetime.now(timezone.utc).date().isoformat()
    for j in jovens:
        i = novos.get(j["tiktok_id"])
        if not i:
            continue
        v = {**j, "views": i.get("playCount") or 0, "curtidas": i.get("diggCount") or 0, "comentarios": i.get("commentCount") or 0,
             "compartilhamentos": i.get("shareCount") or 0, "salvos": i.get("collectCount") or 0}
        v["ritmo"] = ritmo(v, med.get(j["perfil"]) or 1000, views_ontem=j["views"])
        db.table("videos_mercado").update({k: v[k] for k in ("views", "curtidas", "comentarios", "compartilhamentos", "salvos", "ritmo")} | {
            "nota_engajamento": nota_engajamento(v), "velocidade": velocidade(v), "prestes_viralizar": prestes(v),
            "nota_viral": round(v["views"] / max(med.get(j["perfil"]) or 1000, 1), 2)}).eq("tiktok_id", j["tiktok_id"]).execute()
        db.table("metricas_mercado").upsert({"tiktok_id": j["tiktok_id"], "coletado_em": hoje, "views": v["views"], "curtidas": v["curtidas"],
                                             "compartilhamentos": v["compartilhamentos"]}).execute()
    print(f"re-medidos: {len(jovens)}")


# ---------------------------------------------------------------- orquestração
@app.function(secrets=secrets, timeout=60 * 50, schedule=modal.Cron("0 6 * * *"))   # 06:00 UTC = 03:00 em Brasília
def coletar(forcar_videos: bool = False):
    db = _db()
    coletar_hashtags(db)
    remedir(db)
    dias = {int(d) for d in os.environ.get("DIAS_VIDEOS", "0,3").split(",") if d.strip()}
    if not forcar_videos and datetime.now(timezone.utc).weekday() not in dias:
        print("hoje só hashtags e re-medição"); return
    videos = coletar_videos(db)
    if not videos:
        return
    med = _medianas(db, sorted({v["perfil"] for v in videos if v["perfil"] != "@"})[:200])
    hoje = datetime.now(timezone.utc).date().isoformat()
    for v in videos:
        base = med.get(v["perfil"]) or max(v.pop("_seguidores", None) or 0, 1000) // 10   # sem mediana: ~10% dos seguidores
        v["nota_viral"] = round(v["views"] / max(base, 1), 2)
        v["nota_engajamento"], v["velocidade"], v["ritmo"] = nota_engajamento(v), velocidade(v), ritmo(v, base)
        v["prestes_viralizar"] = prestes(v)
        v.pop("_seguidores", None)
    linhas = [{k: x for k, x in v.items() if not k.startswith("_")} for v in videos]
    for k in range(0, len(linhas), 200):
        db.table("videos_mercado").upsert(linhas[k:k + 200]).execute()
    db.table("metricas_mercado").upsert([{"tiktok_id": v["tiktok_id"], "coletado_em": hoje, "views": v["views"], "curtidas": v["curtidas"],
                                          "compartilhamentos": v["compartilhamentos"]} for v in videos]).execute()
    videos = [v for v in videos if v["views"] >= PISO_VIEWS]
    fortes = sorted(videos, key=lambda v: (v["prestes_viralizar"], v["velocidade"]), reverse=True)[:ANALISAR_POR_DIA]
    analisar(db, fortes)
    ler_comentarios(db, fortes)
    print(f"ok: {len(videos)} vídeos, {len(fortes)} analisados")


@app.function(secrets=secrets, timeout=120)
@modal.fastapi_endpoint(method="POST")
def ler_link(body: dict):
    """'Aprender com vídeos': lê um link do TikTok pelo Apify (legenda, hashtags, views, perfil) e sugere produto e tipo de gancho."""
    if body.get("token") != os.environ.get("WORKER_TOKEN"):
        return {"erro": "sem permissão"}
    itens = _apify("clockworks/tiktok-scraper", {"postURLs": [body["url"]], "resultsPerPage": 1, "shouldDownloadVideos": False}, timeout=90)
    if not itens:
        return {"erro": "o TikTok não devolveu esse vídeo"}
    v = _linha_video(itens[0], body.get("nicho_id") or "")
    fala = _fala_inicial(v.pop("_legenda_auto", None)); v.pop("_seguidores", None)
    sugestao = {}
    if os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic
        txt = anthropic.Anthropic().messages.create(model="claude-haiku-5-5", max_tokens=300, messages=[{"role": "user", "content":
            f"Vídeo de TikTok. Legenda: {v.get('legenda')}\nFala inicial: {fala}\nProdutos cadastrados do criador: {body.get('produtos') or []}\n"
            f"Responda só JSON: {{\"gancho\": \"...\", \"tipo\": um de {list(TIPOS)}, \"produto\": nome cadastrado ou \"outro\", \"nicho\": \"...\"}}"}]).content[0].text
        try:
            sugestao = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
        except ValueError:
            pass
    return {"titulo": v.get("legenda") or "", "perfil": v.get("perfil"), "autor": v.get("perfil"), "thumb": v.get("capa_url"),
            "views": v.get("views"), "fala_inicial": fala, "sugestao": sugestao}


# ---------------------------------------------------------------- 7. pesquisa sob demanda (dentro da plataforma)
def expandir_buscas(tema: str) -> list[str]:
    """Como a last30days faz para produto: o tema + variações de review/unboxing, em português."""
    t = " ".join(tema.lower().replace("#", " ").split())[:60]
    return [t, f"{t} review", f"{t} unboxing", f"achadinho {t}"]


def _normalizar_tema(tema: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", tema.lower()).encode("ascii", "ignore").decode()
    return " ".join(t.replace("#", " ").split())[:60]


@app.function(secrets=secrets, timeout=300)
@modal.fastapi_endpoint(method="POST")
def pesquisar(body: dict):
    """Pesquisa no TikTok dos últimos `dias` sobre um tema. O app (/api/mercado/pesquisar) já conferiu o login,
    o limite diário e o cache; aqui só busca, pontua, analisa e grava o resultado na linha de pesquisas_mercado."""
    if body.get("token") != os.environ.get("WORKER_TOKEN"):
        return {"erro": "sem permissão"}
    tema, dias = (body.get("tema") or "").strip(), int(body.get("dias") or 30)
    if len(tema) < 2:
        return {"erro": "digite um produto ou tema"}
    desde = (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()
    t = " ".join(tema.lower().replace("#", " ").split())
    entrada = {"searchQueries": expandir_buscas(tema), "hashtags": [t.replace(" ", "")], "resultsPerPage": 20, "proxyCountryCode": PAIS,
               "shouldDownloadVideos": False, "shouldDownloadCovers": False, "shouldDownloadSubtitles": False}
    vistos: dict[str, dict] = {}
    for i in _apify("clockworks/tiktok-scraper", entrada, timeout=240):
        v = _linha_video(i, "")
        if v and v["views"] >= PISO_VIEWS and (v["postado_em"] or "") >= desde:
            vistos.setdefault(v["tiktok_id"], v)
    videos = list(vistos.values())
    for v in videos:
        base = max(v.get("_seguidores") or 0, 1000) // 10
        v["nota_viral"], v["nota_engajamento"], v["velocidade"] = round(v["views"] / base, 2), nota_engajamento(v), velocidade(v)
        v["ritmo"] = ritmo(v, base)
        v["prestes_viralizar"] = prestes(v)
    videos.sort(key=lambda v: v["velocidade"], reverse=True)
    perfis = {v["perfil"] for v in videos}
    resultado = {"tema": tema, "dias": dias, "total": len(videos), "gerado_em": datetime.now(timezone.utc).isoformat()}
    if len(videos) < 3 or len(perfis) < 2:   # last30days: "nada sólido" é uma resposta honesta
        resultado |= {"nada_solido": True, "videos": [], "ganchos": [], "ctas": [], "resumo": ""}
    else:
        top = videos[:12]
        analise: dict[str, dict] = {}
        resumo = ""
        if os.environ.get("ANTHROPIC_API_KEY"):
            entrada_ia = []
            for v in top:
                ini, fim = _falas(v.get("_legenda_auto"))
                entrada_ia.append({"id": v["tiktok_id"], "views": v["views"], "legenda": (v.get("legenda") or "")[:300], "fala_inicial": ini, "fala_final": fim})
            try:
                r = _claude_json(
                    f"Vídeos de TikTok Brasil sobre \"{tema}\" nos últimos {dias} dias, do mais rápido para o mais lento. Para cada vídeo diga "
                    f"gancho (frase de abertura), tipo (um de {list(TIPOS)}), cta (chamada final, vazio se não houver), cta_tipo (um de {list(TIPOS_CTA)}). "
                    "Depois escreva resumo: 3 frases curtas, em português simples, dizendo o que está funcionando agora para vender isso "
                    "(estilo de gancho, CTA, formato), só com base nestes vídeos.\nVídeos: " + json.dumps(entrada_ia, ensure_ascii=False) +
                    "\nResponda só JSON: {\"videos\": [{\"id\": \"...\", \"gancho\": \"...\", \"tipo\": \"...\", \"cta\": \"...\", \"cta_tipo\": \"...\"}], \"resumo\": \"...\"}", 3000)
                analise = {str(x.get("id")): x for x in r.get("videos", [])}
                resumo = r.get("resumo") or ""
            except Exception as e:
                print("análise falhou:", e)
        lista = []
        for v in top:
            a = analise.get(v["tiktok_id"], {})
            lista.append({k: v.get(k) for k in ("tiktok_id", "url", "perfil", "legenda", "capa_url", "postado_em", "views", "curtidas",
                                                 "comentarios", "compartilhamentos", "nota_viral", "nota_engajamento", "velocidade", "ritmo",
                                                 "prestes_viralizar")} | {"gancho": a.get("gancho"), "tipo": a.get("tipo"), "cta": a.get("cta"),
                                                                          "cta_tipo": a.get("cta_tipo")})
        def agrupar(campo: str, tipo: str):
            g: dict[str, dict] = {}
            for x in lista:
                if x.get(campo):
                    e = g.setdefault(x[tipo] or "outro", {"tipo": x[tipo] or "outro", "videos": 0, "perfis": set(), "views": 0, "exemplo": x[campo]})
                    e["videos"] += 1; e["perfis"].add(x["perfil"]); e["views"] += x["views"]
            out = [{"tipo": e["tipo"], "videos": e["videos"], "perfis": len(e["perfis"]), "media_views": e["views"] // e["videos"],
                    "exemplo": e["exemplo"], "confirmado": len(e["perfis"]) >= 2} for e in g.values()]
            return sorted(out, key=lambda e: (e["confirmado"], e["media_views"]), reverse=True)
        resultado |= {"nada_solido": False, "videos": lista, "ganchos": agrupar("gancho", "tipo"), "ctas": agrupar("cta", "cta_tipo"), "resumo": resumo}
    if body.get("pesquisa_id"):
        _db().table("pesquisas_mercado").update({"resultado": resultado}).eq("id", body["pesquisa_id"]).execute()
    return resultado
