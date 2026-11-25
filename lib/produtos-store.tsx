"use client";
import * as React from "react";
import { toast } from "sonner";
import { PRODUTOS_INICIAIS, IDS_EXEMPLO, type Produto, type ImagemProduto, type Rotulo } from "./produtos";
import { modoReal, supabase } from "./supabase";

/**
 * Produtos e as imagens de referência de cada um.
 * Modo real: ficam SALVOS NA CONTA (tabelas produtos / produto_imagens + Storage "biblioteca"),
 * então aparecem em qualquer navegador, celular ou link da plataforma.
 * Modo demonstração (sem banco): ficam só neste navegador.
 */
type Ctx = {
  produtos: Produto[];
  carregando: boolean;
  criarProduto: (nome: string, descricao: string, palavras: string[]) => string;
  editarProduto: (id: string, p: Partial<Pick<Produto, "nome" | "descricao" | "palavras">>) => void;
  removerProduto: (id: string) => void;
  adicionarImagens: (produtoId: string, arquivos: File[], rotulo: Rotulo) => void;
  rotularImagem: (produtoId: string, imagemId: string, rotulo: Rotulo) => void;
  removerImagem: (produtoId: string, imagemId: string) => void;
};

const ProdutosCtx = React.createContext<Ctx | null>(null);
const KEY = "editaja:produtos:v1";
const KEY_IMPORTADO = "editaja:produtos:importado";
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hueDe = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const tamanho = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16)));
const nomeArquivo = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
const exemplo = (nome: string) => /gr[eê]mio/i.test(nome);

/** Lê a imagem como data URL (só no modo demonstração, para aparecer a miniatura). */
const lerImagem = (f: File) => new Promise<string | undefined>((ok) => {
  if (f.size > 600_000) return ok(undefined);
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(undefined); r.readAsDataURL(f);
});

type LinhaProduto = { id: string; nome: string; descricao: string | null; palavras: string[] | null; created_at: string };
type LinhaImagem = { id: string; produto_id: string; nome: string; rotulo: Rotulo; storage_path: string; tamanho_kb: number | null; ordem: number; origem: string | null };

