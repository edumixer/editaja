"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Anchor, CalendarDays, Check, Copy, Info, Megaphone, Minus, Plus, ScrollText, Sparkles, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useTextos } from "@/lib/textos-store";
import { useProdutos } from "@/lib/produtos-store";
import { combinacoes, corpoDemo, datasSugeridas, referenciasPara, type Roteiro } from "@/lib/textos";
import { cn } from "@/lib/utils";

const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

function Escolha({ titulo, icon: Icon, opcoes, sel, onSel, placeholder }: { titulo: string; icon: React.ElementType; opcoes: string[]; sel: string[]; onSel: (s: string[]) => void; placeholder: string }) {
  const [novo, setNovo] = React.useState("");
  const todas = [...new Set([...opcoes, ...sel])];
  const alternar = (x: string) => onSel(sel.includes(x) ? sel.filter((y) => y !== x) : [...sel, x]);
  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-1.5"><Icon className="size-3.5" /> {titulo} <span className="text-muted-foreground">({sel.length} escolhidos)</span></Label>
      <div className="grid gap-1.5">
        {todas.map((x) => (
          <button key={x} onClick={() => alternar(x)} className={cn("flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors", sel.includes(x) ? "border-primary/50 bg-accent" : "bg-card hover:bg-accent/50")}>
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", sel.includes(x) && "border-primary bg-primary text-primary-foreground")}>{sel.includes(x) && <Check className="size-3.5" />}</span>
            <span className="min-w-0 flex-1 break-words">{x}</span>
          </button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) { onSel([...sel, novo.trim()]); setNovo(""); } }}>
        <Input placeholder={placeholder} value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button type="submit" variant="outline" size="icon" aria-label="Adicionar"><Plus /></Button>
      </form>
    </div>
  );
}

function RoteiroCard({ r }: { r: Roteiro }) {
  const { removerRoteiro } = useTextos();
  const { produtos } = useProdutos();
  const p = produtos.find((x) => x.id === r.produtoId);
  const versoes = combinacoes(r);
  const datas = datasSugeridas(r.inicio, versoes.length);
  const texto = (v: (typeof versoes)[number]) => `GANCHO: ${v.gancho}\n\n${r.corpo}\n\nCTA: ${v.cta}`;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{r.titulo}</CardTitle>
          <CardDescription className="mt-1">{p?.nome ?? "Produto"} · {r.ganchos.length} ganchos × {r.ctas.length} CTAs · {versoes.length} {versoes.length === 1 ? "vídeo" : "vídeos"}</CardDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Excluir roteiro" onClick={() => { removerRoteiro(r.id); toast("Roteiro excluído"); }}><Trash2 /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meio do vídeo (igual em todas)</p>
          <p className="whitespace-pre-line">{r.corpo}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {versoes.map((v, i) => (
            <div key={v.n} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-primary">Vídeo {v.n}</span>
                {datas[i] && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="size-3" /> {dataCurta(datas[i])}</span>}
              </div>
              <p className="mt-1.5"><span className="text-muted-foreground">Gancho:</span> {v.gancho}</p>
              <p className="mt-1"><span className="text-muted-foreground">CTA:</span> {v.cta}</p>
              <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => { navigator.clipboard?.writeText(texto(v)); toast.success(`Roteiro do vídeo ${v.n} copiado`); }}><Copy /> Copiar</Button>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="brand" asChild><Link href="/biblioteca?upload=1"><Upload /> Enviar o bruto gravado</Link></Button>
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(versoes.map((v) => `— Vídeo ${v.n} —\n${texto(v)}`).join("\n\n")); toast.success("Todos os roteiros copiados"); }}><Copy /> Copiar todos</Button>
        </div>
        <p className="text-xs text-muted-foreground">Grave cada gancho e cada CTA uma vez no mesmo bruto. Ao enviar, o editor corta e monta os {versoes.length} vídeos.</p>
      </CardContent>
    </Card>
  );
}

