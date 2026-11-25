/** Ganchos, legendas, hashtags, CTAs e descrições de referência. A IA lê estes exemplos para escrever no mesmo jeito. */

export type TipoTexto = "gancho" | "legenda" | "descricao" | "hashtags" | "cta";

export const TIPOS: Record<TipoTexto, { label: string; plural: string; dica: string; placeholder: string }> = {
  gancho: { label: "Gancho", plural: "Ganchos", dica: "A primeira frase do vídeo, a que segura quem está rolando o feed.", placeholder: "Cuidado com camisa falsa do Grêmio\nVocê está usando o sérum errado" },
  legenda: { label: "Legenda", plural: "Legendas", dica: "O texto curto do post, logo abaixo do vídeo.", placeholder: "Gremista, olha o acabamento dessa camisa 💙🖤🤍" },
  descricao: { label: "Descrição", plural: "Descrições", dica: "O texto mais longo do post, com o contexto e a chamada.", placeholder: "Testei por 15 dias e o resultado me surpreendeu…" },
  hashtags: { label: "Hashtags", plural: "Hashtags", dica: "Um conjunto de hashtags que funcionou, uma linha por post.", placeholder: "#gremio #camisadogremio #tricolor #achadinhos" },
  cta: { label: "CTA", plural: "CTAs", dica: "A chamada do final: o que a pessoa deve fazer.", placeholder: "Clica no carrinho aqui embaixo e garante o seu" },
};

export type OrigemTexto = "minha" | "outro" | "viral";
export const ORIGENS: Record<OrigemTexto, string> = { minha: "Meu", outro: "De outro criador", viral: "Viralizou" };

export type TextoRef = {
  id: string; tipo: TipoTexto; texto: string;
  produtoId: string | null;      // null = vale para qualquer produto
  origem: OrigemTexto; autor?: string;
  destaque: boolean;             // performou bem: pesa mais na geração
  criadoEm: string;
};

const t = (id: string, tipo: TipoTexto, texto: string, produtoId: string | null, origem: OrigemTexto = "minha", destaque = false): TextoRef =>
  ({ id, tipo, texto, produtoId, origem, destaque, criadoEm: "2026-11-13" });

export const TEXTOS_INICIAIS: TextoRef[] = [
  t("g1", "gancho", "Cuidado com camisa falsa do Grêmio", "camisas-gremio", "minha", true),
  t("g2", "gancho", "Gremista, olha o que chegou aqui", "camisas-gremio"),
  t("g3", "gancho", "Seu sérum pode ser FALSO", "serum-facil", "minha", true),
  t("g4", "gancho", "Esse sérum viralizou e eu precisava testar", "serum-facil", "outro"),
  t("g5", "gancho", "Esse relógio faz TUDO", "smartwatch"),
  t("g6", "gancho", "Não compre antes de ver isso", null, "viral", true),
  t("g7", "gancho", "Ninguém te conta isso sobre", null, "viral"),
  t("l1", "legenda", "Gremista, olha o acabamento dessa camisa 💙🖤🤍", "camisas-gremio", "minha", true),
  t("l2", "legenda", "O sérum que todo mundo tá falando ✨", "serum-facil"),
  t("l3", "legenda", "Chegou e eu não acreditei 😱", null),
  t("l4", "legenda", "Original x falso: você saberia diferenciar? 👀", null, "viral", true),
  t("d1", "descricao", "Testei por 15 dias e o resultado me surpreendeu. Te conto o que mudou na minha pele e se vale o preço. Comenta EU QUERO que te mando o link.", "serum-facil", "minha", true),
  t("d2", "descricao", "Manto oficial com etiqueta, escudo bordado e tecido de jogo. Mostrei de perto pra você não cair em réplica. Link no carrinho.", "camisas-gremio"),
  t("h1", "hashtags", "#gremio #camisadogremio #tricolor #achadinhos #blackfriday", "camisas-gremio", "minha", true),
  t("h2", "hashtags", "#skincare #serum #autocuidado #achadinhos", "serum-facil"),
  t("h3", "hashtags", "#tiktokmademebuyit #achadinhos #review", null),
  t("c1", "cta", "Clica no carrinho aqui embaixo e garante o seu", null, "minha", true),
  t("c2", "cta", "Comenta EU QUERO que eu te mando o link", null),
  t("c3", "cta", "Salva esse vídeo pra não cair no golpe", null, "viral"),
];

