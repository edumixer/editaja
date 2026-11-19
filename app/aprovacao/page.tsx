"use client";
import * as React from "react";
import Link from "next/link";
import { Clock, Scissors, Image as ImageIcon, Volume2, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoThumb } from "@/components/video-thumb";
import { MiniaturaReal, quandoEditado, type VideoReal } from "@/components/video-real";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { fmtDur, type Status } from "@/lib/data";

const FILTROS: { id: string; label: string; status: Status[] }[] = [
  { id: "pendentes", label: "Pendentes", status: ["aprovacao"] },
  { id: "aprovados", label: "Aprovados", status: ["aprovado", "agendado", "publicado"] },
  { id: "reeditando", label: "Reeditando", status: ["recusado"] },
];

export default function Aprovacao() {
  const { videos, modoReal, sessao } = useStore();
  const [f, setF] = React.useState("pendentes");
  const lista = videos.filter((v) => FILTROS.find((x) => x.id === f)!.status.includes(v.status));

  return (
    <>
      <PageHeader title="Aprovação" description="Assista cada vídeo editado e aprove, ou peça ajustes com um comentário." />
      {!modoReal && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <b>Modo exemplo:</b> esta versão ainda não está ligada ao servidor de edição. Os vídeos enviados não saem do seu navegador e as imagens abaixo são prévias simuladas, não o vídeo editado.
        </p>
      )}
      <Tabs value={f} onValueChange={setF}>
        <TabsList className="mb-5 w-full sm:w-auto">
          {FILTROS.map((x) => {
            const n = videos.filter((v) => x.status.includes(v.status)).length;
            return <TabsTrigger key={x.id} value={x.id} className="flex-1 sm:flex-none">{x.label} <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{n}</span></TabsTrigger>;
          })}
        </TabsList>
      </Tabs>

      {lista.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nada por aqui agora.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lista.map((v) => (
            <Link key={v.id} href={`/aprovacao/${v.id}`} className="group">
              <div className="relative">
                {modoReal
                  ? <MiniaturaReal owner={sessao?.user.id} id={v.id} versao={v.versao} caminho={(v as VideoReal).editadoPath} className="transition-all group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10" />
                  : <VideoThumb hue={v.hue} headline={v.headline} className="transition-all group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10" />}
                <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur">{fmtDur(v.duracaoFinal)}</span>
                {v.variante && <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">Versão {v.variante}</span>}
              </div>
              <div className="mt-2.5"><StatusBadge status={v.status} /></div>
              <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{v.titulo}</p>
              {quandoEditado(v) && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarClock className="size-3 shrink-0" />Editado {quandoEditado(v)}</p>}
              <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-0.5"><Clock className="size-3" />{fmtDur(v.duracaoBruto)}</span>
                <span className="flex items-center gap-0.5"><Scissors className="size-3" />{v.cortes ?? "—"}</span>
                <span className="flex items-center gap-0.5"><ImageIcon className="size-3" />{v.imagens ?? "—"}</span>
                <span className="flex items-center gap-0.5"><Volume2 className="size-3" />{v.sons ?? "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