export function ProdutosProvider({ children }: { children: React.ReactNode }) {
  const [produtos, setProdutos] = React.useState<Produto[]>(PRODUTOS_INICIAIS);
  const [carregando, setCarregando] = React.useState(modoReal);
  const [uid, setUid] = React.useState<string | null>(null);
  const uidRef = React.useRef<string | null | undefined>(undefined);
  const loaded = React.useRef(false);

  /* ---------- modo real: carrega da conta ---------- */
  const recarregar = React.useCallback(async () => {
    if (!supabase) return;
    const [{ data: ps }, { data: ims }] = await Promise.all([
      supabase.from("produtos").select("id, nome, descricao, palavras, created_at").order("created_at", { ascending: false }),
      supabase.from("produto_imagens").select("id, produto_id, nome, rotulo, storage_path, tamanho_kb, ordem, origem").order("ordem"),
    ]);
    const imagens = (ims as LinhaImagem[] | null) ?? [];
    // miniaturas: links assinados (1 h) das imagens guardadas no Storage
    const urls: Record<string, string> = {};
    if (imagens.length) {
      const { data } = await supabase.storage.from("biblioteca").createSignedUrls(imagens.map((i) => i.storage_path), 3600);
      for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    }
    setProdutos(((ps as LinhaProduto[] | null) ?? []).map((p) => ({
      id: p.id, nome: p.nome, descricao: p.descricao ?? "", palavras: p.palavras ?? [], hue: hueDe(p.id), pasta: "enviado",
      imagens: imagens.filter((i) => i.produto_id === p.id).map((i): ImagemProduto => ({
        id: i.id, nome: i.nome, rotulo: i.rotulo, hue: hueDe(i.id), tamanho: tamanho((i.tamanho_kb ?? 0) * 1000),
        origem: i.origem ?? "Enviado por você", caminho: i.storage_path, url: urls[i.storage_path],
      })),
    })));
    setCarregando(false);
  }, []);

  /** Sobe uma imagem para o Storage e grava a linha dela. */
  const subirImagem = React.useCallback(async (dono: string, produtoId: string, arq: Blob, nome: string, rotulo: Rotulo, ordem: number, origem: string) => {
    const caminho = `${dono}/produtos/${produtoId}/${Date.now().toString(36)}-${nomeArquivo(nome)}`;
    const up = await supabase!.storage.from("biblioteca").upload(caminho, arq, { contentType: arq.type || "image/png", upsert: false });
    if (up.error) throw up.error;
    const { error } = await supabase!.from("produto_imagens").insert({
      owner_id: dono, produto_id: produtoId, nome, rotulo, storage_path: caminho, tamanho_kb: Math.round(arq.size / 1000), ordem, origem,
    });
    if (error) throw error;
  }, []);

  /** Uma vez por conta+navegador: traz para a conta os produtos que a versão antiga guardava só neste navegador. */
  const importarDoNavegador = React.useCallback(async (dono: string) => {
    let antigos: Produto[] = [];
    try {
      if (localStorage.getItem(`${KEY_IMPORTADO}:${dono}`)) return;
      antigos = JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch { return; }
    // produtos de exemplo só entram se a pessoa colocou imagens próprias neles; o Grêmio (fictício) nunca
    const meus = antigos.filter((p) => !exemplo(p.nome) && (!IDS_EXEMPLO.includes(p.id) || p.imagens.some((i) => i.origem === "Enviado por você")));
    let n = 0;
    for (const p of meus) {
      const { data: existe } = await supabase!.from("produtos").select("id").eq("nome", p.nome).limit(1).maybeSingle();
      if (existe) continue;
      const id = uuid();
      const { error } = await supabase!.from("produtos").insert({
        id, owner_id: dono, slug: `${slug(p.nome) || "produto"}-${id.slice(0, 6)}`, nome: p.nome,
        descricao: p.descricao || null, palavras: p.palavras ?? [], pasta_origem: "importado do navegador",
      });
      if (error) continue;
      n++;
      let ordem = 1;
      for (const im of p.imagens) {
        if (!im.url?.startsWith("data:")) continue; // só as imagens que o navegador guardou inteiras
        try { const blob = await (await fetch(im.url)).blob(); await subirImagem(dono, id, blob, im.nome, im.rotulo, ordem++, "Importado do navegador"); } catch {}
      }
    }
    try { localStorage.setItem(`${KEY_IMPORTADO}:${dono}`, new Date().toISOString()); } catch {}
    if (n) toast.success(`${n} produto(s) recuperado(s) deste navegador`, { description: "Agora ficam salvos na sua conta." });
  }, [subirImagem]);

  React.useEffect(() => {
    if (!supabase) return;
    const iniciar = async (id: string | null) => {
      if (uidRef.current === id) return;
      uidRef.current = id; setUid(id);
      if (!id) { setProdutos([]); setCarregando(false); return; }
      setCarregando(true);
      await importarDoNavegador(id);
      await recarregar();
    };
    supabase.auth.getSession().then(({ data }) => iniciar(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { iniciar(s?.user.id ?? null); });
    return () => sub.subscription.unsubscribe();
  }, [recarregar, importarDoNavegador]);

  /* ---------- modo demonstração: só neste navegador ---------- */
  React.useEffect(() => {
    if (modoReal) return;
    try { const raw = localStorage.getItem(KEY); if (raw) setProdutos((JSON.parse(raw) as Produto[]).filter((p) => !exemplo(p.nome))); } catch {}
    loaded.current = true;
  }, []);
  React.useEffect(() => {
    if (modoReal || !loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(produtos)); } catch {}
  }, [produtos]);

  const mudar = (id: string, fn: (p: Produto) => Produto) => setProdutos((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
  const falhou = (o: string) => (e: unknown) => { toast.error(`Não deu para ${o}`, { description: (e as Error)?.message ?? "Tente de novo." }); recarregar(); };

  const value: Ctx = {
    produtos, carregando,
    criarProduto: (nome, descricao, palavras) => {
      const id = modoReal ? uuid() : `${slug(nome) || "produto"}-${Date.now().toString(36)}`;
      setProdutos((ps) => [{ id, nome, descricao, palavras, hue: hueDe(id), imagens: [], pasta: "enviado" }, ...ps]);
      if (supabase && uid) {
        supabase.from("produtos").insert({ id, owner_id: uid, slug: `${slug(nome) || "produto"}-${id.slice(0, 6)}`, nome, descricao: descricao || null, palavras })
          .then(({ error }) => { if (error) falhou("criar o produto")(error); });
      }
      return id;
    },
    editarProduto: (id, p) => {
      mudar(id, (x) => ({ ...x, ...p }));
      if (supabase) supabase.from("produtos").update({ ...p, ...(p.descricao !== undefined ? { descricao: p.descricao || null } : {}) }).eq("id", id)
        .then(({ error }) => { if (error) falhou("salvar o produto")(error); });
    },
    removerProduto: (id) => {
      const p = produtos.find((x) => x.id === id);
      setProdutos((ps) => ps.filter((x) => x.id !== id));
      if (supabase) (async () => {
        const caminhos = (p?.imagens ?? []).map((i) => i.caminho).filter(Boolean) as string[];
        if (caminhos.length) await supabase.storage.from("biblioteca").remove(caminhos);
        const { error } = await supabase.from("produtos").delete().eq("id", id);
        if (error) falhou("excluir o produto")(error);
      })();
    },
    adicionarImagens: async (produtoId, arquivos, rotulo) => {
      const novas: ImagemProduto[] = await Promise.all(arquivos.map(async (f) => ({
        id: Math.random().toString(36).slice(2), nome: f.name, rotulo, hue: Math.round(Math.random() * 360),
        tamanho: tamanho(f.size), url: modoReal ? URL.createObjectURL(f) : await lerImagem(f), origem: "Enviado por você",
      })));
      const base = produtos.find((p) => p.id === produtoId)?.imagens.length ?? 0;
      mudar(produtoId, (p) => ({ ...p, imagens: [...p.imagens, ...novas] }));
      if (supabase && uid) {
        try {
          for (const [i, f] of arquivos.entries()) await subirImagem(uid, produtoId, f, f.name, rotulo, base + i + 1, "Enviado por você");
          await recarregar();
        } catch (e) { falhou("enviar a imagem")(e); }
      }
    },
    rotularImagem: (produtoId, imagemId, rotulo) => {
      mudar(produtoId, (p) => ({ ...p, imagens: p.imagens.map((i) => (i.id === imagemId ? { ...i, rotulo } : i)) }));
      if (supabase) supabase.from("produto_imagens").update({ rotulo }).eq("id", imagemId).then(({ error }) => { if (error) falhou("mudar a marcação")(error); });
    },
    removerImagem: (produtoId, imagemId) => {
      const im = produtos.find((p) => p.id === produtoId)?.imagens.find((i) => i.id === imagemId);
      mudar(produtoId, (p) => ({ ...p, imagens: p.imagens.filter((i) => i.id !== imagemId) }));
      if (supabase) (async () => {
        if (im?.caminho) await supabase.storage.from("biblioteca").remove([im.caminho]);
        const { error } = await supabase.from("produto_imagens").delete().eq("id", imagemId);
        if (error) falhou("remover a imagem")(error);
      })();
    },
  };
  return <ProdutosCtx.Provider value={value}>{children}</ProdutosCtx.Provider>;
}

export function useProdutos() {
  const c = React.useContext(ProdutosCtx);
  if (!c) throw new Error("useProdutos fora do provider");
  return c;
}
