"use client";
import * as React from "react";
import { toast } from "sonner";
import {
  Brain, Check, CloudUpload, Code2, Copy, Film, FolderOpen, History, Image as ImageIcon, Info, Loader2, Lock, Music, Plus, RotateCcw,
  ShieldX, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, User, Users, X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEstilos, rotuloOrigem } from "@/lib/estilos-store";
import type { Origem, Referencia, Regra } from "@/lib/estilos";
import { cn } from "@/lib/utils";
import { AnaliseReferencia } from "@/components/analise-referencia";

const ICONE_ORIGEM: Record<Origem["tipo"], React.ElementType> = { inicial: FolderOpen, voce: User, colaborador: Users, aprendizado: Brain };
const COR_ORIGEM: Record<Origem["tipo"], string> = {
  inicial: "bg-secondary text-secondary-foreground", voce: "bg-primary/12 text-primary",
  colaborador: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_35%)] dark:text-warning", aprendizado: "bg-success/12 text-success",
};

function OrigemBadge({ o, curto }: { o: Origem; curto?: boolean }) {
  const Icon = ICONE_ORIGEM[o.tipo]; const r = rotuloOrigem(o);
  return <span title={r.label} className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium", COR_ORIGEM[o.tipo])}><Icon className="size-3 shrink-0" /><span className="truncate">{curto ? r.curto : r.label}</span></span>;
}

const TIPO_REGRA: Record<Regra["tipo"], { label: string; icon: React.ElementType; cls: string }> = {
  fixa: { label: "Fixa", icon: Lock, cls: "text-primary" },
  preferencia: { label: "Preferência", icon: Star, cls: "text-warning" },
  proibido: { label: "Proibido", icon: ShieldX, cls: "text-destructive" },
};

