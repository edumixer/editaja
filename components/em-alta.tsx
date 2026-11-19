"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, CalendarRange, ExternalLink, Flame, Hash, Loader2, Megaphone, Minus, Plus, Rocket, Search, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useTextos } from "@/lib/textos-store";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { COMUNIDADE, CTAS_BR, HASHTAGS_BR, HOJE, NICHOS, PERIODOS, TIPO_CTA, TIPO_GANCHO, VIRAIS_BR, fmtNum, pesquisaDemo, rankear, type CtaMercado, type HashtagMercado, type ItemRanking, type Periodo, type ResultadoPesquisa, type ViralMercado } from "@/lib/tendencias";
import { cn } from "@/lib/utils";

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

/** 12 barrinhas: views médias por mês no último ano; o mês atual em destaque. */
function Meses({ valores }: { valores: number[] }) {
  const max = Math.max(...valores, 1); const atual = 11;
  const rotulo = (m: number) => { const d = new Date(HOJE); d.setMonth(d.getMonth() - (11 - m)); return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); };
  return (
    <div className="flex h-8 items-end gap-0.5" aria-label="Desempenho mês a mês no último ano">
      {valores.map((v, m) => <span key={m} title={`${rotulo(m)}: ${fmtNum(v)} views por vídeo`} className={cn("w-1.5 rounded-sm", m === atual ? "bg-primary" : "bg-primary/25")} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}
    </div>
  );
}

