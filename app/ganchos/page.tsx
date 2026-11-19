"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, BookMarked, Brain, Check, Clapperboard, Copy, Flame, Link2, Loader2, Minus, Plus, Search, Sparkles, Star, Trash2, Users, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTextos } from "@/lib/textos-store";
import { useProdutos } from "@/lib/produtos-store";
import { ORIGENS, TIPOS, analisarEstrutura, gerarComReferencias, referenciasPara, type OrigemTexto, type TipoTexto } from "@/lib/textos";
import { TIPO_GANCHO, fmtNum, perfilDaUrl, rankear, separarLegenda, type ItemRanking, type RefTikTok } from "@/lib/tendencias";
import { cn } from "@/lib/utils";

const ORDEM: TipoTexto[] = ["gancho", "legenda", "descricao", "hashtags", "cta"];
type Aba = "biblioteca" | "aprender";
const ABAS: { id: Aba; titulo: string; dica: string; icon: React.ElementType }[] = [
  { id: "biblioteca", titulo: "Minha biblioteca", dica: "O que a IA usa como exemplo", icon: BookMarked },
  { id: "aprender", titulo: "Aprender com vídeos", dica: "Links de páginas do TikTok", icon: Clapperboard },
];

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{children}</button>;
}

function Tendencia({ i }: { i: ItemRanking }) {
  if (i.status === "novo") return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Novo</span>;
  const Icon = i.status === "subindo" ? ArrowUpRight : i.status === "caindo" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
      i.status === "subindo" ? "bg-success/15 text-success" : i.status === "caindo" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
      <Icon className="size-3" /> {i.status === "estavel" ? "Estável" : `${i.variacao! > 0 ? "+" : ""}${i.variacao}%`}
    </span>
  );
}


