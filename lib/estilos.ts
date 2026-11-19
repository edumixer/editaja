/** Estilos de edição: perfil (JSON que o editor lê), referências que o alimentam e histórico versionado. */

export type Regra = { id: string; texto: string; tipo: "fixa" | "preferencia" | "proibido"; origem: string };

export type PerfilEstilo = {
  velocidade: number;
  capa_0_1s: boolean;
  cortes: { respiros: boolean; manter_ultima_tentativa: boolean; folga_fim_frase_s: number };
  reducao_ruido: boolean;
  headline: { duracao_s: number; emoji_alerta: Record<string, string> };
  imagens: { onde: "onde_aponta" | "topo" | "centro"; inclinacao_graus: [number, number]; animacao: boolean; intervalo_s: number };
  sons: { foto: string | null; print_ou_fala_clica: string | null; volume: number };
  uau_no_inicio: "nunca" | "sugerir" | "sempre";
  proibido: string[];
};

export type Origem =
  | { tipo: "inicial"; pasta: string }          // carregado das pastas atuais do projeto
  | { tipo: "voce" }                            // enviado pelo dono da conta
  | { tipo: "colaborador"; nome: string }       // vídeo de outra criadora/colaborador
  | { tipo: "aprendizado"; video: string };     // veio de um Aprovar/Recusar

export type Referencia = {
  id: string; estiloId: string; nome: string; tipo: "video" | "imagem" | "som"; tamanho: string; hue: number;
  origem: Origem; quando: string;
  analise: { status: "pronta" | "analisando"; resumo?: string; extraido?: string[] };
};

export type Versao = { n: number; quando: string; autor: string; motivo: string; origem: Origem; mudancas: string[]; perfil: PerfilEstilo; regras: Regra[] };

export type Estilo = { id: string; nome: string; descricao: string; padrao?: boolean; hue: number; versaoAtual: number; versoes: Versao[]; usos: number; aprovacao: number };

export type Sugestao = {
  id: string; estiloId: string; video: string; tipo: "recusa" | "aprovacao"; comentario: string; quando: string;
  proposta: { texto: string; regra: Regra; patch?: Partial<PerfilEstilo> };
  status: "pendente" | "aplicada" | "descartada";
};

const PERFIL_CLEAN: PerfilEstilo = {
  velocidade: 1.1,
  capa_0_1s: true,
  cortes: { respiros: true, manter_ultima_tentativa: true, folga_fim_frase_s: 0.12 },
  reducao_ruido: true,
  headline: { duracao_s: 6, emoji_alerta: { cuidado: "⚠️", "não compre": "🚨", golpe: "🚫", falso: "❌" } },
  imagens: { onde: "onde_aponta", inclinacao_graus: [-7, 6], animacao: false, intervalo_s: 0.35 },
  sons: { foto: "Bubble pop", print_ou_fala_clica: "mouse-click", volume: 0.8 },
  uau_no_inicio: "sugerir",
  proibido: ["cards e botões visuais", "carrinho laranja / “clique aqui” / “loja oficial”", "fade e zoom/punch-in", "sons criados por síntese"],
};

const INI = (pasta: string): Origem => ({ tipo: "inicial", pasta });

