"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CloudUpload, Film, FolderPlus, Image as ImageIcon, LayoutGrid, List, MoreHorizontal, Music, Pause, Play, Scissors, Send, Sparkles, Trash2, X, Check, Wifi,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PASTAS, type Arquivo, type Video } from "@/lib/data";
import { VideoThumb } from "@/components/video-thumb";
import { useStore } from "@/lib/store";
import { enviarRetomavel } from "@/lib/upload";
import { supabase } from "@/lib/supabase";
import { capturarCapa } from "@/components/capa-video";
import { useEstilos } from "@/lib/estilos-store";
import { useProdutos } from "@/lib/produtos-store";
import { HooksCtas, type Combinacoes } from "@/components/hooks-ctas";
import { HeadlineConfig, HEADLINE_PADRAO, type HeadlineCfg } from "@/components/headline-config";
import Link from "next/link";
import type { Upload as TusUpload } from "tus-js-client";
import { cn } from "@/lib/utils";
import { ExcluirDialog } from "@/components/excluir-video";
import { BarraIndeterminada, LIMITE_UPLOAD_MB } from "@/lib/andamento";

const ICONES: Record<string, React.ElementType> = { film: Film, scissors: Scissors, send: Send, sparkles: Sparkles, image: ImageIcon, music: Music };

type Envio = { id: string; nome: string; mb: number; enviado: number; pausado: boolean; feito: boolean; velocidade: number; arquivo?: File; erro?: string; videoId?: string; naFila?: boolean; grande?: boolean; iniciando?: boolean };

