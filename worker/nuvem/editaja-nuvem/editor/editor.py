#!/usr/bin/env python3
"""Editor automático de vídeos TikTok.

Etapas:
  1) transcribe  -> <nome>.transcricao.json  (palavras com tempo; whisper.cpp + modelos/ggml-small-q5_1.bin)
  2) plan        -> <nome>.plano.json        (trechos mantidos: corta respiros e tentativas repetidas)
  3) (Claude edita o plano: título, imagens, avaliações, zooms extras)
  4) render      -> <nome>_editado.mp4

Uso:
  python3 -I editor.py transcribe bruto.mp4 [--model caminho/ggml.bin]
  python3 -I editor.py plan bruto.mp4 [--sem-transcricao]
  python3 -I editor.py render bruto.mp4 [--saida final.mp4]
"""
import argparse, json, os, re, subprocess, sys, unicodedata, difflib

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1080, 1920
VELOCIDADE = 1.1  # padrão do Eduardo: todo vídeo sai acelerado 1.1x
FONT_CANDIDATES = [
    os.path.join(HERE, "fontes", "InterDisplay-Bold.otf"),
    "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

# ---------------------------------------------------------------- utilidades
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-4000:])
        raise SystemExit(f"falhou: {cmd[0]}")
    return r

def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(r.stdout.strip())

# ---------------------------------------------------------------- QUALIDADE + SÍLABAS (regras fixas do Eduardo, 2026-11-12)
TONEMAP_HDR = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=mobius:param=0.3:desat=0,"
               "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,")

