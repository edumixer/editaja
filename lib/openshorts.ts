"use client";
/**
 * Ligação com o motor de cortes (OpenShorts, MIT — github.com/mutonby/openshorts).
 *
 * O motor roda no computador (docker compose up, API em http://localhost:8000) ou num servidor.
 * O navegador chama a API dele direto (o OpenShorts self-host libera CORS para qualquer origem),
 * então funciona mesmo com o EditaJá publicado na Vercel. Endpoints usados:
 *   GET  /health                 -> motor ligado?
 *   GET  /api/config             -> precisa de chave Gemini? (localLlm)
 *   POST /api/uploads            -> reserva envio de arquivo; PUT bytes no upload_url
 *   POST /api/process            -> {url | upload_id, acknowledged, target_clips, clip_min_seconds, clip_max_seconds,
 *                                    captions, auto_hook, source_start, source_end, output_format}
 *   GET  /api/status/{job_id}    -> {status: queued|processing|completed|failed, logs, result: {clips}}
 */

export type ConfigMotor = { url: string; chaveGemini: string };
export type OpcoesCorte = {
  quantidade: number | null; // null = o motor decide (3 a 15)
  minSeg: number; maxSeg: number;
  legendas: boolean; gancho: boolean;
  inicio?: string; fim?: string; // trecho da live/vídeo, "hh:mm:ss" ou segundos
  formato: "vertical" | "auto";
};
export type Corte = {
  indice: number; inicio: number; fim: number; nota?: number;
  titulo: string; gancho: string; descricaoTiktok: string; descricaoInstagram: string; porque?: string;
  videoUrl: string; // absoluto
};
export type Trabalho = {
  id: string; fonte: string; tipo: "link" | "arquivo"; criadoEm: string;
  ganchoNoVideo?: boolean; // gancho já escrito pelo motor: o EditaJá não põe outra headline
  status: "fila" | "processando" | "pronto" | "erro"; etapa?: string; detalhe?: string; posicaoFila?: number; erro?: string; cortes?: Corte[]; demo?: boolean;
};

const KEY_CFG = "editaja:reels:motor:v1";
const KEY_JOBS = "editaja:reels:trabalhos:v1";
export const URL_PADRAO = "http://localhost:8000";

export function lerConfig(): ConfigMotor {
  try { const r = localStorage.getItem(KEY_CFG); if (r) return { ...JSON.parse(r), chaveGemini: "" }; } catch {}
  return { url: URL_PADRAO, chaveGemini: "" };
}
export function salvarConfig(c: ConfigMotor) { try { localStorage.setItem(KEY_CFG, JSON.stringify({ url: c.url })); } catch {} }
export function lerTrabalhos(): Trabalho[] { try { return JSON.parse(localStorage.getItem(KEY_JOBS) || "[]"); } catch { return []; } }
export function salvarTrabalhos(t: Trabalho[]) { try { localStorage.setItem(KEY_JOBS, JSON.stringify(t.slice(0, 30))); } catch {} }

const base = (c: ConfigMotor) => c.url.trim().replace(/\/+$/, "");
const cab = (c: ConfigMotor, json = true): Record<string, string> => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(c.chaveGemini ? { "X-Gemini-Key": c.chaveGemini } : {}),
});

async function erroDe(r: Response) {
  try { const j = await r.json(); return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j); } catch { return `Erro ${r.status}`; }
}

