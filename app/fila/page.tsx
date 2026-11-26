"use client";
import Link from "next/link";
import * as React from "react";
import { AlertTriangle, Check, Clock, Cpu, Loader2, MessageSquareWarning, Upload, ArrowRight, RotateCcw, Trash2, CloudUpload, Scissors } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fonteDoVideo, linkAssinado } from "@/components/capa-video";
import type { VideoReal as VideoRealBase } from "@/components/video-real";

/** Campos extras da linha do banco usados aqui (ver lib/store.tsx). */
type VideoReal = VideoRealBase & { atualizadoEm?: string; brutoPath?: string; opcoes?: { editar_ao_terminar?: boolean } };
import { supabase } from "@/lib/supabase";
import type { Video } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { VideoThumb } from "@/components/video-thumb";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { fmtDur } from "@/lib/data";
import { ETAPAS_UI, etapaUI, fmtRestante, useTempoRestante, BarraIndeterminada, LIMITE_UPLOAD_MB } from "@/lib/andamento";
import { ExcluirDialog } from "@/components/excluir-video";
import { toast } from "sonner";
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

/** Envio parado: sem notícia do navegador há mais de 90 s. */
const PARADO_MS = 90_000;

/** Para envios antigos (antes da barra): o arquivo bruto chegou inteiro ao armazenamento? */
function useBrutoChegou(v: VideoReal, checar: boolean) {
  const [ok, setOk] = React.useState<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (!checar || !supabase || !v.brutoPath) return;
    const i = v.brutoPath.lastIndexOf("/");
    supabase.storage.from("brutos").list(v.brutoPath.slice(0, i), { search: v.brutoPath.slice(i + 1) })
      .then(({ data }) => setOk(!!data?.some((f) => f.name === v.brutoPath!.slice(i + 1))));
  }, [checar, v.brutoPath]);
  return ok;
}

function erroAmigavel(erro?: string) {
  if (!erro) return "A edição falhou.";
  if (/413|too large|exceeded the maximum/i.test(erro))
    return `O vídeo editado ficou maior que o limite de ${LIMITE_UPLOAD_MB} MB do armazenamento. A nova versão do editor já reduz o tamanho sozinha: toque em Tentar de novo.`;
  return `A edição falhou: ${erro.slice(0, 160)}`;
}

/** Barra do envio do arquivo (antes de entrar na fila). */
function Envio({ v, onEditar }: { v: VideoReal; onEditar: () => Promise<void> }) {
  const parado = Date.now() - new Date(v.atualizadoEm ?? v.criadoEm).getTime() > PARADO_MS;
  const terminou = v.progresso >= 100;
  const chegou = useBrutoChegou(v, parado && !terminou);
  const [mandando, setMandando] = React.useState(false);
  const pronto = terminou || chegou === true;
  const mandar = async () => {
    setMandando(true);
    try { await onEditar(); toast.success("Vídeo mandado para a edição"); }
    catch (e) { toast.error("Não deu para mandar", { description: (e as Error).message }); }
    finally { setMandando(false); }
  };
  if (pronto) return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5 text-xs sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{v.opcoes?.editar_ao_terminar && !parado ? "Vídeo enviado. Entrando na fila…" : "Vídeo enviado, mas ainda não foi para a edição."}</span>
      <Button size="sm" variant="brand" className="self-start sm:self-auto" disabled={mandando} onClick={mandar}>{mandando ? <Loader2 className="animate-spin" /> : <Scissors />} Mandar para edição</Button>
    </div>
  );
  if (parado) return (
    <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning/15 p-2.5 text-xs">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{chegou === undefined ? "Verificando o envio…" : `O envio parou${v.progresso > 0 ? ` em ${Math.round(v.progresso)}%` : ""} (o site foi fechado ou a internet caiu). Exclua este item e envie o vídeo de novo.${v.tamanhoMb > LIMITE_UPLOAD_MB ? ` Atenção: ele tem ${v.tamanhoMb} MB e o limite é ${LIMITE_UPLOAD_MB} MB por vídeo.` : ""}`}</span>
    </div>
  );
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-primary"><CloudUpload className="size-3.5" /> Enviando o vídeo…</span>
        <span className="tabular-nums text-muted-foreground">{Math.round(v.progresso)}%</span>
      </div>
      {v.progresso > 0 ? <Progress value={v.progresso} className="mt-1.5" /> : <BarraIndeterminada className="mt-1.5" />}
      <p className="mt-1.5 text-xs text-muted-foreground">Entra na fila sozinho quando terminar. Não feche o site até lá.</p>
    </div>
  );
}

