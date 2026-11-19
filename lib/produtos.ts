/** Produtos: cada um tem sua pasta de imagens de referência usadas nas sobreposições. */

export type Rotulo = "produto" | "original" | "falso" | "detalhe" | "print";

export const ROTULOS: Record<Rotulo, { label: string; dica: string }> = {
  produto: { label: "Produto", dica: "Entra quando falam o nome do produto ou apontam para ele" },
  original: { label: "Original", dica: "Entra quando falam “original” ou “verdadeiro”" },
  falso: { label: "Falso", dica: "Entra quando falam “falso”, uma por vez, onde a pessoa aponta" },
  detalhe: { label: "Detalhe", dica: "Close de etiqueta, textura, embalagem" },
  print: { label: "Print", dica: "Print de loja/avaliação, entra com o som de clique" },
};

export type ImagemProduto = { id: string; nome: string; rotulo: Rotulo; tamanho: string; hue: number; url?: string; origem: string };

export type Produto = {
  id: string; nome: string; descricao: string; hue: number;
  palavras: string[];           // como o produto é chamado na fala (ajuda a achar o momento certo)
  imagens: ImagemProduto[];
  pasta: string;                // de onde veio (pasta inicial) ou "enviado"
};

const img = (id: string, nome: string, rotulo: Rotulo, tamanho: string, hue: number, origem: string): ImagemProduto =>
  ({ id, nome, rotulo, tamanho, hue, origem });

export const PRODUTOS_INICIAIS: Produto[] = [
  { id: "camisas-gremio", nome: "Camisas do Grêmio", hue: 215, pasta: "biblioteca/camisas-gremio/",
    descricao: "Camisas oficiais. Fotos enviadas pelo Eduardo.", palavras: ["camisa", "grêmio", "tricolor", "manto"],
    imagens: [
      img("cg1", "camisa-1.png", "produto", "190 KB", 210, "biblioteca/camisas-gremio/"),
      img("cg2", "camisa-2.png", "detalhe", "128 KB", 215, "biblioteca/camisas-gremio/"),
      img("cg3", "camisa-3.png", "original", "144 KB", 220, "biblioteca/camisas-gremio/"),
    ] },
  { id: "serum-facil", nome: "Sérum Facil", hue: 290, pasta: "biblioteca/serum-facil/",
    descricao: "Sérum facial. Comparação original x falso.", palavras: ["sérum", "serum", "facil"],
    imagens: [
      img("sf1", "produto-serum.png", "original", "164 KB", 290, "biblioteca/serum-facil/"),
      img("sf2", "falso-1.png", "falso", "56 KB", 0, "biblioteca/falsos-genericos/"),
      img("sf3", "falso-2.png", "falso", "52 KB", 10, "biblioteca/falsos-genericos/"),
    ] },
  { id: "smartwatch", nome: "Smartwatch", hue: 165, pasta: "biblioteca/",
    descricao: "Relógio inteligente (referência Garmin).", palavras: ["relógio", "smartwatch", "garmin"],
    imagens: [img("sw1", "garmin_referencia.png", "produto", "250 KB", 165, "biblioteca/")] },
  { id: "lisinha-clarinha", nome: "Lisinha e Clarinha", hue: 20, pasta: "enviado",
    descricao: "Sem imagens ainda. Envie as fotos oficiais.", palavras: ["lisinha", "clarinha"], imagens: [] },
  { id: "creme-celulite", nome: "Creme celulite e estria", hue: 340, pasta: "enviado",
    descricao: "Sem imagens ainda. Envie as fotos oficiais.", palavras: ["creme", "celulite", "estria"], imagens: [] },
];

/* ---------- hooks × CTAs ---------- */
export type Trecho = { id: string; texto: string; s?: number; e?: number };

/** Prévia do que a transcrição costuma achar. No real o worker marca os tempos de cada trecho. */
export function detectarDemo(produto: string): { hooks: Trecho[]; ctas: Trecho[] } {
  const p = produto.replace(/^\+ /, "");
  return {
    hooks: [
      { id: "h1", texto: `Cuidado, ${p.toLowerCase()} falso está em todo lugar`, s: 0.4, e: 3.1 },
      { id: "h2", texto: `Olha o que chegou: ${p.toLowerCase()} original`, s: 3.6, e: 6.2 },
    ],
    ctas: [
      { id: "c1", texto: "Clica no carrinho aqui embaixo e garante o seu", s: 52.0, e: 55.4 },
      { id: "c2", texto: "Comenta EU QUERO que eu te mando o link", s: 56.1, e: 59.0 },
    ],
  };
}
