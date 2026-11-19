export type Status =
  | "fila"
  | "editando"
  | "aprovacao"
  | "recusado"
  | "aprovado"
  | "agendado"
  | "publicado";

export type EtapaId = "upload" | "transcricao" | "cortes" | "velocidade" | "sons" | "imagens" | "render";

export const ETAPAS: { id: EtapaId; nome: string; detalhe: string }[] = [
  { id: "upload", nome: "Upload", detalhe: "Envio retomável do bruto" },
  { id: "transcricao", nome: "Transcrição", detalhe: "Whisper local, frase a frase" },
  { id: "cortes", nome: "Cortes", detalhe: "Respiros e tentativas repetidas" },
  { id: "velocidade", nome: "Velocidade 1.1x", detalhe: "Fala mais dinâmica" },
  { id: "sons", nome: "Sons", detalhe: "Bubble pop e mouse-click" },
  { id: "imagens", nome: "Imagens", detalhe: "Referências onde a pessoa aponta" },
  { id: "render", nome: "Render", detalhe: "Qualidade original + capa 0.1s" },
];

export type Comentario = { autor: string; texto: string; quando: string };

export type Video = {
  id: string;
  titulo: string;
  produto: string;
  estiloId?: string;
  headline: string;
  criador: string;
  status: Status;
  progresso: number;
  etapa: number;
  duracaoBruto: number;
  duracaoFinal?: number;
  tamanhoMb: number;
  hue: number;
  criadoEm: string;
  versao: number;
  cortes?: number;
  imagens?: number;
  sons?: number;
  legenda?: string;
  descricao?: string;
  hashtags?: string[];
  agendadoPara?: string;
  comentarios: Comentario[];
  variante?: string;
  headlineAtiva?: boolean;                 // false = vídeo sem texto na tela
  headlinePos?: { x: number; y: number };   // centro da headline (0 a 1); padrão no topo
  surpresas?: { s: number; texto: string; motivos: string[] }[];   // reações de surpresa achadas (só sugestão)
};

