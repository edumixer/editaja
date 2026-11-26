"use client";
import { supabase } from "./supabase";

/**
 * Onde ficam os vídeos.
 * - Novos (com NEXT_PUBLIC_ARMAZENAMENTO=r2): Cloudflare R2, sem limite de 50 MB. O caminho gravado no banco começa com "r2:".
 * - Antigos (sem "r2:"): continuam no Supabase Storage e abrem normalmente.
 * Fotos pequenas (capa, imagens dos produtos) continuam no Supabase.
 */
export const R2_ATIVO = process.env.NEXT_PUBLIC_ARMAZENAMENTO === "r2";
export const ehR2 = (c?: string | null) => !!c && c.startsWith("r2:");
const semPrefixo = (c: string) => c.replace(/^r2:/, "");

async function api<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  const r = await fetch("/api/r2", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `armazenamento: ${r.status}`);
  return j as T;
}

const cache = new Map<string, { url: string; ate: number }>();
/** Link assinado (vale 1 h; guardado por 50 min) para assistir um arquivo, no R2 ou no Supabase. */
export async function linkAssinado(bucket: string, caminho: string, baixarComo?: string): Promise<string | null> {
  const k = `${bucket}/${caminho}${baixarComo ? "#" + baixarComo : ""}`;
  const c = cache.get(k);
  if (c && c.ate > Date.now()) return c.url;
  let url: string | null = null;
  try {
    if (ehR2(caminho)) {
      const { links } = await api<{ links: Record<string, string> }>({ acao: "links", bucket, caminhos: [caminho], baixar: baixarComo });
      url = links[caminho] ?? null;
    } else {
      const { data } = await supabase!.storage.from(bucket).createSignedUrl(caminho, 3600, baixarComo ? { download: baixarComo } : undefined);
      url = data?.signedUrl ?? null;
    }
  } catch { url = null; }
  if (url) cache.set(k, { url, ate: Date.now() + 50 * 60_000 });
  return url;
}

/** O arquivo chegou inteiro no armazenamento? */
export async function arquivoExiste(bucket: string, caminho: string): Promise<boolean> {
  if (ehR2(caminho)) {
    try { return (await api<{ existe: boolean }>({ acao: "existe", bucket, caminho })).existe; } catch { return false; }
  }
  const i = caminho.lastIndexOf("/");
  const { data } = await supabase!.storage.from(bucket).list(caminho.slice(0, i), { search: caminho.slice(i + 1) });
  return !!data?.some((f) => f.name === caminho.slice(i + 1));
}

/** Apaga as pastas dos vídeos (brutos/<dono>/<id>/ e editados/<dono>/<id>/) nos dois lugares. */
export async function apagarPastas(owner: string, ids: string[]) {
  for (const bucket of ["brutos", "editados"]) for (const vid of ids) {
    const pasta = `${owner}/${vid}`;
    const { data } = await supabase!.storage.from(bucket).list(pasta, { limit: 1000 });
    const caminhos = (data ?? []).map((f) => `${pasta}/${f.name}`);
    if (caminhos.length) await supabase!.storage.from(bucket).remove(caminhos);
  }
  if (R2_ATIVO) {
    await api({ acao: "apagar", pastas: ids.flatMap((vid) => ["brutos", "editados"].map((bucket) => ({ bucket, pasta: `${owner}/${vid}` }))) })
      .catch(() => {});   // se o R2 falhar, o registro sai do banco mesmo assim
  }
}

// ---------------------------------------------------------------- envio em partes direto para o R2

const PARTE = 16 * 1024 * 1024;   // 16 MB por parte (1 GB = 64 partes)
const SIMULTANEAS = 4;
type Cb = { progresso: (enviados: number, total: number) => void; ok: () => void; erro: (e: Error) => void };

/**
 * Envio retomável para o R2: o arquivo vai em partes de 16 MB, 4 ao mesmo tempo, cada uma com até 6 tentativas.
 * Se a aba fechar ou a internet cair, ao enviar o MESMO arquivo de novo ele continua das partes que já chegaram.
 * Devolve { start, abort } (mesma forma do envio antigo): abort() pausa e start() continua.
 */