/** Etapas da edição com % real gravado pelo editor e tempo restante estimado. */
function Editando({ v }: { v: VideoReal }) {
  const atual = etapaUI(v.etapa, v.progresso);
  const restante = useTempoRestante(`${v.id}:${v.versao}`, v.progresso, true);
  const e = ETAPAS_UI[atual];
  return (
    <>
      <div className="mt-3">
        <div className="flex justify-between gap-2 text-xs">
          <span className="font-medium text-primary">{e.nome}… <span className="font-normal text-muted-foreground">{e.detalhe}</span></span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(v.progresso)}%</span>
        </div>
        <Progress value={Math.max(2, v.progresso)} className="mt-1.5" />
        <p className="mt-1.5 text-xs text-muted-foreground">{restante != null ? `Faltam ${fmtRestante(restante)}` : "Calculando o tempo que falta…"}</p>
      </div>
      <ol className="mt-3 grid grid-cols-6 gap-1 border-t pt-3">
        {ETAPAS_UI.map((et, idx) => {
          const done = idx < atual, cur = idx === atual;
          return (
            <li key={et.id} className="flex flex-col items-center gap-1.5 text-center">
              <span className={cn("grid size-7 place-items-center rounded-full border text-[10px] font-semibold transition-colors",
                done && "border-transparent bg-success text-white", cur && "border-primary bg-primary/10 text-primary", !done && !cur && "text-muted-foreground")}>
                {done ? <Check className="size-3.5" /> : cur ? <Loader2 className="size-3.5 animate-spin" /> : idx + 1}
              </span>
              <span className={cn("hidden text-[10px] leading-tight sm:block", cur ? "font-medium text-foreground" : "text-muted-foreground")}>{et.nome}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default function Fila() {
  const { videos, modoReal, enviarParaEdicao } = useStore();
  const [assistir, setAssistir] = React.useState<Video | null>(null);
  const [apagar, setApagar] = React.useState<Video | null>(null);
  const ligado = useEditorLigado(videos.some((v) => v.status === "editando"));
  const banco = (v: Video) => (v as VideoReal).statusBanco;
  const ordem = (v: Video) => (v.status === "editando" ? 0 : banco(v) === "erro" ? 1 : banco(v) === "enviando" ? 3 : 2);
  const ativos = videos.filter((v) => ["editando", "fila", "recusado"].includes(v.status)).sort((a, b) => ordem(a) - ordem(b));
  const naFila = ativos.filter((v) => v.status !== "editando" && !["erro", "enviando"].includes(banco(v) ?? ""));
  const editandoAgora = ativos.find((v) => v.status === "editando");
  const restanteAtual = useTempoRestante(editandoAgora ? `${editandoAgora.id}:${editandoAgora.versao}` : "", editandoAgora?.progresso ?? 0, !!editandoAgora);
  const concluidos = videos.filter((v) => ["aprovacao", "aprovado", "agendado", "publicado"].includes(v.status)).slice(0, 5);
  const estimativa = (editandoAgora ? (restanteAtual ?? 240) : 0) + naFila.length * 240;

  return (
    <>
      <PageHeader title="Fila de edição" description="Acompanhe cada vídeo do envio até ficar pronto para aprovar."
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
          {ativos.map((v) => {
            const r = v as VideoReal;
            const ativo = v.status === "editando";
            const sb = r.statusBanco;
            const posicao = naFila.indexOf(v) + 1;
            return (
              <Card key={v.id} className={cn("overflow-hidden", ativo && "ring-1 ring-primary/40", sb === "erro" && "ring-1 ring-destructive/30")}>
                <div className="flex gap-4 p-4 sm:p-5">
                  <button type="button" onClick={() => modoReal && setAssistir(v)} className="w-20 shrink-0 rounded-xl sm:w-24" aria-label={`Assistir ${v.titulo}`}>
                    <VideoThumb hue={v.hue} headline={v.headline} video={v} className="w-full" showPlay={modoReal} size="sm" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {sb === "enviando" ? <Badge variant="secondary"><CloudUpload /> Enviando</Badge>
                          : sb === "erro" ? <Badge variant="destructive"><AlertTriangle /> Erro</Badge>
                          : <StatusBadge status={v.status} />}
                        {v.versao > 1 && <span className="text-xs text-muted-foreground">versão {v.versao}</span>}
                        {posicao > 0 && <span className="text-xs text-muted-foreground">#{posicao} na fila</span>}
                        {modoReal && <span className="text-xs text-muted-foreground">· enviado {new Date(v.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                      {modoReal && (
                        <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Excluir ${v.titulo}`} title="Excluir da fila" onClick={() => setApagar(v)}><Trash2 /></Button>
                      )}
                    </div>
                    <p className="mt-1.5 truncate font-semibold">{v.titulo}</p>
                    <p className="text-xs text-muted-foreground">{v.produto === "—" ? "Sem produto" : v.produto} · {v.criador}{v.duracaoBruto ? ` · bruto ${fmtDur(v.duracaoBruto)}` : ""}{v.tamanhoMb ? ` · ${v.tamanhoMb >= 1000 ? `${(v.tamanhoMb / 1000).toFixed(1).replace(".", ",")} GB` : `${v.tamanhoMb} MB`}` : ""}</p>
                    {sb === "enviando" && <Envio v={r} onEditar={() => enviarParaEdicao(v.id)} />}
                    {sb === "erro" && (
                      <div className="mt-2 flex flex-col gap-2 rounded-lg bg-destructive/8 p-2.5 text-xs text-destructive sm:flex-row sm:items-center">
                        <span className="flex min-w-0 flex-1 items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{erroAmigavel(r.erro)}</span>
                        <Button size="sm" variant="outline" className="self-start sm:self-auto" onClick={() => enviarParaEdicao(v.id)}><RotateCcw /> Tentar de novo</Button>
                      </div>
                    )}
                    {v.status === "recusado" && v.comentarios.length > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/8 p-2 text-xs text-destructive">
                        <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" /> “{v.comentarios[v.comentarios.length - 1].texto}”
                      </p>
                    )}
                    {posicao > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">Aguardando a vez</span>
                          <span className="text-muted-foreground">{ligado === false ? "começa quando o editor ligar" : posicao === 1 && !editandoAgora ? "começa em até 1 min" : `começa em ${fmtRestante(estimativaAte(posicao, editandoAgora ? (restanteAtual ?? 240) : 0))}`}</span>
                        </div>
                        <BarraIndeterminada className="mt-1.5 opacity-60" />
                      </div>
                    )}
                    {ativo && <Editando v={r} />}
                  </div>
                </div>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Editando agora</span><span className="font-medium">{editandoAgora ? `${Math.round(editandoAgora.progresso)}%` : "nenhum"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Esperando a vez</span><span className="font-medium">{naFila.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tempo para esvaziar</span><span className="font-medium">{!editandoAgora && naFila.length === 0 ? "—" : ligado ? fmtRestante(estimativa) : "começa quando o editor ligar"}</span></div>
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
      <ExcluirDialog video={apagar} onClose={() => setApagar(null)} />
    </>
  );
}

/** Cada vídeo leva ~4 min: espera = o que falta do atual + os da frente. */
function estimativaAte(posicao: number, restanteAtual: number) {
  return restanteAtual + (posicao - 1) * 240;
}
