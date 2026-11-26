"use client";
import * as React from "react";

/**
 * Andamento do envio e da edição mostrado na Fila e no Painel.
 * O editor grava `etapa` (0..6) e `progresso` (0..100) no banco; aqui viram as etapas que a pessoa entende.
 *   etapa 0 = preparando · 1 = transcrição · 2 = cortes · 3..5 = montagem · 6 = render (≥ 96% = finalizando)
 */
export const ETAPAS_UI = [
  { id: "preparando", nome: "Preparando", detalhe: "Baixando o vídeo enviado" },
  { id: "transcricao", nome: "Transcrevendo", detalhe: "Lendo a fala, frase a frase" },
  { id: "cortes", nome: "Cortes", detalhe: "Tirando respiros e tentativas repetidas" },
  { id: "montagem", nome: "Montagem", detalhe: "Velocidade 1.1x, sons, imagens e headline" },
  { id: "render", nome: "Renderizando", detalhe: "Gerando o vídeo na qualidade original" },
  { id: "finalizando", nome: "Finalizando", detalhe: "Salvando e escrevendo a legenda" },
] as const;

export function etapaUI(etapa: number, progresso: number) {
  if (etapa >= 6) return progresso >= 96 ? 5 : 4;
  if (etapa >= 3) return 3;
  return Math.max(0, etapa);
}

/** Limite de tamanho por arquivo do armazenamento (Supabase grátis = 50 MB). Mude NEXT_PUBLIC_LIMITE_UPLOAD_MB ao trocar de plano. */
export const LIMITE_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_LIMITE_UPLOAD_MB || 50);

export function fmtRestante(s: number) {
  if (s < 45) return "menos de 1 min";
  const m = Math.round(s / 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)} h ${m % 60} min`;
}

/**
 * Tempo restante estimado pela velocidade real do progresso enquanto a tela está aberta.
 * Devolve null até ter dados suficientes (≥ 15 s e ≥ 3 pontos de avanço).
 */
export function useTempoRestante(chave: string, pct: number, ativo: boolean) {
  const inicio = React.useRef<{ chave: string; t: number; p: number } | null>(null);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [ativo]);
  if (!ativo) { inicio.current = null; return null; }
  if (!inicio.current || inicio.current.chave !== chave || pct < inicio.current.p) inicio.current = { chave, t: Date.now(), p: pct };
  const dt = (Date.now() - inicio.current.t) / 1000, dp = pct - inicio.current.p;
  if (dt < 15 || dp < 3) return null;
  return ((100 - pct) * dt) / dp;
}

/** Faixa de progresso sem porcentagem (quando ainda não dá para medir). */
export function BarraIndeterminada({ className = "" }: { className?: string }) {
  return React.createElement("div", { className: `relative h-2 w-full overflow-hidden rounded-full bg-secondary ${className}` },
    React.createElement("div", { className: "brand-gradient absolute inset-y-0 left-0 w-1/3 rounded-full", style: { animation: "deslizar 1.4s ease-in-out infinite" } }));
}