export function enviarR2(arquivo: File, caminho: string, on: Cb) {
  const bucket = "brutos", c = semPrefixo(caminho);
  const total = arquivo.size, nPartes = Math.max(1, Math.ceil(total / PARTE));
  const memo = `r2up:${c}:${total}:${arquivo.lastModified}`;
  let parado = false, terminou = false;
  const xhrs = new Set<XMLHttpRequest>();
  const feitas = new Map<number, { etag: string; tamanho: number }>();
  const andando = new Map<number, number>();
  const avisar = () => {
    let b = 0; feitas.forEach((p) => (b += p.tamanho)); andando.forEach((x) => (b += x));
    on.progresso(Math.min(b, total), total);
  };
  const ler = () => { try { return localStorage.getItem(memo); } catch { return null; } };
  const gravar = (v: string | null) => { try { if (v) localStorage.setItem(memo, v); else localStorage.removeItem(memo); } catch { /* sem localStorage */ } };

  const enviarParte = (url: string, n: number) => new Promise<string>((ok, falha) => {
    const ini = (n - 1) * PARTE, fim = Math.min(total, ini + PARTE);
    const x = new XMLHttpRequest();
    xhrs.add(x);
    x.open("PUT", url);
    x.upload.onprogress = (e) => { andando.set(n, e.loaded); avisar(); };
    x.onload = () => {
      xhrs.delete(x); andando.delete(n);
      const etag = x.getResponseHeader("ETag");
      if (x.status >= 200 && x.status < 300 && etag) ok(etag);
      else falha(new Error(x.status >= 200 && x.status < 300 ? "O R2 não devolveu o ETag (confira o CORS do bucket)" : `parte ${n}: ${x.status}`));
    };
    x.onerror = () => { xhrs.delete(x); andando.delete(n); falha(new Error(`parte ${n}: falha de rede`)); };
    x.onabort = () => { xhrs.delete(x); andando.delete(n); falha(new Error("pausado")); };
    x.send(arquivo.slice(ini, fim));
  });

  const rodar = async () => {
    try {
      let uploadId = ler();
      if (uploadId) {
        try {
          const { partes } = await api<{ partes: { n: number; etag: string; tamanho: number }[] }>({ acao: "listar", bucket, caminho: c, uploadId });
          for (const p of partes) {
            const esperado = Math.min(total, p.n * PARTE) - (p.n - 1) * PARTE;
            if (p.tamanho === esperado) feitas.set(p.n, { etag: p.etag, tamanho: p.tamanho });
          }
        } catch { uploadId = null; feitas.clear(); }
      }
      if (!uploadId) {
        uploadId = (await api<{ uploadId: string }>({ acao: "iniciar", bucket, caminho: c, tipo: arquivo.type || "video/mp4" })).uploadId;
        gravar(uploadId);
      }
      avisar();
      const faltam = Array.from({ length: nPartes }, (_, i) => i + 1).filter((n) => !feitas.has(n));
      const urls: Record<number, string> = {};
      for (let i = 0; i < faltam.length; i += 200) {
        Object.assign(urls, (await api<{ urls: Record<number, string> }>({ acao: "partes", bucket, caminho: c, uploadId, numeros: faltam.slice(i, i + 200) })).urls);
      }
      const fila = [...faltam];
      const trabalhador = async () => {
        while (fila.length && !parado) {
          const n = fila.shift()!;
          for (let t = 0; ; t++) {
            try { const etag = await enviarParte(urls[n], n); feitas.set(n, { etag, tamanho: Math.min(total, n * PARTE) - (n - 1) * PARTE }); avisar(); break; }
            catch (e) {
              if (parado) throw e;
              if (t >= 5) throw e;
              await new Promise((r) => setTimeout(r, [1000, 3000, 6000, 12000, 20000][t]));
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, fila.length || 1) }, trabalhador));
      if (parado) return;
      await api({ acao: "concluir", bucket, caminho: c, uploadId, partes: [...feitas].map(([n, p]) => ({ n, etag: p.etag })) });
      gravar(null); terminou = true;
      on.progresso(total, total);
      on.ok();
    } catch (e) {
      if (!parado) on.erro(e as Error);
    }
  };

  const ctrl = {
    start: () => { if (terminou) return; parado = false; feitas.clear(); andando.clear(); void rodar(); },
    abort: () => { parado = true; xhrs.forEach((x) => x.abort()); },
  };
  ctrl.start();
  return ctrl;
}
