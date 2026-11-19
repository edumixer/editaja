// EditaJá · robô diário do "Em alta" (TikTok Brasil). Chamado pelo pg_cron (SQL 008), nunca pelo app.
//  etapa "iniciar"  (03:00 de Brasília): dispara no Apify as coletas do dia (hashtags, re-medição, vídeos por nicho em seg/qui)
//  etapa "processar" (a cada 15 min até 06:45): busca o que ficou pronto, pontua, tira ganchos/CTAs e grava
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PISO_VIEWS, analisar, apifyIniciar, apifyItens, apifyStatus, linhaVideo, modelo, pontuar, ritmo, notaEngajamento, velocidade, prestes, type Video } from "../_shared/mercado.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const DIAS_VIDEOS = (Deno.env.get("DIAS_VIDEOS") ?? "1,4").split(",").map(Number);   // 0=dom … 6=sáb (seg e qui)
const VIDEOS_POR_BUSCA = Number(Deno.env.get("VIDEOS_POR_BUSCA") ?? 30);
const ANALISAR = Number(Deno.env.get("ANALISAR_POR_NICHO") ?? 25);
const TIKTOK = "clockworks/tiktok-scraper";
const INTENCAO = ["onde compr", "onde acho", "link", "quanto", "qual o preço", "qual o valor", "comprei", "chegou", "quero", "carrinho", "cupom", "vende", "qual loja"];

async function registrar(tipo: string, run: { id: string; dataset: string }, extra: Record<string, unknown> = {}) {
  await db.from("execucoes_robo").insert({ tipo, run_id: run.id, dataset_id: run.dataset, ...extra });
}

async function iniciar(forcarVideos = false) {
  const feitos: string[] = [];
  for (const periodo of [7, 30]) {
    await registrar("hashtags", await apifyIniciar("automation-lab/tiktok-trends-scraper", { trendType: "hashtag", countryCode: "BR", period: periodo, maxResults: 100 }), { periodo });
    feitos.push(`hashtags ${periodo}d`);
  }
  const desde = new Date(Date.now() - 4 * 864e5).toISOString();
  const { data: jovens } = await db.from("videos_mercado").select("url").gte("postado_em", desde).gte("views", PISO_VIEWS).order("velocidade", { ascending: false }).limit(60);
  if (jovens?.length) { await registrar("remedir", await apifyIniciar(TIKTOK, { postURLs: jovens.map((j) => j.url), resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false })); feitos.push(`re-medir ${jovens.length}`); }
  const diaBR = new Date(Date.now() - 3 * 3.6e6).getUTCDay();
  if (forcarVideos || DIAS_VIDEOS.includes(diaBR)) {
    const { data: nichos } = await db.from("nichos_mercado").select("*").eq("ativo", true).order("ordem");
    for (const n of nichos ?? []) {
      await registrar("videos", await apifyIniciar(TIKTOK, { hashtags: n.hashtags, searchQueries: n.buscas, resultsPerPage: VIDEOS_POR_BUSCA, proxyCountryCode: "BR",
        shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false }), { nicho_id: n.id });
      feitos.push(`vídeos ${n.id}`);
    }
  }
  return feitos;
}

async function medianas(perfis: string[]) {
  if (!perfis.length) return {} as Record<string, number>;
  const { data } = await db.from("perfis_mercado").select("perfil,mediana_views").in("perfil", perfis);
  return Object.fromEntries((data ?? []).filter((r) => r.mediana_views).map((r) => [r.perfil, r.mediana_views as number]));
}

const sem_ = (v: Video) => Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")));

