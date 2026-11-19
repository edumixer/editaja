"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type ModoHeadline = "auto" | "manual" | "sem";
export type HeadlineCfg = { modo: ModoHeadline; texto: string; x: number; y: number };
export const HEADLINE_PADRAO: HeadlineCfg = { modo: "auto", texto: "", x: 0.5, y: 0.24 };

const MODOS: { id: ModoHeadline; titulo: string; dica: string }[] = [
  { id: "auto", titulo: "Automática", dica: "A IA escreve com o gancho falado" },
  { id: "manual", titulo: "Eu escrevo", dica: "Seu texto, na posição que quiser" },
  { id: "sem", titulo: "Sem headline", dica: "O vídeo sai sem texto na tela" },
];
const ATALHOS = [{ l: "Topo", y: 0.14 }, { l: "Meio", y: 0.45 }, { l: "Baixo", y: 0.72 }];
const lim = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Tela 9:16 em miniatura: toque ou arraste o texto para escolher onde a headline aparece. */
export function PosicaoHeadline({ texto, x, y, onChange, className }: { texto: string; x: number; y: number; onChange: (p: { x: number; y: number }) => void; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const arrastando = React.useRef(false);
  const mover = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onChange({ x: Math.round(lim((e.clientX - r.left) / r.width, 0.15, 0.85) * 100) / 100, y: Math.round(lim((e.clientY - r.top) / r.height, 0.05, 0.9) * 100) / 100 });
  };
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div ref={ref} role="slider" aria-label="Posição da headline" aria-valuetext={`${Math.round(y * 100)}% da altura`} aria-valuenow={Math.round(y * 100)} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowUp") onChange({ x, y: lim(y - 0.03, 0.05, 0.9) }); if (e.key === "ArrowDown") onChange({ x, y: lim(y + 0.03, 0.05, 0.9) }); }}
        onPointerDown={(e) => { arrastando.current = true; e.currentTarget.setPointerCapture(e.pointerId); mover(e); }}
        onPointerMove={(e) => arrastando.current && mover(e)} onPointerUp={() => (arrastando.current = false)}
        className="relative aspect-[9/16] w-28 shrink-0 cursor-crosshair touch-none select-none overflow-hidden rounded-xl bg-gradient-to-b from-zinc-600 to-zinc-900 ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <div className="absolute bottom-0 left-1/2 h-[55%] w-[60%] -translate-x-1/2 rounded-t-[45%] bg-white/10" />
        <span className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded bg-black/30 px-1 text-center text-[9px] font-extrabold leading-tight text-white ring-1 ring-primary"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>{texto || "Sua headline"}</span>
      </div>
      <div className="grid min-w-0 gap-1.5 text-xs">
        <p className="text-muted-foreground">Toque ou arraste na tela ao lado para posicionar.</p>
        <div className="flex flex-wrap gap-1.5">
          {ATALHOS.map((a) => (
            <button key={a.l} type="button" onClick={() => onChange({ x: 0.5, y: a.y })}
              className={cn("rounded-full border px-3 py-1.5 font-medium", Math.abs(y - a.y) < 0.05 && Math.abs(x - 0.5) < 0.05 ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{a.l}</button>
          ))}
        </div>
        <p className="tabular-nums text-muted-foreground">Altura: {Math.round(y * 100)}% · {x < 0.4 ? "à esquerda" : x > 0.6 ? "à direita" : "centralizada"}</p>
      </div>
    </div>
  );
}

/** Escolha do texto na tela para o envio: automática, escrita por você (com posição) ou nenhuma. */
export function HeadlineConfig({ value, onChange }: { value: HeadlineCfg; onChange: (v: HeadlineCfg) => void }) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {MODOS.map((m) => (
          <button key={m.id} type="button" onClick={() => onChange({ ...value, modo: m.id })}
            className={cn("rounded-lg border p-2 text-left transition-colors", value.modo === m.id ? "border-primary bg-accent" : "bg-card hover:bg-accent/50")}>
            <span className="block text-xs font-semibold">{m.titulo}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{m.dica}</span>
          </button>
        ))}
      </div>
      {value.modo === "manual" && (
        <div className="grid gap-3 rounded-lg border bg-card p-3">
          <Input placeholder="Ex.: Cuidado com camisa falsa" value={value.texto} maxLength={80} onChange={(e) => onChange({ ...value, texto: e.target.value })} />
          <PosicaoHeadline texto={value.texto} x={value.x} y={value.y} onChange={(p) => onChange({ ...value, ...p })} />
        </div>
      )}
      {value.modo === "auto" && <p className="text-xs text-muted-foreground">Fica no topo nos primeiros 6 segundos. Na aprovação você pode trocar o texto, mudar de lugar ou tirar.</p>}
    </div>
  );
}