export const VIDEOS_INICIAIS: Video[] = [
  {
    id: "serum-facil", titulo: "Sérum Facil — original x falso", produto: "Sérum Facil",
    headline: "Seu sérum pode ser FALSO", criador: "Eduardo", status: "aprovacao", progresso: 100, etapa: 6,
    duracaoBruto: 114, duracaoFinal: 27.6, tamanhoMb: 412, hue: 290, criadoEm: "2026-11-13T10:12:00", versao: 6,
    cortes: 38, imagens: 2, sons: 3, comentarios: [
      { autor: "Eduardo", texto: "Tirar o carrinho laranja e deixar só as imagens onde eu aponto.", quando: "ontem 18:40" },
    ],
  },
  {
    id: "gremio-1", titulo: "Camisa do Grêmio — hook falso · CTA direto", produto: "Camisas do Grêmio",
    headline: "Cuidado com camisa FALSA", criador: "Eduardo", status: "aprovacao", progresso: 100, etapa: 6,
    duracaoBruto: 96, duracaoFinal: 31.2, tamanhoMb: 388, hue: 210, criadoEm: "2026-11-13T09:02:00", versao: 1,
    cortes: 24, imagens: 3, sons: 4, comentarios: [], variante: "1 de 4",
  },
  {
    id: "gremio-3", titulo: "Camisa do Grêmio — hook gremista · CTA direto", produto: "Camisas do Grêmio",
    headline: "Gremista, olha isso", criador: "Eduardo", status: "aprovado", progresso: 100, etapa: 6,
    duracaoBruto: 96, duracaoFinal: 33.8, tamanhoMb: 388, hue: 220, criadoEm: "2026-11-13T09:02:00", versao: 1,
    cortes: 22, imagens: 3, sons: 4, comentarios: [], variante: "3 de 4",
    legenda: "Gremista, olha o acabamento dessa camisa 💙🖤🤍",
    descricao: "Comprei com desconto de Black Friday e chegou em perfeito estado. Acabamento impecável, tecido oficial e etiqueta de autenticidade. Link na bio!",
    hashtags: ["#gremio", "#camisadogremio", "#blackfriday", "#tricolor", "#achadinhos"],
  },
  {
    id: "smartwatch", titulo: "Smartwatch — unboxing", produto: "Smartwatch",
    headline: "Esse relógio faz TUDO", criador: "Noiva", status: "editando", progresso: 62, etapa: 4,
    duracaoBruto: 142, tamanhoMb: 1240, hue: 165, criadoEm: "2026-11-13T15:44:00", versao: 2, comentarios: [],
    surpresas: [{ s: 12.4, texto: "Caraca, olha o tamanho disso!", motivos: ["fala de espanto", "voz bem mais alta", "frase curta"] }],
  },
  {
    id: "creme-celulite", titulo: "Creme celulite e estria — rotina", produto: "Creme celulite e estria",
    headline: "Muito cuidado com esse creme", criador: "Amiga", status: "fila", progresso: 0, etapa: 0,
    duracaoBruto: 88, tamanhoMb: 690, hue: 340, criadoEm: "2026-11-13T16:20:00", versao: 1, comentarios: [],
  },
  {
    id: "lisinha", titulo: "Lisinha e Clarinha — antes e depois", produto: "Lisinha e Clarinha",
    headline: "O sérum que viralizou", criador: "Noiva", status: "agendado", progresso: 100, etapa: 6,
    duracaoBruto: 90, duracaoFinal: 29.4, tamanhoMb: 520, hue: 20, criadoEm: "2026-11-12T19:00:00", versao: 2,
    cortes: 31, imagens: 4, sons: 5, comentarios: [], agendadoPara: "2026-11-14T19:30:00",
    legenda: "O sérum que todo mundo tá falando ✨", descricao: "Testei por 15 dias e o resultado me surpreendeu.",
    hashtags: ["#skincare", "#lisinha", "#clarinha", "#autocuidado"],
  },
  {
    id: "gremio-unboxing", titulo: "Camisa do Grêmio — unboxing", produto: "Camisas do Grêmio",
    headline: "Chegou e eu não acreditei", criador: "Eduardo", status: "publicado", progresso: 100, etapa: 6,
    duracaoBruto: 74, duracaoFinal: 24.1, tamanhoMb: 300, hue: 235, criadoEm: "2026-11-12T12:00:00", versao: 1,
    cortes: 19, imagens: 1, sons: 2, comentarios: [], agendadoPara: "2026-11-12T20:00:00",
    legenda: "Chegou e eu não acreditei 😱", hashtags: ["#gremio", "#unboxing"],
  },
];

export type Arquivo = { nome: string; tipo: "video" | "imagem" | "audio"; tamanho: string; quando: string; hue: number };