async function processarVideos(itens: any[], nicho: string) {
  const desde = new Date(Date.now() - 3 * 864e5).toISOString();
  const vistos = new Map<string, Video>();
  for (const i of itens) { const v = linhaVideo(i, nicho); if (v && (v.postado_em ?? "") >= desde && !vistos.has(v.tiktok_id)) vistos.set(v.tiktok_id, v); }
  const vs = [...vistos.values()];
  if (!vs.length) return "0 vídeos";
  const med = await medianas([...new Set(vs.map((v) => v.perfil))]);
  vs.forEach((v) => pontuar(v, med[v.perfil]));
  for (let k = 0; k < vs.length; k += 200) await db.from("videos_mercado").upsert(vs.slice(k, k + 200).map(sem_));
  const hoje = new Date().toISOString().slice(0, 10);
  await db.from("metricas_mercado").upsert(vs.map((v) => ({ tiktok_id: v.tiktok_id, coletado_em: hoje, views: v.views, curtidas: v.curtidas, compartilhamentos: v.compartilhamentos })));
  const fortes = vs.filter((v) => v.views >= PISO_VIEWS).sort((a, b) => Number(b.prestes_viralizar) - Number(a.prestes_viralizar) || (b.velocidade ?? 0) - (a.velocidade ?? 0)).slice(0, ANALISAR);
  const { por } = await analisar(fortes, `do nicho ${nicho}`);
  for (const v of fortes) {
    const a = por[v.tiktok_id]; if (!a?.gancho) continue;
    const g = await db.from("ganchos_mercado").upsert({ texto: a.modelo || modelo(a.gancho, a.produto), tipo: a.tipo, nicho_id: nicho }, { onConflict: "texto" }).select("id").single();
    let cta_id = null;
    if (a.cta) { const c = await db.from("ctas_mercado").upsert({ texto: a.cta_modelo || modelo(a.cta, a.produto), tipo: a.cta_tipo || "outro", nicho_id: nicho }, { onConflict: "texto" }).select("id").single(); cta_id = c.data?.id ?? null; }
    await db.from("videos_mercado").update({ gancho_falado: a.gancho, produto: a.produto ?? null, gancho_id: g.data?.id ?? null, cta_falado: a.cta || null, cta_id, analisado_em: new Date().toISOString() }).eq("tiktok_id", v.tiktok_id);
  }
  const semMediana = [...new Set(fortes.map((v) => v.perfil))].filter((p) => !med[p] && p !== "@").slice(0, 40);
  if (semMediana.length) await registrar("perfis", await apifyIniciar(TIKTOK, { profiles: semMediana.map((p) => p.slice(1)), resultsPerPage: 10, profileScrapeSections: ["videos"], profileSorting: "latest", shouldDownloadVideos: false, shouldDownloadCovers: false }), { nicho_id: nicho });
  const paraComentar = fortes.slice(0, 15).map((v) => v.url).filter(Boolean);
  if (paraComentar.length) await registrar("comentarios", await apifyIniciar("clockworks/tiktok-comments-scraper", { postURLs: paraComentar, commentsPerPost: 40 }), { nicho_id: nicho }).catch(() => {});
  return `${vs.length} vídeos, ${fortes.length} analisados`;
}

async function processarPerfis(itens: any[]) {
  const por: Record<string, number[]> = {}, segs: Record<string, number> = {};
  for (const i of itens) { const p = "@" + (i.authorMeta?.name ?? ""); (por[p] ??= []).push(i.playCount ?? 0); segs[p] = i.authorMeta?.fans ?? 0; }
  const linhas = Object.entries(por).filter(([p, v]) => p !== "@" && v.length).map(([perfil, v]) => {
    const s = [...v].sort((a, b) => a - b); return { perfil, seguidores: segs[perfil], mediana_views: s[Math.floor(s.length / 2)], atualizado_em: new Date().toISOString() };
  });
  if (linhas.length) await db.from("perfis_mercado").upsert(linhas);
  // recalcula a nota de viral dos vídeos recentes desses perfis com a mediana real
  const desde = new Date(Date.now() - 7 * 864e5).toISOString();
  for (const l of linhas) {
    const { data: vs } = await db.from("videos_mercado").select("tiktok_id,views,curtidas,comentarios,compartilhamentos,salvos,postado_em").eq("perfil", l.perfil).gte("postado_em", desde);
    for (const v of (vs ?? []) as Video[]) {
      v.ritmo = ritmo(v, l.mediana_views);
      await db.from("videos_mercado").update({ nota_viral: Math.round(v.views / Math.max(l.mediana_views, 1) * 100) / 100, ritmo: v.ritmo, prestes_viralizar: prestes(v) }).eq("tiktok_id", v.tiktok_id);
    }
  }
  return `${linhas.length} perfis`;
}

