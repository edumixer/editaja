"use client";
import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { VIDEOS_INICIAIS, ETAPAS, type Video, type Status } from "./data";
import { modoReal, supabase } from "./supabase";
import { R2_ATIVO, apagarPastas } from "./armazenamento";
import { gerarComReferencias } from "./textos";
import { textosSalvos } from "./textos-store";
import type { Produto } from "./produtos";

type Ctx = {
  videos: Video[];
  modoReal: boolean;
  sessao: Session | null;
  carregando: boolean;
  update: (id: string, patch: Partial<Video>) => void;
  aprovar: (id: string) => void;
  recusar: (id: string, comentario: string) => void;
  adicionar: (nome: string, mb: number) => string;
  criarVideo: (nome: string, mb: number, produto: string, opcoes: Record<string, unknown>) => Promise<{ id: string; caminho: string; owner: string }>;
  /** Grava no vídeo o que a pessoa escolheu no envio (produto, estilo, headline…). Chamado ao tocar em "Editar". */
  configurarVideo: (id: string, produto: { id: string; nome: string } | null, opcoes: Record<string, unknown>) => Promise<void>;
  enviarParaEdicao: (id: string) => Promise<void>;
  /** Apaga o vídeo (e as versões ganchos × CTAs dele) do banco e os arquivos do armazenamento. */
  excluirVideo: (id: string) => Promise<void>;
  /** Apaga vários de uma vez (seleção na Aprovação). Original selecionado leva as versões dele junto. */
  excluirVarios: (ids: string[]) => Promise<number>;
  agendar: (id: string, quando: string) => void;
  publicarAgora: (id: string) => void;
  reset: () => void;
};

const StoreCtx = React.createContext<Ctx | null>(null);
const KEY = "editaja:videos:v1";

/** Legenda, descrição e hashtags escritas no jeito das referências em "Ganchos e Legendas" (do produto primeiro). */
export function gerarTextosIA(v: Video) {
  let produtos: Produto[] = [];
  try { const raw = localStorage.getItem("editaja:produtos:v1"); if (raw) produtos = JSON.parse(raw); } catch {}
  const produtoId = produtos.find((p) => p.nome === v.produto)?.id ?? null;
  const { legenda, descricao, hashtags } = gerarComReferencias(v, textosSalvos(), produtoId);
  return { legenda, descricao, hashtags };
}

