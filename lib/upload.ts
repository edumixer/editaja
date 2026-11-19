"use client";
import * as tus from "tus-js-client";
import { supabase, SUPABASE_URL } from "./supabase";

/**
 * Upload retomável (protocolo TUS) direto para o Supabase Storage, em partes de 6 MB.
 * Se a conexão cair, `findPreviousUploads` retoma da última parte enviada.
 */
export async function enviarRetomavel(
  arquivo: File, caminho: string,
  on: { progresso: (enviados: number, total: number) => void; ok: () => void; erro: (e: Error) => void },
) {
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  const up = new tus.Upload(arquivo, {
    endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
    retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
    headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: 6 * 1024 * 1024,
    metadata: { bucketName: "brutos", objectName: caminho, contentType: arquivo.type || "video/mp4", cacheControl: "3600" },
    onProgress: on.progresso,
    onSuccess: on.ok,
    onError: on.erro,
  });
  const anteriores = await up.findPreviousUploads();
  if (anteriores.length) up.resumeFromPreviousUpload(anteriores[0]);
  up.start();
  return up; // up.abort() pausa; up.start() retoma
}
