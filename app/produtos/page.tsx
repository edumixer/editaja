"use client";
import * as React from "react";
import { toast } from "sonner";
import { CloudUpload, FolderOpen, ImageIcon, Info, Package, Pencil, Plus, Trash2, Hand, Tags, X, MessageSquareQuote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProdutos } from "@/lib/produtos-store";
import { ROTULOS, ROTULOS_FIXOS, LUGARES, TAMANHOS, ehFixo, nomeRotulo, dicaCategoria, type Categoria, type Produto, type Rotulo, type RotuloFixo } from "@/lib/produtos";
import { cn } from "@/lib/utils";

const COR_ROTULO: Record<RotuloFixo, string> = {
  produto: "bg-primary text-primary-foreground", original: "bg-success text-white", falso: "bg-destructive text-white",
  detalhe: "bg-secondary text-secondary-foreground", print: "bg-warning text-black",
};

/** Cor da etiqueta: classe fixa para as da plataforma, cor própria para cada categoria criada. */
function corEtiqueta(r: Rotulo, categorias: Categoria[]): { className: string; style?: React.CSSProperties } {
  if (ehFixo(r)) return { className: COR_ROTULO[r] };
  const c = categorias.find((x) => x.id === r);
  return { className: "text-white", style: { backgroundColor: `oklch(0.55 0.17 ${c?.hue ?? 285})` } };
}

function Etiqueta({ r, categorias, className, children }: { r: Rotulo; categorias: Categoria[]; className?: string; children?: React.ReactNode }) {
  const cor = corEtiqueta(r, categorias);
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", cor.className, className)} style={cor.style}>{children ?? nomeRotulo(r, categorias)}</span>;
}

/* ---------- categoria personalizada: nome, frases faladas, lugar e tamanho ---------- */
const DURACOES = [1.5, 2, 3, 4];
const RESERVAS: { v: Categoria["reserva"]; label: string }[] = [
  { v: "produto", label: "Usar a imagem de Produto" }, { v: "original", label: "Usar a imagem de Original" },
  { v: "detalhe", label: "Usar a imagem de Detalhe" }, { v: "print", label: "Usar a imagem de Print" }, { v: null, label: "Não mostrar nada" },
];

function Opcoes<T extends string | number>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: { v: T; label: string }[]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={valor === o.v} onClick={() => onChange(o.v)}
          className={cn("min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors", valor === o.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{o.label}</button>
      ))}
    </div>
  );
}

