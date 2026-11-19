/** Análise completa de um vídeo de referência (o que o worker extrai e grava em referencias.analise). */
export type AnaliseCompleta = {
  duracao_s: number;
  resumo: string;
  transcricao: { t: number; texto: string }[];
  legendas: { usa: boolean; fonte: string; tamanho: string; cor: string; contorno: string; posicao: string; palavras_por_tela: number; estilo: string };
  headline: { texto: string; ate_s: number; posicao: string; emoji: string | null };
  ritmo: { cortes_por_min: number; pausa_max_s: number; plano_medio_s: number; velocidade: string };
  imagens: { t: number; lado: string; inclinacao: string; duracao_s: number; o_que: string }[];
  sons: { t: number; som: string; gatilho: string }[];
  camera: string;
  regras: string[];
};

export const ANALISES_INICIAIS: Record<string, AnaliseCompleta> = {
  "ref-nathana": {
    duracao_s: 90, resumo: "Review de sérum com jump cuts secos, título-gancho fixo nos 6 s iniciais e sobreposições curtas de produto.",
    transcricao: [
      { t: 0.2, texto: "Gente, esse sérum viralizou e eu precisava testar" },
      { t: 4.8, texto: "Olha a textura, super leve, absorve rapidinho" },
      { t: 31.5, texto: "Depois de 15 dias olha a diferença na minha pele" },
      { t: 84.0, texto: "O link tá aqui no carrinho, corre que tá com desconto" },
    ],
    legendas: { usa: true, fonte: "Montserrat ExtraBold", tamanho: "≈ 7% da altura", cor: "Branco", contorno: "Preto 3 px + sombra", posicao: "Centro-baixo (≈ 68% da altura)", palavras_por_tela: 3, estilo: "Palavra a palavra, destaque amarelo na palavra falada" },
    headline: { texto: "ESSE SÉRUM VIRALIZOU", ate_s: 6, posicao: "Topo (≈ 18%)", emoji: null },
    ritmo: { cortes_por_min: 24, pausa_max_s: 0.25, plano_medio_s: 2.5, velocidade: "≈ 1.1x" },
    imagens: [
      { t: 5.1, lado: "direita", inclinacao: "+5°", duracao_s: 2.4, o_que: "frasco do produto" },
      { t: 33.0, lado: "esquerda / direita", inclinacao: "−4° / +4°", duracao_s: 3.0, o_que: "antes e depois" },
    ],
    sons: [{ t: 5.1, som: "pop curto", gatilho: "imagem entra" }, { t: 84.2, som: "clique", gatilho: "falou “carrinho”" }],
    camera: "Selfie, rosto no terço superior, luz frontal",
    regras: ["Pausas máximas de 0,25 s", "Título-gancho nos 6 s", "Legenda palavra a palavra, 3 por tela", "Imagem de produto inclinada ao falar dele"],
  },
  "ref-inclinadas": {
    duracao_s: 21, resumo: "Fotos entram uma a uma, secas, inclinadas, cada uma com som de gota, do lado em que a pessoa aponta.",
    transcricao: [
      { t: 0.3, texto: "Olha esse aqui, falso" },
      { t: 1.4, texto: "e esse aqui, falso também" },
      { t: 3.0, texto: "o original é esse" },
    ],
    legendas: { usa: false, fonte: "—", tamanho: "—", cor: "—", contorno: "—", posicao: "—", palavras_por_tela: 0, estilo: "Sem legenda corrida" },
    headline: { texto: "", ate_s: 0, posicao: "—", emoji: null },
    ritmo: { cortes_por_min: 18, pausa_max_s: 0.3, plano_medio_s: 3.3, velocidade: "1.0x" },
    imagens: [
      { t: 0.35, lado: "esquerda (onde aponta)", inclinacao: "−7°", duracao_s: 1.1, o_que: "falso 1" },
      { t: 1.45, lado: "direita (onde aponta)", inclinacao: "+6°", duracao_s: 1.4, o_que: "falso 2" },
      { t: 3.05, lado: "centro", inclinacao: "+3°", duracao_s: 2.0, o_que: "original" },
    ],
    sons: [{ t: 0.35, som: "gota", gatilho: "imagem entra" }, { t: 1.45, som: "gota", gatilho: "imagem entra" }, { t: 3.05, som: "gota", gatilho: "imagem entra" }],
    camera: "Selfie em pé, braço livre para apontar",
    regras: ["Uma imagem por “falso”, do lado que aponta", "Inclinação −7° / +6°, sem animação", "Som a cada imagem que entra"],
  },
  "ref-uau": {
    duracao_s: 38, resumo: "Unboxing com a reação de surpresa (espanto) como prévia no início, depois o gancho falado; câmeras alternadas.",
    transcricao: [
      { t: 0.0, texto: "Reação de surpresa (prévia)" },
      { t: 1.8, texto: "Chegou a camisa nova e olha isso" },
      { t: 12.4, texto: "Nossa, a etiqueta é original mesmo" },
      { t: 34.0, texto: "Link aqui embaixo" },
    ],
    legendas: { usa: true, fonte: "Poppins Bold", tamanho: "≈ 6% da altura", cor: "Branco", contorno: "Sombra suave", posicao: "Centro (≈ 60%)", palavras_por_tela: 4, estilo: "Frase curta, sem destaque" },
    headline: { texto: "OLHA O QUE CHEGOU", ate_s: 5, posicao: "Topo (≈ 15%)", emoji: "😱" },
    ritmo: { cortes_por_min: 30, pausa_max_s: 0.2, plano_medio_s: 2.0, velocidade: "≈ 1.1x" },
    imagens: [],
    sons: [{ t: 0.0, som: "whoosh", gatilho: "abertura" }],
    camera: "Alterna selfie e câmera de cima (mãos abrindo a caixa)",
    regras: ["Reação de surpresa de 1–2 s abre o vídeo", "Manter reações nas surpresas", "Cortar “oi gente / hoje vou mostrar”"],
  },
};

