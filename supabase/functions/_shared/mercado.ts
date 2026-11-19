// EditaJá · lógica do "Em alta" (TikTok Brasil) compartilhada pelas Edge Functions mercado-robo e mercado-pesquisar.
// Notas inspiradas na skill last30days (MIT): engajamento em escala log, velocidade com peso de recência,
// piso de 1.000 views, "nada sólido" e confirmação por 2+ perfis.

export const PISO_VIEWS = 1000;
export const TIPOS = ["alerta", "preco", "teste", "surpresa", "pergunta", "antes_depois", "outro"] as const;
export const TIPOS_CTA = ["carrinho", "cupom", "urgencia", "comentar", "seguir", "link_bio", "outro"] as const;

// ---------------------------------------------------------------- Apify
const APIFY = "https://api.apify.com/v2";
const tok = () => { const t = Deno.env.get("APIFY_TOKEN"); if (!t) throw new Error("APIFY_TOKEN não configurado"); return t; };
const ator = (a: string) => a.replace("/", "~");

export async function apifySync(a: string, input: unknown, timeout = 110): Promise<any[]> {
  const r = await fetch(`${APIFY}/acts/${ator(a)}/run-sync-get-dataset-items?token=${tok()}&timeout=${timeout}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout((timeout + 15) * 1000),
  });
  if (!r.ok) throw new Error(`Apify ${a}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}
export async function apifyIniciar(a: string, input: unknown): Promise<{ id: string; dataset: string }> {
  const r = await fetch(`${APIFY}/acts/${ator(a)}/runs?token=${tok()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify ${a}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()).data; return { id: d.id, dataset: d.defaultDatasetId };
}
export async function apifyStatus(run: string): Promise<string> {
  const r = await fetch(`${APIFY}/actor-runs/${run}?token=${tok()}`); return (await r.json()).data?.status ?? "UNKNOWN";
}
export async function apifyItens(dataset: string): Promise<any[]> {
  const r = await fetch(`${APIFY}/datasets/${dataset}/items?clean=true&format=json&token=${tok()}`); return r.ok ? await r.json() : [];
}

// ---------------------------------------------------------------- vídeos
export type Video = {
  tiktok_id: string; url: string; perfil: string; nicho_id: string | null; legenda: string | null; hashtags: string[]; musica: string | null;
  capa_url: string | null; duracao_s: number | null; postado_em: string | null; views: number; curtidas: number; compartilhamentos: number;
  comentarios: number; salvos: number; _seguidores?: number; _legenda_auto?: string | null;
  nota_viral?: number; nota_engajamento?: number; velocidade?: number; ritmo?: number; prestes_viralizar?: boolean;
};

export function linhaVideo(i: any, nicho: string | null): Video | null {
  const id = String(i?.id ?? ""); if (!id) return null;
  const a = i.authorMeta ?? {}, m = i.musicMeta ?? {}, vm = i.videoMeta ?? {};
  const sub = (vm.subtitleLinks ?? []).find((s: any) => String(s.language ?? "").toLowerCase().startsWith("por"));
  return {
    tiktok_id: id, url: i.webVideoUrl ?? "", perfil: "@" + (a.name ?? ""), nicho_id: nicho, legenda: i.text ?? null,
    hashtags: (i.hashtags ?? []).map((h: any) => (typeof h === "string" ? h : h?.name)).filter(Boolean),
    musica: m.musicName ?? null, capa_url: vm.coverUrl ?? null, duracao_s: vm.duration ?? null, postado_em: i.createTimeISO ?? null,
    views: i.playCount ?? 0, curtidas: i.diggCount ?? 0, compartilhamentos: i.shareCount ?? 0, comentarios: i.commentCount ?? 0, salvos: i.collectCount ?? 0,
    _seguidores: a.fans ?? 0, _legenda_auto: sub?.downloadLink ?? null,
  };
}

const l1p = (x?: number | null) => Math.log1p(Math.max(0, x ?? 0));
export function notaEngajamento(v: Video) {
  const bruto = 0.45 * l1p(v.views) + 0.27 * l1p(v.curtidas) + 0.18 * l1p(v.comentarios) + 0.10 * l1p((v.compartilhamentos ?? 0) + (v.salvos ?? 0));
  return Math.round(100 * Math.max(0, Math.min(1, (bruto - 2.1) / (11.5 - 2.1))));
}
export const horas = (v: Video) => { const t = Date.parse(v.postado_em ?? ""); return isNaN(t) ? 720 : Math.max(1, (Date.now() - t) / 3.6e6); };
export function velocidade(v: Video) { const d = horas(v) / 24; return Math.round(notaEngajamento(v) / Math.sqrt(Math.floor(d) + 1) * (d < 7 ? 1.5 : 1) * 100) / 100; }
export function ritmo(v: Video, mediana: number, viewsOntem?: number) {
  const normal = Math.max(mediana, 1) / 72;
  return Math.round(((viewsOntem != null ? Math.max(0, v.views - viewsOntem) / 24 : v.views / horas(v)) / normal) * 100) / 100;
}
export const prestes = (v: Video) => horas(v) <= 72 && v.views >= PISO_VIEWS && (v.ritmo ?? 0) >= 3;
export function pontuar(v: Video, mediana?: number) {
  const base = mediana || Math.max(v._seguidores ?? 0, 1000) / 10;
  v.nota_viral = Math.round((v.views / Math.max(base, 1)) * 100) / 100;
  v.nota_engajamento = notaEngajamento(v); v.velocidade = velocidade(v); v.ritmo = ritmo(v, base); v.prestes_viralizar = prestes(v);
  return v;
}

// ---------------------------------------------------------------- fala (legenda automática WebVTT)
export async function falas(link?: string | null): Promise<{ inicio: string; fim: string }> {
  if (!link) return { inicio: "", fim: "" };
  let vtt = "";
  try { vtt = await (await fetch(link, { signal: AbortSignal.timeout(8000) })).text(); } catch { return { inicio: "", fim: "" }; }
  const seg = (t: string) => t.trim().replace(",", ".").split(":").map(Number).reverse().reduce((a, x, i) => a + x * 60 ** i, 0);
  const deixas: [number, number, string][] = [];
  for (const b of vtt.replace(/\r/g, "").split("\n\n")) {
    const ls = b.trim().split("\n").filter((x) => x && !x.startsWith("WEBVTT"));
    if (ls.length >= 2 && ls[0].includes("-->")) { const [a, z] = ls[0].split("-->"); deixas.push([seg(a), seg(z.trim().split(" ")[0]), ls.slice(1).join(" ")]); }
  }
  if (!deixas.length) return { inicio: "", fim: "" };
  const total = deixas[deixas.length - 1][1];
  return { inicio: deixas.filter(([a]) => a <= 4).map((d) => d[2]).join(" ").slice(0, 300), fim: deixas.filter(([a, b]) => b >= total - 6 && a > 4).map((d) => d[2]).join(" ").slice(0, 300) };
}

// ---------------------------------------------------------------- gancho e CTA (sem IA: regras; com ANTHROPIC_API_KEY: Claude)
const limpar = (t: string) => t.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/@[\w.]+/g, "").replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s+/g, " ").trim();
const CTA_RE = /(carrinho|link|comenta|coment[aá]rio|cupom|desconto|segue|siga|bio|clica|clique|corre|aproveita|compra aqui|garant)/i;
const pedacos = (t: string) => t.split(/#[\p{L}\p{N}_]+|\n|(?<=[.!?])\s+/u).map(limpar).filter((x) => x.length > 3);
export function primeiraFrase(t: string) { const s = pedacos(t); return (s.find((x) => !CTA_RE.test(x)) ?? s[0] ?? "").slice(0, 120); }
export function tipoGancho(t: string): string {
  const s = t.toLowerCase();
  if (/n[aã]o compre|cuidado|falso|falsa|r[eé]plica|golpe|erro|pare de|nunca|ningu[eé]m te conta/.test(s)) return "alerta";
  if (/antes e depois|antes x depois|depois de \d/.test(s)) return "antes_depois";
  if (/testei|teste|usei por|\d+ dias (usando|com)|funciona mesmo/.test(s)) return "teste";
  if (/r\$|reais|barato|pre[cç]o|vale a pena|custa/.test(s)) return "preco";
  if (/olha|chegou|caraca|n[aã]o acredit|uau|gente|socorro|que isso/.test(s)) return "surpresa";
  if (s.includes("?")) return "pergunta";
  return "outro";
}
export function ctaDe(legenda: string, fim: string) {
  const fonte = [limpar(fim), ...pedacos(legenda)].find((x) => CTA_RE.test(x)) ?? "";
  return fonte.slice(0, 120);
}
export function tipoCta(t: string): string {
  const s = t.toLowerCase();
  if (/cupom|desconto|off|promo/.test(s)) return "cupom";
  if (/comenta|coment[aá]rio|escreve/.test(s)) return "comentar";
  if (/acab|[uú]ltimas|estoque|corre|s[oó] hoje|hoje/.test(s)) return "urgencia";
  if (/carrinho|clica|clique|compra/.test(s)) return "carrinho";
  if (/bio/.test(s)) return "link_bio";
  if (/segue|siga|seguir/.test(s)) return "seguir";
  return "outro";
}

type Analise = { gancho: string; tipo: string; cta: string; cta_tipo: string; modelo?: string; cta_modelo?: string; produto?: string };
/** Analisa vídeos: Claude se houver chave, senão regras. Devolve por tiktok_id. */
export async function analisar(vs: Video[], contexto = ""): Promise<{ por: Record<string, Analise>; resumo: string }> {
  const entrada = await Promise.all(vs.map(async (v) => { const f = await falas(v._legenda_auto); return { v, ...f }; }));
  const regras: Record<string, Analise> = {};
  for (const { v, inicio, fim } of entrada) {
    const gancho = (inicio && inicio.length > 8 ? limpar(inicio) : primeiraFrase(v.legenda ?? "")).slice(0, 120);
    const cta = ctaDe(v.legenda ?? "", fim);
    regras[v.tiktok_id] = { gancho, tipo: tipoGancho(gancho), cta, cta_tipo: cta ? tipoCta(cta) : "" };
  }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { por: regras, resumo: "" };
  try {
    const prompt = `Vídeos de TikTok Brasil ${contexto}. Para cada um diga gancho (frase de abertura que prende, use fala_inicial; sem ela a 1ª frase da legenda), ` +
      `modelo (forma geral do gancho sem o nome do produto), tipo (um de ${TIPOS.join(", ")}), produto (2 a 4 palavras), cta (chamada final, vazio se não houver), ` +
      `cta_modelo (forma geral do CTA sem produto nem preço), cta_tipo (um de ${TIPOS_CTA.join(", ")}). Depois escreva resumo: 3 frases curtas e simples dizendo o que está funcionando agora, só com base nestes vídeos.\n` +
      `Vídeos: ${JSON.stringify(entrada.map(({ v, inicio, fim }) => ({ id: v.tiktok_id, views: v.views, legenda: (v.legenda ?? "").slice(0, 300), fala_inicial: inicio, fala_final: fim })))}\n` +
      `Responda só JSON: {"videos":[{"id":"","gancho":"","modelo":"","tipo":"","produto":"","cta":"","cta_modelo":"","cta_tipo":""}],"resumo":""}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }) });
    const txt: string = (await r.json()).content?.[0]?.text ?? "";
    const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    for (const x of j.videos ?? []) if (regras[String(x.id)] && x.gancho) regras[String(x.id)] = { ...regras[String(x.id)], ...x, tipo: TIPOS.includes(x.tipo) ? x.tipo : "outro", cta_tipo: TIPOS_CTA.includes(x.cta_tipo) ? x.cta_tipo : (x.cta ? "outro" : "") };
    return { por: regras, resumo: j.resumo ?? "" };
  } catch { return { por: regras, resumo: "" }; }
}

/** Modelo de frase para agrupar: minúsculo, sem acento, sem números e sem o nome do produto. */
export function modelo(t: string, produto = "") {
  let s = limpar(t).replace(/[.!…]+$/u, "");
  for (const p of produto.toLowerCase().split(/\s+/).filter((w) => w.length > 3)) s = s.replace(new RegExp(`((esse|essa|este|esta|o|a|um|uma|seu|sua)\\s+)?${p}\\S*`, "giu"), "isso");
  s = s.replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- nicho a partir do tema (palavras-chave dos nichos)
export function detectarNicho(tema: string, nichos: { id: string; nome: string; palavras: string[] }[]) {
  const t = tema.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let melhor: { id: string; nome: string } | null = null, pts = 0;
  for (const n of nichos) {
    const p = n.palavras.filter((w) => t.includes(w.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase())).length;
    if (p > pts) { pts = p; melhor = n; }
  }
  return melhor;
}
