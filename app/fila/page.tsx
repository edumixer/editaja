"use client";
import Link from "next/link";
import { Check, Clock, Cpu, Loader2, MessageSquareWarning, Upload, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { VideoThumb } from "@/components/video-thumb";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { ETAPAS, fmtDur } from "@/lib/data";
import { cn } from "@/lib/utils";

export default function Fila() {
  const { videos } = useStore();
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
                  <VideoThumb hue={v.hue} headline={v.headline} className="w-20 shrink-0 sm:w-24" showPlay={false} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={v.status} />
                      {v.versao > 1 && <span className="text-xs text-muted-foreground">versão {v.versao}</span>}
                      {!ativo && <span className="text-xs text-muted-foreground">#{i + 1} na fila</span>}
                    </div>
                    <p className="mt-1.5 truncate font-semibold">{v.titulo}</p>
                    <p className="text-xs text-muted-foreground">{v.produto} · {v.criador} · bruto {fmtDur(v.duracaoBruto)} · {v.tamanhoMb >= 1000 ? `${(v.tamanhoMb / 1000).toFixed(1).replace(".", ",")} GB` : `${v.tamanhoMb} MB`}</p>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="flex items-center gap-1.5 font-medium text-success"><span className="size-2 rounded-full bg-success" /> Online</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Na fila</span><span className="font-medium">{ativos.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-medium">~{Math.max(1, ativos.length) * 4} min</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Média por vídeo</span><span className="font-medium">3m40s</span></div>
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
                  <VideoThumb hue={v.hue} className="w-9 shrink-0 rounded-md" showPlay={false} size="sm" />
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
    </>
  );
}
