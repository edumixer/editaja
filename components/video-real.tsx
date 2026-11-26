"use client";
import * as React from "react";
import { Loader2, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { linkAssinado } from "@/lib/armazenamento";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/data";

/** Campos que só existem no modo real (vêm da linha do banco). */
export type VideoReal = Video & { editadoPath?: string; erro?: string; statusBanco?: string; editadoEm?: string };

/** Data e hora em que o editor terminou o vídeo (ex.: "19/11 às 14:30"). Sem registro, usa a data de envio. */
export function quandoEditado(v: Video): string | undefined {
  const iso = (v as VideoReal).editadoEm ?? v.criadoEm;
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

/** Link assinado (1 h) do vídeo editado no Storage: editados/<dono>/<id>/v<versao>.mp4 */
export function useVideoEditado(owner: string | undefined, id: string, versao: number, caminho?: string, pronto = true) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState(false);
  React.useEffect(() => {
    if (!owner || !supabase || !pronto) return;
    let vivo = true;
    setUrl(null); setErro(false);
    // usa o caminho que o editor gravou no banco; se não tiver, o caminho padrão
    const alvo = caminho || `${owner}/${id}/v${versao}.mp4`;
    linkAssinado("editados", alvo).then((u) => {   // R2 (novos) ou Supabase (antigos)
      if (!vivo) return;
      if (u) setUrl(u); else setErro(true);
    });
    return () => { vivo = false; };
  }, [owner, id, versao, caminho, pronto]);
  return { url, erro };
}

/** Miniatura com o 1º quadro do vídeo editado de verdade (sem baixar o vídeo todo). */
export function MiniaturaReal({ owner, id, versao, caminho, className }: { owner?: string; id: string; versao: number; caminho?: string; className?: string }) {
  const { url, erro } = useVideoEditado(owner, id, versao, caminho);
  return (
    <div className={cn("relative aspect-[9/16] overflow-hidden rounded-xl bg-black ring-1 ring-black/5", className)}>
      {url && <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />}
      {!url && !erro && <div className="absolute inset-0 grid place-items-center text-white/60"><Loader2 className="size-5 animate-spin" /></div>}
      {erro && <div className="absolute inset-0 grid place-items-center p-3 text-center text-[11px] text-white/70">Arquivo editado não encontrado</div>}
      {url && <div className="absolute inset-0 grid place-items-center"><div className="grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md"><Play className="size-4 fill-current" /></div></div>}
    </div>
  );
}