/* ---------- o que a IA aprende da estrutura ---------- */
const EMOJI = /\p{Extended_Pictographic}/gu;
const TEM_EMOJI = /\p{Extended_Pictographic}/u;

export type Estrutura = {
  n: number; palavras: number; comEmoji: number; emojis: string[]; comPergunta: number; comCaixaAlta: number;
  aberturas: string[]; hashtagsPorPost: number; hashtagsTop: string[];
};

const top = (xs: string[], n: number) => {
  const c = new Map<string, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
};

export function analisarEstrutura(lista: TextoRef[]): Estrutura {
  const n = lista.length || 1;
  const tags = lista.flatMap((x) => x.texto.match(/#[\p{L}\p{N}_]+/gu) ?? []);
  return {
    n: lista.length,
    palavras: Math.round(lista.reduce((s, x) => s + x.texto.replace(/#[\p{L}\p{N}_]+/gu, "").split(/\s+/).filter(Boolean).length, 0) / n),
    comEmoji: Math.round((lista.filter((x) => TEM_EMOJI.test(x.texto)).length / n) * 100),
    emojis: top(lista.flatMap((x) => x.texto.match(EMOJI) ?? []), 5),
    comPergunta: Math.round((lista.filter((x) => x.texto.includes("?")).length / n) * 100),
    comCaixaAlta: Math.round((lista.filter((x) => /\b[A-ZÀ-Ú]{3,}\b/.test(x.texto)).length / n) * 100),
    aberturas: top(lista.map((x) => x.texto.split(/\s+/).slice(0, 2).join(" ").replace(/[,.!?:]+$/, "")), 3),
    hashtagsPorPost: lista.some((x) => x.tipo === "hashtags") ? Math.round(tags.length / n) : 0,
    hashtagsTop: top(tags.map((x) => x.toLowerCase()), 8),
  };
}

/** Exemplos mais relevantes: do produto primeiro, destacados antes, depois os gerais. */
export function referenciasPara(textos: TextoRef[], tipo: TipoTexto, produtoId: string | null, max = 8) {
  const peso = (x: TextoRef) => (x.produtoId && x.produtoId === produtoId ? 4 : x.produtoId === null ? 2 : 0) + (x.destaque ? 1 : 0);
  return textos.filter((x) => x.tipo === tipo && (x.produtoId === null || x.produtoId === produtoId))
    .sort((a, b) => peso(b) - peso(a)).slice(0, max);
}

/**
 * Prévia da geração no modo demonstração. No servidor, estes mesmos exemplos vão como contexto para o Claude,
 * que escreve legenda, descrição e hashtags no mesmo jeito.
 */
export function gerarComReferencias(v: { produto: string; headline: string }, textos: TextoRef[], produtoId: string | null) {
  const ref = (tp: TipoTexto) => referenciasPara(textos, tp, produtoId);
  const leg = ref("legenda"), des = ref("descricao"), hs = ref("hashtags"), ctas = ref("cta");
  const eLeg = analisarEstrutura(leg);
  // emojis do exemplo mais parecido (do produto, com estrela), no mesmo jeito que você usa
  const emoji = eLeg.comEmoji >= 50 ? ` ${(leg[0]?.texto.match(EMOJI) ?? eLeg.emojis.slice(0, 1)).join("")}` : "";
  const aviso = /cuidado|falso|golpe|não compre/i.test(v.headline);
  const pergunta = eLeg.comPergunta >= 40 ? (aviso ? " Você saberia diferenciar?" : " Você já conhecia?") : "";
  const gancho = v.headline.replace(/\s+$/, "").replace(/[.!]$/, "");
  const legenda = `${gancho.charAt(0).toUpperCase()}${gancho.slice(1)}${pergunta}${emoji}`.trim();

  const baseDesc = des[0]?.texto.split(/(?<=[.!?])\s+/)[0];
  const cta = ctas[0]?.texto;   // só CTA que a pessoa cadastrou; nada inventado
  const descricao = [
    aviso ? `Antes de comprar ${v.produto}, confira estes detalhes.` : `Testei ${v.produto} e te conto tudo.`,
    baseDesc && !baseDesc.includes(v.produto) ? baseDesc.replace(/^(Testei|Manto|Mostrei)\b.*$/i, "").trim() : "",
    cta ? `${cta}.` : "",
  ].filter(Boolean).join(" ").replace(/\.\./g, ".");

  const qtd = Math.max(4, Math.min(8, analisarEstrutura(hs).hashtagsPorPost || 5));
  const tagProduto = `#${v.produto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")}`;
  const hashtags = [...new Set([tagProduto, ...analisarEstrutura(hs).hashtagsTop, ...(aviso ? ["#original"] : [])])].slice(0, qtd);

  return { legenda, descricao, hashtags, baseadoEm: leg.length + des.length + hs.length + ctas.length };
}

/* ---------- roteiros ---------- */
export type Roteiro = {
  id: string; produtoId: string; titulo: string;
  ganchos: string[]; ctas: string[];   // textos (copiados da biblioteca ou escritos na hora)
  corpo: string;                        // o meio do vídeo, igual para todas as versões
  qtdVideos: number;                    // quantas combinações gancho × CTA viram vídeo
  inicio: string | null;                // opcional: a partir de quando postar (uma versão por dia no calendário)
  criadoEm: string;
};

/** Datas sugeridas para postar cada versão: uma por dia a partir do início. */
export function datasSugeridas(inicio: string | null, n: number) {
  if (!inicio) return [];
  return Array.from({ length: n }, (_, i) => { const d = new Date(`${inicio}T12:00:00`); d.setDate(d.getDate() + i); return d; });
}

export function combinacoes(r: Pick<Roteiro, "ganchos" | "ctas" | "qtdVideos">) {
  const out: { gancho: string; cta: string; n: number }[] = [];
  // alterna para que as primeiras versões já variem gancho e CTA
  for (let k = 0; k < r.ganchos.length * r.ctas.length; k++) {
    const gi = k % r.ganchos.length, ci = (Math.floor(k / r.ganchos.length) + gi) % r.ctas.length;
    if (!out.some((o) => o.gancho === r.ganchos[gi] && o.cta === r.ctas[ci])) out.push({ gancho: r.ganchos[gi], cta: r.ctas[ci], n: out.length + 1 });
  }
  for (let gi = 0; gi < r.ganchos.length; gi++) for (let ci = 0; ci < r.ctas.length; ci++)
    if (!out.some((o) => o.gancho === r.ganchos[gi] && o.cta === r.ctas[ci])) out.push({ gancho: r.ganchos[gi], cta: r.ctas[ci], n: out.length + 1 });
  return out.slice(0, Math.max(1, r.qtdVideos));
}

/** Prévia do corpo do roteiro (no servidor é o Claude, com as palavras e as imagens do produto). */
export function corpoDemo(produto: string, palavras: string[], comFalso: boolean) {
  const p = produto; const w = palavras[0] ?? p.toLowerCase();
  return [
    `1. Mostre ${p} na mão, perto da câmera (2 s).`,
    comFalso
      ? `2. Aponte para a esquerda: "esse aqui é falso". Aponte para a direita: "esse também". O editor coloca as fotos onde você aponta.`
      : `2. Mostre o detalhe que mais chama atenção do ${w} (etiqueta, textura, tela).`,
    `3. Fale o principal benefício em uma frase curta.`,
    `4. Mostre o ${comFalso ? "original" : "resultado"} de perto por 2 a 3 s.`,
  ].join("\n");
}
