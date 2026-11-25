"use client";
import * as React from "react";
import { Loader2, Plus, Sparkles, X, Wand2, Megaphone, Anchor, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Trecho } from "@/lib/produtos";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type Combinacoes = { automatico: boolean; hooks: Trecho[]; ctas: Trecho[] };

type Deteccao = { status: "pedida" | "lendo" | "pronta" | "erro"; hooks?: Trecho[]; ctas?: Trecho[]; fonte?: string; frases?: number; erro?: string };

const fmt = (s?: number) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

function Lista({ titulo, icon: Icon, itens, onChange, placeholder }: { titulo: string; icon: React.ElementType; itens: Trecho[]; onChange: (t: Trecho[]) => void; placeholder: string }) {
  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-1.5"><Icon className="size-3.5" /> {titulo} <span className="text-muted-foreground">({itens.length})</span></Label>
      {itens.length === 0 && <p className="text-xs text-muted-foreground">Nenhum encontrado na fala.</p>}
      {itens.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
          <Input className="h-9 text-xs" value={t.texto} placeholder={placeholder}
            onChange={(e) => onChange(itens.map((x) => (x.id === t.id ? { ...x, texto: e.target.value } : x)))} />
          {t.s != null && <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:block">{fmt(t.s)}–{fmt(t.e)}</span>}
          <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => onChange(itens.filter((x) => x.id !== t.id))}><X /></Button>
        </div>
      ))}
      <button onClick={() => onChange([...itens, { id: Math.random().toString(36).slice(2), texto: "" }])} className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Plus className="size-3.5" /> Adicionar</button>
    </div>
  );
}

/**
 * Ganchos e CTAs do MESMO bruto, tirados só da fala real do vídeo enviado (transcrição na nuvem).
 * Mais de um gancho e/ou mais de uma CTA gravados = um vídeo por combinação. Nada de texto de exemplo.
 */
