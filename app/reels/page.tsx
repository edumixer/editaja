"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Link2, Upload, Scissors, Loader2, Plug, PlugZap, Settings2, Download, Copy, Wand2, Trash2, Clock, Radio, Sparkles, ShieldCheck, ChevronDown, AlertTriangle, Check,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoThumb } from "@/components/video-thumb";
import { useStore } from "@/lib/store";
import { enviarRetomavel } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  lerConfig, salvarConfig, lerTrabalhos, salvarTrabalhos, verificarMotor, enviarArquivo, iniciarCortes, consultar, baixarCorte,
  trabalhoExemplo, fmtTempo, URL_PADRAO, painelLigado, enviarLinksPainel, lerFilaPainel, lerCortesPainel, type FilaPainel, type TrabalhoPainel, type ConfigMotor, type EstadoMotor, type OpcoesCorte, type Trabalho, type Corte,
} from "@/lib/openshorts";

const DURACOES = [
  { id: "curto", nome: "15 a 30 s", min: 15, max: 30 },
  { id: "medio", nome: "20 a 45 s", min: 20, max: 45 },
  { id: "longo", nome: "30 a 60 s", min: 30, max: 60 },
];
const QUANTIDADES: (number | null)[] = [null, 3, 5, 8, 10, 15];

export default function Reels() {
  const [cfg, setCfg] = React.useState<ConfigMotor>({ url: URL_PADRAO, chaveGemini: "" });
  const [motor, setMotor] = React.useState<EstadoMotor | null>(null);
  const [cfgAberto, setCfgAberto] = React.useState(false);
  const [trabalhos, setTrabalhos] = React.useState<Trabalho[]>([]);
  const carregou = React.useRef(false);

  const [aba, setAba] = React.useState<"link" | "arquivo">("link");
  const [link, setLink] = React.useState("");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [inicio, setInicio] = React.useState("");
  const [fim, setFim] = React.useState("");
  const [qtd, setQtd] = React.useState<number | null>(null);
  const [dur, setDur] = React.useState("medio");
  const [legendas, setLegendas] = React.useState(true);
  const [gancho, setGancho] = React.useState(true);
  const [direitos, setDireitos] = React.useState(false);
  const [enviando, setEnviando] = React.useState<number | null>(null); // progresso 0..1 do envio do arquivo
  const [iniciando, setIniciando] = React.useState(false);
  const [baixaQ, setBaixaQ] = React.useState<number | null>(null);
  const [painel, setPainel] = React.useState(false);
  const [fila, setFila] = React.useState<FilaPainel | null>(null);

  React.useEffect(() => {
    const c = lerConfig(); carregou.current = true;
    const salvos = lerTrabalhos();
    const job = new URLSearchParams(location.search).get("job");
    if (job && /^[\w-]{6,}$/.test(job) && !salvos.some((t) => t.id === job))
      salvos.unshift({ id: job, fonte: "Trabalho do motor " + job.slice(0, 8), tipo: "link", ganchoNoVideo: true, criadoEm: new Date().toISOString(), status: "processando", etapa: "Buscando no motor" });
    setCfg(c); setTrabalhos(salvos);
    verificarMotor(c).then(setMotor);
    painelLigado().then(setPainel);
  }, []);
  React.useEffect(() => {
    if (!painel) return;
    const tick = () => lerFilaPainel().then(setFila).catch(() => {});
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, [painel]);
  React.useEffect(() => { if (carregou.current) salvarTrabalhos(trabalhos); }, [trabalhos]);

  const patch = React.useCallback((id: string, p: Partial<Trabalho>) => setTrabalhos((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t))), []);

  // acompanha os trabalhos em andamento a cada 4 s
  const ativos = trabalhos.filter((t) => !t.demo && (t.status === "fila" || t.status === "processando")).map((t) => t.id).join(",");
  React.useEffect(() => {
    if (!ativos || !motor?.ligado) return;
    const ids = ativos.split(",");
    const tick = () => ids.forEach((id) => consultar(cfg, id).then((p) => patch(id, p)).catch(() => {}));
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [ativos, motor?.ligado, cfg, patch]);

  const ligado = !!motor?.ligado;
  const fonteOk = aba === "link" ? /^https?:\/\/\S+\.\S+/.test(link.trim()) : !!arquivo;

  const gerar = async (forcarBaixa = false) => {
    if (!fonteOk) { toast.error(aba === "link" ? "Cole o link do vídeo ou da live." : "Escolha o arquivo do vídeo."); return; }
    if (!direitos) { toast.error("Confirme que você tem autorização para usar esse conteúdo."); return; }
    const fonte = aba === "link" ? link.trim() : arquivo!.name;
    if (!ligado) {
      setTrabalhos((ts) => [trabalhoExemplo(fonte), ...ts]);
      toast.message("Exemplo criado", { description: "O motor de cortes não está ligado, então mostramos cortes de exemplo. Ligue o motor para cortar de verdade." });
      return;
    }
    if (aba === "link" && painel && !inicio.trim() && !fim.trim()) {
      setIniciando(true);
      try {
        const res = await enviarLinksPainel([link.trim()], qtd);
        setLink("");
        toast.success("Link enviado para o seu painel de cortes", { description: res[0] || "Live é cortada em partes de 20 min enquanto continua. Os cortes aparecem aqui embaixo." });
        lerFilaPainel().then(setFila).catch(() => {});
      } catch (e) { toast.error("O painel não aceitou o link", { description: (e as Error).message }); }
      finally { setIniciando(false); }
      return;
    }
    const d = DURACOES.find((x) => x.id === dur)!;
    const opcoes: OpcoesCorte = { quantidade: qtd, minSeg: d.min, maxSeg: d.max, legendas, gancho, inicio, fim, formato: "vertical" };
    setIniciando(true);
    try {
      let uploadId: string | undefined;
      if (aba === "arquivo") { setEnviando(0); uploadId = await enviarArquivo(cfg, arquivo!, setEnviando); setEnviando(null); }
      const r = await iniciarCortes(cfg, aba === "link" ? { url: link.trim() } : { uploadId }, opcoes, forcarBaixa);
      if (r.baixaQualidade != null) { setBaixaQ(r.baixaQualidade); return; }
      setTrabalhos((ts) => [{ id: r.jobId!, fonte, tipo: aba, ganchoNoVideo: gancho, criadoEm: new Date().toISOString(), status: "fila", etapa: "Na fila do motor" }, ...ts]);
      setLink(""); setArquivo(null); setInicio(""); setFim("");
      toast.success("Cortes em andamento", { description: "Pode sair da tela: o motor continua trabalhando e os cortes aparecem aqui." });
    } catch (e) {
      toast.error("Não consegui iniciar", { description: (e as Error).message });
    } finally { setIniciando(false); setEnviando(null); }
  };

  return (
    <>
      <PageHeader title="Reels de vídeos longos"
        description="Cole o link de um vídeo, podcast ou live (sua ou de quem te autorizou) e receba os melhores momentos já cortados em 9:16."
        actions={
          <Button variant="outline" onClick={() => setCfgAberto(true)}>
            <span className={cn("size-2 rounded-full", motor == null ? "bg-muted-foreground" : ligado ? "bg-success" : "bg-destructive")} />
            {motor == null ? "Verificando motor…" : ligado ? "Motor ligado" : "Motor desligado"} <Settings2 />
          </Button>
        } />

      {motor && !ligado && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Plug className="size-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{motor.bloqueado ? "O navegador bloqueou a conexão com o motor" : "O motor de cortes não está ligado"}</p>
              <p className="text-muted-foreground">{motor.bloqueado ? motor.erro : "Você pode testar a tela com cortes de exemplo. Para cortar de verdade, ligue o motor no seu computador e toque em Conectar."}</p>
            </div>
            <Button size="sm" onClick={() => (motor.bloqueado ? location.reload() : setCfgAberto(true))}><PlugZap /> {motor.bloqueado ? "Já permiti, recarregar" : "Conectar motor"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* -------- novo corte -------- */}
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Scissors className="size-5 text-primary" /> Novo corte</CardTitle>
            <CardDescription>A IA assiste o vídeo inteiro, escolhe os trechos com mais chance de viralizar e entrega cada um enquadrado no rosto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">1. De onde vem o vídeo?</p>
              <Tabs value={aba} onValueChange={(v) => setAba(v as "link" | "arquivo")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="link"><Link2 className="size-4" /> Link ou live</TabsTrigger>
                  <TabsTrigger value="arquivo"><Upload className="size-4" /> Arquivo</TabsTrigger>
                </TabsList>
                <TabsContent value="link" className="mt-3 space-y-2">
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=…  ou link da live" inputMode="url" />
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Radio className="mt-0.5 size-3.5 shrink-0" /> Funciona com YouTube, Twitch, Kick e outros. Live ao vivo também: com o painel ligado ela é cortada em partes de 20 min enquanto continua. Com um trecho escolhido, só aquele pedaço é cortado.</p>
                  <details className="rounded-lg border p-2.5 text-sm">
                    <summary className="cursor-pointer font-medium">Usar só um trecho (opcional)</summary>
                    <p className="mt-1 text-xs text-muted-foreground">Bom para vídeos e lives longas. Use horas:minutos:segundos, por exemplo 1:20:00.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Começa em</Label><Input className="mt-1" value={inicio} onChange={(e) => setInicio(e.target.value)} placeholder="0:30:00" /></div>
                      <div><Label className="text-xs">Termina em</Label><Input className="mt-1" value={fim} onChange={(e) => setFim(e.target.value)} placeholder="0:50:00" /></div>
                    </div>
                  </details>
                </TabsContent>
                <TabsContent value="arquivo" className="mt-3">
                  <label className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-accent", arquivo && "border-primary/50 bg-primary/5")}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setArquivo(f); }}>
                    <Upload className="size-6 text-muted-foreground" />
                    {arquivo
                      ? <span className="text-sm font-medium break-all">{arquivo.name} <span className="text-muted-foreground">· {(arquivo.size / 1e6).toFixed(0)} MB</span></span>
                      : <span className="text-sm text-muted-foreground">Arraste o vídeo aqui ou toque para escolher (até 2 GB)</span>}
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                  </label>
                </TabsContent>
              </Tabs>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">2. Como quer os cortes?</p>
              <Label className="text-xs text-muted-foreground">Quantos cortes</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {QUANTIDADES.map((q) => (
                  <button key={q ?? "auto"} onClick={() => setQtd(q)}
                    className={cn("h-9 rounded-full border px-3 text-sm transition-colors", qtd === q ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-accent")}>
                    {q ?? "A IA decide"}
                  </button>
                ))}
              </div>
              <Label className="mt-3 block text-xs text-muted-foreground">Duração de cada corte</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {DURACOES.map((d) => (
                  <button key={d.id} onClick={() => setDur(d.id)}
                    className={cn("h-9 rounded-lg border px-2 text-sm transition-colors", dur === d.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-accent")}>{d.nome}</button>
                ))}
              </div>
              <div className="mt-3 space-y-2.5 rounded-xl border p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span><span className="font-medium">Legendas na tela</span><span className="block text-xs text-muted-foreground">Palavra por palavra, sincronizadas com a fala</span></span>
                  <Switch checked={legendas} onCheckedChange={setLegendas} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span><span className="font-medium">Gancho escrito no início</span><span className="block text-xs text-muted-foreground">Uma frase curta tirada do que é falado</span></span>
                  <Switch checked={gancho} onCheckedChange={setGancho} />
                </label>
              </div>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl bg-muted/50 p-3 text-sm">
              <input type="checkbox" checked={direitos} onChange={(e) => setDireitos(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span><span className="font-medium">Tenho autorização para usar este conteúdo.</span>
                <span className="block text-xs text-muted-foreground">Vídeos e lives de outras pessoas só com permissão do dono (ou dentro das regras de cortes do canal). Sem isso o vídeo pode ser derrubado por direitos autorais.</span></span>
            </label>

            <Button variant="brand" size="lg" className="w-full" disabled={iniciando} onClick={() => gerar()}>
              {iniciando ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {enviando != null ? `Enviando ${Math.round(enviando * 100)}%` : iniciando ? "Iniciando…" : ligado ? "Gerar cortes" : "Ver cortes de exemplo"}
            </Button>
          </CardContent>
        </Card>

        {/* -------- trabalhos e cortes -------- */}
        <div className="space-y-4 lg:col-span-3">
          {painel && fila && <PainelCortes fila={fila} />}
          {trabalhos.length === 0 && !(painel && fila?.trabalhos.length) && (
            <Card className="grid place-items-center p-10 text-center">
              <div className="brand-gradient grid size-12 place-items-center rounded-2xl text-white"><Scissors className="size-6" /></div>
              <p className="mt-3 font-semibold">Nenhum corte ainda</p>
              <p className="max-w-sm text-sm text-muted-foreground">Cole um link ao lado. Um vídeo de 1 hora leva em média 10 a 20 minutos no computador (bem menos com placa de vídeo NVIDIA).</p>
            </Card>
          )}
          {trabalhos.map((t) => <CardTrabalho key={t.id} t={t} remover={() => setTrabalhos((ts) => ts.filter((x) => x.id !== t.id))} />)}
        </div>
      </div>

      <ConfigDialog aberto={cfgAberto} onOpenChange={setCfgAberto} cfg={cfg} motor={motor}
        salvar={async (c) => { setCfg(c); salvarConfig(c); setMotor(null); const m = await verificarMotor(c); setMotor(m); return m; }} />

      <Dialog open={baixaQ != null} onOpenChange={(o) => !o && setBaixaQ(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-500" /> Vídeo em baixa qualidade</DialogTitle>
            <DialogDescription>Esse link só tem {baixaQ}p. Os cortes vão ficar com menos nitidez que o normal. Quer cortar mesmo assim?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaQ(null)}>Cancelar</Button>
            <Button onClick={() => { setBaixaQ(null); gerar(true); }}>Cortar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CardTrabalho({ t, remover }: { t: Trabalho; remover: () => void }) {
  const rodando = t.status === "fila" || t.status === "processando";
  return (
    <Card className={cn("overflow-hidden", rodando && "ring-1 ring-primary/40")}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", t.status === "erro" ? "bg-destructive/10 text-destructive" : t.status === "pronto" ? "bg-success/10 text-success" : "bg-primary/10 text-primary")}>
          {rodando ? <Loader2 className="size-5 animate-spin" /> : t.status === "erro" ? <AlertTriangle className="size-5" /> : <Check className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={t.fonte}>{t.fonte}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(t.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {t.demo && " · exemplo"}
            {t.status === "pronto" && ` · ${t.cortes?.length ?? 0} cortes`}
          </p>
          {rodando && <p className="mt-1.5 text-sm font-medium text-primary">{t.etapa ?? "Trabalhando"}… <span className="font-normal text-muted-foreground">há {Math.max(1, Math.round((Date.now() - new Date(t.criadoEm).getTime()) / 60000))} min</span></p>}
          {rodando && t.detalhe && <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={t.detalhe}>{t.detalhe}</p>}
          {rodando && <p className="mt-1 text-[11px] text-muted-foreground">No computador, sem placa de vídeo, cada 10 min de vídeo leva uns 8 a 10 min para cortar.</p>}
          {t.status === "erro" && <p className="mt-1.5 rounded-lg bg-destructive/8 p-2 text-xs text-destructive">{t.erro}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={remover} aria-label="Tirar da lista"><Trash2 /></Button>
      </div>
      {rodando && <div className="h-1 overflow-hidden bg-secondary"><div className="brand-gradient h-full w-full animate-pulse" /></div>}
      {t.status === "pronto" && !!t.cortes?.length && (
        <div className="grid gap-3 border-t bg-muted/20 p-3 sm:grid-cols-2 sm:p-4">
          {[...t.cortes].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0)).map((c) => <CardCorte key={c.indice} c={c} t={t} />)}
        </div>
      )}
    </Card>
  );
}

function CardCorte({ c, t }: { c: Corte; t: Trabalho }) {
  const { modoReal, adicionar, criarVideo, enviarParaEdicao } = useStore();
  const [mandando, setMandando] = React.useState(false);
  const [feito, setFeito] = React.useState(false);
  const dur = Math.max(0, c.fim - c.inicio);
  const nome = `${c.titulo.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 50)}.mp4`;

  const copiar = (txt: string) => navigator.clipboard?.writeText(txt).then(() => toast.success("Copiado"));
  const baixar = async () => {
    try {
      const blob = await baixarCorte(c);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast.error((e as Error).message); }
  };
  /** Manda o corte para a fila do EditaJá: limpa respiros, 1.1x, capa 0.1 s, sem cards/CTAs. */
  const editar = async () => {
    setMandando(true);
    try {
      if (!modoReal || t.demo) {
        adicionar(nome, Math.max(1, Math.round(dur * 0.6)));
      } else {
        const blob = await baixarCorte(c);
        const arq = new File([blob], nome, { type: "video/mp4" });
        const { id, caminho } = await criarVideo(nome, Math.max(1, Math.round(arq.size / 1e6)), "—", { origem: "reels", headline: t.ganchoNoVideo ? { modo: "sem" } : c.gancho ? { modo: "manual", texto: c.gancho } : { modo: "auto" } });
        await new Promise<void>((ok, falha) => enviarRetomavel(arq, caminho, { progresso: () => {}, ok: () => ok(), erro: falha }));
        await enviarParaEdicao(id);
      }
      setFeito(true);
      toast.success("Corte na fila de edição", { description: "O editor tira os respiros, deixa em 1.1x e coloca a capa. Depois é só aprovar." });
    } catch (e) { toast.error("Não consegui mandar o corte", { description: (e as Error).message }); }
    finally { setMandando(false); }
  };

  return (
    <div className="flex min-w-0 gap-3 rounded-xl border bg-card p-3">
      <div className="w-24 shrink-0 sm:w-28">
        {c.videoUrl
          ? <video src={c.videoUrl} controls preload="metadata" playsInline className="aspect-[9/16] w-full rounded-lg bg-black object-cover" />
          : <VideoThumb hue={(c.indice * 67 + 200) % 360} headline={c.gancho} size="sm" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {c.nota != null && <span className={cn("rounded-full px-2 py-0.5 font-semibold", c.nota >= 85 ? "bg-success/15 text-success" : c.nota >= 70 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>Nota {c.nota}</span>}
          <span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-3" />{Math.round(dur)} s · aos {fmtTempo(c.inicio)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-semibold">{c.titulo}</p>
        {c.gancho && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">Gancho: “{c.gancho}”</p>}
        {c.porque && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.porque}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          <Button size="sm" variant={feito ? "outline" : "default"} disabled={mandando || feito} onClick={editar}>
            {mandando ? <Loader2 className="animate-spin" /> : feito ? <Check /> : <Wand2 />} {feito ? "Na fila" : "Editar no EditaJá"}
          </Button>
          {c.videoUrl && <Button size="sm" variant="outline" onClick={baixar} aria-label="Baixar"><Download /></Button>}
          {c.descricaoTiktok && <Button size="sm" variant="outline" onClick={() => copiar(c.descricaoTiktok)} aria-label="Copiar descrição"><Copy /> Descrição</Button>}
        </div>
        {feito && <Link href="/fila" className="mt-1.5 text-xs text-primary hover:underline">Ver na fila de edição →</Link>}
      </div>
    </div>
  );
}

function ConfigDialog({ aberto, onOpenChange, cfg, motor, salvar }:
  { aberto: boolean; onOpenChange: (o: boolean) => void; cfg: ConfigMotor; motor: EstadoMotor | null; salvar: (c: ConfigMotor) => Promise<EstadoMotor> }) {
  const [url, setUrl] = React.useState(cfg.url);
  const [testando, setTestando] = React.useState(false);
  React.useEffect(() => { if (aberto) { setUrl(cfg.url); } }, [aberto, cfg]);
  const testar = async () => {
    setTestando(true);
    const m = await salvar({ url: url.trim() || URL_PADRAO, chaveGemini: "" });
    setTestando(false);
    if (m.ligado) { toast.success("Motor conectado"); onOpenChange(false); } else toast.error("Não conectou", { description: m.erro, duration: 15000 });
  };
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PlugZap className="size-5 text-primary" /> Motor de cortes</DialogTitle>
          <DialogDescription>É o programa que assiste o vídeo e faz os cortes. Ele roda no seu computador (ou num servidor) e esta tela conversa com ele.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {[
            "Abra o Docker Desktop no computador.",
            "Dê dois cliques em iniciar.bat na pasta cortes-gta (ou rode docker compose up -d)",
            "Espere 1 minuto e toque em Conectar abaixo. A chave do Gemini já fica no motor, não precisa digitar aqui.",
          ].map((p, i) => (
            <li key={i} className="flex gap-2.5"><span className="brand-gradient grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white">{i + 1}</span><span className="pt-0.5">{p}</span></li>
          ))}
        </ol>
        <div className="space-y-3">
          <div><Label>Endereço do motor</Label><Input className="mt-1.5" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={URL_PADRAO} /></div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Os vídeos vão direto do seu navegador para o motor. Nada passa pelos servidores do EditaJá até você tocar em “Editar no EditaJá”.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={testar} disabled={testando}>{testando ? <Loader2 className="animate-spin" /> : <Plug />} Conectar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_PAINEL: Record<string, string> = {
  pendente: "Na fila", enviando: "Enviando para o motor", baixando: "Baixando o vídeo", processando: "Cortando", concluido: "Pronto", erro: "Erro",
};

function PainelCortes({ fila }: { fila: FilaPainel }) {
  const lives = Object.entries(fila.lives ?? {});
  const itens = fila.trabalhos.slice(0, 20);
  if (!lives.length && !itens.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Radio className="size-4 text-primary" /> Seu painel de cortes</CardTitle>
        <CardDescription>Links, lives e vídeos longos que o painel cortes-gta está cortando no seu computador.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lives.map(([canal, l]) => (
          <div key={canal} className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="min-w-0 flex-1 truncate"><span className="font-medium">Gravando ao vivo:</span> {l.titulo || canal}</span>
            <span className="shrink-0 text-xs text-muted-foreground">vira cortes a cada 20 min</span>
          </div>
        ))}
        {itens.map((t) => <ItemPainel key={t.id} t={t} />)}
      </CardContent>
    </Card>
  );
}

function ItemPainel({ t }: { t: TrabalhoPainel }) {
  const [aberto, setAberto] = React.useState(false);
  const [cortes, setCortes] = React.useState<Corte[] | null>(null);
  const [erro, setErro] = React.useState("");
  const pronto = t.status === "concluido" && !!t.pasta_saida;
  const rodando = !["concluido", "erro"].includes(t.status);
  const abrir = async () => {
    setAberto((a) => !a);
    if (cortes || !pronto) return;
    try { setCortes(await lerCortesPainel(t.pasta_saida!)); } catch (e) { setErro((e as Error).message); }
  };
  const fake: Trabalho = { id: `painel-${t.id}`, fonte: t.origem, tipo: "link", criadoEm: "", status: "pronto", ganchoNoVideo: true };
  return (
    <div className="rounded-lg border">
      <button onClick={abrir} disabled={!pronto} className="flex w-full items-center gap-2.5 p-2.5 text-left text-sm disabled:cursor-default">
        {rodando ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : t.status === "erro" ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : <Check className="size-4 shrink-0 text-success" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{t.titulo || t.origem}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {STATUS_PAINEL[t.status] ?? t.status}{t.cortes ? ` · ${t.cortes} cortes` : ""}{t.canal ? ` · ${t.canal}` : ""}{t.criado ? ` · ${new Date(t.criado * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </span>
          {t.status === "erro" && t.erro && <span className="mt-1 block text-xs text-destructive">{t.erro}</span>}
        </span>
        {pronto && <ChevronDown className={cn("size-4 shrink-0 transition-transform", aberto && "rotate-180")} />}
      </button>
      {aberto && (
        <div className="grid gap-3 border-t bg-muted/20 p-3 sm:grid-cols-2">
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          {!cortes && !erro && <p className="text-xs text-muted-foreground">Carregando cortes…</p>}
          {cortes?.sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0)).map((c) => <CardCorte key={c.indice} c={c} t={fake} />)}
        </div>
      )}
    </div>
  );
}
