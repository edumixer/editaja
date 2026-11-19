"use client";
import * as React from "react";
import { toast } from "sonner";
import { CloudUpload, FolderOpen, ImageIcon, Info, Package, Pencil, Plus, Trash2, Hand } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProdutos } from "@/lib/produtos-store";
import { ROTULOS, type Produto, type Rotulo } from "@/lib/produtos";
import { cn } from "@/lib/utils";

const COR_ROTULO: Record<Rotulo, string> = {
  produto: "bg-primary text-primary-foreground", original: "bg-success text-white", falso: "bg-destructive text-white",
  detalhe: "bg-secondary text-secondary-foreground", print: "bg-warning text-black",
};

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
  const { produtos, adicionarImagens, rotularImagem, removerImagem, removerProduto } = useProdutos();
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
    toast.success(`${imgs.length} imagem(ns) em ${p.nome}`, { description: `Marcadas como “${ROTULOS[rotuloEnvio].label}”.` });
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
                  {(Object.keys(ROTULOS) as Rotulo[]).map((r) => (
                    <button key={r} onClick={() => setRotuloEnvio(r)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", rotuloEnvio === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{ROTULOS[r].label}</button>
                  ))}
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
                          <DropdownMenuTrigger className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow", COR_ROTULO[im.rotulo])}>{ROTULOS[im.rotulo].label} ▾</DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Quando usar esta imagem</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(Object.keys(ROTULOS) as Rotulo[]).map((r) => (
                              <DropdownMenuItem key={r} onSelect={() => rotularImagem(p.id, im.id, r)}>
                                <div><p className="font-medium">{ROTULOS[r].label}</p><p className="text-[11px] text-muted-foreground">{ROTULOS[r].dica}</p></div>
                              </DropdownMenuItem>
                            ))}
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
                  {(Object.keys(ROTULOS) as Rotulo[]).map((r) => (
                    <li key={r} className="flex items-start gap-2"><span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", COR_ROTULO[r])}>{ROTULOS[r].label}</span><span className="text-xs text-muted-foreground">{ROTULOS[r].dica}</span></li>
                  ))}
                </ul>
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
    </>
  );
}
