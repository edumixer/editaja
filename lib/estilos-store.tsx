"use client";
import * as React from "react";
import {
  ESTILOS_INICIAIS, REFERENCIAS_INICIAIS, SUGESTOES_INICIAIS, propostaDeFeedback,
  type Estilo, type Referencia, type Sugestao, type Versao, type Origem, type Regra,
} from "./estilos";

type Ctx = {
  estilos: Estilo[];
  referencias: Referencia[];
  sugestoes: Sugestao[];
  atual: (id: string) => Versao;
  adicionarReferencia: (r: { nome: string; tipo: Referencia["tipo"]; tamanho: string; estiloId: string; origem: Origem }) => void;
  removerReferencia: (id: string) => void;
  registrarFeedback: (f: { video: string; tipo: "recusa" | "aprovacao"; comentario: string; motivos?: string[]; estiloId?: string }) => void;
  aplicarSugestao: (id: string) => void;
  descartarSugestao: (id: string) => void;
  restaurarVersao: (estiloId: string, n: number) => void;
  removerRegra: (estiloId: string, regraId: string) => void;
  novoEstilo: (nome: string, baseId: string) => string;
};

const EstilosCtx = React.createContext<Ctx | null>(null);
const KEY = "editaja:estilos:v2";   // v2: "uau" virou "reação de surpresa"
const agora = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function EstilosProvider({ children }: { children: React.ReactNode }) {
  const [estilos, setEstilos] = React.useState<Estilo[]>(ESTILOS_INICIAIS);
  const [referencias, setReferencias] = React.useState<Referencia[]>(REFERENCIAS_INICIAIS);
  const [sugestoes, setSugestoes] = React.useState<Sugestao[]>(SUGESTOES_INICIAIS);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); setEstilos(d.estilos); setReferencias(d.referencias); setSugestoes(d.sugestoes); }
    } catch {}
    loaded.current = true;
  }, []);
  React.useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify({ estilos, referencias, sugestoes })); } catch {}
  }, [estilos, referencias, sugestoes]);

  /** Toda mudança no estilo vira uma versão nova (nada é apagado; dá para voltar). */
  const novaVersao = React.useCallback((estiloId: string, fn: (v: Versao) => Omit<Versao, "n" | "quando">) => {
    setEstilos((es) => es.map((e) => {
      if (e.id !== estiloId) return e;
      const base = e.versoes.find((v) => v.n === e.versaoAtual)!;
      const n = Math.max(...e.versoes.map((v) => v.n)) + 1;
      return { ...e, versaoAtual: n, versoes: [...e.versoes, { ...fn(base), n, quando: agora() }] };
    }));
  }, []);

  const atual = (id: string) => { const e = estilos.find((x) => x.id === id)!; return e.versoes.find((v) => v.n === e.versaoAtual)!; };

  const value: Ctx = {
    estilos, referencias, sugestoes, atual,
    adicionarReferencia: (r) => {
      const id = `ref-${Date.now().toString(36)}`;
      setReferencias((rs) => [{ ...r, id, hue: Math.round(Math.random() * 360), quando: "agora", analise: { status: "analisando" } }, ...rs]);
      setTimeout(() => {
        const extraido = r.tipo === "video" ? ["ritmo dos cortes", "posição das imagens", "duração do gancho"] : r.tipo === "som" ? ["som disponível para o editor"] : ["imagem disponível para sobreposição"];
        setReferencias((rs) => rs.map((x) => x.id === id ? { ...x, analise: { status: "pronta", resumo: r.tipo === "video" ? "Analisado: ritmo, enquadramento, entrada das imagens e sons." : "Pronto para o editor usar.", extraido } } : x));
        if (r.tipo === "video") {
          setSugestoes((ss) => [{
            id: `s-${id}`, estiloId: r.estiloId, video: r.nome, tipo: "aprovacao", quando: agora(), status: "pendente",
            comentario: `Nova referência analisada (${r.origem.tipo === "colaborador" ? `de ${r.origem.nome}` : "sua"}).`,
            proposta: { texto: "Adotar o ritmo de cortes desta referência (pausas máximas de 0,25 s)", regra: { id: `r-${id}`, texto: "Pausas máximas de 0,25 s entre falas", tipo: "preferencia", origem: r.nome } },
          }, ...ss]);
        }
      }, 2600);
    },
    removerReferencia: (id) => setReferencias((rs) => rs.filter((r) => r.id !== id)),
    registrarFeedback: ({ video, tipo, comentario, motivos = [], estiloId = "clean" }) => {
      const proposta = tipo === "recusa"
        ? propostaDeFeedback(comentario, motivos, video, estiloId)
        : { texto: "Reforçar as regras usadas neste vídeo (aprovado sem ajustes)", regra: { id: `r-${Date.now().toString(36)}`, texto: `Aprovado sem ajustes: ${video}`, tipo: "preferencia" as const, origem: `Aprovação · ${video}` } };
      setSugestoes((ss) => [{ id: `s-${Date.now().toString(36)}`, estiloId, video, tipo, comentario, quando: agora(), proposta, status: "pendente" }, ...ss]);
    },
    aplicarSugestao: (id) => {
      const s = sugestoes.find((x) => x.id === id);
      if (!s) return;
      novaVersao(s.estiloId, (base) => ({
        autor: s.tipo === "recusa" ? "Recusa aprendida" : "Aprovação aprendida",
        motivo: s.comentario, origem: { tipo: "aprendizado", video: s.video },
        mudancas: [`+ ${s.proposta.texto}`],
        perfil: { ...base.perfil, ...(s.proposta.patch ?? {}) },
        regras: [...base.regras, s.proposta.regra as Regra],
      }));
      setSugestoes((ss) => ss.map((x) => x.id === id ? { ...x, status: "aplicada" } : x));
    },
    descartarSugestao: (id) => setSugestoes((ss) => ss.map((x) => x.id === id ? { ...x, status: "descartada" } : x)),
    restaurarVersao: (estiloId, n) => {
      const e = estilos.find((x) => x.id === estiloId)!;
      const alvo = e.versoes.find((v) => v.n === n)!;
      novaVersao(estiloId, () => ({ autor: "Você", motivo: `Desfeito: voltou para a versão ${n}`, origem: { tipo: "voce" }, mudancas: [`↺ restaurou a v${n}`], perfil: alvo.perfil, regras: alvo.regras }));
    },
    removerRegra: (estiloId, regraId) => novaVersao(estiloId, (base) => {
      const r = base.regras.find((x) => x.id === regraId);
      return { autor: "Você", motivo: "Regra removida manualmente", origem: { tipo: "voce" }, mudancas: [`− ${r?.texto ?? regraId}`], perfil: base.perfil, regras: base.regras.filter((x) => x.id !== regraId) };
    }),
    novoEstilo: (nome, baseId) => {
      const id = `est-${Date.now().toString(36)}`;
      const base = atual(baseId);
      setEstilos((es) => [...es, {
        id, nome, descricao: `Criado a partir de ${es.find((x) => x.id === baseId)?.nome}.`, hue: Math.round(Math.random() * 360), usos: 0, aprovacao: 0, versaoAtual: 1,
        versoes: [{ ...base, n: 1, quando: agora(), autor: "Você", motivo: "Estilo novo", origem: { tipo: "voce" }, mudancas: ["= cópia do estilo base"] }],
      }]);
      return id;
    },
  };

  return <EstilosCtx.Provider value={value}>{children}</EstilosCtx.Provider>;
}

export function useEstilos() {
  const c = React.useContext(EstilosCtx);
  if (!c) throw new Error("useEstilos fora do provider");
  return c;
}

export function rotuloOrigem(o: Origem) {
  switch (o.tipo) {
    case "inicial": return { label: `Conteúdo inicial · ${o.pasta}`, curto: "Inicial" };
    case "voce": return { label: "Enviado por você", curto: "Você" };
    case "colaborador": return { label: `Colaborador(a) · ${o.nome}`, curto: o.nome };
    case "aprendizado": return { label: `Aprendido com · ${o.video}`, curto: "Aprendizado" };
  }
}
