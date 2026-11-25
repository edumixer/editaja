/** Produtos: cada um tem sua pasta de imagens de referência usadas nas sobreposições. */

export type Rotulo = "produto" | "original" | "falso" | "detalhe" | "print";

export const ROTULOS: Record<Rotulo, { label: string; dica: string }> = {
  produto: { label: "Produto", dica: "Entra quando falam o nome do produto ou apontam para ele" },
  original: { label: "Original", dica: "Entra quando falam “original” ou “verdadeiro”" },
  falso: { label: "Falso", dica: "Entra quando falam “falso”, uma por vez, onde a pessoa aponta" },
  detalhe: { label: "Detalhe", dica: "Close de etiqueta, textura, embalagem" },
  print: { label: "Print", dica: "Print de loja/avaliação, entra com o som de clique" },
};

export type ImagemProduto = { id: string; nome: string; rotulo: Rotulo; tamanho: string; hue: number; url?: string; origem: string; caminho?: string };

export type Produto = {
  id: string; nome: string; descricao: string; hue: number;
  palavras: string[];           // como o produto é chamado na fala (ajuda a achar o momento certo)
  imagens: ImagemProduto[];
  pasta: string;                // de onde veio (pasta inicial) ou "enviado"
};

/** Nenhum produto de exemplo: cada conta começa vazia e cadastra os próprios produtos (ficam salvos na conta). */
export const PRODUTOS_INICIAIS: Produto[] = [];

/** Ids dos produtos de exemplo que as versões antigas guardavam no navegador (não são importados para a conta). */
export const IDS_EXEMPLO = ["camisas-gremio", "serum-facil", "smartwatch", "lisinha-clarinha", "creme-celulite"];

/* ---------- hooks × CTAs ---------- */
export type Trecho = { id: string; texto: string; s?: number; e?: number };