export function HooksCtas({ value, onChange, videoId, varios, enviando }: {
  value: Combinacoes; onChange: (v: Combinacoes) => void;
  videoId?: string | null;   // o vídeo (já enviado) cuja fala será lida
  varios?: boolean;          // mais de um vídeo no envio: cada um é lido sozinho
  enviando?: boolean;        // o vídeo ainda está subindo
}) {
  const [det, setDet] = React.useState<Deteccao | null>(null);
  const [aviso, setAviso] = React.useState("");
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const lendo = det?.status === "pedida" || det?.status === "lendo";

  React.useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  React.useEffect(() => { setDet(null); setAviso(""); }, [videoId]);

  const h = Math.max(1, value.hooks.filter((x) => x.texto.trim()).length);
  const c = Math.max(1, value.ctas.filter((x) => x.texto.trim()).length);

  const aplicar = (d: Deteccao) => {
    const hooks = (d.hooks ?? []).map((x, i) => ({ ...x, id: x.id ?? `h${i + 1}` }));
    const ctas = (d.ctas ?? []).map((x, i) => ({ ...x, id: x.id ?? `c${i + 1}` }));
    onChange({ ...valueRef.current, automatico: false, hooks, ctas });
    if (!d.frases) setAviso("Não encontrei fala neste vídeo. Ele sai como foi gravado, em 1 vídeo.");
    else if (hooks.length <= 1 && ctas.length <= 1) setAviso("Só achei um gancho e uma chamada na fala. O vídeo sai como foi gravado, em 1 vídeo. Se gravou outra versão, adicione abaixo.");
    else setAviso("");
  };

  const acompanhar = (id: string) => {
    if (timer.current) clearInterval(timer.current);
    const inicio = Date.now();
    timer.current = setInterval(async () => {
      const { data } = await supabase!.from("videos").select("deteccao").eq("id", id).maybeSingle();
      const d = (data?.deteccao ?? null) as Deteccao | null;
      if (d) setDet(d);
      if (d?.status === "pronta") { clearInterval(timer.current!); aplicar(d); }
      else if (d?.status === "erro") { clearInterval(timer.current!); setAviso("Não consegui ler a fala deste vídeo agora. Deixe “Achar sozinho” ligado: o editor lê na hora de editar."); }
      else if (Date.now() - inicio > 8 * 60_000) { clearInterval(timer.current!); setDet(null); setAviso("O editor na nuvem demorou para responder. Deixe “Achar sozinho” ligado e toque em Editar: ele lê a fala na hora de editar."); }
    }, 4000);
  };

  const detectar = async () => {
    setAviso("");
    if (!supabase || !videoId) return;
    const { data } = await supabase.from("videos").select("deteccao").eq("id", videoId).maybeSingle();
    const atual = (data?.deteccao ?? null) as Deteccao | null;
    if (atual?.status === "pronta") { setDet(atual); aplicar(atual); return; }
    if (atual?.status !== "pedida" && atual?.status !== "lendo") {
      const { error } = await supabase.from("videos").update({ deteccao: { status: "pedida" } }).eq("id", videoId);
      if (error) { setAviso("Não deu para pedir a leitura da fala. Tente de novo."); return; }
    }
    setDet({ status: "pedida" });
    acompanhar(videoId);
  };

  const podeLer = !!videoId && !varios && !enviando && !!supabase;
  const motivo = !supabase ? "Na demonstração não há vídeo de verdade para transcrever."
    : varios ? "Com mais de um vídeo no envio, cada um tem os ganchos e CTAs achados sozinhos na fala dele, na hora de editar."
    : enviando ? "Espere o vídeo terminar de subir para ler a fala."
    : !videoId ? "Envie o vídeo primeiro: a prévia lê a fala dele." : "";

  const botao = (texto: string) => (
    <Button size="sm" variant="outline" disabled={!podeLer || lendo} onClick={detectar}>
      {lendo ? <Loader2 className="animate-spin" /> : <Wand2 />} {texto}
    </Button>
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Hooks e CTAs</Label>
          <p className="mt-1 text-xs text-muted-foreground">Gravou mais de um gancho (no começo) ou mais de uma chamada (no final) no mesmo vídeo? O editor lê a sua fala e gera um vídeo para cada combinação.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">Achar sozinho <Switch checked={value.automatico} onCheckedChange={(a) => onChange({ ...value, automatico: a })} /></div>
      </div>

      {lendo && (
        <p className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          {det?.status === "pedida" ? "Pedido enviado ao editor na nuvem. Ele começa em até 1 minuto…" : "Transcrevendo a fala do vídeo… leva 1 a 3 minutos."}
        </p>
      )}

      {value.automatico ? (
        !lendo && (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <Sparkles className="hidden size-4 shrink-0 text-primary sm:block" />
            <p className="flex-1">Na edição, o editor transcreve o vídeo e marca cada gancho e cada CTA que você falou. Quer conferir antes? Leia a fala agora.</p>
            {botao("Ver prévia")}
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4">
            <Lista titulo="Ganchos (início)" icon={Anchor} itens={value.hooks} placeholder="O gancho, como você falou" onChange={(hooks) => onChange({ ...value, hooks })} />
            <Lista titulo="CTAs (final)" icon={Megaphone} itens={value.ctas} placeholder="A chamada, como você falou" onChange={(ctas) => onChange({ ...value, ctas })} />
          </div>
          {!lendo && <div>{botao(det ? "Ler a fala de novo" : "Ler a fala do vídeo")}</div>}
        </>
      )}

      {(aviso || (motivo && !lendo)) && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> {aviso || motivo}</p>
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
          <p className="mt-2 text-[11px] text-muted-foreground">Os textos e tempos vêm da sua fala. Corrigir o texto não muda o áudio: o editor usa o trecho que você falou.</p>
        </div>
      )}
    </div>
  );
}
