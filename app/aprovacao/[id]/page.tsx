"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCircle2, Clock, Copy, Download, Hash, Image as ImageIcon, Loader2, MessageSquare, Pause, Play, RefreshCw, Scissors, Sparkles, ThumbsDown, Volume2, VolumeX, Wand2, CalendarClock, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { useStore, gerarTextosIA } from "@/lib/store";
import { fmtDur, type Video } from "@/lib/data";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useEstilos } from "@/lib/estilos-store";
import { Switch } from "@/components/ui/switch";
import { PosicaoHeadline } from "@/components/headline-config";
import { ImagensDoVideo } from "@/components/imagens-video";
import { useVideoEditado, quandoEditado, type VideoReal } from "@/components/video-real";
import { linkAssinado } from "@/lib/armazenamento";

function PlayerReal({ v: v0, owner }: { v: Video; owner: string }) {
  const v = v0 as VideoReal;
  const pronto = !["fila", "editando", "recusado"].includes(v.status) || Boolean(v.editadoPath && v.status !== "recusado");
  const { url, erro } = useVideoEditado(owner, v.id, v.versao, v.editadoPath, pronto);
  const [falhouTocar, setFalhouTocar] = React.useState(false);
  React.useEffect(() => setFalhouTocar(false), [url]);
  // link que baixa o arquivo (em vez de só abrir o vídeo numa aba), com o nome do vídeo
  const [linkBaixar, setLinkBaixar] = React.useState<string | null>(null);
  React.useEffect(() => {
    setLinkBaixar(null);
    if (!url || !v.editadoPath) return;
    let vivo = true;
    linkAssinado("editados", v.editadoPath, `${(v.titulo || "video").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60)}.mp4`).then((u) => vivo && setLinkBaixar(u));
    return () => { vivo = false; };
  }, [url, v.editadoPath, v.titulo]);
  const aviso = (t: React.ReactNode) => <div className="grid size-full place-items-center p-6 text-center text-sm text-white/75">{t}</div>;
  return (
    <div className="mx-auto w-full max-w-[290px] sm:max-w-[360px]">
      <div className="aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-2xl shadow-primary/10 ring-1 ring-border">
        {v.statusBanco === "erro" ? aviso(<span><b className="text-white">O editor encontrou um erro.</b><br />{v.erro ?? "Tente enviar de novo."}</span>)
          : !pronto ? aviso(<span><Loader2 className="mx-auto mb-3 size-6 animate-spin" /><b className="text-white">{v.status === "editando" ? `Editando… ${Math.round(v.progresso)}%` : "Na fila de edição"}</b><br />A prévia aparece aqui sozinha assim que o vídeo editado ficar pronto.</span>)
          : url && !falhouTocar ? <video key={url} src={url} controls playsInline preload="metadata" onError={() => setFalhouTocar(true)} className="size-full object-contain" />
          : url && falhouTocar ? aviso(<span>Este navegador não conseguiu tocar a prévia. Use o botão Baixar vídeo abaixo.</span>)
          : erro ? aviso("O vídeo editado ainda não foi salvo. Se ele acabou de sair da fila, espere alguns segundos e recarregue.")
          : <div className="grid size-full place-items-center text-sm text-white/60"><Loader2 className="size-6 animate-spin" /></div>}
      </div>
      {url && <Button variant="outline" size="sm" className="mt-3 w-full" asChild><a href={linkBaixar ?? url} download><Download /> Baixar vídeo</a></Button>}
    </div>
  );
}

