import type { Video } from "./data";

/**
 * Vídeo bruto (o arquivo original enviado).
 * - Fica guardado por PRAZO_BRUTO_DIAS dias depois do envio e então é apagado sozinho, para não lotar o armazenamento.
 * - Só o arquivo do bruto some: os vídeos editados, a capa e a transcrição continuam.
 * - Enquanto o bruto (ou uma versão dele) estiver subindo, na fila, editando ou sendo refeito, ele não é apagado:
 *   o prazo espera a edição terminar.
 * A exclusão marca opcoes.bruto_excluido_em no original e nas versões (ganchos × CTAs), que usam o mesmo arquivo.
 */
export const PRAZO_BRUTO_DIAS = 3;
const DIA = 24 * 3600 * 1000;
/** Vídeos enviados antes da autoexclusão existir contam os 3 dias a partir deste momento (ninguém perde bruto de surpresa). */
export const INICIO_AUTOEXCLUSAO = Date.parse("2026-11-27T15:00:00Z");

type Extra = Video & { origemId?: string; brutoPath?: string; statusBanco?: string; opcoes?: Record<string, unknown>; editadoPath?: string };

/** Status em que o editor ainda precisa do arquivo bruto. */
const USANDO = new Set(["enviando", "fila", "editando", "recusado"]);

export const brutoExcluido = (v: Video) => !!(v as Extra).opcoes?.bruto_excluido_em;

/** Quando o bruto vence (data de envio + 3 dias). */
export const venceEm = (v: Video) => new Date(Math.max(new Date(v.criadoEm).getTime(), INICIO_AUTOEXCLUSAO) + PRAZO_BRUTO_DIAS * DIA);

/** O original e as versões que dependem do mesmo arquivo bruto. */
export const familia = (v: Video, videos: Video[]) => [v, ...videos.filter((x) => (x as Extra).origemId === v.id)];

/** O editor ainda está usando o bruto (dele ou de alguma versão)? */
export const brutoEmUso = (v: Video, videos: Video[]) =>
  familia(v, videos).some((x) => USANDO.has((x as Extra).statusBanco ?? x.status));

/** Algum vídeo editado saiu deste bruto? (se não, excluir o bruto = excluir o vídeo inteiro) */
export const temEditados = (v: Video, videos: Video[]) => familia(v, videos).some((x) => !!(x as Extra).editadoPath);

/** Pode apagar sozinho agora: venceu, ainda existe e o editor não está usando. */
export const brutoVencido = (v: Video, videos: Video[], agora = Date.now()) =>
  !(v as Extra).origemId && !!(v as Extra).brutoPath && !brutoExcluido(v) && venceEm(v).getTime() <= agora && !brutoEmUso(v, videos);

/** Texto do prazo: "Some em 2 dias", "Some hoje às 14:30"; com o editor usando, o prazo espera. `curto` = etiqueta da miniatura. */
export function prazoTexto(v: Video, videos: Video[], agora = Date.now(), curto = false) {
  const fim = venceEm(v).getTime();
  const falta = fim - agora;
  if (brutoEmUso(v, videos)) return curto ? "Editando · prazo pausado" : falta <= 0 ? "Será excluído quando a edição terminar" : `Some em ${diasTexto(falta)} (espera a edição terminar)`;
  if (falta <= 0) return "Será excluído agora";
  if (falta < DIA) return `Some hoje às ${new Date(fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return `Some em ${diasTexto(falta)}`;
}

function diasTexto(ms: number) {
  if (ms < DIA) { const h = Math.max(1, Math.round(ms / 3600_000)); return `${h} hora${h > 1 ? "s" : ""}`; }
  const d = Math.max(1, Math.round(ms / DIA));
  return `${d} dia${d > 1 ? "s" : ""}`;
}

/** Vence em menos de 24 h (para o aviso no sino e no topo da Biblioteca). */
export const venceLogo = (v: Video, agora = Date.now()) => venceEm(v).getTime() - agora < DIA;

/** Brutos ainda guardados (originais com arquivo que não foi excluído). */
export const brutosGuardados = (videos: Video[]) =>
  videos.filter((v) => !(v as Extra).origemId && !!(v as Extra).brutoPath && !brutoExcluido(v));