const REGRAS_CLEAN: Regra[] = [
  { id: "r1", texto: "Todo vídeo abre com 0,1 s de capa (mantém a do bruto ou escolhe o melhor take)", tipo: "fixa", origem: "COMO-USAR.md" },
  { id: "r2", texto: "Velocidade 1.1x em todo vídeo exportado", tipo: "fixa", origem: "Pedido do Eduardo · 12 nov" },
  { id: "r3", texto: "Cortes secos de respiros e tentativas repetidas, mantendo a última", tipo: "fixa", origem: "estilo-referencia.md" },
  { id: "r4", texto: "Nunca cortar o fim de sílabas/frases; folga após cada frase", tipo: "fixa", origem: "Recusa: “mulheres” cortado" },
  { id: "r5", texto: "Qualidade original: resolução, cor e saturação do bruto", tipo: "fixa", origem: "Recusa · 12 nov" },
  { id: "r6", texto: "Headline com “cuidado/falso/golpe” ganha emoji de alerta ao lado", tipo: "preferencia", origem: "Pedido do Eduardo" },
  { id: "r7", texto: "Uma imagem por “falso” falado, onde a pessoa aponta, levemente inclinada, sem animação", tipo: "preferencia", origem: "referencia_imagens_inclinadas.mov" },
  { id: "r8", texto: "Bubble pop em cada foto que entra; mouse-click quando falar “clica”", tipo: "preferencia", origem: "Pasta Sons" },
  { id: "r9", texto: "Sem cards, botões, CTAs visuais ou animações extras", tipo: "proibido", origem: "2 recusas · 12 nov" },
  { id: "r10", texto: "Headline é opcional: automática, escrita pela pessoa (na posição escolhida) ou sem texto na tela", tipo: "preferencia", origem: "Pedido do Eduardo · 16 nov" },
];

export const ESTILOS_INICIAIS: Estilo[] = [
  {
    id: "clean", nome: "Clean do Eduardo", padrao: true, hue: 290, usos: 9, aprovacao: 87, versaoAtual: 4,
    descricao: "Cortes secos, 1.1x, imagens onde aponta, sons fixos. Sem cards nem animações.",
    versoes: [
      { n: 1, quando: "12 nov 10:05", autor: "Análise automática", motivo: "Criado a partir do vídeo de referência da Nathana", origem: { tipo: "colaborador", nome: "Nathana" },
        mudancas: ["+ cortes secos", "+ título-gancho nos 6 s", "+ punch-ins a cada 8–15 s", "+ cards de produto e avaliações"],
        perfil: { ...PERFIL_CLEAN, sons: { foto: null, print_ou_fala_clica: null, volume: 0.8 }, proibido: [] }, regras: REGRAS_CLEAN.slice(0, 3) },
      { n: 2, quando: "12 nov 14:40", autor: "Recusa do Eduardo", motivo: "“Tirar o carrinho laranja e deixar só as imagens onde eu aponto.”", origem: { tipo: "aprendizado", video: "Sérum Facil v2" },
        mudancas: ["− cards de produto/loja/carrinho", "− punch-ins e fades", "+ proibido: CTAs visuais", "+ imagens onde a pessoa aponta"],
        perfil: { ...PERFIL_CLEAN, sons: { foto: null, print_ou_fala_clica: null, volume: 0.8 } }, regras: [...REGRAS_CLEAN.slice(0, 3), REGRAS_CLEAN[6], REGRAS_CLEAN[8]] },
      { n: 3, quando: "12 nov 15:30", autor: "Referência + Sons", motivo: "Fotos inclinadas e sons oficiais escolhidos", origem: INI("referencias/ + sistema/sons"),
        mudancas: ["+ inclinação −7° / +6°", "+ Bubble pop em cada foto", "+ mouse-click no “clica”", "− sons sintetizados"],
        perfil: PERFIL_CLEAN, regras: [...REGRAS_CLEAN.slice(0, 3), ...REGRAS_CLEAN.slice(6)] },
      { n: 4, quando: "12 nov 18:10", autor: "Recusa do Eduardo", motivo: "“Cortou o fim de ‘mulheres’” + qualidade e capa", origem: { tipo: "aprendizado", video: "Sérum Facil v5" },
        mudancas: ["+ folga 0,12 s no fim das frases", "+ capa 0,1 s", "+ qualidade original", "+ emoji de alerta na headline"],
        perfil: PERFIL_CLEAN, regras: REGRAS_CLEAN },
    ],
  },
  {
    id: "unboxing", nome: "Unboxing · reação de surpresa", hue: 30, usos: 1, aprovacao: 100, versaoAtual: 1,
    descricao: "Opcional por vídeo: a melhor reação de surpresa (1–2 s) abre o vídeo, depois o gancho falado. Vale qualquer expressão de espanto, não só “uau”.",
    versoes: [
      { n: 1, quando: "12 nov 17:30", autor: "Análise automática", motivo: "Criado a partir de referencia_unboxing_uau.mp4", origem: INI("referencias/"),
        mudancas: ["+ reação de surpresa (1–2 s) no início", "+ manter reações nas surpresas", "− “oi gente / hoje vou mostrar”", "= herda o Clean"],
        perfil: { ...PERFIL_CLEAN, uau_no_inicio: "sempre" },
        regras: [
          { id: "u1", texto: "A melhor reação de surpresa (1–2 s, produto aparecendo) abre o vídeo: “uau”, “caraca”, “meu deus”, voz mais alta ou cara de espanto", tipo: "fixa", origem: "referencia_unboxing_uau.mp4" },
          { id: "u2", texto: "Manter a reação em cada nova surpresa", tipo: "preferencia", origem: "referencia_unboxing_uau.mp4" },
          { id: "u3", texto: "Cortar “oi gente / hoje vou mostrar” e esperas", tipo: "proibido", origem: "referencia_unboxing_uau.mp4" },
          ...REGRAS_CLEAN,
        ] },
    ],
  },
];