/** Mensagem clara para o erro do envio (o 413 é arquivo acima do limite do armazenamento). */
function motivoErro(msg: string) {
  if (/413|too large|exceeded the maximum/i.test(msg)) return `O arquivo passa do limite de ${LIMITE_UPLOAD_MB} MB por vídeo.`;
  return "A conexão caiu.";
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { adicionar, modoReal, criarVideo, configurarVideo, enviarParaEdicao, update } = useStore();
  const tus = React.useRef<Record<string, TusUpload>>({});
  const router = useRouter();
  const [envios, setEnvios] = React.useState<Envio[]>([]);
  const { produtos } = useProdutos();
  const [produtoId, setProdutoId] = React.useState("");
  const prod = produtos.find((x) => x.id === produtoId);
  // escolhas feitas no envio; valem para os vídeos quando a pessoa toca em "Editar" (também para os que ainda estão subindo)
  const escolhas = React.useRef<{ produto: { id: string; nome: string } | null; opcoes: Record<string, unknown> } | null>(null);
  const pendentes = React.useRef<Map<string, Promise<void>>>(new Map());   // envios já mandados para a fila, esperando terminar de subir (-> gravação das escolhas)
  const videoDe = React.useRef<Record<string, { id: string; capa?: Promise<string | undefined> }>>({});
  const { estilos } = useEstilos();
  const [estiloId, setEstiloId] = React.useState("clean");
  const [unboxing, setUnboxing] = React.useState(false);
  const [comb, setComb] = React.useState<Combinacoes>({ automatico: true, hooks: [], ctas: [] });
  const [headline, setHeadline] = React.useState<HeadlineCfg>(HEADLINE_PADRAO);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const t = setInterval(() => {
      setEnvios((es) => es.map((e) => {
        if (e.pausado || e.feito || e.arquivo) return e;
        const vel = 18 + Math.random() * 14; // MB/s simulado
        const enviado = Math.min(e.mb, e.enviado + vel * 0.4);
        return { ...e, enviado, velocidade: vel, feito: enviado >= e.mb };
      }));
    }, 400);
    return () => clearInterval(t);
  }, []);

  const patch = (id: string, p: Partial<Envio>) => setEnvios((es) => es.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** Grava as escolhas no vídeo (produto certo, estilo, headline, capa) e só então põe na fila de edição. */
  const mandarVideo = async (envioId: string, jaSubiu = true) => {
    const v = videoDe.current[envioId], esc = escolhas.current;
    if (!v || !esc) return;
    const capa = await v.capa;
    // as escolhas ficam gravadas no vídeo na hora: se a aba fechar, a Fila ainda consegue mandar para edição
    await configurarVideo(v.id, esc.produto, { ...esc.opcoes, ...(capa ? { capa } : {}), editar_ao_terminar: true });
    if (jaSubiu) await enviarParaEdicao(v.id);
    setEnvios((es) => es.filter((x) => x.id !== envioId || !x.feito).map((x) => (x.id === envioId ? { ...x, naFila: true } : x)));
  };

  const iniciarReal = async (e: Envio) => {
    try {
      // o vídeo nasce "enviando", sem produto: o produto e as opções entram quando a pessoa toca em "Editar"
      const { id, caminho, owner } = await criarVideo(e.nome, e.mb, "", {});
      // capa de verdade: uma foto de um quadro do próprio vídeo (se o navegador conseguir abrir o formato)
      const capa = capturarCapa(e.arquivo!).then(async (b) => {
        if (!b) return undefined;
        const alvo = `${owner}/${id}/capa.jpg`;
        const { error } = await supabase!.storage.from("brutos").upload(alvo, b, { contentType: "image/jpeg", upsert: true });
        return error ? undefined : alvo;
      }).catch(() => undefined);
      videoDe.current[e.id] = { id, capa };
      patch(e.id, { videoId: id });
      let ultimo = { t: Date.now(), b: 0 };
      // a porcentagem do envio vai para o banco (a cada ~3 s): a Fila mostra a barra mesmo em outra tela ou aparelho
      let gravado = 0;
      const gravar = (pct: number, forcar = false) => {
        if (!forcar && Date.now() - gravado < 3000) return;
        gravado = Date.now();
        supabase!.from("videos").update({ progresso: Math.round(pct * 10) / 10 }).eq("id", id).eq("status", "enviando").then(() => {});
      };
      tus.current[e.id] = await enviarRetomavel(e.arquivo!, caminho, {
        progresso: (b) => {
          const agora = Date.now(); const dt = (agora - ultimo.t) / 1000;
          const vel = dt > 0.5 ? (b - ultimo.b) / 1e6 / dt : undefined;
          if (dt > 0.5) ultimo = { t: agora, b };
          patch(e.id, { enviado: b / 1e6, iniciando: false, ...(vel != null ? { velocidade: vel } : {}) });
          gravar((b / (e.arquivo!.size || 1)) * 100);
        },
        ok: async () => {
          patch(e.id, { feito: true, enviado: e.mb, iniciando: false }); gravar(100, true);
          const esc = pendentes.current.get(e.id);
          if (esc) { pendentes.current.delete(e.id); await esc.catch(() => {}); await enviarParaEdicao(id); }
        },
        erro: (err) => patch(e.id, { erro: motivoErro(err.message), pausado: true, iniciando: false }),
      });
    } catch (err) { patch(e.id, { erro: motivoErro((err as Error).message), pausado: true, iniciando: false }); }
  };

  const addFiles = (files: (File | { name: string; size: number })[]) => {
    const novos: Envio[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2), nome: f.name, mb: Math.max(1, Math.round(f.size / 1e6) || 420), enviado: 0, pausado: false, feito: false, velocidade: 0,
      arquivo: modoReal && f instanceof File ? f : undefined,
      grande: modoReal && f.size > LIMITE_UPLOAD_MB * 1024 * 1024,
      iniciando: modoReal && f instanceof File,
    }));
    setEnvios((es) => [...es, ...novos]);
    // vídeo acima do limite nem começa a subir (o armazenamento recusaria no fim, com erro 413)
    novos.filter((n) => n.arquivo && !n.grande).forEach(iniciarReal);
  };
  const pausar = (e: Envio) => {
    const up = tus.current[e.id];
    if (up) { if (e.pausado) up.start(); else up.abort(); }
    patch(e.id, { pausado: !e.pausado, erro: undefined });
  };

  const exemplo = () => addFiles([{ name: "creme_noite_bruto.mp4", size: 860e6 }, { name: "fone_bluetooth_unboxing.mov", size: 1.4e9 }]);
  const prontos = envios.filter((e) => e.feito && !e.naFila && !e.grande);
  const subindo = modoReal ? envios.filter((e) => !e.feito && e.videoId && !e.erro && !pendentes.current.has(e.id)) : [];
  const paraEditar = [...prontos, ...subindo];
  // prévia de ganchos/CTAs: lê a fala do vídeo enviado (com vários vídeos, cada um é lido na hora de editar)
  const ativos = envios.filter((e) => !e.naFila);
  const unico = ativos.length === 1 ? ativos[0] : null;
  const varios = ativos.length > 1;
  const combFinal: Combinacoes = varios ? { automatico: true, hooks: [], ctas: [] } : comb;

  const mandarParaFila = async () => {
    if (modoReal) {
      escolhas.current = {
        produto: prod ? { id: prod.id, nome: prod.nome } : null,
        opcoes: { surpresa: unboxing, estilo_id: estiloId, combinacoes: combFinal, headline },
      };
      try {
        const gravando = subindo.map((e) => { const p = mandarVideo(e.id, false); pendentes.current.set(e.id, p); return p; });
        await Promise.all([...prontos.map((e) => mandarVideo(e.id)), ...gravando]);
      } catch (err) { toast.error("Não deu para pôr na fila", { description: (err as Error).message }); return; }
    }
    if (!modoReal) prontos.forEach((e) => {
      const id = adicionar(e.nome, e.mb);
      if (headline.modo === "sem") update(id, { headlineAtiva: false });
      else if (headline.modo === "manual" && headline.texto.trim()) update(id, { headline: headline.texto.trim(), headlinePos: { x: headline.x, y: headline.y } });
    });
    const n = combFinal.automatico ? 0 : Math.max(1, combFinal.hooks.filter((x) => x.texto.trim()).length) * Math.max(1, combFinal.ctas.filter((x) => x.texto.trim()).length);
    toast.success(`${paraEditar.length} vídeo(s) na fila de edição${prod ? ` · ${prod.nome}` : ""}`, { description: subindo.length ? "Os que ainda estão subindo entram na fila assim que terminarem. Acompanhe a barra de envio na Fila; não feche o site até lá." : n > 1 ? `Cada bruto vira ${n} vídeos (ganchos × CTAs). Você recebe um aviso quando estiverem prontos.` : "Você recebe um aviso quando estiverem prontos para aprovar." });
    setEnvios((es) => es.filter((e) => !e.feito));
    onOpenChange(false);
    router.push("/fila");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar vídeos brutos</DialogTitle>
          <DialogDescription>Arquivos grandes são enviados em partes. Se a internet cair, o envio continua de onde parou.</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => inputRef.current?.click()}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/50", drag && "border-primary bg-accent")}
        >
          <div className="brand-gradient grid size-12 place-items-center rounded-2xl text-white shadow-lg shadow-primary/30"><CloudUpload className="size-6" /></div>
          <p className="mt-3 font-medium">Toque para escolher ou arraste aqui</p>
          <p className="mt-1 text-xs text-muted-foreground">MP4, MOV ou HEVC do celular · até {LIMITE_UPLOAD_MB} MB por vídeo · pode enviar vários de uma vez</p>
          <input ref={inputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />
        </div>
        {envios.length === 0 && !modoReal && (
          <button onClick={exemplo} className="-mt-2 text-xs font-medium text-primary hover:underline">Simular envio com 2 vídeos de exemplo</button>
        )}

        {envios.length > 0 && (
          <div className="space-y-2">
            {envios.map((e) => {
              const pct = (e.enviado / e.mb) * 100;
              const partes = Math.ceil(e.mb / 8);
              return (
                <div key={e.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><Film className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.nome}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {e.grande ? <span className="text-destructive">{e.mb} MB: passa do limite de {LIMITE_UPLOAD_MB} MB por vídeo. Corte ou exporte em tamanho menor e envie de novo.</span>
                          : e.feito ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3" /> Enviado · {e.mb} MB{e.naFila ? " · entra na fila" : ""}</span>
                          : e.iniciando ? "Preparando o envio…"
                          : e.erro ? `${e.erro} Parou em ${Math.round(pct)}% · toque em ▶ para tentar de novo`
                          : e.pausado ? `Pausado em ${Math.round(pct)}% · retoma da parte ${Math.floor((e.enviado / e.mb) * partes) + 1} de ${partes}`
                          : `${Math.round(e.enviado)} de ${e.mb} MB · ${e.velocidade.toFixed(0)} MB/s · parte ${Math.floor((e.enviado / e.mb) * partes) + 1}/${partes}`}
                      </p>
                    </div>
                    {!e.feito && !e.grande && !e.iniciando && (
                      <Button variant="ghost" size="icon-sm" aria-label={e.pausado ? "Retomar" : "Pausar"} onClick={() => pausar(e)}>
                        {e.pausado ? <Play /> : <Pause />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => setEnvios((es) => es.filter((x) => x.id !== e.id))}><X /></Button>
                  </div>
                  {!e.feito && !e.grande && (e.iniciando ? <BarraIndeterminada className="mt-2.5 h-1.5" />
                    : <div className="mt-2.5 flex items-center gap-2"><Progress value={pct} className="h-1.5" /><span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums">{Math.round(pct)}%</span></div>)}
                </div>
              );
            })}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wifi className="size-3.5" /> Deixe o site aberto enquanto envia. Se a internet cair, o envio continua de onde parou.</p>
          </div>
        )}

        <div className="grid gap-4 rounded-xl bg-muted/50 p-4">
          <div className="grid gap-2">
            <Label>Estilo de edição</Label>
            <div className="flex flex-wrap gap-1.5">
              {estilos.map((s) => (
                <button key={s.id} onClick={() => { setEstiloId(s.id); if (s.id === "unboxing") setUnboxing(true); }} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", estiloId === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{s.nome} · v{s.versaoAtual}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">O editor segue as regras da versão atual desse estilo. Ajuste em Estilos e Referências.</p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between"><Label>Produto</Label><Link href="/produtos" className="text-xs font-medium text-primary hover:underline">Gerenciar produtos</Link></div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setProdutoId("")} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", produtoId === "" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>Sem produto</button>
              {produtos.map((p) => (
                <button key={p.id} onClick={() => setProdutoId(p.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", produtoId === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{p.nome} · {p.imagens.length}</button>
              ))}
              <Link href="/produtos" className="rounded-full border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">+ Novo produto</Link>
            </div>
            <p className="text-xs text-muted-foreground">{!prod ? (produtos.length === 0 ? "Você ainda não cadastrou produtos. O vídeo sai sem imagens de referência; cadastre em Produtos." : "Sem produto: o vídeo sai sem imagens de referência.") : prod.imagens.length === 0 ? "Este produto ainda não tem imagens: o vídeo sai sem sobreposições. Envie em Produtos." : "O editor usa só as imagens deste produto quando a pessoa aponta ou fala dele."}</p>
          </div>
          <HooksCtas value={combFinal} onChange={setComb} videoId={unico?.feito ? unico.videoId : null} varios={varios} enviando={!!unico && !unico.feito} />
          <div className="grid gap-2">
            <Label>Texto na tela (headline)</Label>
            <HeadlineConfig value={headline} onChange={setHeadline} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label>Abrir com a reação de surpresa</Label>
              <p className="mt-1 text-xs text-muted-foreground">Opcional. O editor acha o momento de espanto pela fala (“uau”, “caraca”, “meu deus”, “não acredito”…), pelo tom de voz e pela expressão. Desligado, ele só sugere uma versão alternativa.</p>
            </div>
            <Switch checked={unboxing} onCheckedChange={setUnboxing} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Continuar em segundo plano</Button>
          <Button variant="brand" disabled={paraEditar.length === 0} onClick={mandarParaFila}>
            <Scissors /> Editar {paraEditar.length > 0 ? `${paraEditar.length} vídeo${paraEditar.length > 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileTile({ a }: { a: (typeof PASTAS)[number]["arquivos"][number] }) {
  const Icon = a.tipo === "video" ? Film : a.tipo === "imagem" ? ImageIcon : Music;
  return (
    <Card className="group overflow-hidden p-0 transition-shadow hover:shadow-md">
      <div className={cn("relative grid place-items-center", a.tipo === "video" ? "aspect-[4/5]" : "aspect-square")}
        style={{ backgroundImage: `linear-gradient(160deg, oklch(0.6 0.15 ${a.hue}), oklch(0.3 0.08 ${a.hue}))` }}>
        <Icon className="size-8 text-white/80" />
        {a.tipo === "audio" && (
          <div className="absolute inset-x-4 bottom-4 flex h-6 items-end gap-0.5">
            {Array.from({ length: 24 }).map((_, i) => <span key={i} className="flex-1 rounded-full bg-white/60" style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%` }} />)}
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/30 text-white opacity-100 backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem><Scissors /> Editar agora</DropdownMenuItem>
            <DropdownMenuItem><FolderPlus /> Mover para…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive data-[highlighted]:text-destructive"><Trash2 /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-3">
        <p className="truncate text-xs font-medium" title={a.nome}>{a.nome}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{a.tamanho} · {a.quando}</p>
      </div>
    </Card>
  );
}

/** Modo real: as pastas mostram os vídeos da conta (nada de arquivos de exemplo). */
function pastasReais(videos: Video[]) {
  const arq = (v: Video): Arquivo & { video: Video } => ({
    nome: v.titulo, tipo: "video", hue: v.hue, video: v,
    tamanho: v.tamanhoMb ? `${v.tamanhoMb} MB` : "—",
    quando: new Date(v.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
  });
  const editado = (v: Video) => !!(v as Video & { editadoPath?: string }).editadoPath;
  return [
    { id: "brutos", nome: "Brutos", icone: "film", descricao: "Vídeos que você enviou", arquivos: videos.filter((v) => !(v as Video & { origemId?: string }).origemId).map(arq) },
    { id: "editados", nome: "Editados", icone: "scissors", descricao: "Prontos ou já aprovados", arquivos: videos.filter(editado).map(arq) },
    { id: "publicados", nome: "Publicados", icone: "send", descricao: "Já foram para o ar", arquivos: videos.filter((v) => v.status === "publicado").map(arq) },
  ];
}

function TileReal({ a, onClick, onExcluir }: { a: Arquivo & { video: Video }; onClick: () => void; onExcluir: () => void }) {
  return (
    <Card className="group relative overflow-hidden p-0 transition-shadow hover:shadow-md">
      <button type="button" onClick={onClick} className="block w-full"><VideoThumb hue={a.hue} video={a.video} className="rounded-none" /></button>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Opções do vídeo" className="absolute right-2 top-2 grid size-8 place-items-center rounded-md bg-black/40 text-white backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onClick}><Play /> Abrir</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExcluir} className="text-destructive data-[highlighted]:text-destructive"><Trash2 /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="p-3">
        <p className="truncate text-xs font-medium" title={a.nome}>{a.nome}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{a.tamanho} · {a.quando}</p>
      </div>
    </Card>
  );
}

function Biblioteca() {
  const params = useSearchParams();
  const router = useRouter();
  const { videos, modoReal } = useStore();
  const [pasta, setPasta] = React.useState("brutos");
  const [modo, setModo] = React.useState<"grid" | "lista">("grid");
  const [open, setOpen] = React.useState(false);
  const [apagar, setApagar] = React.useState<Video | null>(null);
  const abrir = (v: Video & { editadoPath?: string }) => router.push(v.editadoPath ? `/aprovacao/${v.id}` : "/fila");
  React.useEffect(() => { if (params.get("upload")) setOpen(true); }, [params]);
  const PASTAS_V = modoReal ? pastasReais(videos) : PASTAS;
  const atual = PASTAS_V.find((p) => p.id === pasta) ?? PASTAS_V[0];

  return (
    <>
      <PageHeader title="Biblioteca" description="Seus vídeos, referências, imagens e sons organizados por pasta."
        actions={<>
          <Button variant="outline"><FolderPlus /> Nova pasta</Button>
          <Button variant="brand" onClick={() => setOpen(true)}><CloudUpload /> Enviar vídeos</Button>
        </>} />

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
        {PASTAS_V.map((p) => {
          const Icon = ICONES[p.icone];
          return (
            <button key={p.id} onClick={() => setPasta(p.id)}
              className={cn("flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all", pasta === p.id ? "border-primary/40 bg-accent text-accent-foreground shadow-xs" : "bg-card hover:bg-accent/60")}>
              <Icon className="size-4" /> {p.nome}
              <Badge variant={pasta === p.id ? "default" : "secondary"} className="ml-0.5">{p.arquivos.length}</Badge>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{atual.descricao}</p>
        <div className="flex rounded-lg border bg-card p-0.5">
          <Button variant={modo === "grid" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setModo("grid")} aria-label="Grade"><LayoutGrid /></Button>
          <Button variant={modo === "lista" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setModo("lista")} aria-label="Lista"><List /></Button>
        </div>
      </div>

      {modo === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {atual.arquivos.map((a, i) => ("video" in a ? <TileReal key={(a as { video: Video }).video.id} a={a as Arquivo & { video: Video }} onClick={() => abrir((a as { video: Video }).video)} onExcluir={() => setApagar((a as { video: Video }).video)} /> : <FileTile key={a.nome + i} a={a} />))}
          <button onClick={() => setOpen(true)} className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            <CloudUpload className="size-6" /> Adicionar
          </button>
        </div>
      ) : (
        <Card className="divide-y p-0">
          {atual.arquivos.map((a, i) => (
            <div key={a.nome + i} className="flex items-center gap-3 px-4 py-3">
              <div className="size-10 shrink-0 rounded-lg" style={{ backgroundImage: `linear-gradient(160deg, oklch(0.6 0.15 ${a.hue}), oklch(0.3 0.08 ${a.hue}))` }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.nome}</p>
                <p className="text-xs text-muted-foreground">{a.tamanho} · {a.quando}</p>
              </div>
              {"video" in a ? (
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label="Opções do vídeo" className="grid size-8 place-items-center rounded-md hover:bg-accent"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => abrir((a as { video: Video }).video)}><Play /> Abrir</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setApagar((a as { video: Video }).video)} className="text-destructive data-[highlighted]:text-destructive"><Trash2 /> Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>}
            </div>
          ))}
        </Card>
      )}

      <ExcluirDialog video={apagar} onClose={() => setApagar(null)} />
      <UploadDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && params.get("upload")) router.replace("/biblioteca"); }} />
    </>
  );
}

export default function Page() {
  return <Suspense><Biblioteca /></Suspense>;
}
