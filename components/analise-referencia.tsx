"use client";
import * as React from "react";
import { AudioLines, Captions, Clapperboard, Gauge, Image as ImageIcon, ListChecks, Type, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analiseDemo } from "@/lib/analise";

const tempo = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0").replace(".", ",")}`;

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

/** Tudo o que foi extraído do vídeo de referência: fala, legendas, fonte, posição, ritmo, imagens e sons. */
export function AnaliseReferencia({ open, onOpenChange, id, nome }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; nome: string }) {
  const a = React.useMemo(() => analiseDemo(id, nome), [id, nome]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{nome}</DialogTitle>
          <DialogDescription>{a.resumo}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { i: Video, l: "Duração", v: `${a.duracao_s} s` },
            { i: Clapperboard, l: "Cortes/min", v: a.ritmo.cortes_por_min },
            { i: Gauge, l: "Pausa máx.", v: `${String(a.ritmo.pausa_max_s).replace(".", ",")} s` },
            { i: ImageIcon, l: "Imagens", v: a.imagens.length },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border p-3"><s.i className="size-4 text-muted-foreground" /><p className="mt-1.5 text-sm font-semibold tabular-nums">{s.v}</p><p className="text-[11px] text-muted-foreground">{s.l}</p></div>
          ))}
        </div>
        <Tabs defaultValue="texto">
          <TabsList className="w-full justify-start overflow-x-auto scrollbar-none">
            <TabsTrigger value="texto"><Type /> Texto na tela</TabsTrigger>
            <TabsTrigger value="fala"><Captions /> Fala</TabsTrigger>
            <TabsTrigger value="imagens"><ImageIcon /> Imagens e sons</TabsTrigger>
            <TabsTrigger value="regras"><ListChecks /> Regras</TabsTrigger>
          </TabsList>
          <TabsContent value="texto" className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
              {a.legendas.usa ? <>
                <Linha k="Fonte" v={a.legendas.fonte} /><Linha k="Tamanho" v={a.legendas.tamanho} /><Linha k="Cor" v={a.legendas.cor} />
                <Linha k="Contorno" v={a.legendas.contorno} /><Linha k="Posição" v={a.legendas.posicao} /><Linha k="Palavras por tela" v={a.legendas.palavras_por_tela} /><Linha k="Estilo" v={a.legendas.estilo} />
              </> : <p className="text-sm text-muted-foreground">Sem legenda corrida.</p>}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Headline (gancho na tela)</p>
              {a.headline.texto ? <>
                <Linha k="Texto" v={a.headline.texto} /><Linha k="Fica até" v={`${a.headline.ate_s} s`} /><Linha k="Posição" v={a.headline.posicao} /><Linha k="Emoji" v={a.headline.emoji ?? "—"} />
              </> : <p className="text-sm text-muted-foreground">Sem headline.</p>}
              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Câmera e ritmo</p>
              <Linha k="Enquadramento" v={a.camera} /><Linha k="Plano médio" v={`${String(a.ritmo.plano_medio_s).replace(".", ",")} s`} /><Linha k="Velocidade" v={a.ritmo.velocidade} />
            </div>
          </TabsContent>
          <TabsContent value="fala">
            <ol className="space-y-2">
              {a.transcricao.map((l, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-14 shrink-0 tabular-nums text-muted-foreground">{tempo(l.t)}</span><span>{l.texto}</span></li>)}
            </ol>
          </TabsContent>
          <TabsContent value="imagens" className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sobreposições</p>
              {a.imagens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma.</p>}
              {a.imagens.map((im, i) => <p key={i} className="border-b py-2 text-sm last:border-0"><span className="tabular-nums text-muted-foreground">{tempo(im.t)}</span> · {im.o_que} · {im.lado} · {im.inclinacao} · {String(im.duracao_s).replace(".", ",")} s</p>)}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><AudioLines className="size-3.5" /> Sons</p>
              {a.sons.map((s, i) => <p key={i} className="border-b py-2 text-sm last:border-0"><span className="tabular-nums text-muted-foreground">{tempo(s.t)}</span> · {s.som} · {s.gatilho}</p>)}
            </div>
          </TabsContent>
          <TabsContent value="regras">
            <p className="mb-2 text-sm text-muted-foreground">O que esta referência ensina ao estilo. Cada item vira uma sugestão em Aprendizado.</p>
            <ul className="space-y-1.5">{a.regras.map((r) => <li key={r} className="rounded-lg bg-accent px-3 py-2 text-sm">{r}</li>)}</ul>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