export const REFERENCIAS_INICIAIS: Referencia[] = [
  { id: "ref-nathana", estiloId: "clean", nome: "Vídeo da Nathana (sérum Lisinha/Clarinha)", tipo: "video", tamanho: "90 s", hue: 320, quando: "12 nov",
    origem: { tipo: "colaborador", nome: "Nathana" },
    analise: { status: "pronta", resumo: "Jump cuts sem pausas > 0,25 s, título-gancho nos 6 s, sobreposições de 2–4 s.", extraido: ["cortes secos", "título 6 s", "sobreposições pop-in"] } },
  { id: "ref-inclinadas", estiloId: "clean", nome: "referencia_imagens_inclinadas.mov", tipo: "video", tamanho: "11,1 MB", hue: 260, quando: "12 nov",
    origem: INI("referencias/"),
    analise: { status: "pronta", resumo: "Fotos entram uma a uma (~0,35 s), secas, inclinadas −7°/+6°, com som de gota.", extraido: ["inclinação −7°/+6°", "intervalo 0,35 s", "gota por foto"] } },
  { id: "ref-uau", estiloId: "unboxing", nome: "referencia_unboxing_uau.mp4", tipo: "video", tamanho: "6,3 MB", hue: 30, quando: "12 nov",
    origem: INI("referencias/"),
    analise: { status: "pronta", resumo: "Gancho falado com energia, reação de surpresa vira prévia no início, alternância de câmeras.", extraido: ["Surpresa no início", "sem “oi gente”", "alternar câmeras"] } },
  { id: "som-bubble", estiloId: "clean", nome: "Bubble pop.mp3", tipo: "som", tamanho: "72 KB", hue: 190, quando: "12 nov", origem: INI("sistema/sons/"),
    analise: { status: "pronta", resumo: "Som oficial de foto entrando (aparado em gota.wav).", extraido: ["som: foto"] } },
  { id: "som-click", estiloId: "clean", nome: "mouse-click.mp3", tipo: "som", tamanho: "17 KB", hue: 200, quando: "12 nov", origem: INI("sistema/sons/"),
    analise: { status: "pronta", resumo: "Som oficial para “clica/clicar” e print sozinho.", extraido: ["som: clica"] } },
  { id: "img-falso-1", estiloId: "clean", nome: "falso-1.png", tipo: "imagem", tamanho: "56 KB", hue: 0, quando: "12 nov", origem: INI("biblioteca/falsos-genericos/"),
    analise: { status: "pronta", resumo: "Imagem genérica sem marca para o gancho “falso”." } },
  { id: "img-falso-2", estiloId: "clean", nome: "falso-2.png", tipo: "imagem", tamanho: "52 KB", hue: 10, quando: "12 nov", origem: INI("biblioteca/falsos-genericos/"),
    analise: { status: "pronta", resumo: "Imagem genérica sem marca para o gancho “falso”." } },
  { id: "img-serum", estiloId: "clean", nome: "produto-serum.png", tipo: "imagem", tamanho: "164 KB", hue: 290, quando: "12 nov", origem: INI("biblioteca/serum-facil/"),
    analise: { status: "pronta", resumo: "Produto recortado (Sérum Facil)." } },
  { id: "img-camisa-1", estiloId: "clean", nome: "camisa-1.png", tipo: "imagem", tamanho: "190 KB", hue: 210, quando: "12 nov", origem: INI("biblioteca/camisas-gremio/"),
    analise: { status: "pronta", resumo: "Foto oficial enviada pelo Eduardo (Camisas do Grêmio)." } },
  { id: "img-camisa-2", estiloId: "clean", nome: "camisa-2.png", tipo: "imagem", tamanho: "128 KB", hue: 215, quando: "12 nov", origem: INI("biblioteca/camisas-gremio/"),
    analise: { status: "pronta", resumo: "Foto oficial enviada pelo Eduardo (Camisas do Grêmio)." } },
  { id: "img-camisa-3", estiloId: "clean", nome: "camisa-3.png", tipo: "imagem", tamanho: "144 KB", hue: 220, quando: "12 nov", origem: INI("biblioteca/camisas-gremio/"),
    analise: { status: "pronta", resumo: "Foto oficial enviada pelo Eduardo (Camisas do Grêmio)." } },
];