export default function Roteiros() {
  const { textos, roteiros, salvarRoteiro } = useTextos();
  const { produtos } = useProdutos();
  const [produtoId, setProdutoId] = React.useState(produtos[0]?.id ?? "");
  const p = produtos.find((x) => x.id === produtoId);
  const [ganchos, setGanchos] = React.useState<string[]>([]);
  const [ctas, setCtas] = React.useState<string[]>([]);
  const [corpo, setCorpo] = React.useState("");
  const [qtd, setQtd] = React.useState(1);
  const [inicio, setInicio] = React.useState<string>("");
  const max = Math.max(1, ganchos.length * ctas.length);
  React.useEffect(() => { setQtd(max); }, [max]);
  React.useEffect(() => { setGanchos([]); setCtas([]); setCorpo(""); }, [produtoId]);

  const opG = referenciasPara(textos, "gancho", produtoId || null, 12).map((x) => x.texto);
  const opC = referenciasPara(textos, "cta", produtoId || null, 12).map((x) => x.texto);
  const previa = combinacoes({ ganchos, ctas, qtdVideos: qtd });
  const datas = datasSugeridas(inicio || null, previa.length);
  const pronto = p && ganchos.length > 0 && ctas.length > 0 && corpo.trim();

  const salvar = () => {
    if (!p) return;
    salvarRoteiro({ produtoId: p.id, titulo: `${p.nome} · ${ganchos.length}×${ctas.length}`, ganchos, ctas, corpo, qtdVideos: qtd, inicio: inicio || null });
    toast.success(`Roteiro salvo: ${qtd} ${qtd === 1 ? "vídeo" : "vídeos"}`, { description: "Grave o bruto seguindo o roteiro e envie normalmente." });
    setGanchos([]); setCtas([]); setCorpo(""); setInicio("");
  };

  return (
    <>
      <PageHeader title="Roteiros" description="Opcional. Planeje um vídeo por produto, escolha vários ganchos e CTAs e decida quantos vídeos sair de uma gravação só." />

      <p className="mb-5 flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" /> Quem não usa roteiro segue normal: envia o bruto, aprova e publica. O roteiro só ajuda a gravar já pensando nas combinações e a encher o calendário.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScrollText className="size-4 text-primary" /> Novo roteiro</CardTitle>
            <CardDescription>Os ganchos e CTAs vêm de Ganchos e Legendas (do produto primeiro). Você também pode escrever na hora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between"><Label>Produto</Label><Link href="/produtos" className="py-1 text-xs font-medium text-primary hover:underline">Gerenciar</Link></div>
              <div className="flex flex-wrap gap-1.5">
                {produtos.map((x) => <button key={x.id} onClick={() => setProdutoId(x.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", produtoId === x.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{x.nome}</button>)}
              </div>
            </div>
            <Escolha titulo="Ganchos (início)" icon={Anchor} opcoes={opG} sel={ganchos} onSel={setGanchos} placeholder="Escrever outro gancho" />
            <Escolha titulo="CTAs (final)" icon={Megaphone} opcoes={opC} sel={ctas} onSel={setCtas} placeholder="Escrever outro CTA" />
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="corpo">Meio do vídeo</Label>
                <Button variant="ghost" size="sm" disabled={!p} onClick={() => p && setCorpo(corpoDemo(p.nome, p.palavras, p.imagens.some((i) => i.rotulo === "falso")))}><Sparkles /> Sugerir</Button>
              </div>
              <Textarea id="corpo" rows={5} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="O que mostrar e falar entre o gancho e o CTA" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader><CardTitle className="text-base">Quantos vídeos</CardTitle><CardDescription>{ganchos.length} ganchos × {ctas.length} CTAs = até {ganchos.length * ctas.length} combinações</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-2">
                <Button variant="ghost" size="icon" aria-label="Menos" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}><Minus /></Button>
                <p className="text-center"><span className="brand-text text-3xl font-bold tabular-nums">{qtd}</span><span className="block text-xs text-muted-foreground">{qtd === 1 ? "vídeo" : "vídeos"}</span></p>
                <Button variant="ghost" size="icon" aria-label="Mais" disabled={qtd >= max} onClick={() => setQtd(qtd + 1)}><Plus /></Button>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ini" className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> Postar a partir de (opcional)</Label>
                <Input id="ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                <p className="text-xs text-muted-foreground">Uma versão por dia. Cada vídeo aprovado entra no calendário nessa data.</p>
              </div>
              {ganchos.length > 0 && ctas.length > 0 && (
                <ol className="space-y-1.5 text-xs">
                  {previa.map((v, i) => (
                    <li key={v.n} className="rounded-lg bg-muted/60 px-2.5 py-2">
                      <span className="font-semibold text-primary">Vídeo {v.n}{datas[i] ? ` · ${dataCurta(datas[i])}` : ""}</span>
                      <span className="mt-0.5 block text-muted-foreground">{v.gancho} → {v.cta}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Button variant="brand" className="w-full" disabled={!pronto} onClick={salvar}><Check /> Salvar roteiro</Button>
              {!pronto && <p className="text-center text-xs text-muted-foreground">Escolha ao menos 1 gancho, 1 CTA e escreva o meio do vídeo.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Roteiros salvos</h2>
      {roteiros.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum roteiro ainda.</Card>
        : <div className="grid gap-4 xl:grid-cols-2">{roteiros.map((r) => <RoteiroCard key={r.id} r={r} />)}</div>}
    </>
  );
}
