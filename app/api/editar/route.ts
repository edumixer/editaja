import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Coloca um vídeo na fila de edição. Só o dono do vídeo pode pedir (RLS).
 * Com EDITAJA_WORKER_URL (Modal) o worker na nuvem começa na hora.
 * Sem ele, o vídeo fica com status "fila" e o editor do computador (worker/editor_local.py) pega em até 15 s.
 */
export async function POST(req: Request) {
  const { video_id } = await req.json();
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const worker = process.env.EDITAJA_WORKER_URL, token = process.env.EDITAJA_WORKER_TOKEN;
  if (!url || !key) return NextResponse.json({ erro: "banco não configurado" }, { status: 503 });
  if (!jwt || !video_id) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: v } = await sb.from("videos").select("id").eq("id", video_id).maybeSingle();
  if (!v) return NextResponse.json({ erro: "vídeo não encontrado" }, { status: 404 });

  if (worker && token) {
    const r = await fetch(worker, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ video_id, token }) });
    if (!r.ok) return NextResponse.json({ erro: "worker indisponível" }, { status: 502 });
    return NextResponse.json({ ok: true, onde: "nuvem" });
  }
  const { error } = await sb.from("videos").update({ status: "fila", etapa: 0, progresso: 0, erro: null }).eq("id", video_id);
  if (error) return NextResponse.json({ erro: "não deu para pôr na fila" }, { status: 500 });
  return NextResponse.json({ ok: true, onde: "computador" });
}