export const SUGESTOES_INICIAIS: Sugestao[] = [
  { id: "s-ex", estiloId: "clean", video: "Camisa do Grêmio — hook gremista", tipo: "aprovacao", quando: "hoje 09:50",
    comentario: "Aprovado de primeira (4 imagens oficiais, sem cards).",
    proposta: { texto: "Reforçar: com fotos oficiais do produto, usar 3 imagens em sequência inclinada.", regra: { id: "s-ex-r", texto: "Com fotos oficiais, usar até 3 em sequência inclinada", tipo: "preferencia", origem: "Aprovação · Camisa do Grêmio" } },
    status: "pendente" },
];

/** Converte um comentário de recusa em proposta de regra (no produto real: Claude lê o comentário + o plano do vídeo). */
export function propostaDeFeedback(texto: string, motivos: string[], video: string, estiloId: string): Sugestao["proposta"] {
  const t = (motivos.join(" ") + " " + texto).toLowerCase();
  const r = (texto2: string, tipo: Regra["tipo"], patch?: Partial<PerfilEstilo>) =>
    ({ texto: texto2, regra: { id: `r-${Date.now().toString(36)}`, texto: texto2, tipo, origem: `Recusa · ${video}` }, patch });
  if (/fim|palavra|sílaba|cortou/.test(t)) return r("Aumentar a folga no fim das frases para 0,20 s", "fixa", { cortes: { respiros: true, manter_ultima_tentativa: true, folga_fim_frase_s: 0.2 } });
  if (/imagem|foto|lugar|esquerda|direita/.test(t)) return r("Conferir a direção do dedo frame a frame antes de posicionar cada imagem", "preferencia");
  if (/repeti/.test(t)) return r("Comparar frases parecidas com tolerância maior para achar tentativas repetidas", "preferencia");
  if (/headline|gancho|título/.test(t)) return r("Sugerir 3 opções de headline antes do render", "preferencia");
  if (/som/.test(t)) return r("Sons só no instante exato da foto/palavra (sem antecipar)", "preferencia");
  if (/capa/.test(t)) return r("Escolher a capa pelo frame com rosto + produto mais nítidos", "preferencia");
  return r(`Nova preferência: “${texto.slice(0, 90)}”`, "preferencia");
}