def is_hdr(path):
    """iPhone grava em HDR (HLG/PQ, 10 bits). Sem tonemap o vídeo sai lavado/sem saturação."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=color_transfer", "-of", "csv=p=0", path], capture_output=True, text=True)
    return r.stdout.strip() in ("arib-std-b67", "smpte2084")

_SIL_CACHE = {}
def silences(path, noise_db=-42, min_sil=0.12):
    if path not in _SIL_CACHE:
        r = subprocess.run(["ffmpeg", "-i", path, "-af", f"silencedetect=n={noise_db}dB:d={min_sil}",
                            "-f", "null", "-"], capture_output=True, text=True)
        st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
        en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
        en += [duration(path)] * (len(st) - len(en))
        _SIL_CACHE[path] = list(zip(st, en))
    return _SIL_CACHE[path]

def _env_db(src, s, e, hop=0.01):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0, s):.3f}", "-t", f"{e - max(0, s):.3f}", "-i", src,
                          "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    a = np.frombuffer(raw, np.float32); n = int(16000 * hop)
    return [20 * np.log10(np.sqrt((a[j:j + n] ** 2).mean()) + 1e-9) for j in range(0, len(a) - n + 1, n)]

def proteger_silabas(trechos, video, quieto_db=-45, quieto_dur=0.06, max_fim=0.8, folga=0.06, ultimo_extra=0.3):
    """REGRA FIXA: NUNCA cortar o fim de sílaba/frase. Para cada corte, procura (no áudio, a cada 10 ms)
    o primeiro trecho realmente quieto (< -45 dB por 60 ms) a partir do ponto de corte e só corta ali.
    Se não houver quieto em 0.8 s, corta no ponto de menor energia (vale entre palavras).
    Não invade o trecho seguinte da mesma fonte. O último trecho ganha +0.3 s de respiro."""
    hop = 0.01; k = int(quieto_dur / hop); out = []
    for i, sg in enumerate(trechos):
        src = sg.get("fonte", video); sg = dict(sg)
        nxt = next((t["s"] for t in trechos[i + 1:] if t.get("fonte", video) == src and t["s"] >= sg["e"]), None)
        lim = sg["e"] + max_fim if nxt is None else min(sg["e"] + max_fim, nxt - 0.02)
        e0 = sg["e"] - 0.05
        db = _env_db(src, e0, lim)
        cut = None
        for j in range(len(db) - k + 1):
            if all(x < quieto_db for x in db[j:j + k]):
                cut = e0 + j * hop + folga; break
        if cut is None and db:
            j = min(range(len(db)), key=lambda q: db[q]); cut = e0 + j * hop
        novo = max(sg["e"], min(cut if cut else sg["e"], lim))
        if i == len(trechos) - 1:
            novo = min(novo + ultimo_extra, lim if nxt is not None else novo + ultimo_extra)
        sg["e"] = round(novo, 3)
        # início: recua até o silêncio antes da 1ª sílaba (máx. 0.2 s)
        prv = max([t["e"] for t in out if t.get("fonte", video) == src and t["e"] <= sg["s"]], default=0.0)
        s0 = max(prv, sg["s"] - 0.2); db = _env_db(src, s0, sg["s"] + 0.01)
        ini = sg["s"]
        for j in range(len(db) - 1, k - 2, -1):
            if all(x < quieto_db for x in db[max(0, j - k + 1):j + 1]):
                ini = s0 + (j + 1) * hop - 0.03; break
        else:
            ini = s0 if db else sg["s"]
        sg["s"] = round(max(prv + 0.02 if prv else 0.0, min(sg["s"], ini)), 3)
        out.append(sg)
    return out

# ---------------------------------------------------------------- EMOJI NA HEADLINE (regra do Eduardo, 2026-11-12)
EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
# palavra de alerta falada/escrita -> emoji de perigo ao lado da headline (varie entre eles de vídeo pra vídeo)
EMOJIS_ALERTA = {"cuidado": "⚠️", "atencao": "🚨", "perigo": "🚨", "alerta": "🚨", "golpe": "🚫", "falso": "❌", "fake": "❌"}

def emoji_da_headline(texto):
    t = norm(texto.replace(" ", ""))
    if t.startswith("naocompre") or "naocompre" in t:   # "não compre..." (exemplo do Eduardo: 🚨)
        return "🚨"
    for w in texto.split():
        n = norm(w)
        for k, e in EMOJIS_ALERTA.items():
            if n.startswith(k):
                return e
    return None

def titulo_png(texto, emoji, font_path, tamanho, out_png, max_chars=22):
    """Desenha a headline (branca, contorno preto) com o emoji COLORIDO ao lado (fim da última linha)."""
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(font_path, tamanho)
    lines = wrap(texto, max_chars).split("\n")
    ef = ImageFont.truetype(EMOJI_FONT, 109)
    em = None
    if emoji:
        tmp = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((10, 10), emoji, font=ef, embedded_color=True)
        em = tmp.crop(tmp.getbbox()); es = int(tamanho * 1.05)
        em = em.resize((int(em.width * es / em.height), es), Image.LANCZOS)
    pad, gap, lh = 20, 14, int(tamanho * 1.25)
    widths = [f.getbbox(l, stroke_width=3)[2] for l in lines]
    if em: widths[-1] += gap + em.width
    Wd = max(widths) + 2 * pad; Hd = lh * len(lines) + 2 * pad
    img = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        x = (Wd - widths[i]) // 2; y = pad + i * lh
        d.text((x + 2, y + 3), l, font=f, fill=(0, 0, 0, 120))          # sombra
        d.text((x, y), l, font=f, fill="white", stroke_width=3, stroke_fill=(0, 0, 0, 155))
        if em and i == len(lines) - 1:
            lw = f.getbbox(l, stroke_width=3)[2]
            img.alpha_composite(em, (x + lw + gap, y + (tamanho - es) // 2 + int(tamanho * 0.12)))
    img.save(out_png)
    return Wd

def paths(video):
    base = os.path.splitext(video)[0]
    return base + ".transcricao.json", base + ".plano.json", base + "_editado.mp4"

def norm(word):
    w = unicodedata.normalize("NFD", word.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)

# ---------------------------------------------------------------- 1) transcrição
MODEL_PATH = os.path.join(HERE, "modelos", "ggml-small-q5_1.bin")

def voiced_chunks(wav, noise_db=-35, min_sil=0.25, min_len=0.15):
    """Trechos com voz pelo silencedetect (tempos precisos; o whisper.cpp erra os tempos por palavra)."""
    r = subprocess.run(["ffmpeg", "-i", wav, "-af", f"silencedetect=n={noise_db}dB:d={min_sil}",
                        "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    total = duration(wav)
    out, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur >= min_len:
            out.append([cur, s])
        cur = e
    if total - cur >= min_len:
        out.append([cur, total])
    return out

def transcribe(video, model=None):
    """Acha os trechos com voz pelo áudio e transcreve cada um com whisper.cpp (modelo ggml local).
    Saída: "frases" (s/e precisos, texto) e "palavras" (tempo aproximado dentro da frase)."""
    import tempfile
    import numpy as np
    from pywhispercpp.model import Model
    tr_path, _, _ = paths(video)
    wav = tempfile.mktemp(suffix=".wav")
    run(["ffmpeg", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav])
    chunks = voiced_chunks(wav)
    import wave
    with wave.open(wav) as wf:
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    os.remove(wav)
    m = Model(model or MODEL_PATH, n_threads=os.cpu_count() or 4, redirect_whispercpp_logs_to=None)
    frases, words = [], []
    for s, e in chunks:
        a = audio[int(max(0, s - 0.1) * 16000): int((e + 0.1) * 16000)]
        if len(a) < 16000:  # whisper precisa de >= 1s
            a = np.concatenate([a, np.zeros(16000 - len(a), np.float32)])
        txt = " ".join(seg.text.strip() for seg in m.transcribe(a, language="pt", no_context=True,
                                                               print_progress=False)).strip()
        txt = re.sub(r"\[.*?\]|\(.*?\)", "", txt).strip()
        if not txt:
            continue
        frases.append({"s": round(s, 3), "e": round(e, 3), "texto": txt})
        ws = txt.split(); step = (e - s) / len(ws)
        for k, w in enumerate(ws):
            words.append({"s": round(s + k * step, 3), "e": round(s + (k + 1) * step, 3), "w": w})
    json.dump({"frases": frases, "palavras": words}, open(tr_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(frases)} frases, {len(words)} palavras -> {tr_path}")

# ---------------------------------------------------------------- 2) plano de cortes
def silence_segments(video, noise_db=-35, min_sil=0.30):
    """Fallback sem transcrição: trechos com voz, segundo o silencedetect."""
    r = subprocess.run(["ffmpeg", "-i", video, "-af", f"silencedetect=n={noise_db}dB:d={min_sil}",
                        "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    total = duration(video)
    keep, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur > 0.15:
            keep.append([cur, s])
        cur = e
    if total - cur > 0.15:
        keep.append([cur, total])
    return [{"s": a, "e": b, "texto": ""} for a, b in keep]

def phrases_from_words(words, gap=0.35):
    """Agrupa palavras em frases quando há uma pausa maior que `gap`."""
    out, cur = [], []
    for w in words:
        if cur and w["s"] - cur[-1]["e"] > gap:
            out.append(cur); cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [{"s": p[0]["s"], "e": p[-1]["e"], "texto": " ".join(x["w"] for x in p),
             "tokens": [norm(x["w"]) for x in p if norm(x["w"])]} for p in out]

def merge_close(ph, gap=0.35):
    """Junta frases separadas por pausa curta (respiração no meio da frase)."""
    out = []
    for p in ph:
        if out and p["s"] - out[-1]["e"] < gap:
            o = out[-1]; o["e"] = p["e"]; o["texto"] += " " + p["texto"]; o["tokens"] += p["tokens"]
        else:
            out.append(dict(p))
    return out

def is_retake(a, b):
    """True se a frase `a` parece uma tentativa abandonada que `b` refaz."""
    ta, tb = a["tokens"], b["tokens"]
    if not ta or not tb:
        return False
    n = min(3, len(ta), len(tb))
    same_start = ta[:n] == tb[:n]
    # a é (quase) um começo de b, ou a e b são muito parecidas
    prefix_sim = difflib.SequenceMatcher(None, ta, tb[:len(ta) + 1]).ratio()
    whole_sim = difflib.SequenceMatcher(None, ta, tb).ratio()
    return (same_start and prefix_sim >= 0.6) or whole_sim >= 0.75

def detect_capa(video, max_t=0.6, limiar=0.30):
    """Se o bruto abre com um take curto (corte de cena nos primeiros ~0.6 s), devolve esse take como capa."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-t", str(max_t), "-i", video, "-vf",
                        f"select='gt(scene,{limiar})',showinfo", "-an", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    ts = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r)]
    ts = [t for t in ts if 0.02 < t <= max_t]
    if ts:
        return {"s": 0.0, "e": round(ts[0], 3), "origem": "bruto (já definida pelo criador)"}
    return None

