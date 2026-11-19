// EditaJá · "Pesquisar no TikTok" dentro da plataforma (tela Em alta). Chamado pelo app com o login do usuário.
// Busca vídeos dos últimos 7/30 dias sobre o produto, detecta o nicho, ordena por velocidade e tira ganchos e CTAs
// dos vídeos reais. Cache de 24 h por tema (vale para todos) e limite de pesquisas novas por usuário por dia.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PISO_VIEWS, analisar, apifySync, detectarNicho, linhaVideo, pontuar, type Video } from "../_shared/mercado.ts";

const LIMITE = Number(Deno.env.get("PESQUISAS_POR_DIA") ?? 5);
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, "content-type": "application/json" } });
const norm = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/#/g, " ").split(/\s+/).filter(Boolean).join(" ").slice(0, 60);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { tema: bruto, dias: d } = await req.json().catch(() => ({}));
  const tema = String(bruto ?? "").trim().slice(0, 60), dias = Number(d) === 7 ? 7 : 30;
  if (tema.length < 2) return json({ erro: "digite um produto ou tema" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const robo = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await usuario.auth.getUser();
  if (!u.user) return json({ erro: "entre na sua conta para pesquisar" }, 401);

  const { data: nichos } = await robo.from("nichos_mercado").select("id,nome,palavras").eq("ativo", true);
  const nicho = detectarNicho(tema, nichos ?? []);
  const tema_norm = norm(tema);
  const { data: cache } = await usuario.rpc("pesquisa_em_cache", { p_tema_norm: tema_norm, p_dias: dias });
  if (cache) return json({ ...cache, cache: true });
  const { data: restantes } = await usuario.rpc("pesquisas_restantes", { p_limite: LIMITE });
  if (!restantes) return json({ erro: `você já fez ${LIMITE} pesquisas novas hoje. Temas que outras pessoas já pesquisaram continuam liberados.` }, 429);
  const { data: linha, error } = await usuario.from("pesquisas_mercado").insert({ tema, tema_norm, dias, nicho_id: nicho?.id ?? null }).select("id").single();
  if (error || !linha) return json({ erro: "não consegui registrar a pesquisa" }, 500);

  const t = norm(tema);
  let itens: any[] = [];
  try {
    itens = await apifySync("clockworks/tiktok-scraper", {
      searchQueries: [t, `${t} review`, `achadinho ${t}`], hashtags: [t.replace(/\s+/g, "")], resultsPerPage: 15, proxyCountryCode: "BR",
      shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false,
    }, 100);
  } catch (e) { return json({ erro: "o TikTok demorou para responder, tente de novo em instantes", detalhe: String(e).slice(0, 200) }, 502); }

  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const vistos = new Map<string, Video>();
  for (const i of itens) { const v = linhaVideo(i, nicho?.id ?? null); if (v && v.views >= PISO_VIEWS && (v.postado_em ?? "") >= desde && !vistos.has(v.tiktok_id)) vistos.set(v.tiktok_id, pontuar(v)); }
  const vs = [...vistos.values()].sort((a, b) => (b.velocidade ?? 0) - (a.velocidade ?? 0));
  const perfis = new Set(vs.map((v) => v.perfil));
  const { data: doNicho } = nicho ? await usuario.rpc("ganchos_do_nicho", { p_nicho: nicho.id, p_dias: 30, p_limite: 6 }) : { data: [] };

  let resultado: Record<string, unknown> = { tema, dias, total: vs.length, gerado_em: new Date().toISOString(), nicho: nicho?.nome ?? null, ganchos_nicho: doNicho ?? [] };
  if (vs.length < 3 || perfis.size < 2) {
    resultado = { ...resultado, nada_solido: true, videos: [], ganchos: [], ctas: [], resumo: "" };
  } else {
    const top = vs.slice(0, 12);
    const { por, resumo } = await analisar(top, `sobre "${tema}" nos últimos ${dias} dias`);
    const lista = top.map((v) => ({ tiktok_id: v.tiktok_id, url: v.url, perfil: v.perfil, legenda: v.legenda, capa_url: v.capa_url, postado_em: v.postado_em, views: v.views,
      curtidas: v.curtidas, comentarios: v.comentarios, compartilhamentos: v.compartilhamentos, nota_viral: v.nota_viral, nota_engajamento: v.nota_engajamento,
      velocidade: v.velocidade, ritmo: v.ritmo, prestes_viralizar: v.prestes_viralizar, ...(por[v.tiktok_id] ?? {}) }));
    const agrupar = (campo: "gancho" | "cta", tipo: "tipo" | "cta_tipo") => {
      const g = new Map<string, { tipo: string; videos: number; perfis: Set<string>; views: number; exemplos: string[] }>();
      for (const x of lista as any[]) {
        if (!x[campo]) continue;
        const k = x[tipo] || "outro"; const e = g.get(k) ?? { tipo: k, videos: 0, perfis: new Set<string>(), views: 0, exemplos: [] as string[] };
        e.videos++; e.perfis.add(x.perfil); e.views += x.views; if (e.exemplos.length < 3 && !e.exemplos.includes(x[campo])) e.exemplos.push(x[campo]); g.set(k, e);
      }
      return [...g.values()].map((e) => ({ tipo: e.tipo, videos: e.videos, perfis: e.perfis.size, media_views: Math.round(e.views / e.videos), exemplo: e.exemplos[0], exemplos: e.exemplos, confirmado: e.perfis.size >= 2 }))
        .sort((a, b) => Number(b.confirmado) - Number(a.confirmado) || b.media_views - a.media_views);
    };
    resultado = { ...resultado, nada_solido: false, videos: lista, ganchos: agrupar("gancho", "tipo"), ctas: agrupar("cta", "cta_tipo"), resumo };
  }
  await robo.from("pesquisas_mercado").update({ resultado }).eq("id", linha.id);
  return json({ ...resultado, restantes: restantes - 1 });
});