export type EstadoMotor = { ligado: boolean; precisaChave: boolean; llmLocal?: string | null; erro?: string; bloqueado?: boolean };
export async function verificarMotor(c: ConfigMotor): Promise<EstadoMotor> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${base(c)}/api/config`, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) return { ligado: false, precisaChave: true, erro: `O motor respondeu ${r.status}` };
    const j = await r.json();
    const llmLocal = j.localLlm ? (typeof j.localLlm === "string" ? j.localLlm : j.localLlm.model ?? "IA local") : null;
    return { ligado: true, precisaChave: !llmLocal, llmLocal };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { ligado: false, precisaChave: true, erro: "O motor não respondeu em 5 segundos. Confira se o Docker está aberto e o motor ligado." };
    return { ligado: false, precisaChave: true, bloqueado: true, erro: "O navegador não deixou esta página falar com o motor no seu computador. Toque no cadeado ao lado do endereço do site, abra Configurações do site e, em \"Rede local\" (ou \"Acesso à rede local\"), escolha Permitir. Depois recarregue a página. Se o Docker estiver fechado, abra-o também." };
  }
}

/** Envia um arquivo para o motor e devolve o upload_id. */
export async function enviarArquivo(c: ConfigMotor, arquivo: File, progresso: (p: number) => void): Promise<string> {
  const r = await fetch(`${base(c)}/api/uploads`, { method: "POST", headers: cab(c), body: JSON.stringify({ filename: arquivo.name }) });
  if (!r.ok) throw new Error(await erroDe(r));
  const { upload_id, upload_url } = await r.json();
  // XHR para ter progresso do envio
  await new Promise<void>((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open("PUT", String(upload_url).replace(/^https?:\/\/[^/]+/, base(c)));
    x.upload.onprogress = (e) => e.lengthComputable && progresso(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? ok() : falha(new Error(x.responseText || `Erro ${x.status} no envio`)));
    x.onerror = () => falha(new Error("A conexão com o motor caiu durante o envio."));
    x.send(arquivo);
  });
  return upload_id;
}

export async function iniciarCortes(c: ConfigMotor, fonte: { url?: string; uploadId?: string }, o: OpcoesCorte, baixaQualidadeOk = false):
  Promise<{ jobId?: string; baixaQualidade?: number }> {
  const corpo: Record<string, unknown> = {
    acknowledged: true, force_low_quality: baixaQualidadeOk,
    captions: o.legendas, auto_hook: o.gancho,
    clip_min_seconds: o.minSeg, clip_max_seconds: o.maxSeg,
    output_format: o.formato,
  };
  if (fonte.url) corpo.url = fonte.url; else corpo.upload_id = fonte.uploadId;
  if (o.quantidade) corpo.target_clips = o.quantidade;
  if (o.inicio?.trim()) corpo.source_start = paraSegundos(o.inicio);
  if (o.fim?.trim()) corpo.source_end = paraSegundos(o.fim);
  const r = await fetch(`${base(c)}/api/process`, { method: "POST", headers: cab(c), body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(await erroDe(r));
  const j = await r.json();
  if (j.needs_confirmation) return { baixaQualidade: j.quality_check?.max_height ?? 0 };
  return { jobId: j.job_id };
}

export function paraSegundos(v: string): number {
  const p = v.trim().split(":").map(Number);
  return p.reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
}

/** Traduz a última linha de log do motor para uma etapa simples. */
function etapaDe(logs: string[]): string {
  const t = (logs.slice(-6).join(" ") || "").toLowerCase();
  if (/download/.test(t)) return "Baixando o vídeo";
  if (/transcri|whisper|parakeet/.test(t)) return "Transcrevendo a fala";
  if (/scene|cena/.test(t)) return "Achando as trocas de cena";
  if (/gemini|viral|moment|llm|score/.test(t)) return "Escolhendo os melhores momentos";
  if (/subtit|caption|legend/.test(t)) return "Colocando legendas";
  if (/hook/.test(t)) return "Escrevendo o gancho";
  if (/render|reframe|crop|track|ffmpeg|encod/.test(t)) return "Enquadrando em 9:16 e renderizando";
  return "Trabalhando";
}

type ClipBruto = {
  start?: number; end?: number; video_url?: string; video_title_for_youtube_short?: string; viral_hook_text?: string;
  video_description_for_tiktok?: string; video_description_for_instagram?: string; predicted_score?: number; viral_score?: number; why?: string; download_url?: string;
  auto_hook?: { text?: string };
};

export async function consultar(c: ConfigMotor, jobId: string): Promise<Partial<Trabalho>> {
  const r = await fetch(`${base(c)}/api/status/${jobId}`, { headers: cab(c, false) });
  if (r.status === 404) return { status: "erro", erro: "O motor não tem mais esse trabalho (pode ter sido apagado ao reiniciar)." };
  if (!r.ok) throw new Error(await erroDe(r));
  const j = await r.json();
  const logs: string[] = (j.logs ?? []).map(String);
  if (j.status === "failed") return { status: "erro", erro: logs.slice(-1)[0] || "O motor não conseguiu cortar esse vídeo." };
  if (j.status !== "completed") {
    const ultima = logs.filter((l) => l.trim()).slice(-1)[0]?.replace(/^\[[^\]]*\]\s*/, "").slice(0, 160);
    const fila = j.queue?.position as number | undefined;
    return { status: j.status === "queued" ? "fila" : "processando", etapa: j.status === "queued" ? (fila ? `Na fila do motor (posição ${fila})` : "Na fila do motor") : etapaDe(logs), detalhe: ultima, posicaoFila: fila };
  }
  const clips: ClipBruto[] = j.result?.clips ?? [];
  return {
    status: "pronto", etapa: undefined,
    cortes: clips.map((k, i) => ({
      indice: i, inicio: k.start ?? 0, fim: k.end ?? 0,
      nota: Number.isFinite(k.predicted_score ?? k.viral_score) ? Math.round((k.predicted_score ?? k.viral_score) as number) : undefined,
      titulo: k.video_title_for_youtube_short || `Corte ${i + 1}`,
      gancho: k.auto_hook?.text || k.viral_hook_text || "",
      descricaoTiktok: k.video_description_for_tiktok || "",
      descricaoInstagram: k.video_description_for_instagram || "",
      porque: k.why,
      videoUrl: k.video_url ? (/^https?:/.test(k.video_url) ? k.video_url : `${base(c)}${k.video_url}`) : "",
    })),
  };
}

/** Baixa o arquivo do corte (para salvar ou mandar para a edição do EditaJá). */
export async function baixarCorte(corte: Corte): Promise<Blob> {
  const r = await fetch(corte.videoUrl);
  if (!r.ok) throw new Error(`Não consegui baixar o corte (${r.status}).`);
  return r.blob();
}

/** Trabalho de exemplo para o modo demonstração (motor desligado). */
export function trabalhoExemplo(fonte: string): Trabalho {
  const exemplos = [
    { t: "Ele não esperava essa reação do público", g: "Ninguém esperava isso 😳", n: 92, a: 754, b: 801 },
    { t: "O segredo que ninguém conta sobre começar do zero", g: "O segredo que ninguém conta 🤫", n: 87, a: 1312, b: 1349 },
    { t: "A pergunta que deixou todo mundo em silêncio", g: "Essa pergunta travou a live", n: 81, a: 2210, b: 2262 },
    { t: "3 erros que quase todo iniciante comete", g: "Pare de fazer isso! 🚫", n: 76, a: 3021, b: 3058 },
  ];
  return {
    id: `demo-${Date.now().toString(36)}`, fonte, tipo: "link", criadoEm: new Date().toISOString(), status: "pronto", demo: true, ganchoNoVideo: true,
    cortes: exemplos.map((e, i) => ({
      indice: i, inicio: e.a, fim: e.b, nota: e.n, titulo: e.t, gancho: e.g,
      descricaoTiktok: `${e.t}. Assista até o fim! #cortes #live #fyp`, descricaoInstagram: `${e.t} 👀 Salve para ver depois.`,
      porque: "Momento com virada de assunto e reação forte, bom para prender nos 3 primeiros segundos.", videoUrl: "",
    })),
  };
}