export const PASTAS: { id: string; nome: string; icone: string; descricao: string; arquivos: Arquivo[] }[] = [
  { id: "brutos", nome: "Brutos", icone: "film", descricao: "Vídeos originais, sem edição", arquivos: [
    { nome: "serum_facil.mp4", tipo: "video", tamanho: "412 MB", quando: "hoje 10:12", hue: 290 },
    { nome: "video_apresentacao_camisas_gremio.mp4", tipo: "video", tamanho: "388 MB", quando: "hoje 09:02", hue: 210 },
    { nome: "smartwatch_unboxing.mov", tipo: "video", tamanho: "1,2 GB", quando: "hoje 15:44", hue: 165 },
    { nome: "creme_rotina.mp4", tipo: "video", tamanho: "690 MB", quando: "hoje 16:20", hue: 340 },
  ]},
  { id: "editados", nome: "Editados", icone: "scissors", descricao: "Prontos para aprovação", arquivos: [
    { nome: "serum_facil_editado_v6.mp4", tipo: "video", tamanho: "14 MB", quando: "hoje 11:30", hue: 290 },
    { nome: "gremio_1_hook-falso_cta-direto.mp4", tipo: "video", tamanho: "13,6 MB", quando: "hoje 09:40", hue: 210 },
    { nome: "gremio_2_hook-falso_cta-torcedor.mp4", tipo: "video", tamanho: "13,7 MB", quando: "hoje 09:41", hue: 215 },
    { nome: "gremio_3_hook-gremista_cta-direto.mp4", tipo: "video", tamanho: "15,9 MB", quando: "hoje 09:42", hue: 220 },
    { nome: "gremio_4_hook-gremista_cta-torcedor.mp4", tipo: "video", tamanho: "15,9 MB", quando: "hoje 09:43", hue: 225 },
  ]},
  { id: "publicados", nome: "Publicados", icone: "send", descricao: "Já foram para o ar", arquivos: [
    { nome: "unboxing_camisa_gremio.mp4", tipo: "video", tamanho: "15,9 MB", quando: "ontem 20:00", hue: 235 },
  ]},
  { id: "referencias", nome: "Referências", icone: "sparkles", descricao: "Estilos que o editor segue", arquivos: [
    { nome: "referencia_imagens_inclinadas.mov", tipo: "video", tamanho: "11,1 MB", quando: "12 nov", hue: 260 },
    { nome: "referencia_unboxing_uau.mp4", tipo: "video", tamanho: "6,3 MB", quando: "12 nov", hue: 30 },
  ]},
  { id: "imagens", nome: "Biblioteca de imagens", icone: "image", descricao: "Fotos por produto", arquivos: [
    { nome: "camisa-1.png", tipo: "imagem", tamanho: "190 KB", quando: "12 nov", hue: 210 },
    { nome: "camisa-2.png", tipo: "imagem", tamanho: "128 KB", quando: "12 nov", hue: 215 },
    { nome: "camisa-3.png", tipo: "imagem", tamanho: "144 KB", quando: "12 nov", hue: 220 },
    { nome: "produto-serum.png", tipo: "imagem", tamanho: "164 KB", quando: "12 nov", hue: 290 },
    { nome: "falso-1.png", tipo: "imagem", tamanho: "56 KB", quando: "12 nov", hue: 0 },
    { nome: "falso-2.png", tipo: "imagem", tamanho: "52 KB", quando: "12 nov", hue: 10 },
    { nome: "garmin_referencia.png", tipo: "imagem", tamanho: "250 KB", quando: "12 nov", hue: 165 },
  ]},
  { id: "sons", nome: "Sons", icone: "music", descricao: "Efeitos fixos aprovados", arquivos: [
    { nome: "Bubble pop.mp3", tipo: "audio", tamanho: "72 KB", quando: "12 nov", hue: 190 },
    { nome: "mouse-click.mp3", tipo: "audio", tamanho: "17 KB", quando: "12 nov", hue: 200 },
  ]},
];

export const REGRAS = [
  { id: "capa", nome: "Capa de 0.1s no início", detalhe: "Mantém a capa do bruto ou escolhe o melhor take", fixa: true },
  { id: "velocidade", nome: "Velocidade 1.1x", detalhe: "Todo vídeo exportado sai acelerado", fixa: true },
  { id: "cortes", nome: "Cortes de respiros e repetições", detalhe: "Mantém a última tentativa, com folga no fim das frases", fixa: true },
  { id: "ruido", nome: "Redução de ruído", detalhe: "Limpa o áudio sem mexer na voz", fixa: true },
  { id: "qualidade", nome: "Qualidade original", detalhe: "Resolução, cor e saturação preservadas", fixa: true },
  { id: "cuidado", nome: "Emoji de perigo no “cuidado”", detalhe: "🚨 ⚠️ ao lado da headline com aviso", fixa: false },
  { id: "imagens", nome: "Imagens onde a pessoa aponta", detalhe: "Levemente inclinadas, sem animação, uma por “falso”", fixa: false },
  { id: "sons", nome: "Sons fixos", detalhe: "Bubble pop em cada foto · mouse-click no “clica”", fixa: false },
  { id: "clean", nome: "Estilo clean", detalhe: "Sem botões, cards, CTAs visuais ou animações extras", fixa: false },
  { id: "unboxing", nome: "Abrir com a reação de surpresa", detalhe: "Opcional: só quando pedir. Se achar uma reação de espanto, sugere versão", fixa: false, padraoDesligado: true },
];

export function fmtDur(s?: number) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m${String(r).padStart(2, "0")}s` : `${s.toFixed(1).replace(".", ",")}s`;
}

export const STATUS_INFO: Record<Status, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  fila: { label: "Na fila", variant: "secondary" },
  editando: { label: "Editando", variant: "default" },
  aprovacao: { label: "Para aprovar", variant: "warning" },
  recusado: { label: "Reeditando", variant: "destructive" },
  aprovado: { label: "Aprovado", variant: "success" },
  agendado: { label: "Agendado", variant: "default" },
  publicado: { label: "Publicado", variant: "success" },
};