function Player({ v }: { v: Video }) {
  const dur = v.duracaoFinal ?? 30;
  const [t, setT] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [mudo, setMudo] = React.useState(false);
  React.useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => setT((x) => { if (x + 0.1 >= dur) { setPlaying(false); return dur; } return x + 0.1; }), 100);
    return () => clearInterval(i);
  }, [playing, dur]);

  const marcas = React.useMemo(() => {
    const n = v.cortes ?? 20;
    const cortes = Array.from({ length: Math.min(n, 30) }, (_, i) => ((i + 1) / (Math.min(n, 30) + 1)) * dur);
    const imgs = [0.18, 0.42, 0.66, 0.8].slice(0, v.imagens ?? 2).map((p) => p * dur);
    return { cortes, imgs };
  }, [v, dur]);
  const imgAtiva = marcas.imgs.findIndex((s) => t >= s && t < s + 2.5);
  const aviso = /cuidado|falso/i.test(v.headline);

  return (
    <div className="mx-auto w-full max-w-[290px] sm:max-w-[360px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-2xl shadow-primary/10 ring-1 ring-border"
        style={{ backgroundImage: `radial-gradient(120% 80% at 50% 0%, oklch(0.55 0.17 ${v.hue}) 0%, oklch(0.28 0.08 ${v.hue}) 55%, oklch(0.14 0.03 ${v.hue}) 100%)` }}
        onClick={() => setPlaying((p) => !p)}>
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <div className={cn("relative h-[62%] w-[70%] transition-transform duration-300", Math.floor(t / 9) % 2 === 1 && "scale-110")}>
            <div className="absolute left-1/2 top-0 aspect-square w-[38%] -translate-x-1/2 rounded-full bg-white/15" />
            <div className="absolute bottom-0 left-0 right-0 h-[62%] rounded-t-[45%] bg-white/10" />
          </div>
        </div>
        {t < 6 && v.headlineAtiva !== false && v.headline && (
          <div className="absolute w-[86%] -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${(v.headlinePos?.x ?? 0.5) * 100}%`, top: `${(v.headlinePos?.y ?? 0.24) * 100}%` }}>
            <span className="inline-block text-2xl font-extrabold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.6)]">{v.headline}{aviso && " 🚨"}</span>
          </div>
        )}
        {imgAtiva >= 0 && (
          <div className={cn("absolute top-[12%] w-[38%] rounded-lg bg-white p-1.5 shadow-2xl", imgAtiva % 2 === 0 ? "left-[8%] -rotate-6" : "right-[8%] rotate-6")}>
            <div className="aspect-square rounded-md" style={{ backgroundImage: `linear-gradient(135deg, oklch(0.75 0.12 ${v.hue + 40}), oklch(0.5 0.15 ${v.hue}))` }} />
            <p className="mt-1 text-center text-[9px] font-bold text-neutral-800">{aviso ? (imgAtiva % 2 === 0 ? "FALSO" : "ORIGINAL") : v.produto}</p>
          </div>
        )}
        {!playing && (
          <div className="absolute inset-0 grid place-items-center bg-black/10">
            <div className="grid size-16 place-items-center rounded-full bg-white/25 text-white backdrop-blur-md"><Play className="size-7 fill-current" /></div>
          </div>
        )}
        <div className="absolute right-3 top-3 flex gap-1.5">
          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">1.1x</span>
          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">v{v.versao}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button size="icon-sm" variant="secondary" onClick={() => { if (t >= dur) setT(0); setPlaying((p) => !p); }} aria-label="Play/pausa">
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="relative h-8 flex-1 cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setT(((e.clientX - r.left) / r.width) * dur); }}>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary" />
          <div className="brand-gradient absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ width: `${(t / dur) * 100}%` }} />
          {marcas.cortes.map((c, i) => <span key={i} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/25" style={{ left: `${(c / dur) * 100}%` }} />)}
          {marcas.imgs.map((c, i) => <span key={i} className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-warning ring-2 ring-background" style={{ left: `${(c / dur) * 100}%` }} />)}
          <span className="absolute top-0 h-8 w-0.5 rounded bg-success" style={{ left: 0 }} title="Capa 0.1s" />
        </div>
        <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{t.toFixed(1).replace(".", ",")} / {dur.toFixed(1).replace(".", ",")}s</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setMudo((m) => !m)} aria-label="Som">{mudo ? <VolumeX /> : <Volume2 />}</Button>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-0.5 rounded bg-success" /> Capa 0.1s</span>
        <span className="flex items-center gap-1"><span className="h-3 w-px bg-foreground/40" /> Cortes</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> Imagem + Bubble pop</span>
      </div>
    </div>
  );
}

function useDigitando(texto: string, ativo: boolean) {
  const [out, setOut] = React.useState(ativo ? "" : texto);
  React.useEffect(() => {
    if (!ativo) { setOut(texto); return; }
    setOut("");
    let i = 0;
    const t = setInterval(() => { i += 3; setOut(texto.slice(0, i)); if (i >= texto.length) clearInterval(t); }, 18);
    return () => clearInterval(t);
  }, [texto, ativo]);
  return out;
}

function PainelIA({ v, animar }: { v: Video; animar: boolean }) {
  const { update } = useStore();
  const [gerando, setGerando] = React.useState(false);
  const [anim, setAnim] = React.useState(animar);
  React.useEffect(() => setAnim(animar), [animar]);
  const legenda = useDigitando(v.legenda ?? "", anim);
  const descricao = useDigitando(v.descricao ?? "", anim);
  const [novaTag, setNovaTag] = React.useState("");

  if (!v.legenda) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <Sparkles className="mx-auto size-6 text-primary" />
        <p className="mt-2 font-medium">Legenda, descrição e hashtags por IA</p>
        <p className="mt-1 text-sm text-muted-foreground">São geradas automaticamente quando você aprova o vídeo, a partir da transcrição.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => { update(v.id, gerarTextosIA(v)); setAnim(true); }}><Wand2 /> Gerar prévia agora</Button>
      </div>
    );
  }

  const regenerar = () => {
    setGerando(true);
    setTimeout(() => {
      const t = gerarTextosIA({ ...v, headline: v.headline + " " });
      update(v.id, { ...t, legenda: t.legenda.replace("veja até o final", "assista antes de comprar").replace("você precisa ver isso", "olha que achado") });
      setGerando(false); setAnim(true);
      toast.success("Novos textos gerados");
    }, 900);
  };
  const copiar = () => {
    navigator.clipboard?.writeText(`${v.legenda}\n\n${v.descricao}\n\n${v.hashtags?.join(" ")}`);
    toast.success("Copiado para a área de transferência");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge><Sparkles /> Gerado por IA a partir da fala</Badge>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={copiar}><Copy /> Copiar</Button>
          <Button variant="ghost" size="sm" onClick={regenerar} disabled={gerando}>{gerando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar outra</Button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="leg">Legenda (primeira linha do post)</Label>
        <Input id="leg" value={legenda} onChange={(e) => { setAnim(false); update(v.id, { legenda: e.target.value }); }} />
      </div>
      <div className="grid gap-2">
        <div className="flex justify-between"><Label htmlFor="desc">Descrição</Label><span className="text-xs tabular-nums text-muted-foreground">{(v.descricao ?? "").length}/2200</span></div>
        <Textarea id="desc" rows={4} value={descricao} onChange={(e) => { setAnim(false); update(v.id, { descricao: e.target.value }); }} />
      </div>
      <div className="grid gap-2">
        <Label>Hashtags</Label>
        <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
          {v.hashtags?.map((h) => (
            <span key={h} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary">
              {h}
              <button className="grid size-4 place-items-center rounded-full hover:bg-primary/20" onClick={() => update(v.id, { hashtags: v.hashtags!.filter((x) => x !== h) })} aria-label={`Remover ${h}`}><X className="size-3" /></button>
            </span>
          ))}
          <form className="flex min-w-24 flex-1 items-center" onSubmit={(e) => { e.preventDefault(); const t = novaTag.trim().replace(/^#?/, "#").replace(/\s+/g, ""); if (t.length > 1) update(v.id, { hashtags: [...(v.hashtags ?? []), t] }); setNovaTag(""); }}>
            <Hash className="size-3.5 text-muted-foreground" />
            <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="adicionar" className="w-full bg-transparent px-1 text-xs outline-none" />
          </form>
        </div>
      </div>
    </div>
  );
}

const MOTIVOS = ["Cortou o fim de uma palavra", "Imagem no lugar errado", "Faltou cortar uma repetição", "Trocar a headline", "Som fora de hora", "Usar outra capa"];

export default function Revisao() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { videos, aprovar, recusar, update, modoReal, sessao, carregando } = useStore();
  const v = videos.find((x) => x.id === id);
  const { registrarFeedback, estilos } = useEstilos();
  const [recusarOpen, setRecusarOpen] = React.useState(false);
  const [comentario, setComentario] = React.useState("");
  const [motivos, setMotivos] = React.useState<string[]>([]);
  const [aba, setAba] = React.useState("edicao");
  const [animarIA, setAnimarIA] = React.useState(false);
  const [aprovando, setAprovando] = React.useState(false);

  if (!v && modoReal && carregando) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>;
  if (!v) return (
    <div className="grid place-items-center py-20 text-center">
      <p className="font-medium">{modoReal && !sessao ? "Entre na sua conta para ver este vídeo" : "Vídeo não encontrado"}</p>
      <Button variant="link" asChild><Link href="/aprovacao">Voltar para aprovação</Link></Button>
    </div>
  );

  const pendente = v.status === "aprovacao";
  const estiloId = v.estiloId ?? "clean";
  const estiloNome = estilos.find((e) => e.id === estiloId)?.nome ?? "Clean";
  const doAprovar = () => {
    setAprovando(true);
    setTimeout(() => {
      aprovar(v.id); setAprovando(false); setAnimarIA(true); setAba("legenda");
      registrarFeedback({ video: v.titulo, tipo: "aprovacao", comentario: "Aprovado sem ajustes.", estiloId });
      toast.success("Vídeo aprovado!", { description: "A IA gerou legenda, descrição e hashtags. Revise e agende." });
    }, 1100);
  };
  const doRecusar = () => {
    const texto = [motivos.join(" · "), comentario].filter(Boolean).join(" — ");
    recusar(v.id, texto || "Ajustes solicitados");
    registrarFeedback({ video: v.titulo, tipo: "recusa", comentario: comentario || texto, motivos, estiloId });
    setRecusarOpen(false);
    toast("Enviado para reedição", { description: `A versão ${v.versao + 1} vai entrar na fila com o seu comentário.` });
    toast("O estilo aprendeu com isso", { description: `Sugestão de regra criada para “${estiloNome}”. Revise em Estilos.`, action: { label: "Ver", onClick: () => router.push("/estilos?aba=aprendizado") } });
    router.push("/fila");
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/aprovacao" aria-label="Voltar"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={v.status} />{v.variante && <Badge variant="outline">Versão {v.variante}</Badge>}</div>
          <h1 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-2xl">{v.titulo}</h1>
          {quandoEditado(v) && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5 shrink-0" />Editado {quandoEditado(v)}</p>}
        </div>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex"><Download /> Baixar</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] xl:gap-10">
        <div>{modoReal && sessao ? <PlayerReal v={v} owner={sessao.user.id} /> : <>
          <Player v={v} />
          <p className="mx-auto mt-3 max-w-[360px] rounded-lg bg-warning/10 px-3 py-2 text-center text-xs text-muted-foreground"><b className="text-foreground">Prévia simulada (modo exemplo).</b> O vídeo editado de verdade aparece aqui quando o servidor de edição estiver ligado.</p>
        </>}</div>

        <div className="space-y-5">
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="w-full">
              <TabsTrigger value="edicao" className="flex-1"><Scissors /> Edição</TabsTrigger>
              <TabsTrigger value="legenda" className="flex-1"><Sparkles /> Legenda</TabsTrigger>
              <TabsTrigger value="comentarios" className="flex-1"><MessageSquare /> Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="edicao" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Duração", v: `${fmtDur(v.duracaoBruto)} → ${fmtDur(v.duracaoFinal)}`, i: Clock },
                  { l: "Cortes", v: v.cortes ?? "—", i: Scissors },
                  { l: "Imagens", v: v.imagens ?? "—", i: ImageIcon },
                  { l: "Sons", v: v.sons ?? "—", i: Volume2 },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl border bg-card p-3">
                    <s.i className="size-4 text-muted-foreground" />
                    <p className="mt-2 text-sm font-semibold tabular-nums">{s.v}</p>
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
                  <div><CardTitle className="text-sm">Headline (texto na tela)</CardTitle><CardDescription className="mt-1">Opcional. Aparece nos primeiros 6 segundos.</CardDescription></div>
                  <label className="flex shrink-0 items-center gap-2 text-xs font-medium">{v.headlineAtiva === false ? "Desligada" : "Ligada"}<Switch checked={v.headlineAtiva !== false} onCheckedChange={(c) => update(v.id, { headlineAtiva: c })} aria-label="Mostrar headline no vídeo" /></label>
                </CardHeader>
                {v.headlineAtiva !== false ? (
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input value={v.headline} maxLength={80} placeholder="Escreva o texto que quiser (sem ponto final)" onChange={(e) => update(v.id, { headline: e.target.value })} onBlur={(e) => { const t = e.target.value.replace(/[\s.…]+$/, ""); if (t !== e.target.value) update(v.id, { headline: t }); }} />
                      {/cuidado|falso/i.test(v.headline) && <span className="grid size-10 shrink-0 place-items-center rounded-lg border text-lg" title="Emoji de perigo automático">🚨</span>}
                    </div>
                    <PosicaoHeadline texto={v.headline} x={v.headlinePos?.x ?? 0.5} y={v.headlinePos?.y ?? 0.24} onChange={(p) => update(v.id, { headlinePos: p })} />
                    <p className="text-xs text-muted-foreground">A prévia do vídeo já mostra a mudança. O vídeo final sai com este texto e nesta posição.</p>
                  </CardContent>
                ) : <CardContent><p className="text-sm text-muted-foreground">Este vídeo vai sair sem texto na tela. Ligue de novo quando quiser.</p></CardContent>}
              </Card>
              {modoReal && sessao && (v.status === "aprovacao" || v.status === "aprovado") && (
                <ImagensDoVideo v={v} onRefazer={(texto) => {
                  recusar(v.id, texto);
                  toast("Refazendo o vídeo com as imagens", { description: `A versão ${v.versao + 1} entrou na fila. Leva de 1 a 3 minutos.` });
                  router.push("/fila");
                }} />
              )}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Regras aplicadas · {estiloNome}</CardTitle></CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {["Capa de 0.1s no início", "Velocidade 1.1x", "Respiros e repetições cortados", "Folga no fim das frases", "Redução de ruído", "Qualidade original mantida", "Imagens onde a pessoa aponta", "Bubble pop em cada foto", "Sem CTAs ou animações extras"].map((r) => (
                    <p key={r} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 shrink-0 text-success" /> {r}</p>
                  ))}
                </CardContent>
              </Card>
              {(v.surpresas?.length ?? 0) > 0 && (v.status === "aprovacao" || v.status === "editando") && (
                <div className="rounded-xl border border-primary/30 bg-accent p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Achamos uma reação de surpresa aos {fmtDur(v.surpresas![0].s)}</p>
                      <p className="mt-0.5 text-muted-foreground">“{v.surpresas![0].texto}” · {v.surpresas![0].motivos.join(", ")}. Quer uma versão que já abre com esse momento?</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => toast.success("Versão alternativa na fila", { description: "Ela abre com a reação de surpresa e depois segue o vídeo normal. A original continua aqui." })}>Gerar versão com a surpresa na frente</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="legenda"><PainelIA v={v} animar={animarIA} /></TabsContent>

            <TabsContent value="comentarios" className="space-y-3">
              {v.comentarios.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Sem comentários. Este vídeo foi editado de primeira.</p>}
              {v.comentarios.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className="brand-gradient grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">{c.autor[0]}</div>
                  <div className="flex-1 rounded-xl rounded-tl-sm bg-muted p-3">
                    <p className="text-xs font-medium">{c.autor} <span className="font-normal text-muted-foreground">· {c.quando} · versão {i + 1}</span></p>
                    <p className="mt-1 text-sm">{c.texto}</p>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-20 z-20 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur lg:static lg:bg-card lg:shadow-none">
            {pendente ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={() => setRecusarOpen(true)}><ThumbsDown /> Pedir ajuste</Button>
                <Button variant="success" size="lg" onClick={doAprovar} disabled={aprovando}>{aprovando ? <Loader2 className="animate-spin" /> : <Check />} {aprovando ? "Gerando textos…" : "Aprovar"}</Button>
              </div>
            ) : v.status === "aprovado" ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="flex flex-1 items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" /> Aprovado. Pronto para publicar.</p>
                <Button variant="brand" size="lg" asChild><Link href={`/publicar?video=${v.id}`}><CalendarClock /> Agendar publicação</Link></Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 p-1 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> {v.status === "agendado" ? "Agendado para publicação." : v.status === "publicado" ? "Já publicado." : "Em reedição."}</p>
            )}
          </div>
        </div>
      </div>

      <Dialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O que precisa ajustar?</DialogTitle>
            <DialogDescription>O editor refaz o vídeo com base no seu comentário, manda a versão {v.versao + 1} para aprovação e sugere uma regra nova para o estilo.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button key={m} onClick={() => setMotivos((ms) => ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m])}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", motivos.includes(m) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{m}</button>
            ))}
          </div>
          <Textarea rows={4} placeholder="Ex.: aos 12s cortou o “original”, deixa um respiro maior. A foto do falso vai do lado esquerdo." value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={doRecusar} disabled={!comentario && motivos.length === 0}><RefreshCw /> Reeditar vídeo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