async function processarRemedir(itens: any[]) {
  const ids = itens.map((i) => String(i.id)).filter(Boolean);
  const { data: antes } = await db.from("videos_mercado").select("tiktok_id,perfil,views,postado_em").in("tiktok_id", ids);
  const ant = Object.fromEntries((antes ?? []).map((a) => [a.tiktok_id, a]));
  const med = await medianas([...new Set((antes ?? []).map((a) => a.perfil))]);
  const hoje = new Date().toISOString().slice(0, 10);
  for (const i of itens) {
    const a = ant[String(i.id)]; if (!a) continue;
    const v = { ...a, views: i.playCount ?? 0, curtidas: i.diggCount ?? 0, comentarios: i.commentCount ?? 0, compartilhamentos: i.shareCount ?? 0, salvos: i.collectCount ?? 0 } as Video;
    const base = med[a.perfil] ?? 1000;
    v.ritmo = ritmo(v, base, a.views);
    await db.from("videos_mercado").update({ views: v.views, curtidas: v.curtidas, comentarios: v.comentarios, compartilhamentos: v.compartilhamentos, salvos: v.salvos, ritmo: v.ritmo,
      nota_engajamento: notaEngajamento(v), velocidade: velocidade(v), prestes_viralizar: prestes(v), nota_viral: Math.round(v.views / Math.max(base, 1) * 100) / 100 }).eq("tiktok_id", a.tiktok_id);
    await db.from("metricas_mercado").upsert({ tiktok_id: a.tiktok_id, coletado_em: hoje, views: v.views, curtidas: v.curtidas, compartilhamentos: v.compartilhamentos });
  }
  return `${itens.length} re-medidos`;
}

async function processarComentarios(itens: any[]) {
  const por: Record<string, string[]> = {};
  for (const c of itens) { const u = String(c.videoWebUrl ?? c.postUrl ?? "").split("?")[0]; (por[u] ??= []).push(String(c.text ?? "").toLowerCase()); }
  let n = 0;
  for (const [url, ts] of Object.entries(por)) {
    if (ts.length < 5) continue;
    const pct = Math.round(1000 * ts.filter((t) => INTENCAO.some((p) => t.includes(p))).length / ts.length) / 10;
    await db.from("videos_mercado").update({ intencao_compra_pct: pct }).like("url", `${url}%`); n++;
  }
  return `${n} vídeos com intenção de compra`;
}

async function processarHashtags(itens: any[], periodo: number) {
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = itens.filter((i) => i.name).map((i) => ({
    coletado_em: hoje, periodo, pais: "BR", hashtag: String(i.name).replace(/^#/, "").toLowerCase(), posicao: i.rank, posts: i.publishedVideoCount, views: i.videoViews,
    tendencia: i.trend, estagio: i.trendStage, momento_pct: i.momentumPct, curva: i.popularityCurve, setores: (i.industries ?? []).map((s: any) => (typeof s === "string" ? s : s?.name)),
  }));
  if (linhas.length) await db.from("hashtags_mercado").upsert(linhas);
  return `${linhas.length} hashtags`;
}

async function processar() {
  const inicio = Date.now(), log: string[] = [];
  const { data: abertas } = await db.from("execucoes_robo").select("*").eq("status", "rodando").order("criado_em").limit(20);
  for (const e of abertas ?? []) {
    if (Date.now() - inicio > 100_000) break;   // folga para o limite da Edge Function
    const st = await apifyStatus(e.run_id);
    if (["RUNNING", "READY"].includes(st)) continue;
    if (st !== "SUCCEEDED") { await db.from("execucoes_robo").update({ status: "falhou", erro: st, processado_em: new Date().toISOString() }).eq("id", e.id); continue; }
    try {
      const itens = await apifyItens(e.dataset_id);
      const r = e.tipo === "videos" ? await processarVideos(itens, e.nicho_id) : e.tipo === "perfis" ? await processarPerfis(itens)
        : e.tipo === "remedir" ? await processarRemedir(itens) : e.tipo === "comentarios" ? await processarComentarios(itens) : await processarHashtags(itens, e.periodo);
      await db.from("execucoes_robo").update({ status: "pronto", processado_em: new Date().toISOString(), erro: null }).eq("id", e.id);
      log.push(`${e.tipo}${e.nicho_id ? " " + e.nicho_id : ""}: ${r}`);
    } catch (err) {
      await db.from("execucoes_robo").update({ status: "falhou", erro: String(err).slice(0, 500), processado_em: new Date().toISOString() }).eq("id", e.id);
    }
  }
  return log;
}

Deno.serve(async (req) => {
  const { data: cfg } = await db.from("config_robo").select("valor").eq("chave", "token").single();
  if (!cfg || req.headers.get("x-robo-token") !== cfg.valor) return new Response("sem permissão", { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const r = body.etapa === "iniciar" ? await iniciar(!!body.forcar_videos) : await processar();
    return Response.json({ ok: true, r });
  } catch (e) { return Response.json({ ok: false, erro: String(e) }, { status: 500 }); }
});