function CardRanking({ i, pos, naBiblioteca, onSalvar }: { i: ItemRanking; pos: number; naBiblioteca: boolean; onSalvar: () => void }) {
  return (
    <Card className="flex gap-3 p-3 sm:p-4">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums", pos <= 3 ? "brand-gradient text-white" : "bg-muted text-muted-foreground")}>{pos}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{i.texto}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <Tendencia i={i} />
          <span className="tabular-nums">{i.usos} {i.usos === 1 ? "vídeo" : "vídeos"}</span>
          <span className="tabular-nums">média de <b className="text-foreground">{fmtNum(i.media)}</b> views</span>
          {i.criadores && <span className="inline-flex items-center gap-1"><Users className="size-3" /> {i.criadores} criadores</span>}
          {i.nicho && <span className="rounded-full bg-muted px-2 py-0.5">{i.nicho}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-end gap-2.5">
            <Meses valores={i.mensal} />
            {i.meses.length > 0 && <p className="pb-0.5 text-[11px] text-muted-foreground"><CalendarRange className="mr-1 inline size-3" />Rende mais em <b className="text-foreground">{i.meses.join(" e ")}</b></p>}
          </div>
          <div className="flex gap-1">
            {!naBiblioteca && <Button variant="outline" size="sm" onClick={onSalvar}><Plus /> Salvar</Button>}
            <Button variant="ghost" size="sm" asChild><Link href="/roteiros">Usar em roteiro</Link></Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- dados do mercado: Supabase (robô diário) ou exemplo ---------------- */
const DIAS_PERIODO: Record<Periodo, number> = { "7d": 7, "30d": 30, "90d": 90, epoca: 30 };
const hueDe = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const nomeNicho = (id?: string | null) => NICHOS.find((n) => n.id === id)?.nome ?? "";
const doNicho = (nicho: string, nomeCurto: string) => nicho === "todos" || nomeNicho(nicho).startsWith(nomeCurto);

type Mercado = { virais: ViralMercado[]; hashtags: HashtagMercado[]; ctas: CtaMercado[]; ganchos: ItemRanking[]; carregando: boolean; demo: boolean };

function curvaDe(c: unknown): number[] {
  if (!Array.isArray(c)) return [];
  return c.map((x) => (typeof x === "number" ? x : Number((x as Record<string, unknown>)?.value ?? (x as Record<string, unknown>)?.popularity ?? 0))).slice(-14);
}

function useMercado(nicho: string, periodo: Periodo): Mercado {
  const { modoReal } = useStore();
  const [m, setM] = React.useState<Mercado>({ virais: [], hashtags: [], ctas: [], ganchos: [], carregando: modoReal, demo: !modoReal });
  React.useEffect(() => {
    if (!modoReal || !supabase) {
      setM({ demo: true, carregando: false, hashtags: HASHTAGS_BR, ctas: CTAS_BR,
        virais: VIRAIS_BR.filter((v) => doNicho(nicho, v.nicho)),
        ganchos: rankear(COMUNIDADE.filter((x) => nicho === "todos" || nomeNicho(nicho).startsWith(x.nicho) || x.nicho === "Geral"), periodo, 120) });
      return;
    }
    let vivo = true;
    (async () => {
      setM((x) => ({ ...x, carregando: true }));
      const sb = supabase!, n = nicho === "todos" ? null : nicho, dias = DIAS_PERIODO[periodo];
      let qv = sb.from("videos_mercado").select("tiktok_id,url,perfil,nicho_id,legenda,gancho_falado,produto,views,curtidas,compartilhamentos,nota_viral,postado_em,ritmo,prestes_viralizar,cta_falado,intencao_compra_pct,ganchos_mercado(tipo)")
        .gte("postado_em", new Date(Date.now() - 3 * 864e5).toISOString()).gte("views", 1000).order("nota_viral", { ascending: false }).limit(40);
      if (n) qv = qv.eq("nicho_id", n);
      const [v, h, c, g] = await Promise.all([
        qv,
        sb.from("hashtags_mercado").select("*").eq("periodo", 7).order("coletado_em", { ascending: false }).order("posicao").limit(60),
        sb.rpc("ranking_ctas_mercado", { p_dias: dias, p_nicho: n }),
        sb.rpc("ranking_mercado", { p_dias: dias, p_nicho: n }),
      ]);
      if (!vivo) return;
      const ultima = h.data?.[0]?.coletado_em;
      setM({
        demo: false, carregando: false,
        virais: (v.data ?? []).map((x: any) => ({
          id: x.tiktok_id, url: x.url, perfil: x.perfil, nicho: nomeNicho(x.nicho_id), legenda: x.legenda ?? "", gancho: x.gancho_falado ?? (x.legenda ?? "").split(/[.!?#\n]/)[0],
          tipo: x.ganchos_mercado?.tipo ?? "outro", produto: x.produto ?? "", views: x.views, curtidas: x.curtidas, compartilhamentos: x.compartilhamentos, nota: x.nota_viral ?? 0,
          horas: Math.max(1, Math.round((Date.now() - Date.parse(x.postado_em)) / 3.6e6)), hue: hueDe(x.tiktok_id), ritmo: x.ritmo ?? 0, prestes: x.prestes_viralizar,
          cta: x.cta_falado ?? undefined, intencao: x.intencao_compra_pct ?? undefined,
        })),
        hashtags: (h.data ?? []).filter((x: any) => x.coletado_em === ultima).slice(0, 12).map((x: any) => ({ hashtag: x.hashtag, posts: x.posts ?? 0, views: x.views ?? 0, estagio: (x.estagio ?? "steady") as HashtagMercado["estagio"], momento: Math.round(x.momento_pct ?? 0), curva: curvaDe(x.curva) })),
        ctas: (c.data ?? []).map((x: any) => ({ texto: x.texto, tipo: x.tipo ?? "outro", videos: x.videos, perfis: x.perfis, mediaViews: Number(x.media_views ?? 0), nota: Number(x.nota_media ?? 0), intencao: Number(x.intencao_compra ?? 0), variacao: Number(x.variacao_pct ?? 0) })),
        ganchos: (g.data ?? []).map((x: any) => {
          const variacao = x.variacao_pct == null ? null : Number(x.variacao_pct);
          return { id: x.gancho_id, texto: x.texto, usos: Number(x.videos), views: Number(x.media_views) * Number(x.videos), media: Number(x.media_views ?? 0), variacao,
            status: variacao === null ? "novo" : variacao >= 15 ? "subindo" : variacao <= -15 ? "caindo" : "estavel", meses: [], mensal: [], nicho: TIPO_GANCHO[x.tipo] ?? undefined } as ItemRanking;
        }),
      });
    })();
    return () => { vivo = false; };
  }, [modoReal, nicho, periodo]);
  return m;
}

/* ---------------- seções ---------------- */
const ESTAGIO: Record<string, { l: string; c: string }> = {
  rising: { l: "Subindo", c: "bg-success/15 text-success" }, peaking: { l: "No pico", c: "bg-warning/15 text-warning" },
  steady: { l: "Estável", c: "bg-muted text-muted-foreground" }, declining: { l: "Caindo", c: "bg-destructive/10 text-destructive" },
};

function Curva({ v }: { v: number[] }) {
  if (v.length < 2) return null;
  const max = Math.max(...v), min = Math.min(...v);
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * 100},${30 - ((y - min) / (max - min || 1)) * 26 - 2}`).join(" ");
  return <svg viewBox="0 0 100 30" className="h-7 w-20 shrink-0" preserveAspectRatio="none" aria-hidden><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-primary" /></svg>;
}

function Secao({ id, icon: Icon, titulo, explica, children }: { id: string; icon: React.ElementType; titulo: string; explica: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 space-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4 text-primary" /> {titulo}</h2>
      <p className="text-sm text-muted-foreground">{explica}</p>
      {children}
    </section>
  );
}

const Vazio = ({ children }: { children: React.ReactNode }) => <Card className="p-6 text-center text-sm text-muted-foreground">{children}</Card>;

function HashtagsAlta({ lista }: { lista: HashtagMercado[] }) {
  return (
    <Secao id="hashtags" icon={Hash} titulo="Hashtags em alta no Brasil" explica="Do TikTok Creative Center, a ferramenta oficial do TikTok. Atualiza todo dia; a linha mostra as últimas semanas.">
      {lista.length === 0 ? <Vazio>As hashtags chegam na primeira coleta do robô, às 3h da manhã.</Vazio> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {lista.map((h) => (
            <Card key={h.hashtag} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">#{h.hashtag}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", (ESTAGIO[h.estagio] ?? ESTAGIO.steady).c)}>{(ESTAGIO[h.estagio] ?? ESTAGIO.steady).l}{h.momento ? ` ${h.momento > 0 ? "+" : ""}${h.momento}%` : ""}</span>
                  {h.posts > 0 && <span className="tabular-nums">{fmtNum(h.posts)} vídeos · {fmtNum(h.views)} views</span>}
                </p>
              </div>
              <Curva v={h.curva} />
            </Card>
          ))}
        </div>
      )}
    </Secao>
  );
}

function ViraisLista({ lista }: { lista: ViralMercado[] }) {
  const ord = [...lista].sort((a, b) => b.nota - a.nota).slice(0, 12);
  return (
    <Secao id="virais" icon={TrendingUp} titulo="Vídeos que viralizaram" explica={<>Postados nos últimos 3 dias. A <b className="text-foreground">nota de viral</b> compara as views com o normal do perfil: 15x = fez 15 vezes mais que de costume.</>}>
      {ord.length === 0 && <Vazio>Nenhum vídeo viral neste nicho ainda. Os vídeos são coletados toda segunda e quinta.</Vazio>}
      {ord.map((v) => (
        <Card key={v.id} className="flex gap-3 p-3 sm:p-4">
          <div className="relative aspect-[9/16] w-14 shrink-0 self-start overflow-hidden rounded-lg sm:w-16" style={{ backgroundImage: `linear-gradient(160deg, oklch(0.6 0.15 ${v.hue}), oklch(0.3 0.08 ${v.hue}))` }}>
            <span className="absolute inset-x-1 bottom-1 rounded bg-black/50 text-center text-[10px] font-bold text-white tabular-nums">{fmtNum(v.views)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="break-words font-medium">“{v.gancho}”</p>
              <span className="brand-gradient shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white tabular-nums">{String(v.nota).replace(".", ",")}x</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.legenda}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{TIPO_GANCHO[v.tipo] ?? v.tipo}</span>
              {v.produto && <span>{v.produto}</span>}<span>{v.perfil}</span>
              <span className="tabular-nums">{fmtNum(v.curtidas)} curtidas · {fmtNum(v.compartilhamentos)} compart.</span>
              <span>há {v.horas} h</span>
              <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ver no TikTok <ExternalLink className="size-3" /></a>
            </div>
            {v.cta && <p className="mt-1.5 text-[11px] text-muted-foreground">CTA: <span className="text-foreground">“{v.cta}”</span>{v.intencao != null ? ` · ${v.intencao}% querem comprar` : ""}</p>}
          </div>
        </Card>
      ))}
    </Secao>
  );
}

function PrestesLista({ lista }: { lista: ViralMercado[] }) {
  const ord = lista.filter((v) => v.prestes && v.horas <= 72).sort((a, b) => (b.ritmo ?? 0) - (a.ritmo ?? 0));
  return (
    <Secao id="prestes" icon={Rocket} titulo="Prestes a viralizar" explica={<>Postados há menos de 3 dias e crescendo bem mais rápido que o normal do perfil. O robô mede de novo todo dia: <b className="text-foreground">9x</b> = ganhando views 9 vezes mais rápido que de costume.</>}>
      {ord.length === 0 && <Vazio>Nada acelerando neste nicho agora. Melhor dizer isso do que inventar tendência.</Vazio>}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
        {ord.map((v) => (
          <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="w-64 shrink-0 rounded-xl border bg-card p-3 hover:bg-accent/40 sm:w-auto">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 font-bold text-success tabular-nums">{v.ritmo}x mais rápido</span>
              <span className="shrink-0">há {v.horas} h</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium">“{v.gancho}”</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground tabular-nums">{[v.produto, `${fmtNum(v.views)} views`, v.perfil].filter(Boolean).join(" · ")}</p>
          </a>
        ))}
      </div>
    </Secao>
  );
}

function CtasAlta({ lista }: { lista: CtaMercado[] }) {
  const ord = [...lista].sort((a, b) => b.intencao - a.intencao || b.nota - a.nota);
  return (
    <Secao id="ctas" icon={Megaphone} titulo="CTAs que mais vendem" explica={<>A chamada do final do vídeo. A <b className="text-foreground">intenção de compra</b> é a parte dos comentários que pergunta onde comprar, o preço ou pede o link. Só entram CTAs usados por 2 ou mais perfis.</>}>
      {ord.length === 0 && <Vazio>Ainda não há CTAs confirmados por 2 perfis neste nicho.</Vazio>}
      {ord.map((c, n) => (
        <Card key={c.texto} className="flex items-start gap-3 p-3 sm:p-4">
          <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">{n + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">“{c.texto}”</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{TIPO_CTA[c.tipo] ?? c.tipo}</span>
              <span className="tabular-nums">{c.videos} vídeos · {c.perfis} perfis · {fmtNum(c.mediaViews)} views em média</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold tabular-nums">{c.intencao}%</p>
            <p className="text-[10px] text-muted-foreground">querem comprar</p>
            <p className={cn("flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums", c.variacao >= 0 ? "text-success" : "text-destructive")}>
              {c.variacao >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(c.variacao)}%
            </p>
          </div>
        </Card>
      ))}
    </Secao>
  );
}

/* ---------------- pesquisa ---------------- */
function PesquisarTikTok() {
  const { modoReal } = useStore();
  const [tema, setTema] = React.useState("");
  const [dias, setDias] = React.useState<7 | 30>(30);
  const [carregando, setCarregando] = React.useState(false);
  const [res, setRes] = React.useState<ResultadoPesquisa | null>(null);
  const [erro, setErro] = React.useState("");

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (tema.trim().length < 2 || carregando) return;
    setCarregando(true); setErro("");
    try {
      if (!modoReal || !supabase) { await new Promise((r) => setTimeout(r, 600)); setRes(pesquisaDemo(tema.trim(), dias)); return; }
      const { data, error } = await supabase.functions.invoke("mercado-pesquisar", { body: { tema, dias } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const d = ctx ? await ctx.json().catch(() => null) : null;
        setErro(d?.erro ?? "não deu certo, tente de novo"); setRes(null);
      } else setRes(data as ResultadoPesquisa);
    } catch { setErro("sem conexão, tente de novo"); } finally { setCarregando(false); }
  }

  return (
    <Card className="space-y-3 border-primary/30 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><Search className="size-4 text-primary" /> Pesquisar um produto no TikTok</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Digite o produto. A pesquisa descobre o nicho dele e mostra os vídeos que mais estão andando, com os ganchos e CTAs que esses vídeos usam de verdade.</p>
      </div>
      <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
        <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: relógio smartwatch, bola de futebol, sérum facial" maxLength={60} className="flex-1" aria-label="Produto ou tema" />
        <div className="flex gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border p-1 sm:flex-none">
            {([7, 30] as const).map((n) => <button type="button" key={n} onClick={() => setDias(n)} className={cn("rounded-md px-3 py-1 text-sm", dias === n ? "bg-accent font-semibold" : "text-muted-foreground")}>{n} dias</button>)}
          </div>
          <Button type="submit" disabled={carregando || tema.trim().length < 2}>{carregando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Pesquisar</Button>
        </div>
      </form>
      {carregando && <p className="text-xs text-muted-foreground">Buscando no TikTok e lendo os vídeos. Leva até 1 minuto e meio.</p>}
      {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {res && (
        <div className="space-y-4 border-t pt-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {res.nicho && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">Nicho: {res.nicho}</span>}
            <span>{res.total} vídeos sobre <b className="text-foreground">{res.tema}</b> nos últimos {res.dias} dias</span>
            {res.cache && <span>· pesquisa de hoje, já pronta</span>}{res.demo && <span>· exemplo</span>}
            {typeof res.restantes === "number" && <span>· {res.restantes} pesquisas novas restantes hoje</span>}
          </p>
          {res.nada_solido ? (
            <p className="rounded-lg bg-muted/60 px-3 py-3 text-sm">Nada sólido sobre <b>{res.tema}</b> nesse período: poucos vídeos passaram de 1.000 views. Tente o nome mais comum do produto ou o período de 30 dias.</p>
          ) : <>
            {res.resumo && <p className="rounded-lg bg-accent px-3 py-2.5 text-sm"><Sparkles className="mr-1 inline size-3.5 text-primary" />{res.resumo}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {([["Ganchos desses vídeos", res.ganchos, TIPO_GANCHO], ["CTAs desses vídeos", res.ctas, TIPO_CTA]] as const).map(([t, grupos, rot]) => (
                <div key={t} className="space-y-1.5">
                  <p className="text-sm font-semibold">{t}</p>
                  {grupos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum encontrado.</p>}
                  {grupos.slice(0, 4).map((g) => (
                    <div key={g.tipo} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{rot[g.tipo] ?? g.tipo}</span>
                        <span className="tabular-nums">{g.videos} {g.videos === 1 ? "vídeo" : "vídeos"} · {fmtNum(g.media_views)} views{g.confirmado ? "" : " · 1 perfil só"}</span>
                      </div>
                      {(g.exemplos?.length ? g.exemplos : [g.exemplo]).map((x) => <p key={x} className="mt-1 text-sm">“{x}”</p>)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {!!res.ganchos_nicho?.length && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Ganchos que mais rendem no nicho {res.nicho} (30 dias)</p>
                {res.ganchos_nicho.map((g) => <p key={g.texto} className="rounded-lg border px-3 py-2 text-sm">“{g.texto}” <span className="text-[11px] text-muted-foreground">· {TIPO_GANCHO[g.tipo] ?? g.tipo} · {g.perfis} perfis · {fmtNum(Number(g.media_views))} views</span></p>)}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Vídeos mais rápidos</p>
              {res.videos.map((v) => {
                const horas = Math.max(1, Math.round(((res.demo ? HOJE.getTime() : Date.now()) - new Date(v.postado_em).getTime()) / 3600e3));
                return (
                  <a key={v.tiktok_id} href={v.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg border p-2.5 hover:bg-accent/40">
                    <span className="mt-0.5 w-12 shrink-0 text-center text-xs font-bold leading-tight tabular-nums">{fmtNum(v.views)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{v.gancho ? `“${v.gancho}”` : v.legenda}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>{v.perfil}</span><span>há {horas < 48 ? `${horas} h` : `${Math.round(horas / 24)} dias`}</span>
                        <span className="tabular-nums">engajamento {v.nota_engajamento}/100</span>
                        {v.prestes_viralizar && <span className="font-semibold text-success">acelerando {v.ritmo}x</span>}
                      </p>
                      {v.cta && <p className="mt-0.5 text-[11px] text-muted-foreground">CTA: “{v.cta}”</p>}
                    </div>
                    <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                );
              })}
            </div>
          </>}
        </div>
      )}
    </Card>
  );
}

/* ---------------- tela Em alta ---------------- */
const IR_PARA = [["prestes", "Prestes a viralizar"], ["virais", "Virais"], ["ganchos", "Ganchos"], ["ctas", "CTAs"], ["hashtags", "Hashtags"]] as const;

export function EmAlta() {
  const { textos, adicionarTextos } = useTextos();
  const [fonte, setFonte] = React.useState<"mercado" | "comunidade" | "meus">("mercado");
  const [periodo, setPeriodo] = React.useState<Periodo>("30d");
  const [nicho, setNicho] = React.useState("todos");
  const m = useMercado(nicho, periodo);
  const itens = fonte === "meus" ? textos.filter((x) => x.tipo === "gancho") : COMUNIDADE.filter((x) => nicho === "todos" || nomeNicho(nicho).startsWith(x.nicho) || x.nicho === "Geral");
  const rankingLocal = React.useMemo(() => rankear(itens, periodo, fonte === "meus" ? 1 : 40), [itens, periodo, fonte]);
  const ranking = fonte === "mercado" ? m.ganchos : rankingLocal;
  const subindo = ranking.filter((x) => x.status !== "caindo");
  const caindo = ranking.filter((x) => x.status === "caindo");
  const naBib = (t: string) => textos.some((x) => x.tipo === "gancho" && x.texto.toLowerCase() === t.toLowerCase());
  const salvar = (t: string) => { adicionarTextos("gancho", [t], null, "viral"); toast.success("Gancho salvo em Ganchos e Legendas", { description: "Já entra como referência nos próximos vídeos." }); };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border bg-muted/40 p-1.5" role="tablist">
        {([["mercado", "TikTok Brasil", "Todo mundo que posta"], ["comunidade", "Comunidade", "Quem usa o EditaJá"], ["meus", "Meus vídeos", "Só o que você postou"]] as const).map(([id, t, d]) => (
          <button key={id} role="tab" aria-selected={fonte === id} onClick={() => setFonte(id)} className={cn("rounded-xl px-2 py-2 text-center sm:text-left sm:px-3", fonte === id ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/60")}>
            <span className="block text-xs font-semibold sm:text-sm">{t}</span><span className="block text-[10px] text-muted-foreground sm:text-xs">{d}</span>
          </button>
        ))}
      </div>

      {fonte === "mercado" && <PesquisarTikTok />}

      <Card className="space-y-3 p-4">
        {fonte !== "meus" && (
          <div className="grid gap-2">
            <Label>Nicho</Label>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip ativo={nicho === "todos"} onClick={() => setNicho("todos")}>Todos</Chip>
              {NICHOS.map((n) => <Chip key={n.id} ativo={nicho === n.id} onClick={() => setNicho(n.id)}>{n.nome}</Chip>)}
            </div>
          </div>
        )}
        <div className="grid gap-2">
          <Label>Período dos ganchos e CTAs</Label>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
            {(Object.keys(PERIODOS) as Periodo[]).filter((p) => fonte !== "mercado" || p !== "epoca").map((p) => <Chip key={p} ativo={periodo === p} onClick={() => setPeriodo(p)}>{PERIODOS[p].label}</Chip>)}
          </div>
          <p className="text-xs text-muted-foreground">{PERIODOS[periodo].dica} A seta compara com o período anterior do mesmo tamanho.</p>
        </div>
        {(m.demo || fonte !== "mercado") && <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">{fonte === "mercado" ? "Números de exemplo. Com o robô ligado, atualiza toda madrugada com os vídeos do TikTok Brasil." : "Números de exemplo até os vídeos publicados terem views medidas."}</p>}
      </Card>

      {fonte === "mercado" && (
        <div className="sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background/90 px-4 py-2 backdrop-blur scrollbar-none sm:top-16 sm:mx-0 sm:rounded-xl sm:border sm:px-2">
          <span className="shrink-0 self-center pr-1 text-[11px] font-medium text-muted-foreground">Ir para:</span>
          {IR_PARA.map(([id, t]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs font-medium hover:bg-accent">{t}</a>)}
        </div>
      )}

      {m.carregando && fonte === "mercado" ? <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando o mercado…</Card> : <>
        {fonte === "mercado" && <><PrestesLista lista={m.virais} /><ViraisLista lista={m.virais} /></>}

        <Secao id="ganchos" icon={Flame} titulo={fonte === "mercado" ? "Ganchos que mais viralizam" : "Ganchos funcionando agora"} explica={fonte === "mercado" ? "Frases de abertura parecidas contam juntas. Só entram ganchos usados por 2 ou mais perfis. Toque em Salvar para a IA usar nos seus vídeos." : "Os ganchos com mais views por vídeo no período."}>
          {subindo.length === 0 && <Vazio>Ainda não há ganchos com dados suficientes neste período.</Vazio>}
          {subindo.slice(0, 10).map((i, n) => <CardRanking key={i.id} i={i} pos={n + 1} naBiblioteca={fonte === "meus" || naBib(i.texto)} onSalvar={() => salvar(i.texto)} />)}
        </Secao>

        {caindo.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Esfriando</h2>
            <p className="text-sm text-muted-foreground">Funcionaram antes e agora rendem menos. Vale dar um descanso.</p>
            {caindo.map((i, n) => <CardRanking key={i.id} i={i} pos={subindo.length + n + 1} naBiblioteca={fonte === "meus" || naBib(i.texto)} onSalvar={() => salvar(i.texto)} />)}
          </section>
        )}

        {fonte === "mercado" && <><CtasAlta lista={m.ctas} /><HashtagsAlta lista={m.hashtags} /></>}
      </>}
    </div>
  );
}
