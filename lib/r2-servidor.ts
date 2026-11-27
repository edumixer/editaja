import { createHash, createHmac } from "node:crypto";

/**
 * Cloudflare R2 (compatível com S3) sem dependências: assinatura AWS SigV4 feita aqui.
 * As chaves ficam só nas variáveis de ambiente da Vercel (nunca vão para o navegador):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * No R2 tudo fica num bucket só; a "pasta" de cima é o antigo bucket do Supabase: brutos/… e editados/…
 */
const conta = process.env.R2_ACCOUNT_ID ?? "";
const chave = process.env.R2_ACCESS_KEY_ID ?? "";
const segredo = process.env.R2_SECRET_ACCESS_KEY ?? "";
export const R2_BUCKET = process.env.R2_BUCKET ?? "";
export const r2Configurado = Boolean(conta && chave && segredo && R2_BUCKET);
// R2_ENDPOINT só para teste local (ex.: http://127.0.0.1:5000); em produção é sempre o endereço da conta no R2
const base = process.env.R2_ENDPOINT || `https://${conta}.r2.cloudflarestorage.com`;
const host = base.replace(/^https?:\/\//, "");

const sha256 = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
/** Codificação de URI do SigV4 (RFC 3986). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const caminhoUrl = (key: string) => `/${R2_BUCKET}${key ? "/" + key.split("/").map(enc).join("/") : ""}`;

type Assinar = { metodo: string; key: string; query?: Record<string, string>; corpo?: string; expira?: number };

function credenciais(agora: Date) {
  const amzDate = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = amzDate.slice(0, 8);
  const escopo = `${dia}/auto/s3/aws4_request`;
  const kAssin = hmac(hmac(hmac(hmac("AWS4" + segredo, dia), "auto"), "s3"), "aws4_request");
  return { amzDate, escopo, kAssin };
}
const consulta = (q: Record<string, string>) =>
  Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join("&");

/** URL pré-assinada (o navegador usa direto, sem as chaves). */
export function urlAssinada({ metodo, key, query = {}, expira = 3600 }: Assinar) {
  const { amzDate, escopo, kAssin } = credenciais(new Date());
  const q: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${chave}/${escopo}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expira),
    "X-Amz-SignedHeaders": "host",
  };
  const cq = consulta(q);
  const canon = [metodo, caminhoUrl(key), cq, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const texto = ["AWS4-HMAC-SHA256", amzDate, escopo, sha256(canon)].join("\n");
  const assin = createHmac("sha256", kAssin).update(texto).digest("hex");
  return `${base}${caminhoUrl(key)}?${cq}&X-Amz-Signature=${assin}`;
}

/** Chamada assinada feita pelo servidor (criar/concluir envio em partes, listar, apagar). */
async function chamar({ metodo, key, query = {}, corpo = "" }: Assinar) {
  const { amzDate, escopo, kAssin } = credenciais(new Date());
  const hashCorpo = sha256(corpo);
  const cq = consulta(query);
  const cab = `host:${host}\nx-amz-content-sha256:${hashCorpo}\nx-amz-date:${amzDate}\n`;
  const assinados = "host;x-amz-content-sha256;x-amz-date";
  const canon = [metodo, caminhoUrl(key), cq, cab, assinados, hashCorpo].join("\n");
  const texto = ["AWS4-HMAC-SHA256", amzDate, escopo, sha256(canon)].join("\n");
  const assin = createHmac("sha256", kAssin).update(texto).digest("hex");
  const r = await fetch(`${base}${caminhoUrl(key)}${cq ? "?" + cq : ""}`, {
    method: metodo,
    headers: {
      "x-amz-content-sha256": hashCorpo, "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${chave}/${escopo}, SignedHeaders=${assinados}, Signature=${assin}`,
      ...(corpo ? { "content-type": "application/xml" } : {}),
    },
    body: corpo || undefined,
    cache: "no-store",
  });
  const txt = metodo === "HEAD" ? "" : await r.text();
  return { ok: r.ok, status: r.status, txt };
}

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`, "g"))].map((m) => m[1]);
const desescapar = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");

function falhou(onde: string, r: { status: number; txt: string }): never {
  throw new Error(`R2 ${onde}: ${r.status} ${tag(r.txt, "Message")[0] ?? tag(r.txt, "Code")[0] ?? ""}`.trim());
}

export async function iniciarMultipart(key: string, tipo: string) {
  void tipo;
  const r = await chamar({ metodo: "POST", key, query: { uploads: "" } });
  if (!r.ok) falhou("iniciar", r);
  return tag(r.txt, "UploadId")[0];
}

export async function listarPartes(key: string, uploadId: string) {
  const partes: { n: number; etag: string; tamanho: number }[] = [];
  let marcador = "";
  for (let i = 0; i < 20; i++) {
    const r = await chamar({ metodo: "GET", key, query: { uploadId, "max-parts": "1000", ...(marcador ? { "part-number-marker": marcador } : {}) } });
    if (!r.ok) falhou("listar partes", r);
    for (const p of tag(r.txt, "Part")) {
      partes.push({ n: Number(tag(p, "PartNumber")[0]), etag: desescapar(tag(p, "ETag")[0] ?? ""), tamanho: Number(tag(p, "Size")[0]) });
    }
    if (tag(r.txt, "IsTruncated")[0] !== "true") break;
    marcador = tag(r.txt, "NextPartNumberMarker")[0] ?? "";
  }
  return partes;
}

export async function concluirMultipart(key: string, uploadId: string, partes: { n: number; etag: string }[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const corpo = `<CompleteMultipartUpload>${[...partes].sort((a, b) => a.n - b.n)
    .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${esc(p.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const r = await chamar({ metodo: "POST", key, query: { uploadId }, corpo });
  if (!r.ok || /<Error>/.test(r.txt)) falhou("concluir", r);
}

export async function cancelarMultipart(key: string, uploadId: string) {
  await chamar({ metodo: "DELETE", key, query: { uploadId } });
}

export async function existe(key: string) {
  const r = await chamar({ metodo: "HEAD", key });
  return r.ok;
}

/** Apaga um arquivo (R2 responde 204 também quando ele já não existe). */
export async function apagarArquivo(key: string) {
  const r = await chamar({ metodo: "DELETE", key });
  if (!r.ok) falhou("apagar", r);
}

/** Apaga tudo que começa com o prefixo (ex.: "brutos/<dono>/<id>/"). */
export async function apagarPasta(prefixo: string) {
  let n = 0, token = "";
  for (let i = 0; i < 20; i++) {
    const r = await chamar({ metodo: "GET", key: "", query: { "list-type": "2", prefix: prefixo, ...(token ? { "continuation-token": token } : {}) } });
    if (!r.ok) falhou("listar", r);
    const keys = tag(r.txt, "Key").map(desescapar);
    for (const k of keys) { const d = await chamar({ metodo: "DELETE", key: k }); if (d.ok) n++; }
    if (tag(r.txt, "IsTruncated")[0] !== "true") break;
    token = desescapar(tag(r.txt, "NextContinuationToken")[0] ?? "");
  }
  return n;
}
