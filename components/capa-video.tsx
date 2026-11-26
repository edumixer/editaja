"use client";
import * as React from "react";
import { Film, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/data";

/** Campos do modo real que a capa usa (vêm da linha do banco, ver lib/store.tsx). */
type Extra = { capaPath?: string; brutoPath?: string; editadoPath?: string; ownerId?: string };

import { linkAssinado } from "@/lib/armazenamento";
/** Link assinado (cache de 50 min) de um arquivo, no R2 (caminho "r2:…") ou no Supabase. */
export { linkAssinado };

/** Arquivo para assistir: o editado quando existe, senão o bruto enviado. */
export function fonteDoVideo(v: Video): { bucket: string; caminho: string } | null {
  const x = v as Video & Extra;
  if (x.editadoPath) return { bucket: "editados", caminho: x.editadoPath };
  if (x.brutoPath) return { bucket: "brutos", caminho: x.brutoPath };
  return null;
}

/**
 * Capa de verdade do vídeo (modo real): a foto tirada do próprio vídeo no envio;
 * sem ela, um quadro do vídeo editado ou do bruto. Nunca uma arte de exemplo.
 */
export function CapaReal({ video, className, showPlay = true, size = "md" }: { video: Video; className?: string; showPlay?: boolean; size?: "sm" | "md" | "lg" }) {
  const x = video as Video & Extra;
  const [img, setImg] = React.useState<string | null>(null);
  const [vid, setVid] = React.useState<string | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  React.useEffect(() => {
    let vivo = true;
    setImg(null); setVid(null); setFalhou(false);
    (async () => {
      if (!supabase) return;
      if (x.capaPath) { const u = await linkAssinado("brutos", x.capaPath); if (vivo && u) { setImg(u); return; } }
      const f = fonteDoVideo(video);
      if (!f) { if (vivo) setFalhou(true); return; }
      const u = await linkAssinado(f.bucket, f.caminho);
      if (!vivo) return;
      if (u) setVid(u); else setFalhou(true);
    })();
    return () => { vivo = false; };
  }, [x.capaPath, x.brutoPath, x.editadoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("relative aspect-[9/16] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-black/5", className)}>
      {img && <img src={img} alt="" className="size-full object-cover" onError={() => { setImg(null); setFalhou(true); }} />}
      {!img && vid && <video src={`${vid}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" onError={() => { setVid(null); setFalhou(true); }} />}
      {!img && !vid && (
        <div className="absolute inset-0 grid place-items-center text-white/60">
          {falhou ? <Film className={size === "sm" ? "size-4" : "size-6"} /> : <span className="size-4 animate-pulse rounded-full bg-white/30" />}
        </div>
      )}
      {showPlay && (img || vid) && (
        <div className="absolute inset-0 grid place-items-center">
          <div className={cn("grid place-items-center rounded-full bg-black/40 text-white backdrop-blur-md", size === "lg" ? "size-16" : size === "sm" ? "size-6" : "size-9")}>
            <Play className={cn("fill-current", size === "lg" ? "size-7" : size === "sm" ? "size-3" : "size-4")} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Tira uma foto (JPG) de um quadro do vídeo escolhido, direto no navegador. Se o navegador não abrir o formato, devolve null. */
export function capturarCapa(arquivo: File, segundo = 0.5): Promise<Blob | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    let feito = false;
    const fim = (b: Blob | null) => { if (feito) return; feito = true; URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); ok(b); };
    const t = setTimeout(() => fim(null), 10_000);
    v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onloadedmetadata = () => { v.currentTime = Math.min(segundo, Math.max(0, (v.duration || 1) / 3)); };
    v.onseeked = () => {
      try {
        const w = 540, h = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w) || 960;
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(v, 0, 0, w, h);
        c.toBlob((b) => { clearTimeout(t); fim(b); }, "image/jpeg", 0.82);
      } catch { clearTimeout(t); fim(null); }
    };
    v.onerror = () => { clearTimeout(t); fim(null); };
    v.src = url;
  });
}