function EnviarReferencia({ open, onOpenChange, estiloId }: { open: boolean; onOpenChange: (o: boolean) => void; estiloId: string }) {
  const { estilos, adicionarReferencia } = useEstilos();
  const [estilo, setEstilo] = React.useState(estiloId);
  const [quem, setQuem] = React.useState<"voce" | "colaborador">("voce");
  const [nome, setNome] = React.useState("");
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setEstilo(estiloId), [estiloId]);

  const enviar = () => {
    const lista = arquivos.length ? arquivos : [{ name: "referencia_colaboradora.mp4", size: 24e6, type: "video/mp4" } as File];
    lista.forEach((f) => adicionarReferencia({
      nome: f.name, tamanho: `${(f.size / 1e6).toFixed(1).replace(".", ",")} MB`, estiloId: estilo,
      tipo: f.type.startsWith("image") ? "imagem" : f.type.startsWith("audio") ? "som" : "video",
      origem: quem === "colaborador" ? { tipo: "colaborador", nome: nome || "Colaborador(a)" } : { tipo: "voce" },
    }));
    toast.success("Referência enviada", { description: "A IA está analisando. Você vai ver a sugestão de regra em Aprendizado." });
    setArquivos([]); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar referência</DialogTitle>
          <DialogDescription>Vídeos de estilo, sons e imagens. O vídeo é registrado e analisado por inteiro: fala, legendas (fonte, tamanho, cor, posição), headline, ritmo dos cortes, onde e como entram as imagens e os sons. Depois vira sugestão de regra para o estilo escolhido.</DialogDescription>
        </DialogHeader>
        <div onClick={() => inputRef.current?.click()} className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors hover:border-primary/50 hover:bg-accent/50">
          <CloudUpload className="size-7 text-primary" />
          <p className="mt-2 text-sm font-medium">{arquivos.length ? `${arquivos.length} arquivo(s) escolhido(s)` : "Escolher vídeos, sons ou imagens"}</p>
          <p className="text-xs text-muted-foreground">MP4, MOV, MP3, WAV, PNG, JPG</p>
          <input ref={inputRef} type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
        </div>
        <div className="grid gap-2">
          <Label>De quem é esta referência?</Label>
          <div className="grid grid-cols-2 gap-2">
            {([["voce", "Minha", User], ["colaborador", "De um colaborador", Users]] as const).map(([id, l, I]) => (
              <button key={id} onClick={() => setQuem(id)} className={cn("flex items-center gap-2 rounded-xl border p-3 text-sm font-medium", quem === id ? "border-primary bg-accent" : "hover:bg-accent/60")}><I className="size-4" /> {l}</button>
            ))}
          </div>
          {quem === "colaborador" && <Input placeholder="Nome do colaborador(a)" value={nome} onChange={(e) => setNome(e.target.value)} />}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> A origem fica registrada em cada regra que nascer desta referência.</p>
        </div>
        <div className="grid gap-2">
          <Label>Alimentar qual estilo?</Label>
          <div className="flex flex-wrap gap-1.5">
            {estilos.map((e) => <button key={e.id} onClick={() => setEstilo(e.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", estilo === e.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{e.nome}</button>)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="brand" onClick={enviar}><Sparkles /> Enviar e analisar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefCard({ r }: { r: Referencia }) {
  const { removerReferencia } = useEstilos();
  const [ver, setVer] = React.useState(false);
  const Icon = r.tipo === "video" ? Film : r.tipo === "imagem" ? ImageIcon : Music;
  return (
    <Card className="group flex flex-col overflow-hidden p-0">
      <div className={cn("relative grid place-items-center", r.tipo === "video" ? "aspect-[4/5]" : "aspect-[4/3]")}
        style={{ backgroundImage: `linear-gradient(160deg, oklch(0.6 0.15 ${r.hue}), oklch(0.3 0.08 ${r.hue}))` }}>
        <Icon className="size-7 text-white/80" />
        {r.analise.status === "analisando" && <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-medium text-white"><span className="flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" /> Analisando…</span></div>}
        <button onClick={() => removerReferencia(r.id)} aria-label="Remover" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/30 text-white opacity-100 backdrop-blur sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate text-xs font-semibold" title={r.nome}>{r.nome}</p>
        <OrigemBadge o={r.origem} />
        {r.analise.resumo && <p className="line-clamp-3 text-[11px] text-muted-foreground">{r.analise.resumo}</p>}
        {r.analise.extraido && <div className="mt-auto flex flex-wrap gap-1 pt-1">{r.analise.extraido.map((x) => <span key={x} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{x}</span>)}</div>}
        {r.tipo === "video" && r.analise.status === "pronta" && <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => setVer(true)}><Info /> Ver análise completa</Button>}
      </div>
      {r.tipo === "video" && <AnaliseReferencia open={ver} onOpenChange={setVer} id={r.id} nome={r.nome} />}
    </Card>
  );
}

export default function Estilos() {
  const { estilos, referencias, sugestoes, atual, aplicarSugestao, descartarSugestao, restaurarVersao, removerRegra, novoEstilo } = useEstilos();
  const [sel, setSel] = React.useState("clean");
  const [enviar, setEnviar] = React.useState(false);
  const [filtro, setFiltro] = React.useState<"todas" | Origem["tipo"]>("todas");
  const [novo, setNovo] = React.useState(false);
  const [nomeNovo, setNomeNovo] = React.useState("");
  const [aba, setAba] = React.useState("regras");
  React.useEffect(() => { const a = new URLSearchParams(window.location.search).get("aba"); if (a) setAba(a); }, []);
  const est = estilos.find((e) => e.id === sel) ?? estilos[0];
  const v = atual(est.id);
  const refs = referencias.filter((r) => r.estiloId === est.id && (filtro === "todas" || r.origem.tipo === filtro));
  const pend = sugestoes.filter((s) => s.estiloId === est.id && s.status === "pendente");
  const historicoSug = sugestoes.filter((s) => s.estiloId === est.id && s.status !== "pendente");

  return (
    <>
      <PageHeader title="Estilos e Referências" description="Cada estilo é o “jeito de editar” que a IA segue. Ele aprende com suas referências e com cada Aprovar ou Pedir ajuste."
        actions={<>
          <Button variant="outline" onClick={() => setNovo(true)}><Plus /> Novo estilo</Button>
          <Button variant="brand" onClick={() => setEnviar(true)}><CloudUpload /> Enviar referência</Button>
        </>} />

      {/* Estilos */}
      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
        {estilos.map((e) => {
          const p = sugestoes.filter((s) => s.estiloId === e.id && s.status === "pendente").length;
          return (
            <button key={e.id} onClick={() => setSel(e.id)} className={cn("relative w-72 shrink-0 rounded-2xl border bg-card p-4 text-left transition-all sm:w-auto", sel === e.id ? "border-primary/50 shadow-lg shadow-primary/10 ring-1 ring-primary/30" : "hover:border-primary/30")}>
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(135deg, oklch(0.6 0.2 ${e.hue}), oklch(0.5 0.2 ${e.hue + 40}))` }}><Sparkles className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">{e.nome} {e.padrao && <Badge variant="secondary">padrão</Badge>}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{e.descricao}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><History className="size-3" /> v{e.versaoAtual}</span>
                <span>{e.usos} vídeos</span>
                <span>{e.aprovacao}% aprovados</span>
                {p > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 font-semibold text-primary-foreground">{p} nova{p > 1 ? "s" : ""}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="mb-1 w-full justify-start overflow-x-auto scrollbar-none sm:w-auto">
          <TabsTrigger value="regras"><Lock /> Regras</TabsTrigger>
          <TabsTrigger value="referencias"><Film /> Referências <span className="rounded-full bg-muted px-1.5 text-[11px]">{referencias.filter((r) => r.estiloId === est.id).length}</span></TabsTrigger>
          <TabsTrigger value="aprendizado"><Brain /> Aprendizado {pend.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{pend.length}</span>}</TabsTrigger>
          <TabsTrigger value="json"><Code2 /> Perfil</TabsTrigger>
        </TabsList>

        {/* Regras */}
        <TabsContent value="regras">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{est.nome} <Badge>v{v.n}</Badge></CardTitle>
              <CardDescription>Cada regra mostra de onde veio. Remover uma regra cria uma nova versão, e você pode voltar quando quiser.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {v.regras.map((r) => {
                const T = TIPO_REGRA[r.tipo];
                return (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
                    <T.icon className={cn("mt-0.5 size-4 shrink-0", T.cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{r.texto}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{T.label} · origem: {r.origem}</p>
                    </div>
                    {r.tipo !== "fixa" && <Button variant="ghost" size="icon-sm" aria-label="Remover regra" onClick={() => { removerRegra(est.id, r.id); toast("Regra removida", { description: "Criada uma nova versão. Dá para desfazer no Histórico." }); }}><X /></Button>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referências */}
        <TabsContent value="referencias" className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["todas", "inicial", "voce", "colaborador", "aprendizado"] as const).map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", filtro === f ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                {{ todas: "Todas", inicial: "Conteúdo inicial", voce: "Minhas", colaborador: "Colaboradores", aprendizado: "Aprendidas" }[f]}
              </button>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p><b className="text-foreground">De onde vêm as referências:</b> <OrigemBadge o={{ tipo: "inicial", pasta: "pastas do projeto" }} curto /> já estavam nas pastas referencias/, biblioteca/ e sistema/sons ·{" "}
              <OrigemBadge o={{ tipo: "voce" }} curto /> você enviou · <OrigemBadge o={{ tipo: "colaborador", nome: "Colaborador" }} curto /> vídeos de outras pessoas, com o nome de quem mandou ·{" "}
              <OrigemBadge o={{ tipo: "aprendizado", video: "" }} curto /> veio de um Aprovar/Recusar.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {refs.map((r) => <RefCard key={r.id} r={r} />)}
            <button onClick={() => setEnviar(true)} className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"><CloudUpload className="size-6" /> Enviar referência</button>
          </div>
        </TabsContent>

        {/* Aprendizado */}
        <TabsContent value="aprendizado" className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold"><Brain className="size-4 text-primary" /> Sugestões para revisar</h3>
            <p className="text-sm text-muted-foreground">Nascem de cada Aprovar, Pedir ajuste ou referência nova. Nada muda no estilo sem o seu OK.</p>
            {pend.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma sugestão pendente.</p>}
            {pend.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {s.tipo === "recusa" ? <ThumbsDown className="size-3.5 text-destructive" /> : <ThumbsUp className="size-3.5 text-success" />}
                  <span className="truncate">{s.tipo === "recusa" ? "Pedido de ajuste" : "Aprovação"} · {s.video}</span><span className="ml-auto shrink-0">{s.quando}</span>
                </div>
                <p className="mt-2 text-sm italic text-muted-foreground">“{s.comentario}”</p>
                <div className="mt-3 rounded-lg bg-accent p-3 text-sm"><span className="font-medium text-accent-foreground">Proposta:</span> {s.proposta.texto}</div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => descartarSugestao(s.id)}><X /> Descartar</Button>
                  <Button size="sm" onClick={() => { aplicarSugestao(s.id); toast.success(`Estilo atualizado para v${Math.max(...est.versoes.map((x) => x.n)) + 1}`); }}><Check /> Aplicar ao estilo</Button>
                </div>
              </Card>
            ))}
            {historicoSug.length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Já revisadas</p>
                {historicoSug.map((s) => (
                  <p key={s.id} className="flex items-center gap-2 py-1 text-xs">
                    <Badge variant={s.status === "aplicada" ? "success" : "secondary"}>{s.status}</Badge>
                    <span className="truncate text-muted-foreground">{s.proposta.texto}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" /> Histórico de versões</h3>
            <p className="text-sm text-muted-foreground">Toda mudança fica salva. Volte para qualquer versão com um toque.</p>
            <ol className="relative space-y-3 border-l pl-5">
              {[...est.versoes].reverse().map((ver) => (
                <li key={ver.n} className="relative">
                  <span className={cn("absolute -left-[27px] top-3 grid size-3.5 place-items-center rounded-full ring-4 ring-background", ver.n === est.versaoAtual ? "bg-primary" : "bg-muted-foreground/40")} />
                  <Card className={cn("p-4", ver.n === est.versaoAtual && "ring-1 ring-primary/40")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ver.n === est.versaoAtual ? "default" : "secondary"}>v{ver.n}{ver.n === est.versaoAtual && " · atual"}</Badge>
                      <span className="text-xs text-muted-foreground">{ver.quando} · {ver.autor}</span>
                    </div>
                    <p className="mt-2 text-sm">{ver.motivo}</p>
                    <div className="mt-1.5"><OrigemBadge o={ver.origem} /></div>
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {ver.mudancas.map((m) => <li key={m} className={cn(m.startsWith("+") ? "text-success" : m.startsWith("−") ? "text-destructive" : "text-muted-foreground")}>{m}</li>)}
                    </ul>
                    {ver.n !== est.versaoAtual && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => { restaurarVersao(est.id, ver.n); toast.success(`Voltou para a v${ver.n}`, { description: "Salvo como uma versão nova, nada foi apagado." }); }}><RotateCcw /> Voltar para esta versão</Button>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>

        {/* JSON */}
        <TabsContent value="json">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Perfil que o editor lê</CardTitle><CardDescription className="mt-1">É isto que o editor.py recebe quando você escolhe “{est.nome}” num vídeo.</CardDescription></div>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(v.perfil, null, 2)); toast.success("JSON copiado"); }}><Copy /> Copiar</Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[60vh] overflow-auto rounded-xl bg-muted p-4 text-xs leading-relaxed">{JSON.stringify({ estilo: est.nome, versao: v.n, ...v.perfil }, null, 2)}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EnviarReferencia open={enviar} onOpenChange={setEnviar} estiloId={est.id} />
      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo estilo</DialogTitle><DialogDescription>Começa como cópia do estilo selecionado ({est.nome}). Depois é só enviar referências.</DialogDescription></DialogHeader>
          <Input placeholder="Ex.: Review honesto da Ana" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button disabled={!nomeNovo.trim()} onClick={() => { const id = novoEstilo(nomeNovo.trim(), est.id); setSel(id); setNovo(false); setNomeNovo(""); }}>Criar estilo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