/** Prévia determinística para referências novas no modo demonstração. */
export function analiseDemo(id: string, nome: string): AnaliseCompleta {
  const base = ANALISES_INICIAIS[id];
  if (base) return base;
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 997;
  const cpm = 16 + (h % 14), pausa = (0.2 + (h % 4) * 0.05).toFixed(2).replace(".", ",");
  return {
    duracao_s: 30 + (h % 60), resumo: `Analisado: ${cpm} cortes por minuto, legenda centralizada e imagens entrando ao apontar.`,
    transcricao: [{ t: 0.3, texto: "(transcrição completa aparece aqui depois da análise no servidor)" }],
    legendas: { usa: true, fonte: h % 2 ? "Montserrat Bold" : "Poppins SemiBold", tamanho: "≈ 6% da altura", cor: "Branco", contorno: "Preto 2 px", posicao: "Centro-baixo", palavras_por_tela: 3 + (h % 2), estilo: "Palavra a palavra" },
    headline: { texto: "(texto do gancho na tela)", ate_s: 5 + (h % 3), posicao: "Topo", emoji: null },
    ritmo: { cortes_por_min: cpm, pausa_max_s: Number(pausa.replace(",", ".")), plano_medio_s: Math.round((60 / cpm) * 10) / 10, velocidade: "≈ 1.1x" },
    imagens: [{ t: 4.2, lado: "onde aponta", inclinacao: "±6°", duracao_s: 1.5, o_que: "produto" }],
    sons: [{ t: 4.2, som: "pop", gatilho: "imagem entra" }],
    camera: "Selfie, rosto no terço superior",
    regras: [`Pausas máximas de ${pausa} s`, "Legenda palavra a palavra", "Imagem inclinada onde aponta"],
  };
}
