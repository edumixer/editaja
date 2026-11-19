"use client";
import * as React from "react";
import { PRODUTOS_INICIAIS, type Produto, type ImagemProduto, type Rotulo } from "./produtos";

type Ctx = {
  produtos: Produto[];
  criarProduto: (nome: string, descricao: string, palavras: string[]) => string;
  editarProduto: (id: string, p: Partial<Pick<Produto, "nome" | "descricao" | "palavras">>) => void;
  removerProduto: (id: string) => void;
  adicionarImagens: (produtoId: string, arquivos: File[], rotulo: Rotulo) => void;
  rotularImagem: (produtoId: string, imagemId: string, rotulo: Rotulo) => void;
  removerImagem: (produtoId: string, imagemId: string) => void;
};

const ProdutosCtx = React.createContext<Ctx | null>(null);
const KEY = "editaja:produtos:v1";
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Lê a imagem como data URL (só no modo demonstração, para aparecer a miniatura). */
const lerImagem = (f: File) => new Promise<string | undefined>((ok) => {
  if (f.size > 600_000) return ok(undefined);
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(undefined); r.readAsDataURL(f);
});

export function ProdutosProvider({ children }: { children: React.ReactNode }) {
  const [produtos, setProdutos] = React.useState<Produto[]>(PRODUTOS_INICIAIS);
  const loaded = React.useRef(false);
  React.useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setProdutos(JSON.parse(raw)); } catch {}
    loaded.current = true;
  }, []);
  React.useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(produtos)); } catch {}
  }, [produtos]);

  const mudar = (id: string, fn: (p: Produto) => Produto) => setProdutos((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  const value: Ctx = {
    produtos,
    criarProduto: (nome, descricao, palavras) => {
      const id = `${slug(nome) || "produto"}-${Date.now().toString(36)}`;
      setProdutos((ps) => [{ id, nome, descricao, palavras, hue: Math.round(Math.random() * 360), imagens: [], pasta: "enviado" }, ...ps]);
      return id;
    },
    editarProduto: (id, p) => mudar(id, (x) => ({ ...x, ...p })),
    removerProduto: (id) => setProdutos((ps) => ps.filter((p) => p.id !== id)),
    adicionarImagens: async (produtoId, arquivos, rotulo) => {
      const novas: ImagemProduto[] = await Promise.all(arquivos.map(async (f) => ({
        id: Math.random().toString(36).slice(2), nome: f.name, rotulo, hue: Math.round(Math.random() * 360),
        tamanho: f.size > 1e6 ? `${(f.size / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(f.size / 1e3))} KB`,
        url: await lerImagem(f), origem: "Enviado por você",
      })));
      mudar(produtoId, (p) => ({ ...p, imagens: [...p.imagens, ...novas] }));
    },
    rotularImagem: (produtoId, imagemId, rotulo) => mudar(produtoId, (p) => ({ ...p, imagens: p.imagens.map((i) => (i.id === imagemId ? { ...i, rotulo } : i)) })),
    removerImagem: (produtoId, imagemId) => mudar(produtoId, (p) => ({ ...p, imagens: p.imagens.filter((i) => i.id !== imagemId) })),
  };
  return <ProdutosCtx.Provider value={value}>{children}</ProdutosCtx.Provider>;
}

export function useProdutos() {
  const c = React.useContext(ProdutosCtx);
  if (!c) throw new Error("useProdutos fora do provider");
  return c;
}