# ---------------------------------------------------------------- REAÇÃO DE SURPRESA (Eduardo, 2026-11-16)
# Não depende da palavra "uau": é uma CATEGORIA (espanto, impressionado, surpresa). Três sinais somam nota:
#   1) fala: qualquer expressão de espanto do português falado (lista abaixo, sem acento);
#   2) voz: o trecho é bem mais alto que a média da pessoa (pico de energia), típico de reação;
#   3) forma: frase curta e exclamativa ("!" na transcrição, poucas palavras).
# O Claude ainda confere o rosto nos frames (olhos/boca abertos, mão na boca) antes de usar.
EXPRESSOES_SURPRESA = (
    "uau", "wow", "nossa", "nossasenhora", "caraca", "caramba", "carai", "meudeus", "mds", "jesus", "socorro",
    "gente", "queisso", "olhaisso", "olhasoisso", "olhaque", "naoacredito", "naotoacreditando", "serio", "eita", "vixe",
    "mano", "minhanossa", "queabsurdo", "absurdo", "surreal", "impressionante", "incrivel", "chocada", "chocado",
    "quelindo", "quelinda", "perfeito", "perfeita", "apaixonada", "apaixonado", "oxe", "uhul", "aaah", "ahh", "ohh", "oh",
)

def detectar_surpresas(video, frases, nota_min=1.5):
    if not frases:
        return []
    niveis = []
    for f in frases:
        try:
            env = _env_db(video, f["s"], f["e"])
            niveis.append(max(env) if env else -60.0)
        except Exception:
            niveis.append(-60.0)
    ordenado = sorted(niveis); mediana = ordenado[len(ordenado) // 2]
    out = []
    for f, pico in zip(frases, niveis):
        t = norm(f["texto"].replace(" ", ""))
        palavras = [norm(w) for w in f["texto"].split() if norm(w)]
        nota, motivos = 0.0, []
        expr = next((x for x in EXPRESSOES_SURPRESA if t.startswith(x) or x in t[:24]
                     or any(w == x for w in palavras[:4])), None)
        if expr:
            nota += 1.5; motivos.append(f"fala de espanto ({expr})")
        if pico - mediana >= 6:
            nota += 1.0; motivos.append(f"voz {pico - mediana:.0f} dB acima do normal")
        if "!" in f["texto"] or (len(palavras) <= 3 and f["e"] - f["s"] <= 1.6):
            nota += 0.5; motivos.append("frase curta/exclamativa")
        if nota >= nota_min:
            out.append({"s": f["s"], "e": f["e"], "texto": f["texto"], "nota": round(nota, 1), "motivos": motivos})
    return sorted(out, key=lambda m: -m["nota"])

def plan(video, use_transcript=True, pad_in=0.06, pad_out=0.12):
    tr_path, plan_path, _ = paths(video)
    total = duration(video)
    removed = []
    if use_transcript and os.path.exists(tr_path):
        tr = json.load(open(tr_path))
        if tr.get("frases"):
            ph = [dict(f, tokens=[norm(x) for x in f["texto"].split() if norm(x)]) for f in tr["frases"]]
            ph = merge_close(ph)
        else:
            ph = phrases_from_words(tr["palavras"])
        keep = []
        for i, p in enumerate(ph):
            nxt = ph[i + 1: i + 3]  # compara com as 2 frases seguintes
            if any(is_retake(p, q) for q in nxt):
                removed.append({"s": p["s"], "e": p["e"], "texto": p["texto"], "motivo": "tentativa repetida"})
                continue
            keep.append(p)
    else:
        keep = silence_segments(video)
    segs = []
    for p in keep:
        s, e = max(0, p["s"] - pad_in), min(total, p["e"] + pad_out)
        if segs and s - segs[-1]["e"] < 0.08:      # emenda trechos colados
            segs[-1]["e"] = e; segs[-1]["texto"] += " " + p["texto"]
        else:
            segs.append({"s": round(s, 3), "e": round(e, 3), "texto": p["texto"]})
    # zoom em cortes: alterna 1.0 / 1.15 a cada ~8-15s de vídeo final, nunca em trecho < 1.2s
    t_out, last_zoom_at, zoomed = 0.0, -99, False
    for sg in segs:
        dur = sg["e"] - sg["s"]
        if t_out - last_zoom_at >= 8 and dur >= 1.2:
            zoomed = not zoomed; last_zoom_at = t_out
        sg["zoom"] = 1.0   # padrão clean: sem punch-in (Eduardo pediu edição simples)
        t_out += dur
    # REAÇÃO DE SURPRESA (antes "uau"): categoria, não palavra. Ver detectar_surpresas().
    momentos_surpresa = []
    if use_transcript and os.path.exists(tr_path):
        momentos_surpresa = detectar_surpresas(video, json.load(open(tr_path)).get("frases", []))
    data = {
        "fonte": os.path.basename(video),
        # UAU NA FRENTE é OPCIONAL (decisão do Eduardo): só liga se a pessoa pedir para ESTE vídeo.
        # REGRA FIXA (Eduardo): todo vídeo começa com 0.1 s de CAPA (frame p/ thumbnail do TikTok).
        # Se o bruto já abre com um take curto de capa, ele é detectado e mantido; senão o Claude
        # escolhe o melhor take (confere nos frames) e preenche {"s": t, "e": t+0.1}.
        "capa": detect_capa(video),
        "surpresa_no_inicio": False,   # True = abre o vídeo com a reação de surpresa escolhida (opcional, por vídeo)
        "surpresa_escolhida": None,    # {"s":..,"e":..} (1-2 s, do bruto) — Claude confere nos frames (rosto/expressão)
        "momentos_surpresa": momentos_surpresa,  # candidatos com nota e motivos; se houver e não foi pedido -> SUGERIR
        "duracao_original": round(total, 2),
        "velocidade": VELOCIDADE,
        "duracao_final": round(t_out / VELOCIDADE, 2),
        "trechos": segs,
        "removidos": removed,
        # preenchido pelo Claude depois de ler a transcrição.
        # Tempos de "titulo" e "sobreposicoes" são no VÍDEO FINAL (depois dos cortes).
        # headline OPCIONAL (Eduardo): "ativo": False = vídeo sem texto na tela. "x"/"y" = centro do texto
        # em fração da tela (0..1), escolhidos pela pessoa; sem x/y usa o centro e y=0.60.
        "titulo": {"texto": "", "ate": 6.0, "ativo": True},
        "legenda_corrida": False,
        "sobreposicoes": [
            # {"tipo": "imagem", "arquivos": ["a.jpg"], "de": 1.0, "ate": 3.0},
            # {"tipo": "lado_a_lado", "arquivos": ["antes.jpg", "depois.jpg"], "de": 10, "ate": 13},
            # {"tipo": "avaliacoes", "arquivos": ["r1.png", "r2.png", "r3.png"], "de": 40, "intervalo": 0.7, "ate": 45}
        ],
    }
    json.dump(data, open(plan_path, "w"), ensure_ascii=False, indent=1)
    if momentos_surpresa:
        print(f"SUGESTÃO: {len(momentos_surpresa)} possível(is) reação(ões) de surpresa -> "
              + "; ".join(f"{m['s']:.1f}s '{m['texto'][:40]}' ({', '.join(m['motivos'])})" for m in momentos_surpresa[:5])
              + ". Não aplicado (opcional). Para versão alternativa: conferir nos frames, preencher surpresa_escolhida e rodar render --surpresa.")
    print(f"{len(segs)} trechos, {len(removed)} tentativas removidas, "
          f"{total:.1f}s -> {t_out / VELOCIDADE:.1f}s (em {VELOCIDADE}x)  -> {plan_path}")

# ---------------------------------------------------------------- 3) render
def esc_text(t):
    # a fonte não tem emoji (sairia um quadrado): remove emojis/símbolos fora do BMP
    t = "".join(c for c in t if ord(c) < 0x2600 or 0x3000 <= ord(c) < 0xD800).strip()
    t = re.sub(r"[ \t]+", " ", t)
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")

def wrap(text, max_chars=22):
    lines, cur = [], ""
    for w in text.split():
        if len(cur) + len(w) + 1 > max_chars and cur:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return "\n".join(lines)

def tap_sound(path):
    if not os.path.exists(path):
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=f=1800:d=0.09", "-f", "lavfi", "-i",
             "sine=f=2600:d=0.09", "-filter_complex",
             "[0][1]amix=2,afade=t=out:st=0.01:d=0.08,volume=2.5", path])
    return path