/* ---------- modo real: linha do banco <-> Video da interface ---------- */
type Linha = {
  id: string; titulo: string; produto: string | null; headline: string | null; status: string; etapa: number; progresso: number;
  versao: number; duracao_bruto: number | null; duracao_final: number | null; stats: { cortes?: number; imagens?: number; sons?: number } | null;
  legenda: string | null; descricao: string | null; hashtags: string[] | null; agendado_para: string | null; created_at: string;
  opcoes: Record<string, unknown> | null; erro: string | null; comentarios?: { texto: string; created_at: string }[];
  editado_path?: string | null; editado_em?: string | null; updated_at?: string; origem_id?: string | null; bruto_path?: string | null; owner_id?: string; headline_ativa?: boolean; headline_x?: number | null; headline_y?: number | null; surpresas?: Video["surpresas"] | null;
};
function hueDe(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function paraVideo(l: Linha): Video {
  const status = (l.status === "enviando" || l.status === "erro" ? "fila" : l.status) as Status;
  return {
    id: l.id, titulo: l.titulo, produto: l.produto ?? "—", headline: l.headline ?? "", criador: "Você", status,
    progresso: l.progresso, etapa: l.etapa, duracaoBruto: l.duracao_bruto ?? 0, duracaoFinal: l.duracao_final ?? undefined,
    tamanhoMb: Number((l.opcoes as { mb?: number } | null)?.mb ?? 0), hue: hueDe(l.id), criadoEm: l.created_at, versao: l.versao, estiloId: (l.opcoes as { estilo_id?: string } | null)?.estilo_id,
    cortes: l.stats?.cortes, imagens: l.stats?.imagens, sons: l.stats?.sons, legenda: l.legenda ?? undefined,
    descricao: l.descricao ?? undefined, hashtags: l.hashtags ?? undefined, agendadoPara: l.agendado_para ?? undefined,
    headlineAtiva: l.headline_ativa ?? true, headlinePos: l.headline_x != null && l.headline_y != null ? { x: l.headline_x, y: l.headline_y } : undefined,
    surpresas: l.surpresas ?? undefined,
    comentarios: (l.comentarios ?? []).map((c) => ({ autor: "Você", texto: c.texto, quando: new Date(c.created_at).toLocaleString("pt-BR") })),
    // extras do modo real (lidos pela Aprovação via VideoReal em components/video-real.tsx)
    ...{ editadoPath: l.editado_path ?? undefined, editadoEm: l.editado_em ?? undefined, atualizadoEm: l.updated_at, opcoes: l.opcoes ?? undefined, erro: l.erro ?? undefined, statusBanco: l.status,
      brutoPath: l.bruto_path ?? undefined, ownerId: l.owner_id, origemId: l.origem_id ?? undefined, capaPath: (l.opcoes as { capa?: string } | null)?.capa },
  } as Video;
}
const CAMPOS: Partial<Record<keyof Video, string>> = {
  headline: "headline", headlineAtiva: "headline_ativa", legenda: "legenda", descricao: "descricao", hashtags: "hashtags", status: "status", agendadoPara: "agendado_para",
};
function paraLinha(p: Partial<Video>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) { const c = CAMPOS[k as keyof Video]; if (c) out[c] = v; }
  if (p.headlinePos) { out.headline_x = p.headlinePos.x; out.headline_y = p.headlinePos.y; }
  return out;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [videos, setVideos] = React.useState<Video[]>(modoReal ? [] : VIDEOS_INICIAIS);
  const [sessao, setSessao] = React.useState<Session | null>(null);
  const [carregando, setCarregando] = React.useState(modoReal);
  const loaded = React.useRef(false);

  /* ---------- sessão + dados reais ---------- */
  const recarregar = React.useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("videos").select("*, comentarios(texto, created_at)").order("created_at", { ascending: false });
    setVideos((data as Linha[] | null ?? []).map(paraVideo));
    setCarregando(false);
  }, []);

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); if (data.session) recarregar(); else setCarregando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSessao(s); if (s) recarregar(); else setVideos([]); });
    const canal = supabase.channel("videos").on("postgres_changes", { event: "*", schema: "public", table: "videos" }, () => recarregar()).subscribe();
    return () => { sub.subscription.unsubscribe(); supabase!.removeChannel(canal); };
  }, [recarregar]);

  /* ---------- modo demonstração ---------- */
  React.useEffect(() => {
    if (modoReal) return;
    try {
      const raw = localStorage.getItem(KEY);
      // vídeos de exemplo salvos antes ganham os campos novos (ex.: reações de surpresa achadas)
      if (raw) setVideos((JSON.parse(raw) as Video[]).map((v) => (v.surpresas ? v : { ...v, surpresas: VIDEOS_INICIAIS.find((x) => x.id === v.id)?.surpresas })));
    } catch {}
    loaded.current = true;
  }, []);
  React.useEffect(() => {
    if (modoReal || !loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(videos)); } catch {}
  }, [videos]);
  React.useEffect(() => {
    if (modoReal) return;
    const t = setInterval(() => {
      setVideos((vs) => {
        let mudou = false;
        let next = vs.map((v) => {
          if (v.status !== "editando") return v;
          mudou = true;
          const progresso = Math.min(100, v.progresso + 3 + Math.random() * 4);
          const etapa = Math.min(ETAPAS.length - 1, Math.floor((progresso / 100) * ETAPAS.length));
          if (progresso >= 100) {
            return {
              ...v, progresso: 100, etapa: ETAPAS.length - 1, status: "aprovacao" as const,
              duracaoFinal: Math.round((v.duracaoBruto / 3.6) * 10) / 10,
              cortes: v.cortes ?? Math.round(v.duracaoBruto / 3.2), imagens: v.imagens ?? 2, sons: v.sons ?? 3,
            };
          }
          return { ...v, progresso, etapa };
        });
        if (!next.some((v) => v.status === "editando")) {
          const i = next.findIndex((v) => v.status === "fila" || v.status === "recusado");
          if (i >= 0) { next = next.map((v, j) => (j === i ? { ...v, status: "editando", progresso: 2, etapa: 1 } : v)); mudou = true; }
        }
        return mudou ? next : vs;
      });
    }, 900);
    return () => clearInterval(t);
  }, []);

  /* ---------- ações (otimistas na tela, gravadas no banco no modo real) ---------- */
  const update = React.useCallback((id: string, patch: Partial<Video>) => {
    setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    if (supabase) { const l = paraLinha(patch); if (Object.keys(l).length) supabase.from("videos").update(l).eq("id", id).then(() => {}); }
  }, []);

  const enviarParaEdicao = React.useCallback(async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await fetch("/api/editar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ video_id: id }) });
  }, []);

  const value: Ctx = {
    videos, modoReal, sessao, carregando, update, enviarParaEdicao,
    aprovar: (id) => {
      const v = videos.find((x) => x.id === id);
      if (!v) return;
      update(id, { status: "aprovado", ...(v.legenda ? {} : gerarTextosIA(v)) });
    },
    recusar: (id, comentario) => {
      const v = videos.find((x) => x.id === id);
      setVideos((vs) => vs.map((x) => x.id === id ? {
        ...x, status: "recusado", progresso: 0, etapa: 0, versao: x.versao + 1,
        comentarios: [...x.comentarios, { autor: "Você", texto: comentario, quando: "agora" }],
      } : x));
      if (supabase && v) {
        (async () => {
          await supabase.from("comentarios").insert({ video_id: id, versao: v.versao, texto: comentario });
          await supabase.from("videos").update({ status: "recusado", versao: v.versao + 1, etapa: 0, progresso: 0 }).eq("id", id);
          await enviarParaEdicao(id);
        })();
      }
    },
    adicionar: (nome, mb) => {
      const id = `${nome.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now().toString(36)}`;
      setVideos((vs) => [{
        id, titulo: nome.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), produto: "Novo produto", headline: "Gancho gerado após transcrição",
        criador: "Você", status: "fila", progresso: 0, etapa: 0, duracaoBruto: 60 + Math.round(Math.random() * 90), tamanhoMb: mb,
        hue: Math.round(Math.random() * 360), criadoEm: new Date().toISOString(), versao: 1, comentarios: [],
        surpresas: /unbox|uau|reac/i.test(nome) ? [{ s: 8.2, texto: "Nossa, não acredito!", motivos: ["fala de espanto", "voz bem mais alta"] }] : undefined,
      }, ...vs]);
      return id;
    },
    criarVideo: async (nome, mb, produto, opcoes) => {
      const { data, error } = await supabase!.from("videos")
        .insert({ titulo: nome.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), produto: produto || null, status: "enviando", opcoes: { ...opcoes, mb } })
        .select("id, owner_id").single();
      if (error) throw error;
      // vídeo novo vai para o R2 quando ativo ("r2:" no começo); a capa e a transcrição seguem no Supabase
      const caminho = `${R2_ATIVO ? "r2:" : ""}${data.owner_id}/${data.id}/${nome.replace(/[^\w.\-]+/g, "_")}`;
      await supabase!.from("videos").update({ bruto_path: caminho }).eq("id", data.id);
      return { id: data.id, caminho, owner: data.owner_id };
    },
    configurarVideo: async (id, produto, opcoes) => {
      if (!supabase) return;
      const { data: atual } = await supabase.from("videos").select("opcoes").eq("id", id).maybeSingle();
      const antes = (atual?.opcoes ?? {}) as Record<string, unknown>;
      const { error } = await supabase.from("videos").update({
        produto: produto?.nome ?? null, produto_id: produto?.id ?? null,
        opcoes: { ...antes, ...opcoes, produto_id: produto?.id ?? null },
      }).eq("id", id);
      if (error) throw error;
    },
    excluirVideo: async (id) => {
      type Extra = Video & { origemId?: string; ownerId?: string };
      const lista = videos as Extra[];
      const ids = [id, ...lista.filter((v) => v.origemId === id).map((v) => v.id)];
      const owner = lista.find((v) => v.id === id)?.ownerId;
      setVideos((vs) => vs.filter((v) => !ids.includes(v.id)));
      if (!supabase) return;
      try {
        if (owner) {
          // arquivos: brutos/<dono>/<id>/… (bruto, capa, transcrição) e editados/<dono>/<id>/… de cada versão.
          // Uma versão (gancho × CTA) usa o bruto do original: só some junto com o original.
          await apagarPastas(owner, ids);   // Supabase (antigos) e R2 (novos)
        }
        const { error } = await supabase.from("videos").delete().eq("id", id);   // versões filhas saem junto (cascade)
        if (error) throw error;
      } catch (e) { await recarregar(); throw e; }
    },
    excluirVarios: async (escolhidos) => {
      type Extra = Video & { origemId?: string; ownerId?: string };
      const lista = videos as Extra[];
      const ids = Array.from(new Set([...escolhidos, ...lista.filter((v) => v.origemId && escolhidos.includes(v.origemId)).map((v) => v.id)]));
      if (!ids.length) return 0;
      setVideos((vs) => vs.filter((v) => !ids.includes(v.id)));
      if (!supabase) return ids.length;
      try {
        // arquivos por dono (Supabase antigos + R2 novos), igual à exclusão de um vídeo só
        const porDono = new Map<string, string[]>();
        for (const id of ids) { const o = lista.find((v) => v.id === id)?.ownerId; if (o) porDono.set(o, [...(porDono.get(o) ?? []), id]); }
        for (const [owner, dele] of porDono) await apagarPastas(owner, dele);
        const { error } = await supabase.from("videos").delete().in("id", ids);
        if (error) throw error;
      } catch (e) { await recarregar(); throw e; }
      return ids.length;
    },
    agendar: (id, quando) => update(id, { status: "agendado", agendadoPara: quando }),
    publicarAgora: (id) => update(id, { status: "publicado", agendadoPara: new Date().toISOString() }),
    reset: () => setVideos(VIDEOS_INICIAIS),
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = React.useContext(StoreCtx);
  if (!c) throw new Error("useStore fora do provider");
  return c;
}
