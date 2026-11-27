import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  r2Configurado, urlAssinada, iniciarMultipart, listarPartes, concluirMultipart, cancelarMultipart, existe, apagarPasta, apagarArquivo,
} from "@/lib/r2-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Armazenamento dos vídeos no Cloudflare R2. O navegador nunca vê as chaves: pede aqui links
 * pré-assinados (enviar cada parte, assistir, baixar) e o servidor confere que o arquivo é da pessoa logada
 * (todo caminho começa com o id dela: <dono>/<video>/arquivo).
 */
const BUCKETS = new Set(["brutos", "editados"]);

export async function POST(req: Request) {
  if (!r2Configurado) return NextResponse.json({ erro: "R2 não configurado" }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!url || !chave || !jwt) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { data: u } = await createClient(url, chave).auth.getUser(jwt);
  const dono = u.user?.id;
  if (!dono) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  /** "brutos" + "<dono>/<id>/x.mov" -> "brutos/<dono>/<id>/x.mov", só se for da pessoa. */
  const chaveDe = (bucket: unknown, caminho: unknown) => {
    const c = String(caminho ?? "").replace(/^r2:/, "");
    if (!BUCKETS.has(String(bucket)) || !c.startsWith(`${dono}/`) || c.includes("..")) throw new Error("caminho inválido");
    return `${bucket}/${c}`;
  };

  try {
    switch (b.acao) {
      case "iniciar": {
        const key = chaveDe(b.bucket, b.caminho);
        return NextResponse.json({ uploadId: await iniciarMultipart(key, String(b.tipo || "video/mp4")) });
      }
      case "partes": {   // links para enviar cada parte (PUT direto do navegador para o R2)
        const key = chaveDe(b.bucket, b.caminho);
        const nums: number[] = (b.numeros ?? []).map(Number).filter((n: number) => n >= 1 && n <= 10000).slice(0, 200);
        const urls = Object.fromEntries(nums.map((n) => [n, urlAssinada({ metodo: "PUT", key, query: { partNumber: String(n), uploadId: String(b.uploadId) }, expira: 6 * 3600 })]));
        return NextResponse.json({ urls });
      }
      case "listar": {   // para retomar: quais partes já chegaram
        const key = chaveDe(b.bucket, b.caminho);
        return NextResponse.json({ partes: await listarPartes(key, String(b.uploadId)) });
      }
      case "concluir": {
        const key = chaveDe(b.bucket, b.caminho);
        await concluirMultipart(key, String(b.uploadId), b.partes ?? []);
        return NextResponse.json({ ok: true });
      }
      case "cancelar": {
        await cancelarMultipart(chaveDe(b.bucket, b.caminho), String(b.uploadId));
        return NextResponse.json({ ok: true });
      }
      case "links": {    // assistir / baixar (válido por 1 h)
        const caminhos: string[] = (b.caminhos ?? []).slice(0, 100);
        const baixar = b.baixar ? String(b.baixar) : "";
        const links = Object.fromEntries(caminhos.map((c) => [c, urlAssinada({
          metodo: "GET", key: chaveDe(b.bucket, c), expira: 3600,
          query: baixar ? { "response-content-disposition": `attachment; filename="${baixar.replace(/[^\w.\-]+/g, "_")}"` } : {},
        })]));
        return NextResponse.json({ links });
      }
      case "existe":
        return NextResponse.json({ existe: await existe(chaveDe(b.bucket, b.caminho)) });
      case "apagar": {   // pastas inteiras de um vídeo: brutos/<dono>/<id>/ e editados/<dono>/<id>/
        let n = 0;
        for (const p of (b.pastas ?? []).slice(0, 50)) {
          const key = chaveDe(p.bucket, String(p.pasta).replace(/\/?$/, "/"));
          n += await apagarPasta(key);
        }
        return NextResponse.json({ apagados: n });
      }
      case "apagar_arquivo": {   // um arquivo só (ex.: o vídeo bruto; os editados e a capa ficam)
        const key = chaveDe(b.bucket, b.caminho);
        if (key.endsWith("/")) throw new Error("caminho inválido");
        await apagarArquivo(key);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ erro: "ação desconhecida" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ erro: msg }, { status: msg === "caminho inválido" ? 403 : 502 });
  }
}