/** Mini tela 9:16 mostrando onde a imagem da categoria entra (inclinada, sem animação). */
function PreviaLugar({ lugar, tamanho, hue }: { lugar: Categoria["lugar"]; tamanho: Categoria["tamanho"]; hue: number }) {
  const larg = { pequena: 0.32, media: 0.42, grande: 0.6 }[tamanho];
  const x = lugar === "centro" ? (1 - larg) / 2 : lugar === "esquerda" ? 0.05 : 0.53;
  const y = lugar === "centro" ? 0.26 : 0.12;
  const ang = lugar === "centro" ? -4 : lugar === "esquerda" ? -6 : 6;
  return (
    <div className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-lg border bg-gradient-to-b from-muted to-muted/40" aria-hidden>
      <div className="absolute inset-x-[30%] bottom-0 top-[45%] rounded-t-full bg-foreground/10" />
      <div className="absolute aspect-square rounded-[3px] border-2 border-white shadow-md"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${larg * 100}%`, transform: `rotate(${ang}deg)`, backgroundColor: `oklch(0.6 0.16 ${hue})` }} />
    </div>
  );
}

function CategoriaDialog({ open, onOpenChange, categoria, onSalva }: { open: boolean; onOpenChange: (o: boolean) => void; categoria?: Categoria; onSalva?: (id: string) => void }) {
  const { salvarCategoria, categorias } = useProdutos();
  const [nome, setNome] = React.useState("");
  const [gatilhos, setGatilhos] = React.useState<string[]>([]);
  const [frase, setFrase] = React.useState("");
  const [lugar, setLugar] = React.useState<Categoria["lugar"]>("direita");
  const [tamanho, setTamanho] = React.useState<Categoria["tamanho"]>("media");
  const [duracao, setDuracao] = React.useState(2);
  const [reserva, setReserva] = React.useState<Categoria["reserva"]>("produto");
  React.useEffect(() => {
    if (!open) return;
    setNome(categoria?.nome ?? ""); setGatilhos(categoria?.gatilhos ?? []); setFrase("");
    setLugar(categoria?.lugar ?? "direita"); setTamanho(categoria?.tamanho ?? "media"); setDuracao(categoria?.duracao ?? 2);
    setReserva(categoria ? categoria.reserva : "produto");
  }, [open, categoria]);
  const nomeRepetido = categorias.some((c) => c.id !== categoria?.id && c.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    || ROTULOS_FIXOS.some((r) => ROTULOS[r].label.toLowerCase() === nome.trim().toLowerCase());
  const addFrase = () => {
    const novas = frase.split(/[,;\n]/).map((x) => x.trim().replace(/[.!?]+$/, "")).filter(Boolean);
    if (novas.length) setGatilhos((g) => [...new Set([...g, ...novas])]);
    setFrase("");
  };
  const todas = [...gatilhos, ...frase.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)];
  const pode = !!nome.trim() && !nomeRepetido && todas.length > 0;
  const salvar = () => {
    const id = salvarCategoria({ id: categoria?.id, nome, gatilhos: [...new Set(todas)], lugar, tamanho, duracao, reserva });
    toast.success(categoria ? "Categoria atualizada" : `Categoria “${nome.trim()}” criada`, { description: categoria ? undefined : "Agora marque as imagens do produto com ela." });
    onSalva?.(id); onOpenChange(false);
  };
  const hue = categoria?.hue ?? 285;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{categoria ? "Editar categoria" : "Nova categoria de imagem"}</DialogTitle>
          <DialogDescription>Crie uma etiqueta sua. Quando você falar uma das frases no vídeo, o editor coloca a imagem do produto marcada com ela.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="cn">Nome da categoria</Label>
          <Input id="cn" placeholder="Ex.: Oficial" maxLength={40} value={nome} onChange={(e) => setNome(e.target.value)} />
          {nomeRepetido && <p className="text-xs text-destructive">Já existe uma etiqueta com esse nome.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cf">Quando aparece (o que você fala no vídeo)</Label>
          <div className="flex gap-2">
            <Input id="cf" placeholder="Ex.: loja oficial do TikTok" value={frase} onChange={(e) => setFrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addFrase(); } }} />
            <Button type="button" variant="outline" onClick={addFrase} disabled={!frase.trim()}><Plus /> Adicionar</Button>
          </div>
          {gatilhos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {gatilhos.map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary">
                  {g}
                  <button type="button" aria-label={`Tirar “${g}”`} onClick={() => setGatilhos((x) => x.filter((y) => y !== g))} className="grid size-5 place-items-center rounded-full hover:bg-primary/20"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Uma palavra ou uma frase por vez. Não importa acento nem maiúscula. Frase mais longa vence: “compre na loja oficial” chama esta categoria, e não o Print do “loja”.</p>
        </div>
        <div className="flex gap-4">
          <div className="grid flex-1 content-start gap-3">
            <div className="grid gap-1.5"><Label>Onde aparece</Label>
              <Opcoes rotulo="Onde aparece" valor={lugar} onChange={setLugar} opcoes={(Object.keys(LUGARES) as Categoria["lugar"][]).map((v) => ({ v, label: LUGARES[v] }))} /></div>
            <div className="grid gap-1.5"><Label>Tamanho</Label>
              <Opcoes rotulo="Tamanho" valor={tamanho} onChange={setTamanho} opcoes={(Object.keys(TAMANHOS) as Categoria["tamanho"][]).map((v) => ({ v, label: TAMANHOS[v] }))} /></div>
          </div>
          <PreviaLugar lugar={lugar} tamanho={tamanho} hue={hue} />
        </div>
        <div className="grid gap-1.5"><Label>Tempo na tela</Label>
          <Opcoes rotulo="Tempo na tela" valor={duracao} onChange={setDuracao} opcoes={DURACOES.map((v) => ({ v, label: `${String(v).replace(".", ",")} s` }))} /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr">Se o produto não tiver imagem desta categoria</Label>
          <select id="cr" value={reserva ?? ""} onChange={(e) => setReserva((e.target.value || null) as Categoria["reserva"])}
            className="h-10 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm">
            {RESERVAS.map((o) => <option key={o.label} value={o.v ?? ""}>{o.label}</option>)}
          </select>
        </div>
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> Como todas as imagens: entra levemente inclinada, sem animação, com o som Bubble pop. Você ajusta lugar e tempo de cada vídeo na Aprovação.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!pode} onClick={salvar}>{categoria ? "Salvar" : "Criar categoria"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirCategoria({ categoria, onOpenChange }: { categoria?: Categoria; onOpenChange: (o: boolean) => void }) {
  const { removerCategoria, produtos } = useProdutos();
  const n = categoria ? produtos.reduce((a, p) => a + p.imagens.filter((i) => i.rotulo === categoria.id).length, 0) : 0;
  return (
    <Dialog open={!!categoria} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir a categoria “{categoria?.nome}”?</DialogTitle>
          <DialogDescription>{n ? `${n} ${n === 1 ? "imagem marcada" : "imagens marcadas"} com ela ${n === 1 ? "volta" : "voltam"} para “Produto”. Nenhuma imagem é apagada.` : "Nenhuma imagem está marcada com ela."} Vídeos já editados não mudam.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { if (categoria) { removerCategoria(categoria.id); toast("Categoria excluída"); } onOpenChange(false); }}>Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Capa({ p, className }: { p: Produto; className?: string }) {
  const ims = p.imagens.slice(0, 3);
  return (
    <div className={cn("relative grid place-items-center overflow-hidden rounded-xl", className)}
      style={{ backgroundImage: `linear-gradient(150deg, oklch(0.62 0.15 ${p.hue}), oklch(0.32 0.08 ${p.hue}))` }}>
      {ims.length === 0 ? <Package className="size-7 text-white/70" /> : ims.map((im, i) => (
        <div key={im.id} className="absolute w-[46%] rounded-md bg-white p-1 shadow-lg"
          style={{ transform: `translateX(${(i - (ims.length - 1) / 2) * 34}%) rotate(${[-7, 3, 8][i]}deg)` }}>
          {im.url ? <img src={im.url} alt="" className="aspect-square w-full rounded-sm object-cover" />
            : <div className="aspect-square rounded-sm" style={{ backgroundImage: `linear-gradient(135deg, oklch(0.8 0.1 ${im.hue}), oklch(0.55 0.15 ${im.hue}))` }} />}
        </div>
      ))}
    </div>
  );
}

function ProdutoDialog({ open, onOpenChange, produto, onCriado }: { open: boolean; onOpenChange: (o: boolean) => void; produto?: Produto; onCriado?: (id: string) => void }) {
  const { criarProduto, editarProduto } = useProdutos();
  const [nome, setNome] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [palavras, setPalavras] = React.useState("");
  React.useEffect(() => {
    if (open) { setNome(produto?.nome ?? ""); setDescricao(produto?.descricao ?? ""); setPalavras(produto?.palavras.join(", ") ?? ""); }
  }, [open, produto]);
  const salvar = () => {
    const pal = palavras.split(",").map((x) => x.trim()).filter(Boolean);
    if (produto) { editarProduto(produto.id, { nome, descricao, palavras: pal }); toast.success("Produto atualizado"); }
    else { const id = criarProduto(nome, descricao, pal); onCriado?.(id); toast.success("Produto criado", { description: "Agora envie as imagens de referência dele." }); }
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{produto ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Cada produto tem a própria pasta de imagens. Na edição, o vídeo só usa as imagens do produto vinculado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2"><Label htmlFor="pn">Nome</Label><Input id="pn" placeholder="Ex.: Camisas do Grêmio" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="pd">Descrição (opcional)</Label><Textarea id="pd" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div className="grid gap-2">
          <Label htmlFor="pp">Como o produto é falado no vídeo</Label>
          <Input id="pp" placeholder="camisa, grêmio, manto" value={palavras} onChange={(e) => setPalavras(e.target.value)} />
          <p className="text-xs text-muted-foreground">Separe por vírgula. Ajuda o editor a achar o momento certo de mostrar a imagem.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!nome.trim()} onClick={salvar}>{produto ? "Salvar" : "Criar produto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Produtos() {
  const { produtos, categorias, adicionarImagens, rotularImagem, removerImagem, removerProduto } = useProdutos();
  const [catDialog, setCatDialog] = React.useState<{ open: boolean; categoria?: Categoria; marcar?: string }>({ open: false });
  const [excluirCat, setExcluirCat] = React.useState<Categoria | undefined>();
  const etiquetas: Rotulo[] = [...ROTULOS_FIXOS, ...categorias.map((c) => c.id)];
  React.useEffect(() => { if (!etiquetas.includes(rotuloEnvio)) setRotuloEnvio("produto"); }, [categorias]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = React.useState<string>(produtos[0]?.id ?? "");
  const [novo, setNovo] = React.useState(false);
  const [editar, setEditar] = React.useState(false);
  const [rotuloEnvio, setRotuloEnvio] = React.useState<Rotulo>("produto");
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const p = produtos.find((x) => x.id === sel) ?? produtos[0];

  const enviar = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image"));
    if (!p || imgs.length === 0) return;
    adicionarImagens(p.id, imgs, rotuloEnvio);
    toast.success(`${imgs.length} imagem(ns) em ${p.nome}`, { description: `Marcadas como “${nomeRotulo(rotuloEnvio, categorias)}”.` });
  };

  return (
    <>
      <PageHeader title="Produtos" description="Cada produto tem sua pasta de imagens de referência. Quando a pessoa aponta ou fala do produto, o editor usa só essas imagens."
        actions={<Button variant="brand" onClick={() => setNovo(true)}><Plus /> Novo produto</Button>} />

      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
        {produtos.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cn("w-40 shrink-0 rounded-2xl border bg-card p-2 text-left transition-all sm:w-auto", p?.id === x.id ? "border-primary/50 shadow-lg shadow-primary/10 ring-1 ring-primary/30" : "hover:border-primary/30")}>
            <Capa p={x} className="aspect-[4/3]" />
            <p className="mt-2 truncate px-1 text-sm font-semibold">{x.nome}</p>
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">{x.imagens.length} {x.imagens.length === 1 ? "imagem" : "imagens"}</p>
          </button>
        ))}
        <button onClick={() => setNovo(true)} className="flex w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground sm:w-auto"><Plus className="size-5" /> Novo produto</button>
      </div>

      {p && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">{p.nome} <Badge variant="secondary">{p.imagens.length}</Badge></CardTitle>
                <CardDescription className="mt-1">{p.descricao}</CardDescription>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><FolderOpen className="size-3" /> {p.pasta === "enviado" ? "Criado na plataforma" : `Conteúdo inicial · ${p.pasta}`}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="Editar produto" onClick={() => setEditar(true)}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Excluir produto" onClick={() => { removerProduto(p.id); setSel(produtos.find((x) => x.id !== p.id)?.id ?? ""); toast("Produto excluído"); }}><Trash2 /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); enviar(Array.from(e.dataTransfer.files)); }}
                className={cn("rounded-xl border-2 border-dashed p-4 transition-colors", drag && "border-primary bg-accent")}>
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <div className="brand-gradient grid size-10 shrink-0 place-items-center rounded-xl text-white"><CloudUpload className="size-5" /></div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-sm font-medium">Enviar imagens de {p.nome}</p>
                    <p className="text-xs text-muted-foreground">PNG ou JPG, de preferência com fundo limpo. Arraste aqui ou toque em Escolher.</p>
                  </div>
                  <Button variant="outline" onClick={() => inputRef.current?.click()}><ImageIcon /> Escolher</Button>
                  <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { enviar(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  <span className="text-xs text-muted-foreground">Marcar como:</span>
                  {etiquetas.map((r) => (
                    <button key={r} onClick={() => setRotuloEnvio(r)} className={cn("min-h-8 rounded-full border px-2.5 py-1 text-[11px] font-medium", rotuloEnvio === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{nomeRotulo(r, categorias)}</button>
                  ))}
                  <button onClick={() => setCatDialog({ open: true })} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-accent"><Plus className="size-3" /> Nova categoria</button>
                </div>
              </div>

              {p.imagens.length === 0 ? (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma imagem ainda. Sem imagens, o editor não coloca sobreposição neste produto.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {p.imagens.map((im) => (
                    <div key={im.id} className="group overflow-hidden rounded-xl border bg-card">
                      <div className="relative grid aspect-square place-items-center bg-muted">
                        {im.url ? <img src={im.url} alt={im.nome} className="size-full object-contain p-2" />
                          : <div className="grid size-[70%] -rotate-3 place-items-center rounded-lg shadow-md" style={{ backgroundImage: `linear-gradient(135deg, oklch(0.8 0.1 ${im.hue}), oklch(0.5 0.15 ${im.hue}))` }}><ImageIcon className="size-6 text-white/80" /></div>}
                        <DropdownMenu>
                          <DropdownMenuTrigger className={cn("absolute left-2 top-2 max-w-[calc(100%-3.5rem)] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold shadow", corEtiqueta(im.rotulo, categorias).className)} style={corEtiqueta(im.rotulo, categorias).style}>{nomeRotulo(im.rotulo, categorias)} ▾</DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-[70dvh] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
                            <DropdownMenuLabel>Quando usar esta imagem</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {ROTULOS_FIXOS.map((r) => (
                              <DropdownMenuItem key={r} onSelect={() => rotularImagem(p.id, im.id, r)}>
                                <div><p className="font-medium">{ROTULOS[r].label}</p><p className="text-[11px] text-muted-foreground">{ROTULOS[r].dica}</p></div>
                              </DropdownMenuItem>
                            ))}
                            {categorias.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-[11px] text-muted-foreground">Suas categorias</DropdownMenuLabel></>}
                            {categorias.map((c) => (
                              <DropdownMenuItem key={c.id} onSelect={() => rotularImagem(p.id, im.id, c.id)}>
                                <div className="min-w-0"><p className="font-medium">{c.nome}</p><p className="line-clamp-2 text-[11px] text-muted-foreground">{dicaCategoria(c)}</p></div>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setCatDialog({ open: true, marcar: im.id })}><Plus className="size-4" /> Criar categoria…</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button onClick={() => removerImagem(p.id, im.id)} aria-label="Remover imagem" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/40 text-white opacity-100 backdrop-blur sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-medium" title={im.nome}>{im.nome}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{im.tamanho} · {im.origem}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Hand className="size-4 text-primary" /> Como o editor usa</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Quando a pessoa aponta para o lado e fala, a imagem entra levemente inclinada, sem animação, do lado que ela aponta, com o som Bubble pop.</p>
                <ul className="space-y-2">
                  {ROTULOS_FIXOS.map((r) => (
                    <li key={r} className="flex items-start gap-2"><Etiqueta r={r} categorias={categorias} className="mt-0.5" /><span className="text-xs text-muted-foreground">{ROTULOS[r].dica}</span></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base"><Tags className="size-4 text-primary" /> Suas categorias</CardTitle>
                  <CardDescription className="mt-1">Etiquetas suas, com as frases que chamam a imagem. Valem para todos os produtos.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCatDialog({ open: true })}><Plus /> Nova</Button>
              </CardHeader>
              <CardContent>
                {categorias.length === 0 ? (
                  <button onClick={() => setCatDialog({ open: true })} className="w-full rounded-xl border border-dashed p-4 text-left text-xs text-muted-foreground hover:border-primary/50">
                    <p className="font-medium text-foreground">Ex.: “Oficial”</p>
                    <p className="mt-1">Sempre que você falar “compre aqui na loja oficial do TikTok”, entra a imagem do produto que você marcar como Oficial.</p>
                  </button>
                ) : (
                  <ul className="space-y-3">
                    {categorias.map((c) => {
                      const n = p.imagens.filter((i) => i.rotulo === c.id).length;
                      return (
                        <li key={c.id} className="rounded-xl border p-3">
                          <div className="flex items-center gap-2">
                            <Etiqueta r={c.id} categorias={categorias} className="max-w-[60%] truncate" />
                            <span className="flex-1 truncate text-[11px] text-muted-foreground">{LUGARES[c.lugar]} · {TAMANHOS[c.tamanho]} · {String(c.duracao).replace(".", ",")} s</span>
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${c.nome}`} onClick={() => setCatDialog({ open: true, categoria: c })}><Pencil /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${c.nome}`} onClick={() => setExcluirCat(c)}><Trash2 /></Button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.gatilhos.map((g) => <span key={g} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"><MessageSquareQuote className="size-3 text-muted-foreground" />{g}</span>)}
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {n ? `${n} ${n === 1 ? "imagem" : "imagens"} de ${p.nome}` : c.reserva ? `${p.nome} não tem imagem marcada: usa a de ${ROTULOS[c.reserva].label}` : `${p.nome} não tem imagem marcada: não aparece nada`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Palavras do produto</CardTitle><CardDescription>O editor procura estas palavras na fala.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {p.palavras.length ? p.palavras.map((w) => <span key={w} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{w}</span>) : <span className="text-xs text-muted-foreground">Nenhuma. Toque no lápis para adicionar.</span>}
              </CardContent>
            </Card>
            <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" /> Ao enviar um vídeo, escolha o produto. O editor só usa as imagens dele, nunca de outro produto.</p>
          </div>
        </div>
      )}

      <ProdutoDialog open={novo} onOpenChange={setNovo} onCriado={setSel} />
      <ProdutoDialog open={editar} onOpenChange={setEditar} produto={p} />
      <CategoriaDialog open={catDialog.open} categoria={catDialog.categoria}
        onOpenChange={(o) => setCatDialog((d) => ({ ...d, open: o }))}
        onSalva={(id) => {
          if (catDialog.categoria) return;
          if (catDialog.marcar && p) rotularImagem(p.id, catDialog.marcar, id);
          else setRotuloEnvio(id);   // as próximas imagens enviadas já saem marcadas com a categoria nova
        }} />
      <ExcluirCategoria categoria={excluirCat} onOpenChange={(o) => { if (!o) setExcluirCat(undefined); }} />
    </>
  );
}
