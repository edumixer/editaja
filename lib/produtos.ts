/** Produtos: cada um tem sua pasta de imagens de referência usadas nas sobreposições. */

/** Etiquetas fixas (vêm com a plataforma). */
export type RotuloFixo = "produto" | "original" | "falso" | "detalhe" | "print";
/** Etiqueta de uma imagem: uma fixa ou o id de uma categoria criada pela pessoa. */
export type Rotulo = RotuloFixo | (string & {});

export const ROTULOS_FIXOS: RotuloFixo[] = ["produto", "original", "falso", "detalhe", "print"];
export const ehFixo = (r: string): r is RotuloFixo => (ROTULOS_FIXOS as string[]).includes(r);

export const ROTULOS: Record<RotuloFixo, { label: string; dica: string }> = {
  produto: { label: "Produto", dica: "Entra quando falam o nome do produto ou apontam para ele" },
  original: { label: "Original", dica: "Entra quando falam “original” ou “verdadeiro”" },
  falso: { label: "Falso", dica: "Entra quando falam “falso”, uma por vez, onde a pessoa aponta" },
  detalhe: { label: "Detalhe", dica: "Close de etiqueta, textura, embalagem" },
  print: { label: "Print", dica: "Print de loja/avaliação, entra com o som de clique" },
};

/**
 * Categoria criada pela pessoa (ex.: "Oficial"): quando ela FALA uma das frases gatilho, o editor coloca
 * a imagem do produto marcada com essa categoria. Vale para todos os produtos da conta.
 */
export type Categoria = {
  id: string; nome: string;
  gatilhos: string[];                                   // palavras ou frases faladas ("loja oficial", "compre aqui")
  lugar: "direita" | "esquerda" | "centro";
  tamanho: "pequena" | "media" | "grande";
  duracao: number;                                      // segundos na tela
  reserva: Exclude<RotuloFixo, "falso"> | null;         // produto sem imagem desta categoria: usa esta etiqueta
  hue: number;
};

export const LUGARES: Record<Categoria["lugar"], string> = { direita: "Direita", esquerda: "Esquerda", centro: "Centro" };
export const TAMANHOS: Record<Categoria["tamanho"], string> = { pequena: "Pequena", media: "Média", grande: "Grande" };

/** Nome que aparece na tela para uma etiqueta (fixa ou categoria). */
export function nomeRotulo(r: string, categorias: Categoria[]) {
  if (ehFixo(r)) return ROTULOS[r].label;
  return categorias.find((c) => c.id === r)?.nome ?? "Categoria excluída";
}

/** Dica de quando a categoria entra, para a lista da tela. */
export function dicaCategoria(c: Categoria) {
  const frases = c.gatilhos.length ? c.gatilhos.map((g) => `“${g}”`).join(", ") : "nenhuma frase ainda";
  return `Entra quando falam ${frases}`;
}

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
