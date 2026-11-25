"use client";
import Link from "next/link";
import * as React from "react";
import { AlertTriangle, Check, Clock, Cpu, Loader2, MessageSquareWarning, Upload, ArrowRight, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fonteDoVideo, linkAssinado } from "@/components/capa-video";
import type { VideoReal } from "@/components/video-real";
import { supabase } from "@/lib/supabase";
import type { Video } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { VideoThumb } from "@/components/video-thumb";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { ETAPAS, fmtDur } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Assistir o vídeo (o bruto enquanto não foi editado). */
function Assistir({ v, onClose }: { v: Video | null; onClose: () => void }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState(false);
  React.useEffect(() => {
    setUrl(null); setErro(false);
    const f = v && fonteDoVideo(v);
    if (f) linkAssinado(f.bucket, f.caminho).then((u) => (u ? setUrl(u) : setErro(true)));
  }, [v]);
  return (
    <Dialog open={!!v} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">{v?.titulo}</DialogTitle>
          <DialogDescription>{(v as VideoReal | null)?.editadoPath ? "Vídeo editado" : "Vídeo enviado (ainda sem edição)"}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl bg-black">
          {url && !erro && <video src={url} controls playsInline autoPlay className="max-h-[65dvh] w-full" onError={() => setErro(true)} />}
          {!url && !erro && <div className="grid aspect-[9/16] place-items-center text-white/60"><Loader2 className="size-6 animate-spin" /></div>}
          {erro && (
            <div className="grid aspect-[9/16] place-items-center p-6 text-center text-sm text-white/80">
              <div>Este navegador não consegue tocar esse formato de vídeo (comum em .MOV do iPhone no Windows).{url && <> <a href={url} className="mt-2 block font-medium text-white underline" target="_blank" rel="noreferrer">Baixar o vídeo</a></>}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O editor avisa a cada ~20 s que está ligado. Sem aviso há mais de 2 min = desligado. */
function useEditorLigado(temEditando: boolean) {
  const [visto, setVisto] = React.useState<Date | null | undefined>(undefined);
  React.useEffect(() => {
    if (!supabase) return;
    let vivo = true;
    const ler = () => supabase!.rpc("editor_status").then(({ data }) => { if (vivo) setVisto(data ? new Date(data as string) : null); });
    ler(); const t = setInterval(ler, 20_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!supabase) return true;
  if (visto === undefined) return undefined;
  return temEditando || (!!visto && Date.now() - visto.getTime() < 120_000);
}

export default function Fila() {
  const { videos, modoReal, enviarParaEdicao } = useStore();
  const [assistir, setAssistir] = React.useState<Video | null>(null);
  const ligado = useEditorLigado(videos.some((v) => v.status === "editando"));
  const ativos = videos.filter((v) => ["editando", "fila", "recusado"].includes(v.status))
    .sort((a, b) => (a.status === "editando" ? -1 : b.status === "editando" ? 1 : 0));
  const concluidos = videos.filter((v) => ["aprovacao", "aprovado", "agendado", "publicado"].includes(v.status)).slice(0, 5);

  return (
    <>
      <PageHeader title="Fila de edição" description="O editor trabalha um vídeo por vez, seguindo as suas regras fixas."
        actions={<Button variant="brand" asChild><Link href="/biblioteca?upload=1"><Upload /> Enviar bruto</Link></Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {ativos.length === 0 && (
            <Card className="grid place-items-center p-10 text-center">
              <div className="brand-gradient grid size-12 place-items-center rounded-2xl text-white"><Check className="size-6" /></div>
              <p className="mt-3 font-semibold">Fila vazia</p>
              <p className="text-sm text-muted-foreground">Todos os vídeos foram editados.</p>
            </Card>
          )}
          {ativos.map((v, i) => {
            const ativo = v.status === "editando";
            return (
              <Card key={v.id} className={cn("overflow-hidden", ativo && "ring-1 ring-primary/40")}>
                <div className="flex gap-4 p-4 sm:p-5">
                  <button type="button" onClick={() => modoReal && setAssistir(v)} className="w-20 shrink-0 rounded-xl sm:w-24" aria-label={`Assistir ${v.titulo}`}>
                    <VideoThumb hue={v.hue} headline={v.headline} video={v} className="w-full" showPlay={modoReal} size="sm" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={v.status} />
                      {v.versao > 1 && <span className="text-xs text-muted-foreground">versão {v.versao}</span>}
                      {!ativo && <span className="text-xs text-muted-foreground">#{i + 1} na fila</span>}
                      {modoReal && <span className="text-xs text-muted-foreground">· enviado {new Date(v.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                    <p className="mt-1.5 truncate font-semibold">{v.titulo}</p>
                    {(v as VideoReal).statusBanco === "enviando" && (
                      <p className="mt-1 text-xs text-muted-foreground">{Date.now() - new Date(v.criadoEm).getTime() > 3_600_000 ? "O envio não terminou. Envie o vídeo de novo." : "Subindo o vídeo… entra na fila assim que terminar."}</p>
                    )}
                    {(v as VideoReal).statusBanco === "erro" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/8 p-2 text-xs text-destructive">
                        <AlertTriangle className="size-3.5 shrink-0" /> <span className="min-w-0 flex-1">A edição falhou{(v as VideoReal).erro ? `: ${(v as VideoReal).erro!.slice(0, 140)}` : "."}</span>
                        <Button size="sm" variant="outline" onClick={() => enviarParaEdicao(v.id)}><RotateCcw /> Tentar de novo</Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{v.produto === "—" ? "Sem produto" : v.produto} · {v.criador} · bruto {fmtDur(v.duracaoBruto)} · {v.tamanhoMb >= 1000 ? `${(v.tamanhoMb / 1000).toFixed(1).replace(".", ",")} GB` : `${v.tamanhoMb} MB`}</p>
                    {v.status === "recusado" && v.comentarios.length > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/8 p-2 text-xs text-destructive">
                        <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" /> “{v.comentarios[v.comentarios.length - 1].texto}”
                      </p>
                    )}
                    {ativo && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs"><span className="font-medium text-primary">{ETAPAS[v.etapa].nome}…</span><span className="tabular-nums text-muted-foreground">{Math.round(v.progresso)}%</span></div>
                        <Progress value={v.progresso} className="mt-1.5" />
                      </div>
                    )}
                  </div>
                </div>
                {ativo && (
                  <div className="border-t bg-muted/30 px-4 py-3 sm:px-5">
                    <ol className="grid grid-cols-7 gap-1">
                      {ETAPAS.map((e, idx) => {
                        const done = idx < v.etapa; const cur = idx === v.etapa;
                        return (
                          <li key={e.id} className="flex flex-col items-center gap-1.5 text-center">
                            <span className={cn("grid size-7 place-items-center rounded-full border text-[10px] font-semibold transition-colors",
                              done && "border-transparent bg-success text-white", cur && "border-primary bg-primary/10 text-primary", !done && !cur && "text-muted-foreground")}>
                              {done ? <Check className="size-3.5" /> : cur ? <Loader2 className="size-3.5 animate-spin" /> : idx + 1}
                            </span>
                            <span className={cn("hidden text-[10px] leading-tight sm:block", cur ? "font-medium text-foreground" : "text-muted-foreground")}>{e.nome}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Cpu className="size-4 text-primary" /> Servidor de edição</CardTitle>
              <CardDescription>Processamento com ffmpeg + Whisper</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                {ligado === undefined ? <span className="text-muted-foreground">verificando…</span>
                  : ligado ? <span className="flex items-center gap-1.5 font-medium text-success"><span className="size-2 rounded-full bg-success" /> Ligado</span>
                  : <span className="flex items-center gap-1.5 font-medium text-destructive"><span className="size-2 rounded-full bg-destructive" /> Desligado</span>}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Na fila</span><span className="font-medium">{ativos.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-medium">{ligado ? `~${Math.max(1, ativos.length) * 4} min` : "começa quando o editor ligar"}</span></div>
              {ligado === false && <p className="rounded-lg bg-warning/15 p-2 text-xs">O editor está desligado agora. Seus vídeos estão guardados e entram na edição assim que ele voltar; não precisa enviar de novo.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Concluídos</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link href="/aprovacao">Ver <ArrowRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {concluidos.map((v) => (
                <Link href={`/aprovacao/${v.id}`} key={v.id} className="-m-1 flex items-center gap-3 rounded-lg p-1 hover:bg-accent">
                  <VideoThumb hue={v.hue} video={v} className="w-9 shrink-0 rounded-md" showPlay={false} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.titulo}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {fmtDur(v.duracaoBruto)} → {fmtDur(v.duracaoFinal)}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Assistir v={assistir} onClose={() => setAssistir(null)} />
    </>
  );
}
