"use client";
import { PageHeader } from "@/components/page-header";
import { EmAlta } from "@/components/em-alta";

export default function EmAltaPage() {
  return (
    <>
      <PageHeader title="Em alta no TikTok" description="O que está viralizando agora: vídeos, ganchos, CTAs e hashtags do TikTok Brasil, por nicho. Pesquise qualquer produto." />
      <EmAlta />
    </>
  );
}