def word_captions(video, data):
    """Mapeia palavras da transcrição para o tempo do vídeo final."""
    cache = {}
    def words_of(src):
        if src not in cache:
            tr = paths(src)[0]
            cache[src] = json.load(open(tr))["palavras"] if os.path.exists(tr) else []
        return cache[src]
    out, t0 = [], 0.0
    for sg in data["trechos"]:
        for w in words_of(sg.get("fonte", video)):
            if sg["s"] <= w["s"] and w["e"] <= sg["e"] + 0.05:
                v = float(data.get("velocidade", VELOCIDADE))
                out.append(((t0 + w["s"] - sg["s"]) / v, (t0 + w["e"] - sg["s"]) / v, w["w"]))
        t0 += sg["e"] - sg["s"]
    return out

def render(video, out=None, images_root=None, sound=None, surpresa=False, uau=False):
    _, plan_path, default_out = paths(video)
    out = out or default_out
    data = json.load(open(plan_path))
    surpresa = surpresa or uau
    if surpresa or data.get("surpresa_no_inicio") or data.get("uau_no_inicio"):
        u = (data.get("surpresa_escolhida") or data.get("uau_escolhido")
             or (data.get("momentos_surpresa") or data.get("momentos_uau") or [None])[0])
        if not u:
            raise SystemExit("reação de surpresa pedida, mas o plano não tem 'surpresa_escolhida' nem 'momentos_surpresa'")
        clip = {"s": u["s"], "e": min(u["e"], u["s"] + 2.5), "zoom": 1.0, "texto": "reação de surpresa (prévia)"}
        data["trechos"] = [clip] + data["trechos"]
        shift = (clip["e"] - clip["s"]) / float(data.get("velocidade", VELOCIDADE))
        for ov in data.get("sobreposicoes", []):   # empurra os tempos das imagens/título
            for k in ("de", "ate"):
                if k in ov: ov[k] += shift
            for p in ov.get("pontos", []):
                p["de"] += shift
                if "ate" in p: p["ate"] += shift
            if "tempos" in ov: ov["tempos"] = [t + shift for t in ov["tempos"]]
        if data.get("titulo"): data["titulo"]["ate"] = data["titulo"].get("ate", 6) + shift
        if surpresa and out == default_out:
            out = default_out.replace("_editado.mp4", "_editado_versao_surpresa.mp4")
    font = next(f for f in FONT_CANDIDATES if os.path.exists(f))
    # cada trecho entra como input próprio (-ss/-to): evita estourar memória com vídeos longos
    if data.get("proteger_silabas", True):
        data["trechos"] = proteger_silabas(data["trechos"], video)
    inputs = []
    for sg in data["trechos"]:
        inputs += ["-ss", f"{sg['s']:.3f}", "-to", f"{sg['e']:.3f}", "-i", sg.get("fonte", video)]
    fc = []
    # cortes + zoom por trecho
    for i, sg in enumerate(data["trechos"]):
        z = sg.get("zoom", 1.0)
        tm = TONEMAP_HDR if is_hdr(sg.get("fonte", video)) else "format=yuv420p,"
        fc.append(f"[{i}:v]setpts=PTS-STARTPTS,{tm}"
                  f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                  f"scale=iw*{z}:-2,crop={W}:{H}:(iw-{W})/2:(ih-{H})*0.2,setsar=1,fps=30[v{i}]")
        nr = "highpass=f=80,afftdn=nf=-25:tn=1," if data.get("reduzir_ruido", True) else ""
        fc.append(f"[{i}:a]asetpts=PTS-STARTPTS,{nr}"
                  f"afade=t=in:d=0.02,areverse,afade=t=in:d=0.03,areverse[a{i}]")
    n = len(data["trechos"])
    fc.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vc][ac]")
    last, alast0 = "vc", "ac"
    vel = float(data.get("velocidade", VELOCIDADE))
    if abs(vel - 1.0) > 1e-3:   # acelera fala e imagem; tempos de título/sobreposições são no vídeo já acelerado
        fc.append(f"[vc]setpts=PTS/{vel}[vs]")
        fc.append(f"[ac]atempo={vel}[as]")
        last, alast0 = "vs", "as"
    taps = []  # momentos de "toque"
    idx = len(data["trechos"])
    def snd_path(name):
        p = os.path.join(HERE, "sons", f"{name}.wav")
        return p if os.path.exists(p) else None   # sem arquivo aprovado = sem som
    def add_image(path, width, x_expr, y_expr, t_in, t_out, angle=0):
        nonlocal idx, last
        full = path if os.path.isabs(path) or not images_root else os.path.join(images_root, path)
        inputs.extend(["-loop", "1", "-t", str(t_out + 1), "-i", full])
        lab = f"im{idx}"
        fade = (f"fade=t=in:st={t_in}:d=0.15:alpha=1,fade=t=out:st={t_out - 0.15}:d=0.15:alpha=1,"
                if data.get("animacoes") else "")   # padrão clean: aparece/some seco
        rot = (f"rotate={angle}*PI/180:c=none:ow=rotw({angle}*PI/180):oh=roth({angle}*PI/180),"
               if angle else "")   # foto inclinada (estilo referencia_imagens_inclinadas)
        fc.append(f"[{idx}:v]scale={width}:-1,format=rgba,{rot}{fade}setpts=PTS-STARTPTS[{lab}]")
        fc.append(f"[{last}][{lab}]overlay=x={x_expr}:y={y_expr}:"
                  f"enable='between(t,{t_in},{t_out})':eof_action=pass[o{idx}]")
        last = f"o{idx}"; idx += 1
    for ov in data.get("sobreposicoes", []):
        t, files = ov["tipo"], ov["arquivos"]
        if t == "imagem":
            x = f"W*{ov['x']}" if "x" in ov else "(W-w)/2"
            add_image(files[0], int(W * ov.get("largura", 0.62)), x, f"H*{ov.get('y', 0.18)}",
                      ov["de"], ov["ate"])
        elif t == "lado_a_lado":
            for k, f in enumerate(files[:2]):
                add_image(f, int(W * 0.46), f"W*{0.03 + 0.48 * k}", f"H*{ov.get('y', 0.2)}",
                          ov["de"] + 0.25 * k, ov["ate"])
        elif t == "avaliacoes":
            step = ov.get("intervalo", 0.7)
            for k, f in enumerate(files):
                t_in = ov["de"] + step * k
                add_image(f, int(W * 0.84), "(W-w)/2", f"H*{0.10 + 0.13 * k}", t_in, ov["ate"])
                if ov.get("toque"):   # som só quando o Eduardo pedir
                    taps.append((t_in, snd_path(ov.get("som", "toque"))))
        elif t == "apontado":
            # 1 imagem por ponto: {"arquivos":[...], "pontos":[{"x":0.03,"y":0.05,"de":0.1,"angulo":-7}, ...],
            #   "largura":0.42, "ate":3.5, "som":"gota"}  -> foto inclinada entra seca, com som em cada uma
            for f, p in zip(files, ov["pontos"]):
                add_image(f, int(W * p.get("largura", ov.get("largura", 0.42))), f"W*{p['x']}", f"H*{p['y']}",
                          p["de"], p.get("ate", ov["ate"]), p.get("angulo", ov.get("angulo", 0)))
                if ov.get("som"):
                    taps.append((p["de"], snd_path(ov["som"])))
        elif t == "gancho_falso":
            # 1 imagem por "falso" falado; aparecem uma a uma (1ª à direita, 2ª à esquerda...) e ficam juntas
            ts = ov["tempos"]; n = len(files); wfrac = ov.get("largura", min(0.40, 0.88 / n))
            xs = [0.5 + 0.02, 0.5 - 0.02 - wfrac] if n == 2 else [0.06 + k * (0.88 / n) for k in range(n)]
            for k, f in enumerate(files):
                add_image(f, int(W * wfrac), f"W*{xs[k]}", f"H*{ov.get('y', 0.04)}", ts[k], ov["ate"])
        if ov.get("toque") and t not in ("avaliacoes", "apontado"):
            taps.append((ov["de"], snd_path(ov.get("som", "toque"))))
    # título-gancho
    tit = data.get("titulo") or {}
    if tit.get("texto"):   # REGRA FIXA (Eduardo): headline nunca termina com ponto final
        tit["texto"] = re.sub(r"[\s.…]+$", "", tit["texto"].strip())
    if tit.get("texto") and tit.get("ativo", True):
        tx = tit.get("x")   # centro horizontal escolhido pela pessoa (0..1); None = centralizado
        emoji = tit.get("emoji", emoji_da_headline(tit["texto"]))   # "cuidado" -> ⚠️ automático
        if emoji:
            png = os.path.splitext(out)[0] + "_titulo.png"
            wpx = titulo_png(tit["texto"], emoji, font, tit.get("tamanho", 66), png)
            xe = "(W-w)/2" if tx is None else f"max(0,min(W-w,W*{tx}-w/2))"
            add_image(png, wpx, xe, f"H*{tit.get('y', 0.60)}-20", 0, tit.get("ate", 6))
        else:
            fc.append(f"[{last}]drawtext=fontfile={font}:text='{esc_text(wrap(tit['texto']))}':"
                      f"fontsize={tit.get('tamanho', 66)}:fontcolor=white:borderw=3:bordercolor=black@0.6:"
                      f"shadowcolor=black@0.5:shadowx=2:shadowy=3:line_spacing=10:text_align=C:"
                      f"x={'(w-text_w)/2' if tx is None else f'max(0,min(w-text_w,w*{tx}-text_w/2))'}:"
                      f"y=h*{tit.get('y', 0.60)}:enable='lt(t,{tit.get('ate', 6)})'[tt]")
            last = "tt"
    # legenda corrida opcional (palavra a palavra, em blocos de até 3)
    if data.get("legenda_corrida"):
        caps = word_captions(video, data)
        for j in range(0, len(caps), 3):
            grp = caps[j:j + 3]
            txt = esc_text(" ".join(c[2] for c in grp).upper())
            a, b = grp[0][0], grp[-1][1]
            fc.append(f"[{last}]drawtext=fontfile={font}:text='{txt}':fontsize=64:fontcolor=white:"
                      f"borderw=5:bordercolor=black:x=(w-text_w)/2:y=h*0.70:"
                      f"enable='between(t,{a:.3f},{b:.3f})'[c{j}]")
            last = f"c{j}"
    # sons de toque
    alast = alast0
    # REGRA FIXA (Eduardo): toda vez que a pessoa fala "clica/clique/clicar..." toca o mouse-click
    if data.get("click_na_fala", True):
        for t0, t1, w in word_captions(video, data):
            if norm(w).startswith("cliq") or norm(w).startswith("clic"):
                taps.append((max(0.0, t0), snd_path("click")))
    taps = [tp for tp in taps if tp[1]]
    if taps:
        vol = data.get("volume_efeitos", 0.6)
        for k, (t, snd) in enumerate(taps):
            inputs.extend(["-i", snd])
            fc.append(f"[{idx}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={vol},"
                      f"adelay={int(t * 1000)}:all=1[td{k}]"); idx += 1
        fc.append(f"[{alast0}]" + "".join(f"[td{k}]" for k in range(len(taps))) +
                  f"amix=inputs={len(taps) + 1}:normalize=0:duration=first[am]")
        alast = "am"
    # CAPA 0.1 s no início (sem título, sem som, sem 1.1x) — REGRA FIXA
    capa = data.get("capa")
    if capa is None:
        t0 = data["trechos"][0]["s"] + 0.5
        capa = {"s": t0, "e": t0 + 0.1}
        print("AVISO: plano sem 'capa' -> usando frame automático em", round(t0, 2),
              "s. O certo é o Claude escolher o melhor take e preencher 'capa'.")
    if capa:
        cs, ce = capa["s"], capa["e"]
        csrc = capa.get("fonte", video)
        inputs += ["-ss", f"{cs:.3f}", "-t", f"{ce - cs:.3f}", "-i", csrc]
        tm = TONEMAP_HDR if is_hdr(csrc) else "format=yuv420p,"
        fc.append(f"[{idx}:v]trim=duration={ce - cs:.3f},setpts=PTS-STARTPTS,{tm}"
                  f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30[capv]")
        fc.append(f"anullsrc=r=44100:cl=stereo,atrim=0:{ce - cs:.3f}[capa_a]")
        fc.append(f"[{alast}]aformat=sample_rates=44100:channel_layouts=stereo[mainA]")
        fc.append(f"[capv][capa_a][{last}][mainA]concat=n=2:v=1:a=1[fv][fa]")
        last, alast = "fv", "fa"
    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", f"[{last}]",
           "-map", f"[{alast}]", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
    run(cmd)
    print(f"ok -> {out} ({duration(out):.1f}s, {os.path.getsize(out)/1e6:.1f} MB)")
    if os.path.getsize(out) > 24.5e6:
        versao_pc(out)

def versao_pc(master, limite_mb=24.0):
    """O envio pro PC aceita até 25 MB. Gera *_pc.mp4 em 2 passes (melhor qualidade possível nesse tamanho).
    O master em alta qualidade continua sendo o arquivo principal (anexar no chat)."""
    d = duration(master); kbps = int(limite_mb * 8192 / d) - 192
    out = master.replace(".mp4", "_pc.mp4"); log = master + ".2pass"
    base = ["ffmpeg", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-b:v", f"{kbps}k",
            "-maxrate", f"{int(kbps*1.5)}k", "-bufsize", f"{kbps*3}k", "-passlogfile", log,
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
    run(base + ["-pass", "1", "-an", "-f", "mp4", "/dev/null"])
    run(base + ["-pass", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out])
    print(f"versão PC (<25 MB) -> {out} ({os.path.getsize(out)/1e6:.1f} MB, {kbps} kbps)")

# ---------------------------------------------------------------- CLI
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("etapa", choices=["transcribe", "plan", "render"])
    ap.add_argument("video")
    ap.add_argument("--model", default=None)
    ap.add_argument("--sem-transcricao", action="store_true")
    ap.add_argument("--saida")
    ap.add_argument("--imagens", help="pasta base das imagens das sobreposições")
    ap.add_argument("--surpresa", "--uau", dest="surpresa", action="store_true",
                    help="gera versão ALTERNATIVA abrindo com a reação de surpresa (opcional)")
    a = ap.parse_args()
    if a.etapa == "transcribe":
        transcribe(a.video, a.model)
    elif a.etapa == "plan":
        plan(a.video, use_transcript=not a.sem_transcricao)
    else:
        render(a.video, a.saida, a.imagens, surpresa=a.surpresa)
