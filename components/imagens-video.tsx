"use client";
import * as React from "react";
import Link from "next/link";
import { Image as ImageIcon, Loader2, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { linkAssinado } from "@/components/capa-video";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/data";

/** Uma imagem do produto no vídeo final. Tempos no vídeo editado; x/y = canto de cima à esquerda (fração da tela). */
export type ImagemNoVideo = {
  id: string; rotulo: string; imagem_id: string; path: string;
  de: number; ate: number; x: number; y: number; largura: number; angulo: number; motivo?: string;
};
type ImagemProduto = { id: string; rotulo: string; storage_path: string; nome: string };

const CAPA = 0.1; // o vídeo final começa com a capa de 0,1 s: o que o player mostra = tempo da edição + 0,1 s
const NOME: Record<string, string> = { produto: "Produto", original: "Original", falso: "Falso", detalhe: "Detalhe", print: "Print" };
const COR: Record<string, string> = {
  produto: "bg-primary text-primary-foreground", original: "bg-success text-white", falso: "bg-destructive text-white",
  detalhe: "bg-amber-500 text-white", print: "bg-sky-600 text-white",
};
const LUGAR: Record<string, { x: number; y: number; angulo: number; largura: number }> = {
  falso: { x: 0.05, y: 0.10, angulo: -7, largura: 0.42 }, original: { x: 0.53, y: 0.10, angulo: 6, largura: 0.42 },
  produto: { x: 0.53, y: 0.12, angulo: 6, largura: 0.42 }, detalhe: { x: 0.53, y: 0.34, angulo: 5, largura: 0.40 },
  print: { x: 0.12, y: 0.10, angulo: -3, largura: 0.76 },
};
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0").replace(".", ",")}`;
const lim = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function useLink(bucket: string, caminho?: string | null) {
  const [u, setU] = React.useState<string | null>(null);
  React.useEffect(() => {
    let vivo = true; setU(null);
    if (caminho && supabase) linkAssinado(bucket, caminho).then((x) => vivo && setU(x));
    return () => { vivo = false; };
  }, [bucket, caminho]);
  return u;
}

function Miniatura({ path, className }: { path: string; className?: string }) {
  const u = useLink("biblioteca", path);
  return u ? <img src={u} alt="" draggable={false} className={className} /> : <div className={cn("animate-pulse bg-muted", className)} />;
}

/**
 * Imagens do produto no vídeo: o editor sugere onde e quando cada imagem entra (pela fala: "falso", "original",
 * nome do produto, "detalhe", "clica"...). Aqui a pessoa arrasta, muda o tempo e o tamanho, tira ou põe outra, e refaz o vídeo.
 */
export function ImagensDoVideo({ v, onRefazer }: { v: Video; onRefazer: (texto: string) => void }) {
  const x = v as Video & { editadoPath?: string; capaPath?: string };
  const [carregou, setCarregou] = React.useState(false);
  const [produtoId, setProdutoId] = React.useState<string | null>(null);
  const [original, setOriginal] = React.useState<ImagemNoVideo[] | null>(null);
  const [itens, setItens] = React.useState<ImagemNoVideo[]>([]);
  const [doProduto, setDoProduto] = React.useState<ImagemProduto[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const caixa = React.useRef<HTMLDivElement>(null);
  const arrasto = React.useRef<{ id: string; dx: number; dy: number } | null>(null);
  const fundoVideo = React.useRef<HTMLVideoElement>(null);
  const urlVideo = useLink("editados", x.editadoPath);
  const urlCapa = useLink("brutos", x.capaPath);
  const dur = Math.max(1, (v.duracaoFinal ?? 30) - CAPA);

  React.useEffect(() => {
    let vivo = true;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from("videos").select("imagens, produto_id").eq("id", v.id).maybeSingle();
      const lista = ((data?.imagens ?? null) as ImagemNoVideo[] | null);
      const pid = (data?.produto_id ?? null) as string | null;
      let imgs: ImagemProduto[] = [];
      if (pid) {
        const r = await supabase.from("produto_imagens").select("id, rotulo, storage_path, nome").eq("produto_id", pid).order("ordem");
        imgs = (r.data ?? []) as ImagemProduto[];
      }
      if (!vivo) return;
      setProdutoId(pid); setOriginal(lista); setItens(lista ?? []); setDoProduto(imgs); setSel(lista?.[0]?.id ?? null); setCarregou(true);
    })();
    return () => { vivo = false; };
  }, [v.id, v.versao, x.editadoPath]);

  const atual = itens.find((i) => i.id === sel) ?? null;
  // fundo: o quadro do vídeo editado logo ANTES da imagem entrar (mostra a mão/gesto, sem a imagem antiga)
  React.useEffect(() => {
    const el = fundoVideo.current;
    if (el && atual && el.readyState >= 1) el.currentTime = Math.max(0, atual.de + CAPA - 0.06);
  }, [atual?.de, atual?.id, urlVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = JSON.stringify(itens) !== JSON.stringify(original ?? []);
  const muda = (id: string, p: Partial<ImagemNoVideo>) => setItens((xs) => xs.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const tempo = atual ? itens.filter((i) => atual.de < i.ate && i.de < atual.ate) : []; // visíveis junto com a selecionada

  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current, r = caixa.current?.getBoundingClientRect();
    if (!a || !r) return;
    const it = itens.find((i) => i.id === a.id); if (!it) return;
    muda(a.id, { x: +lim((e.clientX - r.left) / r.width - a.dx, -0.05, 1 - it.largura + 0.05).toFixed(3), y: +lim((e.clientY - r.top) / r.height - a.dy, 0, 0.9).toFixed(3) });
  };

  const adicionar = (img: ImagemProduto) => {
    const base = LUGAR[img.rotulo] ?? LUGAR.produto;
    const de = atual ? Math.min(dur - 1, atual.ate) : Math.min(1, dur / 4);
    const novo: ImagemNoVideo = { id: `n${Date.now().toString(36)}`, rotulo: img.rotulo, imagem_id: img.id, path: img.storage_path,
      de: +de.toFixed(2), ate: +Math.min(dur, de + 2).toFixed(2), ...base, motivo: "Você adicionou" };
    setItens((xs) => [...xs, novo].sort((a, b) => a.de - b.de)); setSel(novo.id);
  };

  const salvar = async () => {
    if (!supabase) return;
    setSalvando(true);
    const { error } = await supabase.from("videos").update({ imagens: itens, imagens_ajustadas: true }).eq("id", v.id);
    setSalvando(false);
    if (error) return;
    onRefazer(itens.length ? `Imagens do produto reposicionadas (${itens.length})` : "Tirar as imagens do produto");
  };
  const pedirSugestao = async () => {
    if (!supabase) return;
    setSalvando(true);
    await supabase.from("videos").update({ imagens_ajustadas: false }).eq("id", v.id);
    setSalvando(false);
    onRefazer("Sugerir de novo as imagens do produto");
  };

  if (!supabase) return null;
  const cab = (
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm"><ImageIcon className="size-4" /> Imagens do produto</CardTitle>
      <CardDescription className="mt-1">O editor coloca cada imagem quando você fala dela (“falso”, “original”, o nome do produto, “detalhe”, “clica”…). Arraste para mudar o lugar e ajuste o tempo.</CardDescription>
    </CardHeader>
  );
  if (!carregou) return <Card>{cab}<CardContent><Loader2 className="size-4 animate-spin text-muted-foreground" /></CardContent></Card>;
  if (!produtoId) return <Card>{cab}<CardContent><p className="text-sm text-muted-foreground">Este vídeo não tem produto escolhido, então nenhuma imagem entra. Escolha o produto no envio do vídeo.</p></CardContent></Card>;
  if (!doProduto.length) return <Card>{cab}<CardContent><p className="text-sm text-muted-foreground">O produto deste vídeo ainda não tem imagens. <Link href="/produtos" className="font-medium text-primary hover:underline">Adicione em Produtos</Link> com a etiqueta certa (Produto, Original, Falso, Detalhe ou Print).</p></CardContent></Card>;

  return (
    <Card>
      {cab}
      <CardContent className="space-y-4">
        {original === null && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-accent p-3 text-xs sm:flex-row sm:items-center">
            <p className="flex-1">Este vídeo foi editado antes das sugestões de imagem. Peça para o editor sugerir agora, ou adicione as imagens você mesmo abaixo.</p>
            <Button size="sm" variant="outline" disabled={salvando} onClick={pedirSugestao}><Wand2 /> Sugerir imagens</Button>
          </div>
        )}
        {original !== null && original.length === 0 && !mudou && (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">Não ouvi nenhuma palavra que chame uma imagem deste produto. Adicione abaixo e escolha o momento.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          {/* tela 9:16 com as imagens arrastáveis */}
          <div ref={caixa} className="relative mx-auto aspect-[9/16] w-full max-w-[220px] touch-none select-none overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-border"
            onPointerMove={mover} onPointerUp={() => (arrasto.current = null)} onPointerCancel={() => (arrasto.current = null)}>
            {urlVideo ? <video ref={fundoVideo} src={urlVideo} muted playsInline preload="auto" className="absolute inset-0 size-full object-cover opacity-90"
              onLoadedMetadata={(e) => { if (atual) e.currentTarget.currentTime = Math.max(0, atual.de + CAPA - 0.06); }} />
              : urlCapa ? <img src={urlCapa} alt="" className="absolute inset-0 size-full object-cover opacity-90" /> : null}
            {(atual ? tempo : []).map((i) => (
              <div key={i.id} role="button" aria-label={`Imagem ${NOME[i.rotulo] ?? i.rotulo}`}
                className={cn("absolute cursor-grab active:cursor-grabbing", i.id === sel ? "z-10 outline-2 outline-offset-2 outline-primary [outline-style:solid]" : "opacity-70")}
                style={{ left: `${i.x * 100}%`, top: `${i.y * 100}%`, width: `${i.largura * 100}%`, transform: `rotate(${i.angulo}deg)`, transformOrigin: "center" }}
                onPointerDown={(e) => {
                  const r = caixa.current!.getBoundingClientRect();
                  arrasto.current = { id: i.id, dx: (e.clientX - r.left) / r.width - i.x, dy: (e.clientY - r.top) / r.height - i.y };
                  caixa.current!.setPointerCapture(e.pointerId); setSel(i.id);
                }}>
                <Miniatura path={i.path} className="pointer-events-none w-full" />
              </div>
            ))}
            {!atual && <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-white/70">Adicione uma imagem para posicionar</div>}
          </div>

          <div className="min-w-0 space-y-3">
            {/* linha do tempo: cada imagem é uma marca, toque para escolher */}
            <div>
              <div className="relative h-9 rounded-lg bg-muted">
                {itens.map((i) => (
                  <button key={i.id} onClick={() => setSel(i.id)} title={`${NOME[i.rotulo] ?? i.rotulo} · ${fmt(i.de + CAPA)}`}
                    className={cn("absolute top-1 h-7 min-w-2 rounded-md text-[10px] font-semibold", COR[i.rotulo] ?? "bg-primary text-primary-foreground", i.id === sel ? "ring-2 ring-foreground" : "opacity-80")}
                    style={{ left: `${(i.de / dur) * 100}%`, width: `${Math.max(2, ((i.ate - i.de) / dur) * 100)}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>0:00</span><span>{fmt(dur + CAPA)}</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {itens.map((i, n) => (
                  <button key={i.id} onClick={() => setSel(i.id)}
                    className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] tabular-nums", i.id === sel ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>
                    <span className={cn("size-2 rounded-full", COR[i.rotulo])} />{n + 1}. {NOME[i.rotulo] ?? i.rotulo} · {fmt(i.de + CAPA)}
                  </button>
                ))}
              </div>
            </div>

            {atual ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Miniatura path={atual.path} className="size-9 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <Badge className={cn("border-0", COR[atual.rotulo])}>{NOME[atual.rotulo] ?? atual.rotulo}</Badge>
                    {atual.motivo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{atual.motivo}</p>}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Tirar esta imagem" onClick={() => { setItens((xs) => xs.filter((i) => i.id !== atual.id)); setSel(itens.find((i) => i.id !== atual.id)?.id ?? null); }}><Trash2 /></Button>
                </div>
                <label className="grid gap-1 text-xs">
                  <span className="flex justify-between"><span>Entra em</span><span className="tabular-nums text-muted-foreground">{fmt(atual.de + CAPA)}</span></span>
                  <input type="range" min={0} max={Math.max(0, dur - 0.3)} step={0.05} value={atual.de} className="accent-primary"
                    onChange={(e) => { const de = +e.target.value; muda(atual.id, { de, ate: +Math.min(dur, de + (atual.ate - atual.de)).toFixed(2) }); }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="flex justify-between"><span>Fica na tela</span><span className="tabular-nums text-muted-foreground">{(atual.ate - atual.de).toFixed(1).replace(".", ",")} s</span></span>
                  <input type="range" min={0.5} max={6} step={0.1} value={+(atual.ate - atual.de).toFixed(1)} className="accent-primary"
                    onChange={(e) => muda(atual.id, { ate: +Math.min(dur, atual.de + +e.target.value).toFixed(2) })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs"><span>Tamanho</span>
                    <input type="range" min={0.2} max={0.9} step={0.01} value={atual.largura} className="accent-primary" onChange={(e) => muda(atual.id, { largura: +e.target.value })} /></label>
                  <label className="grid gap-1 text-xs"><span>Inclinação</span>
                    <input type="range" min={-12} max={12} step={1} value={atual.angulo} className="accent-primary" onChange={(e) => muda(atual.id, { angulo: +e.target.value })} /></label>
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-xs font-medium">Adicionar imagem do produto</p>
              <div className="flex flex-wrap gap-2">
                {doProduto.map((img) => (
                  <button key={img.id} onClick={() => adicionar(img)} className="group relative size-14 overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary" title={`Adicionar (${NOME[img.rotulo] ?? img.rotulo})`}>
                    <Miniatura path={img.storage_path} className="size-full object-cover" />
                    <span className={cn("absolute inset-x-0 bottom-0 truncate px-0.5 text-[9px] font-semibold", COR[img.rotulo])}>{NOME[img.rotulo] ?? img.rotulo}</span>
                    <Plus className="absolute right-0.5 top-0.5 size-3.5 rounded-full bg-background/90 p-0.5 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-muted-foreground">{mudou ? "Para as mudanças entrarem no vídeo, ele é editado de novo (1 a 3 minutos)." : "O fundo mostra o vídeo logo antes da imagem entrar."}</p>
          {mudou && <Button size="sm" variant="ghost" onClick={() => { setItens(original ?? []); setSel(original?.[0]?.id ?? null); }}><RotateCcw /> Desfazer</Button>}
          <Button size="sm" disabled={!mudou || salvando} onClick={salvar}>{salvando ? <Loader2 className="animate-spin" /> : <Wand2 />} Salvar e refazer o vídeo</Button>
        </div>
      </CardContent>
    </Card>
  );
}
