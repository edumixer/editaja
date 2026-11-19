"use client";
import * as React from "react";
import { Loader2, Plus, Sparkles, X, Wand2, Megaphone, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { detectarDemo, type Trecho } from "@/lib/produtos";
import { cn } from "@/lib/utils";

export type Combinacoes = { automatico: boolean; hooks: Trecho[]; ctas: Trecho[] };

const fmt = (s?: number) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

function Lista({ titulo, icon: Icon, itens, onChange, placeholder }: { titulo: string; icon: React.ElementType; itens: Trecho[]; onChange: (t: Trecho[]) => void; placeholder: string }) {
  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-1.5"><Icon className="size-3.5" /> {titulo} <span className="text-muted-foreground">({itens.length})</span></Label>
      {itens.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
          <Input className="h-9 text-xs" value={t.texto} placeholder={placeholder} onChange={(e) => onChange(itens.map((x) => (x.id === t.id ? { ...x, texto: e.target.value } : x)))} />
          {t.s != null && <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:block">{fmt(t.s)}–{fmt(t.e)}</span>}
          <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => onChange(itens.filter((x) => x.id !== t.id))}><X /></Button>
        </div>
      ))}
      <button onClick={() => onChange([...itens, { id: Math.random().toString(36).slice(2), texto: "" }])} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Plus className="size-3.5" /> Adicionar</button>
    </div>
  );
}

/** Define os ganchos e CTAs do mesmo bruto e mostra quantos vídeos vão sair (hooks × CTAs). */
export function HooksCtas({ produto, value, onChange }: { produto: string; value: Combinacoes; onChange: (v: Combinacoes) => void }) {
  const [detectando, setDetectando] = React.useState(false);
  const h = Math.max(1, value.hooks.filter((x) => x.texto.trim()).length);
  const c = Math.max(1, value.ctas.filter((x) => x.texto.trim()).length);
  const detectar = () => {
    setDetectando(true);
    onChange({ ...value, automatico: false });
    setTimeout(() => { onChange({ ...value, automatico: false, ...detectarDemo(produto) }); setDetectando(false); }, 900);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Hooks e CTAs</Label>
          <p className="mt-1 text-xs text-muted-foreground">Gravou mais de um gancho ou chamada no mesmo vídeo? O editor gera um vídeo para cada combinação.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">Achar sozinho <Switch checked={value.automatico} onCheckedChange={(a) => onChange({ ...value, automatico: a })} /></div>
      </div>

      {value.automatico ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <p className="flex-1">Depois da transcrição, o editor marca cada gancho e cada CTA e monta as combinações. Você pode conferir antes do render.</p>
          <Button size="sm" variant="outline" onClick={detectar}><Wand2 /> Ver prévia</Button>
        </div>
      ) : (
        <>
          {detectando ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Lendo a transcrição…</p>
          ) : (
            <div className="grid gap-4">
              <Lista titulo="Ganchos (início)" icon={Anchor} itens={value.hooks} placeholder="Ex.: Cuidado com camisa falsa" onChange={(hooks) => onChange({ ...value, hooks })} />
              <Lista titulo="CTAs (final)" icon={Megaphone} itens={value.ctas} placeholder="Ex.: Clica no carrinho" onChange={(ctas) => onChange({ ...value, ctas })} />
            </div>
          )}
          <button onClick={detectar} className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Wand2 className="size-3.5" /> Detectar na fala de novo</button>
        </>
      )}

      {!value.automatico && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm font-semibold">{h} {h === 1 ? "gancho" : "ganchos"} × {c} {c === 1 ? "CTA" : "CTAs"} = <span className="brand-text">{h * c} {h * c === 1 ? "vídeo" : "vídeos"}</span></p>
          {h * c > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: h }).flatMap((_, i) => Array.from({ length: c }).map((__, j) => (
                <span key={`${i}-${j}`} className={cn("rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums")}>Gancho {i + 1} + CTA {j + 1}</span>
              )))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
