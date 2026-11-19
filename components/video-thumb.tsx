import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

/** Miniatura 9:16 estilizada (no produto real: frame do vídeo). */
export function VideoThumb({ hue, headline, className, playing, showPlay = true, size = "md" }:
  { hue: number; headline?: string; className?: string; playing?: boolean; showPlay?: boolean; size?: "sm" | "md" | "lg" }) {
  const aviso = headline && /cuidado|falso/i.test(headline);
  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-black/5", className)}
      style={{ backgroundImage: `radial-gradient(120% 80% at 50% 0%, oklch(0.55 0.17 ${hue}) 0%, oklch(0.28 0.08 ${hue}) 55%, oklch(0.16 0.03 ${hue}) 100%)` }}
    >
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="relative h-[62%] w-[70%]">
          <div className="absolute left-1/2 top-0 aspect-square w-[38%] -translate-x-1/2 rounded-full bg-white/15 backdrop-blur" />
          <div className="absolute bottom-0 left-0 right-0 h-[62%] rounded-t-[45%] bg-white/10" />
        </div>
      </div>
      {headline && size !== "sm" && (
        <div className="absolute inset-x-0 top-[22%] px-3 text-center">
          <span className={cn("inline-block rounded-md bg-black/25 px-2 py-1 font-extrabold leading-tight text-white drop-shadow-md", size === "lg" ? "text-xl" : "text-[11px]")}>
            {headline}{aviso && " 🚨"}
          </span>
        </div>
      )}
      {showPlay && (
        <div className="absolute inset-0 grid place-items-center">
          <div className={cn("grid place-items-center rounded-full bg-white/20 text-white backdrop-blur-md transition-transform", size === "lg" ? "size-16" : size === "sm" ? "size-6" : "size-9", playing && "scale-0")}>
            <Play className={cn("fill-current", size === "lg" ? "size-7" : size === "sm" ? "size-3" : "size-4")} />
          </div>
        </div>
      )}
    </div>
  );
}
