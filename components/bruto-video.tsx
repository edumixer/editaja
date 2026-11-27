"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, Download, Film, Loader2, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { linkAssinado } from "@/lib/armazenamento";
import { brutoEmUso, familia, PRAZO_BRUTO_DIAS, prazoTexto, temEditados, venceEm, venceLogo } from "@/lib/bruto";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/data";

type Extra = Video & { brutoPath?: string; editadoPath?: string; origemId?: string };

/** Etiqueta do prazo de autoexclusão, em cima da miniatura do bruto. */
export function PrazoBruto({ v, className }: { v: Video; className?: string }) {
  const { videos } = useStore();
  const logo = venceLogo(v) && !brutoEmUso(v, videos);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur", logo ? "bg-destructive text-white" : "bg-black/55 text-white", className)}>
      <Clock className="size-3 shrink-0" /> {prazoTexto(v, videos, Date.now(), true)}
    </span>
  );
}

/** Assistir o vídeo bruto original inteiro, ver os editados dele e excluir só o bruto. */
export function BrutoDialog({ video, onClose, pedirExcluir = false }: { video: Video | null; onClose: () => void; /** já abre na confirmação de excluir */ pedirExcluir?: boolean }) {
  const { videos, excluirBruto, excluirVideo } = useStore();
  const v = video as Extra | null;
  const [url, setUrl] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState(false);
  const [confirmar, setConfirmar] = React.useState(false);
  const [apagando, setApagando] = React.useState(false);

  React.useEffect(() => {
    setUrl(null); setErro(false); setConfirmar(pedirExcluir && !!video && !brutoEmUso(video, videos));
    if (!v?.brutoPath) return;
    let vivo = true;
    linkAssinado("brutos", v.brutoPath).then((u) => { if (vivo) { if (u) setUrl(u); else setErro(true); } });
    return () => { vivo = false; };
  }, [v?.id, v?.brutoPath, pedirExcluir]); // eslint-disable-line react-hooks/exhaustive-deps

  const baixar = async () => {
    if (!v?.brutoPath) return;
    const nome = v.brutoPath.split("/").pop() || `${v.titulo}.mp4`;
    const u = await linkAssinado("brutos", v.brutoPath, nome);
    if (u) window.open(u, "_blank"); else toast.error("Não deu para baixar agora");
  };

  if (!v) return <Dialog open={false} />;
  const versoes = familia(v, videos).filter((x) => (x as Extra).editadoPath);
  const editados = temEditados(v, videos);
  const emUso = brutoEmUso(v, videos);
  const vence = venceEm(v);
  const linkEditado = versoes.length === 1 ? `/aprovacao/${versoes[0].id}` : "/aprovacao";

  const apagar = async () => {
    setApagando(true);
    try {
      if (editados) {
        await excluirBruto(v.id);
        toast.success("Vídeo bruto excluído", { description: `${versoes.length === 1 ? "O vídeo editado continua" : `Os ${versoes.length} vídeos editados continuam`} na Biblioteca.` });
      } else {
        // nunca foi editado: sem o bruto não sobra nada, então o vídeo sai da conta
        await excluirVideo(v.id);
        toast.success("Vídeo bruto excluído");
      }
      onClose();
    } catch (e) {
      toast.error("Não deu para excluir", { description: (e as Error).message });
    } finally { setApagando(false); }
  };

  return (
    <Dialog open={!!video} onOpenChange={(o) => { if (!o && !apagando) onClose(); }}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{v.titulo}</DialogTitle>
          <DialogDescription>
            Vídeo bruto original, do jeito que foi enviado{v.tamanhoMb ? ` · ${v.tamanhoMb} MB` : ""} · enviado em {new Date(v.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto aspect-[9/16] h-[min(52dvh,540px)] max-w-full shrink-0 overflow-hidden rounded-xl bg-black">
          {url && <video key={url} src={url} controls playsInline preload="metadata" className="size-full object-contain" onError={() => setErro(true)} />}
          {!url && !erro && <div className="absolute inset-0 grid place-items-center text-white/60"><Loader2 className="size-6 animate-spin" /></div>}
          {erro && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/75">
              <div><Film className="mx-auto mb-2 size-7" />Não deu para abrir o bruto aqui. O navegador pode não tocar esse formato (ex.: HEVC); use “Baixar”.</div>
            </div>
          )}
        </div>

        <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-xs", venceLogo(v) && !emUso ? "border-destructive/40 bg-destructive/5" : "bg-muted/50")}>
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            <b>{prazoTexto(v, videos)}.</b> Os brutos são excluídos sozinhos {PRAZO_BRUTO_DIAS} dias depois do envio
            ({vence.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}).
            {editados ? " Os vídeos editados continuam guardados." : " Ele ainda não foi editado: edite antes disso para não perder."}
            {emUso && " Enquanto o editor estiver usando, ele não é apagado."}
          </p>
        </div>

        {confirmar && (
          <div className="grid gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <p className="font-semibold">Excluir o vídeo bruto para sempre?</p>
            <p>{editados
              ? `Só o arquivo original sai. ${versoes.length === 1 ? "O vídeo editado continua" : `Os ${versoes.length} vídeos editados continuam`} e você ainda pode aprovar e publicar, mas não dá mais para pedir para refazer.`
              : "Este vídeo ainda não foi editado, então ele sai da sua conta inteiro."} Não dá para desfazer.</p>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {confirmar ? (
            <>
              <Button variant="outline" disabled={apagando} onClick={() => setConfirmar(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={apagando} onClick={apagar}>{apagando ? <Loader2 className="animate-spin" /> : <Trash2 />} {apagando ? "Excluindo…" : "Sim, excluir o bruto"}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={emUso} title={emUso ? "Espere a edição terminar" : undefined} onClick={() => setConfirmar(true)}><Trash2 /> Excluir bruto</Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={baixar}><Download /> Baixar</Button>
                {editados && <Button variant="brand" asChild><Link href={linkEditado}><Scissors /> {versoes.length > 1 ? `Ver editados (${versoes.length})` : "Ver editado"}</Link></Button>}
              </div>
            </>
          )}
        </DialogFooter>
        {emUso && !confirmar && <p className="-mt-2 text-center text-[11px] text-muted-foreground">Para excluir, espere a edição terminar.</p>}
      </DialogContent>
    </Dialog>
  );
}
