/**
 * Ganchos em alta: quantos vídeos usaram cada gancho e quantas views fizeram, por período e por época do ano.
 * No modo real os números vêm de metricas_video (ranking_ganchos / ranking_comunidade no Supabase).
 * No modo demonstração geramos uma série semanal fixa por gancho, com sazonalidade plausível.
 */

export type Periodo = "7d" | "30d" | "90d" | "epoca";
export const PERIODOS: Record<Periodo, { label: string; curto: string; semanas: number; dica: string }> = {
  "7d": { label: "Últimos 7 dias", curto: "7 dias", semanas: 1, dica: "O que está funcionando nesta semana." },
  "30d": { label: "Últimos 30 dias", curto: "30 dias", semanas: 4, dica: "O que está funcionando neste mês." },
  "90d": { label: "Últimos 3 meses", curto: "3 meses", semanas: 13, dica: "Ganchos fortes e constantes." },
  epoca: { label: "Esta época, ano passado", curto: "Ano passado", semanas: 6, dica: "O que funcionou nesta mesma época no ano passado (ex.: Black Friday, Natal, volta às aulas)." },
};

export const HOJE = new Date("2026-11-16T12:00:00");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Semana = { inicio: Date; usos: number; views: number };

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }

/** Formato da curva de cada gancho: picos em datas do varejo, alta recente, queda recente ou estável. */
function perfil(texto: string): (mes: number, semanasAtras: number) => number {
  const t = texto.toLowerCase();
  if (/black|promo|desconto|oferta|natal|presente/.test(t)) return (m) => (m === 10 ? 3.2 : m === 11 ? 2.4 : m === 4 ? 1.3 : 0.6);
  if (/falso|falsa|cuidado|golpe|original|réplica/.test(t)) return (m, w) => (m >= 9 ? 1.9 : 1) * (w < 8 ? 1.5 : 1);
  if (/ninguém|viralizou|tiktok/.test(t)) return (_m, w) => (w < 10 ? 0.45 : w < 30 ? 1.4 : 1);   // cansou: esfriando
  if (/verão|sol|praia|calor/.test(t)) return (m) => (m === 11 || m <= 1 ? 2.6 : 0.5);
  if (/volta às aulas|escola/.test(t)) return (m) => (m === 0 || m === 1 || m === 6 ? 2.5 : 0.5);
  if (/chegou|testei|não acreditei|olha/.test(t)) return (_m, w) => (w < 6 ? 1.6 : 1);
  return () => 1;
}

/** 104 semanas (2 anos) terminando hoje. escala: 1 = um criador; comunidade usa escala maior. */
export function serie(texto: string, escala = 1): Semana[] {
  const r = rnd(hash(texto)); const f = perfil(texto);
  const base = 2500 + r() * 9000; const freq = 0.25 + r() * 0.9;
  return Array.from({ length: 104 }, (_, i) => {
    const atras = 103 - i;
    const inicio = new Date(HOJE); inicio.setDate(inicio.getDate() - atras * 7 - 6);
    const k = f(inicio.getMonth(), atras) * (0.75 + r() * 0.5);
    const usos = Math.max(0, Math.round(freq * escala * k * (0.6 + r() * 0.8)));
    return { inicio, usos, views: Math.round(usos * base * k * (0.7 + r() * 0.6)) };
  });
}

function janela(s: Semana[], periodo: Periodo) {
  const n = PERIODOS[periodo].semanas;
  if (periodo === "epoca") { const fim = s.length - 52 + 3; return { atual: s.slice(fim - n, fim), anterior: s.slice(fim - 2 * n, fim - n) }; }
  return { atual: s.slice(-n), anterior: s.slice(-2 * n, -n) };
}

const somar = (xs: Semana[]) => xs.reduce((a, x) => ({ usos: a.usos + x.usos, views: a.views + x.views }), { usos: 0, views: 0 });

/** Os 2 meses em que o gancho rendeu mais views por vídeo nos últimos 12 meses. */
function melhoresMeses(s: Semana[]) {
  const porMes = new Map<number, { usos: number; views: number }>();
  s.slice(-52).forEach((x) => { const m = x.inicio.getMonth(); const a = porMes.get(m) ?? { usos: 0, views: 0 }; porMes.set(m, { usos: a.usos + x.usos, views: a.views + x.views }); });
  const med = [...porMes.entries()].filter(([, v]) => v.usos > 0).map(([m, v]) => [m, v.views / v.usos] as const);
  const geral = med.reduce((a, [, v]) => a + v, 0) / (med.length || 1);
  const top = med.sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, v]) => v > geral * 1.25).map(([m]) => m).sort((a, b) => a - b);
  return top.map((m) => MESES[m]);
}

