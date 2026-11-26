"use client";
import * as React from "react";
import Link from "next/link";
import { Clock, Scissors, Image as ImageIcon, Volume2, CalendarClock, Check, CheckSquare, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoThumb } from "@/components/video-thumb";
import { MiniaturaReal, quandoEditado, type VideoReal } from "@/components/video-real";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { fmtDur, type Status, type Video } from "@/lib/data";

const FILTROS: { id: string; label: string; status: Status[] }[] = [
  { id: "pendentes", label: "Pendentes", status: ["aprovacao"] },
  { id: "aprovados", label: "Aprovados", status: ["aprovado", "agendado", "publicado"] },
  { id: "reeditando", label: "Reeditando", status: ["recusado"] },
];

export default function Aprovacao() {
  const { videos, modoReal, sessao, excluirVarios } = useStore();
  const [f, setF] = React.useState("pendentes");
  const lista = videos.filter((v) => FILTROS.find((x) => x.id === f)!.status.includes(v.status));

  // seleção de vários vídeos para excluir de uma vez
  const [selecionando, setSelecionando] = React.useState(false);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = React.useState(false);
  const [apagando, setApagando] = React.useState(false);
  const visiveis = new Set(lista.map((v) => v.id));
  const escolhidos = [...sel].filter((id) => visiveis.has(id));
  const todos = lista.length > 0 && escolhidos.length === lista.length;
  const sair = () => { setSelecionando(false); setSel(new Set()); };
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setSel(todos ? new Set() : new Set(lista.map((v) => v.id)));
  const trocarAba = (id: string) => { setF(id); setSel(new Set()); };

  // um original selecionado leva junto as versões (ganchos × CTAs) que ainda não estão marcadas
  const extras = videos.filter((v) => { const o = (v as Video & { origemId?: string }).origemId; return o && escolhidos.includes(o) && !escolhidos.includes(v.id); }).length;
  const titulos = lista.filter((v) => escolhidos.includes(v.id));

  const excluir = async () => {
    setApagando(true);
    try {
      const n = await excluirVarios(escolhidos);
      toast.success(n === 1 ? "1 vídeo excluído" : `${n} vídeos excluídos`, { description: "Os arquivos também foram apagados do armazenamento." });
      setConfirmar(false); sair();
    } catch (e) {
      toast.error("Não deu para excluir", { description: (e as Error).message });
    } finally { setApagando(false); }
  };

  return (
    <>
      <PageHeader title="Aprovação" description="Assista cada vídeo editado e aprove, ou peça ajustes com um comentário." />
      {!modoReal && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <b>Modo exemplo:</b> esta versão ainda não está ligada ao servidor de edição. Os vídeos enviados não saem do seu navegador e as imagens abaixo são prévias simuladas, não o vídeo editado.
        </p>
      )}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={f} onValueChange={trocarAba}>
          <TabsList className="w-full sm:w-auto">
            {FILTROS.map((x) => {
              const n = videos.filter((v) => x.status.includes(v.status)).length;
              return <TabsTrigger key={x.id} value={x.id} className="flex-1 sm:flex-none">{x.label} <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{n}</span></TabsTrigger>;
            })}
          </TabsList>
        </Tabs>
        {lista.length > 0 && (selecionando ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={marcarTodos} className="flex-1 sm:flex-none">
              <CheckSquare /> {todos ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
            <Button variant="ghost" size="sm" onClick={sair} className="flex-1 sm:flex-none"><X /> Cancelar</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setSelecionando(true)} className="self-start sm:self-auto">
            <CheckSquare /> Selecionar
          </Button>
        ))}
      </div>

      {selecionando && (
        <p className="mb-4 text-xs text-muted-foreground">Toque nos vídeos para marcar. Depois use “Excluir selecionados” lá embaixo.</p>
      )}

      {lista.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nada por aqui agora.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lista.map((v) => {
            const marcado = selecionando && sel.has(v.id);
            const conteudo = (
              <>
                <div className={cn("relative rounded-xl transition-all", marcado && "ring-[3px] ring-primary ring-offset-2 ring-offset-background")}>
                  {modoReal
                    ? <MiniaturaReal owner={sessao?.user.id} id={v.id} versao={v.versao} caminho={(v as VideoReal).editadoPath} className={cn("transition-all", !selecionando && "group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10", marcado && "opacity-80")} />
                    : <VideoThumb hue={v.hue} headline={v.headline} className={cn("transition-all", !selecionando && "group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10", marcado && "opacity-80")} />}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur">{fmtDur(v.duracaoFinal)}</span>
                  {v.variante && <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">Versão {v.variante}</span>}
                  {selecionando && (
                    <span aria-hidden className={cn("absolute right-2 top-2 grid size-7 place-items-center rounded-lg border-2 shadow-md transition-colors",
                      marcado ? "border-primary bg-primary text-primary-foreground" : "border-white/90 bg-black/35 text-transparent backdrop-blur")}>
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="mt-2.5"><StatusBadge status={v.status} /></div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{v.titulo}</p>
                {quandoEditado(v) && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarClock className="size-3 shrink-0" />Editado {quandoEditado(v)}</p>}
                <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Clock className="size-3" />{fmtDur(v.duracaoBruto)}</span>
                  <span className="flex items-center gap-0.5"><Scissors className="size-3" />{v.cortes ?? "—"}</span>
                  <span className="flex items-center gap-0.5"><ImageIcon className="size-3" />{v.imagens ?? "—"}</span>
                  <span className="flex items-center gap-0.5"><Volume2 className="size-3" />{v.sons ?? "—"}</span>
                </div>
              </>
            );
            return selecionando ? (
              <button key={v.id} type="button" role="checkbox" aria-checked={marcado} onClick={() => alternar(v.id)}
                className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {conteudo}
              </button>
            ) : (
              <Link key={v.id} href={`/aprovacao/${v.id}`} className="group min-w-0">{conteudo}</Link>
            );
          })}
        </div>
      )}

      {selecionando && (
        <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),0.5rem)+4.75rem)] z-30 mt-6 lg:bottom-6">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card/95 p-2.5 pl-4 shadow-xl backdrop-blur-xl">
            <p className="min-w-0 flex-1 text-sm">
              <b className="tabular-nums">{escolhidos.length}</b> <span className="text-muted-foreground">{escolhidos.length === 1 ? "selecionado" : "selecionados"}</span>
            </p>
            <Button variant="destructive" disabled={!escolhidos.length} onClick={() => setConfirmar(true)}>
              <Trash2 /> <span className="hidden min-[380px]:inline">Excluir selecionados</span><span className="min-[380px]:hidden">Excluir</span>
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmar} onOpenChange={(o) => { if (!o && !apagando) setConfirmar(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {escolhidos.length === 1 ? "1 vídeo" : `${escolhidos.length} vídeos`}?</DialogTitle>
            <DialogDescription>
              Os vídeos editados e os arquivos deles são apagados da sua conta para sempre. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-44 divide-y overflow-y-auto rounded-lg border text-sm">
            {titulos.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{v.titulo}</span>
                {v.variante && <span className="shrink-0 text-[11px] text-muted-foreground">Versão {v.variante}</span>}
              </li>
            ))}
          </ul>
          {extras > 0 && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              Entre eles há vídeo original com <b>{extras} {extras === 1 ? "versão" : "versões"}</b> (ganchos × CTAs) que também {extras === 1 ? "será excluída" : "serão excluídas"}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={apagando} onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={apagando} onClick={excluir}>
              <Trash2 /> {apagando ? "Excluindo…" : `Excluir ${escolhidos.length === 1 ? "1 vídeo" : `${escolhidos.length} vídeos`}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