function AdicionarDialog({ open, onOpenChange, tipoInicial, produtoInicial }: { open: boolean; onOpenChange: (o: boolean) => void; tipoInicial: TipoTexto; produtoInicial: string | null }) {
  const { adicionarTextos } = useTextos();
  const { produtos } = useProdutos();
  const [tipo, setTipo] = React.useState<TipoTexto>(tipoInicial);
  const [produtoId, setProdutoId] = React.useState<string | null>(produtoInicial);
  const [origem, setOrigem] = React.useState<OrigemTexto>("minha");
  const [autor, setAutor] = React.useState("");
  const [texto, setTexto] = React.useState("");
  React.useEffect(() => { if (open) { setTipo(tipoInicial); setProdutoId(produtoInicial); setTexto(""); } }, [open, tipoInicial, produtoInicial]);
  const lista = (tipo === "descricao" || tipo === "legenda" ? texto.split(/\n\s*\n/) : texto.split("\n")).map((x) => x.trim()).filter(Boolean);
  const salvar = () => {
    const n = adicionarTextos(tipo, lista, produtoId, origem, origem === "outro" ? autor : undefined);
    toast.success(`${n} ${n === 1 ? TIPOS[tipo].label.toLowerCase() : TIPOS[tipo].plural.toLowerCase()} adicionad${n === 1 ? "o" : "os"}`, { description: "As próximas legendas já usam isso como referência." });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar à biblioteca</DialogTitle>
          <DialogDescription>Cole vários de uma vez. A IA aprende como foram escritos (tamanho, emojis, perguntas, como começam) para escrever igual.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>1. O que você vai colar?</Label>
          <div className="flex flex-wrap gap-1.5">{ORDEM.map((x) => <Chip key={x} ativo={tipo === x} onClick={() => setTipo(x)}>{TIPOS[x].plural}</Chip>)}</div>
          <p className="text-xs text-muted-foreground">{TIPOS[tipo].dica}</p>
        </div>
        <div className="grid gap-2">
          <Label>2. Para qual produto?</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip ativo={produtoId === null} onClick={() => setProdutoId(null)}>Qualquer produto</Chip>
            {produtos.map((p) => <Chip key={p.id} ativo={produtoId === p.id} onClick={() => setProdutoId(p.id)}>{p.nome}</Chip>)}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tx">3. Cole aqui</Label>
          <Textarea id="tx" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={TIPOS[tipo].placeholder} />
          <p className="text-xs text-muted-foreground">{tipo === "descricao" || tipo === "legenda" ? "Separe um texto do outro com uma linha em branco." : "Um por linha."} {lista.length > 0 && <b className="text-foreground">{lista.length} para adicionar.</b>}</p>
        </div>
        <div className="grid gap-2">
          <Label>4. De onde veio?</Label>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(ORIGENS) as OrigemTexto[]).map((o) => <Chip key={o} ativo={origem === o} onClick={() => setOrigem(o)}>{ORIGENS[o]}</Chip>)}</div>
          {origem === "outro" && <Input placeholder="Nome ou @ do criador (opcional)" value={autor} onChange={(e) => setAutor(e.target.value)} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="brand" disabled={lista.length === 0} onClick={salvar}><Plus /> Adicionar {lista.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- aba 1: biblioteca ---------------- */
function AbaBiblioteca({ onAdicionar, tipo, setTipo, produtoId, setProdutoId }: { onAdicionar: () => void; tipo: TipoTexto; setTipo: (t: TipoTexto) => void; produtoId: string | null | "todos"; setProdutoId: (p: string | null | "todos") => void }) {
  const { textos, editarTexto, removerTexto } = useTextos();
  const { produtos } = useProdutos();
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<"melhores" | "recentes">("melhores");
  const [teste, setTeste] = React.useState({ produtoId: produtos[0]?.id ?? "", headline: "Cuidado com camisa falsa" });
  const [gerado, setGerado] = React.useState<ReturnType<typeof gerarComReferencias> | null>(null);

  const nomeProduto = (id: string | null) => (id ? produtos.find((p) => p.id === id)?.nome ?? "Produto removido" : "Qualquer produto");
  const desempenho = React.useMemo(() => new Map(rankear(textos.filter((x) => x.tipo === "gancho"), "30d").map((r) => [r.id, r])), [textos]);
  const lista = textos
    .filter((x) => x.tipo === tipo && (produtoId === "todos" || x.produtoId === produtoId) && (!busca || x.texto.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => ordem === "recentes" ? b.criadoEm.localeCompare(a.criadoEm) : (Number(b.destaque) - Number(a.destaque)) || ((desempenho.get(b.id)?.media ?? 0) - (desempenho.get(a.id)?.media ?? 0)));
  const usados = produtoId === "todos" ? lista : referenciasPara(textos, tipo, produtoId, 50);
  const est = analisarEstrutura(usados);
  const prodTeste = produtos.find((p) => p.id === teste.produtoId);

  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
        {ORDEM.map((x) => (
          <button key={x} onClick={() => setTipo(x)} className={cn("flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all", tipo === x ? "border-primary/40 bg-accent text-accent-foreground shadow-xs" : "bg-card hover:bg-accent/60")}>
            {TIPOS[x].plural} <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{textos.filter((y) => y.tipo === x).length}</span>
          </button>
        ))}
      </div>
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip ativo={produtoId === "todos"} onClick={() => setProdutoId("todos")}>Todos os produtos</Chip>
        <Chip ativo={produtoId === null} onClick={() => setProdutoId(null)}>Qualquer produto</Chip>
        {produtos.map((p) => <Chip key={p.id} ativo={produtoId === p.id} onClick={() => setProdutoId(p.id)}>{p.nome}</Chip>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder={`Buscar em ${TIPOS[tipo].plural.toLowerCase()}`} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              <Chip ativo={ordem === "melhores"} onClick={() => setOrdem("melhores")}>Melhores primeiro</Chip>
              <Chip ativo={ordem === "recentes"} onClick={() => setOrdem("recentes")}>Mais recentes</Chip>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{TIPOS[tipo].dica} Toque na ★ nos que deram mais resultado: eles pesam mais na hora de gerar.</p>
          {lista.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {busca ? "Nada encontrado com essa busca." : `Nenhum ${TIPOS[tipo].label.toLowerCase()} aqui ainda.`}
              <div><Button variant="outline" size="sm" className="mt-3" onClick={onAdicionar}><Plus /> Adicionar {TIPOS[tipo].plural.toLowerCase()}</Button></div>
            </Card>
          )}
          {lista.map((x) => {
            const d = desempenho.get(x.id);
            return (
              <Card key={x.id} className="flex items-start gap-2 p-3 sm:p-4">
                <button onClick={() => editarTexto(x.id, { destaque: !x.destaque })} aria-label={x.destaque ? "Tirar destaque" : "Destacar"} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-accent sm:size-8">
                  <Star className={cn("size-4", x.destaque ? "fill-warning text-warning" : "text-muted-foreground")} />
                </button>
                <div className="min-w-0 flex-1 pt-1.5 sm:pt-1">
                  <p className="whitespace-pre-line break-words text-sm">{x.texto}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{nomeProduto(x.produtoId)}</span>
                    <span>{ORIGENS[x.origem]}{x.autor ? ` · ${x.autor}` : ""}</span>
                    {d && <><Tendencia i={d} /><span className="tabular-nums">{d.usos} vídeos · {fmtNum(d.media)} views em média (30 dias)</span></>}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Copiar" onClick={() => { navigator.clipboard?.writeText(x.texto); toast.success("Copiado"); }}><Copy /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => removerTexto(x.id)}><Trash2 /></Button>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Brain className="size-4 text-primary" /> O que a IA aprendeu</CardTitle>
              <CardDescription>{TIPOS[tipo].plural} · {produtoId === "todos" ? "todos os produtos" : nomeProduto(produtoId)} · {est.n} exemplos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {est.n === 0 ? <p className="text-muted-foreground">Adicione exemplos para a IA aprender o seu jeito.</p> : <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Palavras", est.palavras], ["Com emoji", `${est.comEmoji}%`], ["Com pergunta", `${est.comPergunta}%`]].map(([k, v]) => (
                    <div key={k} className="rounded-lg border p-2"><p className="font-semibold tabular-nums">{v}</p><p className="text-[11px] text-muted-foreground">{k}</p></div>
                  ))}
                </div>
                {est.emojis.length > 0 && <p><span className="text-muted-foreground">Emojis que você usa:</span> {est.emojis.join(" ")}</p>}
                {est.aberturas.length > 0 && tipo !== "hashtags" && <p><span className="text-muted-foreground">Costuma começar com:</span> {est.aberturas.map((a) => `“${a}…”`).join(", ")}</p>}
                {est.comCaixaAlta > 0 && tipo !== "hashtags" && <p><span className="text-muted-foreground">Palavra em CAIXA ALTA:</span> {est.comCaixaAlta}% dos textos</p>}
                {tipo === "hashtags" && <p><span className="text-muted-foreground">Média por post:</span> {est.hashtagsPorPost} · {est.hashtagsTop.slice(0, 6).join(" ")}</p>}
              </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="size-4 text-primary" /> Testar geração</CardTitle>
              <CardDescription>Veja a legenda que sai com as suas referências, antes de usar num vídeo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">{produtos.map((p) => <Chip key={p.id} ativo={teste.produtoId === p.id} onClick={() => setTeste({ ...teste, produtoId: p.id })}>{p.nome}</Chip>)}</div>
              <div className="grid gap-1.5"><Label htmlFor="hl">Gancho do vídeo</Label><Input id="hl" value={teste.headline} onChange={(e) => setTeste({ ...teste, headline: e.target.value })} /></div>
              <Button className="w-full" variant="outline" disabled={!prodTeste} onClick={() => prodTeste && setGerado(gerarComReferencias({ produto: prodTeste.nome, headline: teste.headline }, textos, prodTeste.id))}><Sparkles /> Gerar</Button>
              {gerado && (
                <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{gerado.legenda}</p>
                  <p className="text-muted-foreground">{gerado.descricao}</p>
                  <p className="break-words text-primary">{gerado.hashtags.join(" ")}</p>
                  <p className="text-[11px] text-muted-foreground">Baseado em {gerado.baseadoEm} referências. No servidor, o Claude escreve com esses exemplos.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}


/* ---------------- aba 3: aprender com vídeos ---------------- */
function AbaAprender() {
  const { textos, adicionarTextos } = useTextos();
  const { produtos } = useProdutos();
  const [links, setLinks] = React.useState("");
  const [produtoId, setProdutoId] = React.useState<string | null>(null);
  const [lendo, setLendo] = React.useState(false);
  const [refs, setRefs] = React.useState<(RefTikTok & { sel: boolean })[]>([]);
  const urls = [...new Set(links.split(/\s+/).map((x) => x.trim()).filter((x) => /tiktok\.com\//i.test(x)))];

  const ler = async () => {
    setLendo(true);
    const out = await Promise.all(urls.map(async (url) => {
      try {
        const r = await fetch(`/api/tiktok?url=${encodeURIComponent(url)}&produtos=${encodeURIComponent(produtos.map((p) => p.nome).join("|"))}`); const d = await r.json();
        if (!r.ok) throw new Error(d.erro ?? "não deu para ler");
        const { legenda, hashtags } = separarLegenda(d.titulo ?? "");
        if (d.sugestao?.produto) { const p = produtos.find((x) => x.nome.toLowerCase() === String(d.sugestao.produto).toLowerCase()); if (p && produtoId === null) setProdutoId(p.id); }
        return { url, autor: d.autor, perfil: d.perfil || perfilDaUrl(url), legenda, hashtags, thumb: d.thumb ?? undefined, sugestao: d.sugestao, sel: true };
      } catch (e) {
        return { url, autor: "", perfil: perfilDaUrl(url), legenda: "", hashtags: [], erro: (e as Error).message, sel: true };
      }
    }));
    setRefs(out); setLendo(false);
  };
  const editar = (i: number, p: Partial<RefTikTok & { sel: boolean }>) => setRefs((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const prontos = refs.filter((r) => r.sel && (r.legenda || r.hashtags.length));
  const salvar = () => {
    let n = 0;
    prontos.forEach((r) => {
      const autor = r.perfil || r.autor || undefined;
      if (r.legenda) n += adicionarTextos("legenda", [r.legenda], produtoId, "outro", autor);
      if (r.hashtags.length) n += adicionarTextos("hashtags", [r.hashtags.join(" ")], produtoId, "outro", autor);
    });
    toast.success(`${prontos.length} vídeo(s) aprendidos`, { description: `${n} referências novas na biblioteca. As próximas legendas seguem esse jeito, sem copiar frases.` });
    setRefs([]); setLinks("");
  };
  const paginas = [...textos.filter((x) => x.origem === "outro" && x.autor).reduce((m, x) => m.set(x.autor!, (m.get(x.autor!) ?? 0) + 1), new Map<string, number>())];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4 text-primary" /> Cole links de vídeos do TikTok</CardTitle>
          <CardDescription>De páginas que escrevem bem. A IA lê a legenda e as hashtags de cada um e aprende o jeito: tamanho, emojis, perguntas, quantas hashtags. Ela nunca copia as frases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="links">1. Links (um por linha)</Label>
            <Textarea id="links" rows={4} value={links} onChange={(e) => setLinks(e.target.value)} placeholder={"https://www.tiktok.com/@pagina/video/123…\nhttps://www.tiktok.com/@outra/video/456…"} />
            <p className="text-xs text-muted-foreground">{urls.length > 0 ? `${urls.length} link(s) do TikTok.` : "No app do TikTok: Compartilhar → Copiar link."}</p>
          </div>
          <div className="grid gap-2">
            <Label>2. Esses vídeos servem de exemplo para qual produto?</Label>
            <div className="flex flex-wrap gap-1.5">
              <Chip ativo={produtoId === null} onClick={() => setProdutoId(null)}>Qualquer produto</Chip>
              {produtos.map((p) => <Chip key={p.id} ativo={produtoId === p.id} onClick={() => setProdutoId(p.id)}>{p.nome}</Chip>)}
            </div>
          </div>
          <Button variant="brand" className="w-full sm:w-auto" disabled={urls.length === 0 || lendo} onClick={ler}>{lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} 3. Ler legendas</Button>

          {refs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Confira antes de salvar</p>
              {refs.map((r, i) => (
                <div key={r.url} className={cn("rounded-xl border p-3", !r.sel && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => editar(i, { sel: !r.sel })} aria-label={r.sel ? "Não usar" : "Usar"} className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border", r.sel && "border-primary bg-primary text-primary-foreground")}>{r.sel && <Check className="size-4" />}</button>
                    {r.thumb && <img src={r.thumb} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />}
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate text-xs text-muted-foreground">{r.perfil || r.autor || r.url}</p>
                      {r.erro && <p className="text-xs text-destructive">Não deu para ler sozinho: {r.erro}. Cole a legenda abaixo.</p>}
                      <Textarea rows={2} value={r.legenda} placeholder="Legenda do vídeo" onChange={(e) => { const s = separarLegenda(e.target.value); editar(i, { legenda: s.legenda, hashtags: s.hashtags.length ? s.hashtags : r.hashtags }); }} />
                      {r.hashtags.length > 0 && <p className="break-words text-xs text-primary">{r.hashtags.join(" ")}</p>}
                      {r.sugestao && <p className="text-xs text-muted-foreground">A IA achou: {[r.sugestao.gancho && `gancho “${r.sugestao.gancho}”`, r.sugestao.tipo && TIPO_GANCHO[r.sugestao.tipo], r.sugestao.produto && `produto: ${r.sugestao.produto}`, r.sugestao.nicho && `nicho: ${r.sugestao.nicho}`].filter(Boolean).join(" · ")}</p>}
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="brand" className="w-full" disabled={prontos.length === 0} onClick={salvar}><Plus /> Salvar {prontos.length} na biblioteca</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Quer que a IA também aprenda o gancho falado e o texto na tela? Envie o vídeo baixado em <Link href="/estilos" className="font-medium text-primary hover:underline">Estilos e Referências</Link>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-primary" /> Páginas que você usa de exemplo</CardTitle>
          <CardDescription>Quanto mais exemplos de uma página, mais a IA escreve parecido com ela.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {paginas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ainda. Cole o primeiro link para começar.</p>
            : paginas.map(([p, n]) => <div key={p} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="truncate">{p}</span><span className="text-xs tabular-nums text-muted-foreground">{n} exemplos</span></div>)}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Ganchos() {
  const [aba, setAbaEstado] = React.useState<Aba>("biblioteca");
  const [tipo, setTipo] = React.useState<TipoTexto>("gancho");
  const [produtoId, setProdutoId] = React.useState<string | null | "todos">("todos");
  const [add, setAdd] = React.useState(false);
  React.useEffect(() => { const a = new URLSearchParams(location.search).get("aba"); if (a === "alta") { location.replace("/em-alta"); return; } if (a && ABAS.some((x) => x.id === a)) setAbaEstado(a as Aba); }, []);
  const setAba = (a: Aba) => { setAbaEstado(a); history.replaceState(null, "", a === "biblioteca" ? "/ganchos" : `/ganchos?aba=${a}`); };

  return (
    <>
      <PageHeader title="Ganchos e Legendas" description="Tudo o que a IA usa para escrever os textos dos seus vídeos: seus exemplos e o que ela aprende com outras páginas."
        actions={<Button variant="brand" onClick={() => setAdd(true)}><Plus /> Adicionar</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border bg-muted/40 p-1.5" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center transition-all sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left", aba === a.id ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/60")}>
            <a.icon className={cn("size-5 shrink-0", aba === a.id && "text-primary")} />
            <span className="min-w-0"><span className="block text-xs font-semibold leading-tight sm:text-sm">{a.titulo}</span><span className="hidden text-xs text-muted-foreground sm:block">{a.dica}</span></span>
          </button>
        ))}
      </div>
      <Link href="/em-alta" className="mb-5 flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm transition-colors hover:bg-accent">
        <Flame className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1"><span className="block font-semibold">Quer ver o que está viralizando agora?</span><span className="block text-xs text-muted-foreground">Ganchos, CTAs e hashtags do TikTok Brasil estão em Em alta.</span></span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      {aba === "biblioteca" && <AbaBiblioteca onAdicionar={() => setAdd(true)} tipo={tipo} setTipo={setTipo} produtoId={produtoId} setProdutoId={setProdutoId} />}
      {aba === "aprender" && <AbaAprender />}

      <AdicionarDialog open={add} onOpenChange={setAdd} tipoInicial={tipo} produtoInicial={produtoId === "todos" ? null : produtoId} />
    </>
  );
}
