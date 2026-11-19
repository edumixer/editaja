import { NextResponse } from "next/server";

/**
 * Lê a legenda pública de um vídeo do TikTok (oEmbed oficial: título = legenda com hashtags, autor, capa).
 * Só aceita links do tiktok.com. O gancho falado e o texto na tela vêm depois, na transcrição do worker.
 */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  let alvo: URL;
  try { alvo = new URL(url); } catch { return NextResponse.json({ erro: "link inválido" }, { status: 400 }); }
  if (!/(^|\.)tiktok\.com$/i.test(alvo.hostname)) return NextResponse.json({ erro: "use um link do tiktok.com" }, { status: 400 });

  // Com o robô de tendências ligado (worker/tendencias.py), o link é lido pelo Apify: legenda, views, fala inicial e sugestão da IA.
  const robo = process.env.EDITAJA_TENDENCIAS_URL, token = process.env.WORKER_TOKEN;
  if (robo && token) {
    const produtos = new URL(req.url).searchParams.get("produtos")?.split("|").filter(Boolean) ?? [];
    const w = await fetch(robo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: alvo.toString(), token, produtos }) }).catch(() => null);
    const d = w?.ok ? await w.json().catch(() => null) : null;
    if (d && !d.erro && d.titulo) return NextResponse.json(d);
  }

  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(alvo.toString())}`, {
    headers: { accept: "application/json" }, cache: "no-store",
  }).catch(() => null);
  if (!r || !r.ok) return NextResponse.json({ erro: "o TikTok não respondeu (vídeo privado, removido ou link curto)" }, { status: 502 });
  const d = (await r.json().catch(() => ({}))) as { title?: string; author_name?: string; author_unique_id?: string; author_url?: string; thumbnail_url?: string };
  if (!d.title && !d.author_name) return NextResponse.json({ erro: "o TikTok não devolveu a legenda (vídeo privado, removido ou link curto)" }, { status: 502 });
  const perfil = d.author_unique_id ? `@${d.author_unique_id}` : (d.author_url?.match(/@[\w.]+/)?.[0] ?? "");
  return NextResponse.json({ titulo: d.title ?? "", autor: d.author_name ?? perfil, perfil, thumb: d.thumbnail_url ?? null });
}