export type StatusTendencia = "subindo" | "estavel" | "caindo" | "novo";
export type ItemRanking = {
  id: string; texto: string; usos: number; views: number; media: number; variacao: number | null;
  status: StatusTendencia; meses: string[]; mensal: number[]; criadores?: number; nicho?: string; produtoId?: string | null;
};

export function rankear(itens: { id: string; texto: string; nicho?: string; produtoId?: string | null; criadores?: number }[], periodo: Periodo, escala = 1): ItemRanking[] {
  return itens.map((it) => {
    const s = serie(it.texto, escala); const { atual, anterior } = janela(s, periodo);
    const a = somar(atual), b = somar(anterior);
    const media = a.usos ? a.views / a.usos : 0, mediaAnt = b.usos ? b.views / b.usos : 0;
    const variacao = mediaAnt ? Math.round(((media - mediaAnt) / mediaAnt) * 100) : null;
    const status: StatusTendencia = variacao === null ? "novo" : variacao >= 15 ? "subindo" : variacao <= -15 ? "caindo" : "estavel";
    const ano = s.slice(-52);
    const mensal = Array.from({ length: 12 }, (_, m) => { const x = somar(ano.slice(Math.floor((m * 52) / 12), Math.floor(((m + 1) * 52) / 12))); return x.usos ? x.views / x.usos : 0; });
    return { ...it, usos: a.usos, views: a.views, media, variacao, status, meses: melhoresMeses(s), mensal };
  }).filter((x) => x.usos > 0).sort((x, y) => y.media * Math.log2(y.usos + 1) - x.media * Math.log2(x.usos + 1));
}

/** Ganchos usados por várias contas da plataforma (anônimo: só o texto e quantos criadores). Exemplo para a demonstração. */
export const COMUNIDADE: { id: string; texto: string; nicho: string; criadores: number }[] = [
  { id: "k1", texto: "Não compre antes de ver isso", nicho: "Geral", criadores: 214 },
  { id: "k2", texto: "Original x falso: você saberia diferenciar?", nicho: "Moda", criadores: 96 },
  { id: "k3", texto: "Black Friday: o achado que eu mais usei no ano", nicho: "Geral", criadores: 158 },
  { id: "k4", texto: "Testei por 7 dias e olha o resultado", nicho: "Beleza", criadores: 131 },
  { id: "k5", texto: "Cuidado com essa réplica", nicho: "Moda", criadores: 74 },
  { id: "k6", texto: "Ninguém te conta isso sobre", nicho: "Geral", criadores: 302 },
  { id: "k7", texto: "Esse viralizou no TikTok e eu precisava testar", nicho: "Beleza", criadores: 188 },
  { id: "k8", texto: "O presente perfeito de Natal por menos de 100", nicho: "Geral", criadores: 67 },
  { id: "k9", texto: "Chegou e eu não acreditei", nicho: "Eletrônicos", criadores: 119 },
  { id: "k10", texto: "Esse relógio faz o que o de 2 mil faz", nicho: "Eletrônicos", criadores: 53 },
  { id: "k11", texto: "Protetor que não deixa a pele branca no verão", nicho: "Beleza", criadores: 41 },
  { id: "k12", texto: "Você está usando isso do jeito errado", nicho: "Geral", criadores: 147 },
];

