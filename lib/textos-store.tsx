"use client";
import * as React from "react";
import { TEXTOS_INICIAIS, type OrigemTexto, type Roteiro, type TextoRef, type TipoTexto } from "./textos";

export const KEY_TEXTOS = "editaja:textos:v1";
const KEY_ROTEIROS = "editaja:roteiros:v1";

type Ctx = {
  textos: TextoRef[];
  roteiros: Roteiro[];
  adicionarTextos: (tipo: TipoTexto, textos: string[], produtoId: string | null, origem: OrigemTexto, autor?: string) => number;
  editarTexto: (id: string, p: Partial<TextoRef>) => void;
  removerTexto: (id: string) => void;
  salvarRoteiro: (r: Omit<Roteiro, "id" | "criadoEm">) => string;
  removerRoteiro: (id: string) => void;
};

const TextosCtx = React.createContext<Ctx | null>(null);
const novoId = () => Math.random().toString(36).slice(2, 10);

function usePersistente<T>(key: string, inicial: T) {
  const [v, setV] = React.useState<T>(inicial);
  const ok = React.useRef(false);
  React.useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) setV(JSON.parse(raw)); } catch {} ok.current = true; }, [key]);
  React.useEffect(() => { if (ok.current) try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV] as const;
}

export function TextosProvider({ children }: { children: React.ReactNode }) {
  const [textos, setTextos] = usePersistente<TextoRef[]>(KEY_TEXTOS, TEXTOS_INICIAIS);
  const [roteiros, setRoteiros] = usePersistente<Roteiro[]>(KEY_ROTEIROS, []);
  const value: Ctx = {
    textos, roteiros,
    adicionarTextos: (tipo, lista, produtoId, origem, autor) => {
      const novos = lista.map((texto) => texto.trim()).filter(Boolean)
        .map((texto) => ({ id: novoId(), tipo, texto, produtoId, origem, autor, destaque: false, criadoEm: new Date().toISOString() }));
      setTextos((ts) => [...novos, ...ts]);
      return novos.length;
    },
    editarTexto: (id, p) => setTextos((ts) => ts.map((x) => (x.id === id ? { ...x, ...p } : x))),
    removerTexto: (id) => setTextos((ts) => ts.filter((x) => x.id !== id)),
    salvarRoteiro: (r) => { const id = novoId(); setRoteiros((rs) => [{ ...r, id, criadoEm: new Date().toISOString() }, ...rs]); return id; },
    removerRoteiro: (id) => setRoteiros((rs) => rs.filter((x) => x.id !== id)),
  };
  return <TextosCtx.Provider value={value}>{children}</TextosCtx.Provider>;
}

export function useTextos() {
  const c = React.useContext(TextosCtx);
  if (!c) throw new Error("useTextos fora do provider");
  return c;
}

/** Lê a biblioteca salva (para quem não está dentro do React, como a geração de legenda na aprovação). */
export function textosSalvos(): TextoRef[] {
  try { const raw = localStorage.getItem(KEY_TEXTOS); if (raw) return JSON.parse(raw); } catch {}
  return TEXTOS_INICIAIS;
}