export const fmtTempo = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

/* ---------- Painel cortes-gta (agente, porta 8090): lives ao vivo e vídeos longos em blocos ---------- */
export const PAINEL_PADRAO = "http://localhost:8090";
export type TrabalhoPainel = {
  id: number; tipo: string; origem: string; canal?: string; titulo?: string; status: string;
  erro?: string | null; pasta_saida?: string | null; cortes?: number | null; criado?: number; atualizado?: number;
};
export type FilaPainel = { contagem: Record<string, number>; trabalhos: TrabalhoPainel[]; lives: Record<string, { titulo?: string; pasta?: string }> };

async function comTempo(url: string, init: RequestInit = {}, ms = 5000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}
export async function painelLigado(painel = PAINEL_PADRAO): Promise<boolean> {
  try { const r = await comTempo(`${painel}/api/saude`, {}, 4000); return r.ok; } catch { return false; }
}
export async function enviarLinksPainel(links: string[], cortes: number | null, painel = PAINEL_PADRAO): Promise<string[]> {
  const r = await comTempo(`${painel}/api/links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ links, cortes: cortes ?? undefined }) }, 60000);
  if (!r.ok) throw new Error(await erroDe(r));
  const j = await r.json();
  return (j.resultado ?? []).map(String);
}
export async function lerFilaPainel(painel = PAINEL_PADRAO): Promise<FilaPainel> {
  const r = await comTempo(`${painel}/api/fila`);
  if (!r.ok) throw new Error(await erroDe(r));
  return r.json();
}
type CorteJson = Record<string, unknown>;
const txt = (o: CorteJson, ...k: string[]) => { for (const x of k) { const v = o[x]; if (typeof v === "string" && v.trim()) return v; } return ""; };
const num = (o: CorteJson, ...k: string[]) => { for (const x of k) { const v = Number(o[x]); if (Number.isFinite(v) && o[x] != null) return v; } return undefined; };
/** Lê <pasta_saida>/cortes.json do painel e devolve os cortes no formato da tela. */
export async function lerCortesPainel(pasta: string, painel = PAINEL_PADRAO): Promise<Corte[]> {
  const base = `${painel}${pasta.startsWith("/") ? "" : "/"}${pasta.split("/").map(encodeURIComponent).join("/")}`;
  const r = await comTempo(`${base}/cortes.json`);
  if (!r.ok) throw new Error(`Não consegui ler os cortes (${r.status}).`);
  const j = await r.json();
  const lista: CorteJson[] = Array.isArray(j) ? j : (j.cortes ?? j.clips ?? []);
  return lista.map((k, i) => {
    const arquivo = txt(k, "arquivo", "file", "mp4");
    const nota = num(k, "score", "viral_score", "predicted_score", "nota");
    return {
      indice: i, inicio: num(k, "start", "inicio") ?? 0, fim: num(k, "end", "fim") ?? 0,
      nota: nota != null ? Math.round(nota) : undefined,
      titulo: txt(k, "titulo", "title", "video_title_for_youtube_short") || `Corte ${i + 1}`,
      gancho: txt(k, "hook", "gancho", "viral_hook_text"),
      descricaoTiktok: txt(k, "legenda_tiktok", "tiktok", "video_description_for_tiktok", "legenda"),
      descricaoInstagram: txt(k, "legenda_instagram", "instagram", "video_description_for_instagram"),
      videoUrl: arquivo ? (/^https?:/.test(arquivo) ? arquivo : `${base}/${arquivo.split("/").pop()!.split("/").map(encodeURIComponent).join("/")}`) : "",
    };
  });
}