export const fmtNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(".", ",")} mil` : `${Math.round(n)}`);

/* ---------- referências do TikTok ---------- */
export type RefTikTok = { url: string; autor: string; perfil: string; legenda: string; hashtags: string[]; thumb?: string; erro?: string; sugestao?: { gancho?: string; tipo?: string; produto?: string; nicho?: string } };

/** Separa a legenda das hashtags no texto que o TikTok devolve. */
export function separarLegenda(titulo: string) {
  const hashtags = [...new Set((titulo.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()))];
  const legenda = titulo.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s{2,}/g, " ").trim();
  return { legenda, hashtags };
}

export function perfilDaUrl(url: string) { return url.match(/tiktok\.com\/(@[\w.]+)/i)?.[1] ?? ""; }

/* ---------- mercado: TikTok Brasil (robô diário: worker/tendencias.py → SQL 006) ---------- */
export type HashtagMercado = { hashtag: string; posts: number; views: number; estagio: "rising" | "peaking" | "steady" | "declining"; momento: number; curva: number[] };
export type ViralMercado = { id: string; url: string; perfil: string; nicho: string; legenda: string; gancho: string; tipo: string; produto: string; views: number; curtidas: number; compartilhamentos: number; nota: number; horas: number; hue: number; ritmo?: number; prestes?: boolean; cta?: string; ctaTipo?: string; intencao?: number };

const curva = (seed: string, sobe: number) => { const r = rnd(hash(seed)); return Array.from({ length: 14 }, (_, i) => Math.max(5, Math.round(40 + sobe * i * 4 + r() * 18))); };
export const HASHTAGS_BR: HashtagMercado[] = [
  { hashtag: "blackfriday", posts: 182000, views: 9.4e8, estagio: "rising", momento: 64, curva: curva("bf", 1.6) },
  { hashtag: "achadinhos", posts: 96000, views: 5.1e8, estagio: "peaking", momento: 22, curva: curva("ach", 0.8) },
  { hashtag: "tiktokshopbrasil", posts: 71000, views: 3.8e8, estagio: "rising", momento: 41, curva: curva("tts", 1.2) },
  { hashtag: "presentedenatal", posts: 33000, views: 1.6e8, estagio: "rising", momento: 88, curva: curva("nat", 2) },
  { hashtag: "skincare", posts: 120000, views: 4.4e8, estagio: "steady", momento: 3, curva: curva("sk", 0.1) },
  { hashtag: "camisadetime", posts: 18000, views: 7.2e7, estagio: "steady", momento: -2, curva: curva("cam", 0) },
  { hashtag: "smartwatch", posts: 24000, views: 9.8e7, estagio: "declining", momento: -19, curva: curva("sw", -0.7) },
  { hashtag: "verao2027", posts: 9000, views: 3.1e7, estagio: "rising", momento: 120, curva: curva("ver", 2.4) },
];

export const VIRAIS_BR: ViralMercado[] = [
  { id: "v1", url: "https://www.tiktok.com/", perfil: "@achadosdacarol", nicho: "Achadinhos", legenda: "Não compre air fryer antes de ver isso 😱 #achadinhos #blackfriday", gancho: "Não compre antes de ver isso", tipo: "alerta", produto: "Air fryer", views: 2.4e6, curtidas: 182000, compartilhamentos: 21000, nota: 31, horas: 26, hue: 25, ritmo: 44, prestes: true, cta: "Corre no carrinho que tá com cupom só hoje", ctaTipo: "cupom", intencao: 23 },
  { id: "v2", url: "https://www.tiktok.com/", perfil: "@peleperfeita", nicho: "Beleza", legenda: "Testei por 7 dias esse sérum e olha 👀 #skincare", gancho: "Testei por 7 dias e olha o resultado", tipo: "teste", produto: "Sérum facial", views: 1.1e6, curtidas: 96000, compartilhamentos: 8800, nota: 18, horas: 40, hue: 300, ritmo: 16, prestes: true, cta: "O link tá aqui no carrinho", ctaTipo: "carrinho", intencao: 17 },
  { id: "v3", url: "https://www.tiktok.com/", perfil: "@torcedorraiz", nicho: "Moda", legenda: "Original x falsa: você saberia diferenciar? #camisadetime", gancho: "Original x falso: você saberia diferenciar?", tipo: "alerta", produto: "Camisa de time", views: 640000, curtidas: 51000, compartilhamentos: 6400, nota: 12, horas: 30, hue: 215, ritmo: 11, cta: "Comenta EU que eu te mando onde comprar a original", ctaTipo: "comentar", intencao: 31 },
  { id: "v4", url: "https://www.tiktok.com/", perfil: "@techbarato", nicho: "Eletrônicos", legenda: "Esse relógio de 89 reais faz o que o de 2 mil faz ⌚", gancho: "Esse faz o que o de 2 mil faz", tipo: "preco", produto: "Smartwatch", views: 880000, curtidas: 64000, compartilhamentos: 12000, nota: 9.5, horas: 52, hue: 165, ritmo: 5, cta: "Clica no carrinho antes que acabe o estoque", ctaTipo: "urgencia", intencao: 12 },
  { id: "v5", url: "https://www.tiktok.com/", perfil: "@casadaju", nicho: "Achadinhos", legenda: "Caraca, olha o tamanho disso!! chegou hoje #tiktokshopbrasil", gancho: "Chegou e eu não acreditei", tipo: "surpresa", produto: "Organizador", views: 510000, curtidas: 47000, compartilhamentos: 3900, nota: 7.8, horas: 18, hue: 45, ritmo: 12, prestes: true, cta: "Tá no carrinho laranja", ctaTipo: "carrinho", intencao: 19 },
  { id: "v6", url: "https://www.tiktok.com/", perfil: "@belezareal", nicho: "Beleza", legenda: "3 erros que fazem seu creme de celulite não funcionar #skincare", gancho: "3 erros que fazem isso não funcionar", tipo: "alerta", produto: "Creme celulite", views: 96000, curtidas: 8100, compartilhamentos: 1300, nota: 4.1, horas: 9, hue: 340, ritmo: 9, prestes: true, cta: "Comenta QUERO que eu te mando", ctaTipo: "comentar", intencao: 27 },
  { id: "v7", url: "https://www.tiktok.com/", perfil: "@gadgetdodia", nicho: "Eletrônicos", legenda: "Quanto você pagaria nisso? 👀 #achadinhos", gancho: "Quanto você pagaria nisso?", tipo: "pergunta", produto: "Fone sem fio", views: 61000, curtidas: 5200, compartilhamentos: 700, nota: 3.6, horas: 6, hue: 190, ritmo: 7, prestes: true, cta: "Clica no carrinho que o preço vai te surpreender", ctaTipo: "carrinho", intencao: 21 },
];
export const TIPO_GANCHO: Record<string, string> = { alerta: "Alerta / falso", preco: "Preço", teste: "Teste", surpresa: "Reação de surpresa", pergunta: "Pergunta", antes_depois: "Antes e depois", outro: "Outro" };

export const TIPO_CTA: Record<string, string> = { carrinho: "Carrinho", cupom: "Cupom / desconto", urgencia: "Urgência", comentar: "Comente a palavra", seguir: "Seguir", link_bio: "Link na bio", outro: "Outro" };

/** Ranking de CTAs do mercado (SQL: ranking_ctas_mercado). Intenção = % de comentários perguntando onde comprar, link, preço. */
export type CtaMercado = { texto: string; tipo: string; videos: number; perfis: number; mediaViews: number; nota: number; intencao: number; variacao: number };
export const CTAS_BR: CtaMercado[] = [
  { texto: "Comenta a palavra que eu te mando o link", tipo: "comentar", videos: 34, perfis: 21, mediaViews: 410000, nota: 9.8, intencao: 29, variacao: 46 },
  { texto: "Corre no carrinho que o cupom é só hoje", tipo: "cupom", videos: 51, perfis: 30, mediaViews: 520000, nota: 11.2, intencao: 22, variacao: 31 },
  { texto: "Tá no carrinho laranja aqui embaixo", tipo: "carrinho", videos: 88, perfis: 47, mediaViews: 300000, nota: 6.1, intencao: 18, variacao: 4 },
  { texto: "Clica antes que acabe o estoque", tipo: "urgencia", videos: 40, perfis: 26, mediaViews: 260000, nota: 5.4, intencao: 13, variacao: -12 },
  { texto: "Link na bio", tipo: "link_bio", videos: 22, perfis: 15, mediaViews: 120000, nota: 2.9, intencao: 7, variacao: -38 },
];

/* ---------------- pesquisa no TikTok dentro da plataforma ---------------- */
export type VideoPesquisa = { tiktok_id: string; url: string; perfil: string; legenda: string; capa_url?: string | null; postado_em: string; views: number; curtidas: number; comentarios: number; compartilhamentos: number; nota_viral: number; nota_engajamento: number; velocidade: number; ritmo: number; prestes_viralizar: boolean; gancho?: string | null; tipo?: string | null; cta?: string | null; cta_tipo?: string | null };
export type GrupoPesquisa = { tipo: string; videos: number; perfis: number; media_views: number; exemplo: string; exemplos?: string[]; confirmado: boolean };
export type ResultadoPesquisa = { tema: string; dias: number; total: number; gerado_em: string; nada_solido: boolean; videos: VideoPesquisa[]; ganchos: GrupoPesquisa[]; ctas: GrupoPesquisa[]; resumo: string; cache?: boolean; restantes?: number; demo?: boolean; nicho?: string | null; ganchos_nicho?: { texto: string; tipo: string; videos: number; perfis: number; media_views: number }[] };

/** Nichos do robô (tabela nichos_mercado, editável). As palavras identificam o nicho do produto pesquisado. */
export const NICHOS: { id: string; nome: string; palavras: string[] }[] = [
  { id: "achadinhos", nome: "Achadinhos e casa", palavras: ["achadinho", "organizador", "casa", "decoracao", "limpeza", "banheiro", "luminaria", "lampada"] },
  { id: "beleza", nome: "Beleza e skincare", palavras: ["serum", "creme", "pele", "celulite", "estria", "maquiagem", "batom", "perfume", "cabelo", "shampoo", "protetor", "unha"] },
  { id: "moda", nome: "Moda e camisas de time", palavras: ["camisa", "camiseta", "time", "gremio", "flamengo", "vestido", "calca", "tenis", "bolsa", "look", "roupa", "oculos", "bone"] },
  { id: "eletronicos", nome: "Eletrônicos", palavras: ["relogio", "smartwatch", "fone", "celular", "carregador", "caixa de som", "tablet", "notebook", "camera", "gadget", "drone", "teclado", "mouse"] },
  { id: "esportes", nome: "Esportes e fitness", palavras: ["bola", "futebol", "chuteira", "academia", "treino", "fitness", "halter", "corda", "bicicleta", "bike", "yoga", "corrida", "whey", "garrafa"] },
  { id: "cozinha", nome: "Cozinha", palavras: ["air fryer", "airfryer", "panela", "cozinha", "faca", "liquidificador", "cafeteira", "pote", "marmita", "utensilio"] },
  { id: "infantil", nome: "Infantil e bebê", palavras: ["bebe", "crianca", "brinquedo", "infantil", "fralda", "mamadeira", "escolar", "mochila"] },
  { id: "pets", nome: "Pets", palavras: ["pet", "cachorro", "gato", "coleira", "racao", "caminha", "arranhador", "petisco"] },
];
const semAcento = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function detectarNicho(tema: string) {
  const t = semAcento(tema); let melhor: (typeof NICHOS)[number] | null = null, pts = 0;
  for (const n of NICHOS) { const p = n.palavras.filter((w) => t.includes(w)).length; if (p > pts) { pts = p; melhor = n; } }
  return melhor;
}

/** Exemplo: cada nicho tem ganchos e CTAs próprios (no modo real eles vêm dos vídeos que o robô leu). */
const BANCO: Record<string, { ganchos: [string, string][]; ctas: [string, string][]; resumo: string }> = {
  eletronicos: {
    ganchos: [["preco", "Esse de 89 reais faz o que o de 2 mil faz"], ["teste", "Coloquei na água pra ver se é à prova d'água mesmo"], ["alerta", "Não compre smartwatch sem ver essas 3 funções"], ["surpresa", "Gente, a bateria durou 9 dias"], ["pergunta", "Original ou genérico: qual vale mais a pena?"]],
    ctas: [["cupom", "Tá com cupom no carrinho só hoje"], ["comentar", "Comenta RELÓGIO que eu te mando o modelo"], ["urgencia", "Últimas unidades nesse preço"], ["carrinho", "Clica no carrinho que o preço vai te surpreender"]],
    resumo: "Em eletrônicos, o que mais anda é comparar com o produto caro (\"faz o que o de 2 mil faz\") e mostrar um teste na hora, como água ou bateria. No fim, cupom e urgência de estoque puxam mais comentários de compra.",
  },
  esportes: {
    ganchos: [["teste", "Chutei com força pra ver se essa bola aguenta"], ["alerta", "Não compre bola pela internet antes de ver isso"], ["preco", "Bola oficial por menos de 60 reais?"], ["antes_depois", "Minha chuteira antes e depois de 1 mês de jogo"], ["surpresa", "Olha o quique dessa bola"]],
    ctas: [["comentar", "Comenta BOLA que eu te mando o link"], ["carrinho", "Tá no carrinho laranja aqui embaixo"], ["seguir", "Segue pra ver o teste na chuva"], ["urgencia", "Corre que tá acabando o tamanho 5"]],
    resumo: "Em esportes, os vídeos que crescem mostram o produto em uso logo no 1º segundo (chute, treino, quique) e testam a resistência. No fim, pedir para comentar uma palavra gera mais perguntas de compra que só apontar o carrinho.",
  },
  beleza: {
    ganchos: [["teste", "Usei por 7 dias e olha a minha pele"], ["alerta", "3 erros que fazem seu creme não funcionar"], ["antes_depois", "Antes e depois de 15 dias usando"], ["preco", "O sérum de farmácia que substitui o importado"], ["pergunta", "Você passa protetor do jeito certo?"]],
    ctas: [["comentar", "Comenta PELE que eu te mando o meu"], ["cupom", "Usa meu cupom no carrinho"], ["carrinho", "O link tá aqui no carrinho"], ["urgencia", "Promoção só até meia-noite"]],
    resumo: "Em beleza, antes e depois e teste de vários dias lideram. Mostrar a pele de perto no começo segura a pessoa. No fim, cupom pessoal e \"comenta que eu te mando\" trazem mais intenção de compra.",
  },
};
const PADRAO = {
  ganchos: [["alerta", "Não compre {p} antes de ver isso"], ["teste", "Testei {p} por 7 dias"], ["preco", "{P} barato que vale a pena?"], ["surpresa", "Gente, olha o que chegou"], ["pergunta", "Você usaria {p} assim?"]] as [string, string][],
  ctas: [["comentar", "Comenta EU que eu te mando o link"], ["cupom", "Corre no carrinho que o cupom é só hoje"], ["carrinho", "Tá no carrinho laranja"], ["urgencia", "Clica antes que acabe"]] as [string, string][],
  resumo: "Os vídeos que mais andam abrem com alerta (\"não compre antes de ver isso\") e mostram o produto nos 2 primeiros segundos. No fim, \"comenta a palavra que eu te mando o link\" puxa mais comentários de compra do que só \"tá no carrinho\".",
};

export function pesquisaDemo(tema: string, dias: number): ResultadoPesquisa {
  const r = rnd(hash(tema.toLowerCase()));
  const nicho = detectarNicho(tema), banco = (nicho && BANCO[nicho.id]) || PADRAO;
  const P = tema.charAt(0).toUpperCase() + tema.slice(1);
  const ganchosT = banco.ganchos.map(([t, g]) => [t, g.replace("{p}", tema).replace("{P}", P)]), ctasT = banco.ctas;
  const videos: VideoPesquisa[] = Array.from({ length: 8 }, (_, i) => {
    const g = ganchosT[i % ganchosT.length], c = ctasT[(i + 1) % ctasT.length];
    const horas = Math.round(6 + r() * (i < 3 ? 60 : dias * 20)), views = Math.round((i < 3 ? 300000 : 40000) * (0.4 + r() * 2.5));
    const ritmo = Math.round((i < 3 ? 6 : 1) + r() * 8);
    return { tiktok_id: `d${i}`, url: "https://www.tiktok.com/", perfil: ["@achadosdacarol", "@peleperfeita", "@casadaju", "@techbarato", "@belezareal", "@gadgetdodia"][i % 6], legenda: `${g[1]} #${tema.replace(/\s+/g, "").toLowerCase()} #tiktokshopbrasil`,
      postado_em: new Date(HOJE.getTime() - horas * 3600e3).toISOString(), views, curtidas: Math.round(views * 0.07), comentarios: Math.round(views * 0.004), compartilhamentos: Math.round(views * 0.01),
      nota_viral: Math.round(ritmo * 1.6 * 10) / 10, nota_engajamento: Math.min(99, 55 + Math.round(r() * 35)), velocidade: Math.round((100 - i * 9) * 10) / 10, ritmo, prestes_viralizar: horas <= 72 && ritmo >= 3,
      gancho: g[1], tipo: g[0], cta: c[1], cta_tipo: c[0] };
  });
  const agrupar = (campo: "gancho" | "cta", tipo: "tipo" | "cta_tipo"): GrupoPesquisa[] => {
    const m = new Map<string, GrupoPesquisa & { _p: Set<string>; _v: number }>();
    for (const v of videos) { const k = v[tipo] ?? "outro"; const e = m.get(k) ?? { tipo: k, videos: 0, perfis: 0, media_views: 0, exemplo: v[campo] ?? "", confirmado: false, _p: new Set(), _v: 0 }; e.videos++; e._p.add(v.perfil); e._v += v.views; m.set(k, e); }
    return [...m.values()].map(({ _p, _v, ...e }) => ({ ...e, perfis: _p.size, media_views: Math.round(_v / e.videos), confirmado: _p.size >= 2 })).sort((a, b) => Number(b.confirmado) - Number(a.confirmado) || b.media_views - a.media_views);
  };
  return { tema, dias, total: 37 + Math.round(r() * 60), gerado_em: HOJE.toISOString(), nada_solido: false, videos, ganchos: agrupar("gancho", "tipo"), ctas: agrupar("cta", "cta_tipo"), demo: true,
    nicho: nicho?.nome ?? null, resumo: banco.resumo };
}
