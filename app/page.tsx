"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Film, Scissors, Send, Sparkles, TrendingUp, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { VideoThumb } from "@/components/video-thumb";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { ETAPAS, fmtDur } from "@/lib/data";

export default function Painel() {
  const { videos } = useStore();
  const count = (s: string[]) => videos.filter((v) => s.includes(v.status)).length;
  const editando = videos.find((v) => v.status === "editando");
  const aprovacao = videos.filter((v) => v.status === "aprovacao");
  const economizado = videos.filter((v) => v.duracaoFinal).length * 2;

  const funil = [
    { label: "Na fila", curto: "Fila", n: count(["fila", "recusado"]), icon: Clock, href: "/fila" },
    { label: "Editando", curto: "Edição", n: count(["editando"]), icon: Scissors, href: "/fila" },
    { label: "Aprovação", curto: "Aprovar", n: count(["aprovacao"]), icon: CheckCircle2, href: "/aprovacao" },
    { label: "Agendados", curto: "Agenda", n: count(["aprovado", "agendado"]), icon: Clock, href: "/publicar" },
    { label: "Publicados", curto: "Postados", n: count(["publicado"]), icon: Send, href: "/publicar" },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full brand-gradient opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-muted-foreground">Olá, Eduardo 👋</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {aprovacao.length > 0 ? <>Você tem <span className="brand-text">{aprovacao.length} vídeos</span> prontos para aprovar</> : "Tudo em dia por aqui"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Envie o bruto e o EditaJá corta respiros e repetições, acelera para 1.1x, coloca sons e imagens e gera a legenda. Você só aprova.
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button variant="brand" size="lg" asChild><Link href="/biblioteca?upload=1"><Upload /> Enviar vídeo bruto</Link></Button>
            <Button variant="outline" size="lg" asChild><Link href="/aprovacao">Revisar agora <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Editados este mês", value: "23", hint: "+8 vs. mês passado", icon: Film },
          { label: "Horas economizadas", value: `${46 + economizado}h`, hint: "≈ 2h por vídeo", icon: Zap },
          { label: "Taxa de aprovação", value: "87%", hint: "na 1ª versão", icon: CheckCircle2 },
          { label: "Tempo médio de edição", value: "3m40s", hint: "vídeo de 2 min", icon: TrendingUp },
        ].map((k) => (
          <Card key={k.label} className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted-foreground sm:text-sm">{k.label}</p>
              <k.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{k.value}</p>
            <p className="mt-1 text-xs text-success">{k.hint}</p>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo dos vídeos</CardTitle>
          <CardDescription>Do bruto ao post, em tempo real</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-1 sm:gap-3">
            {funil.map((f, i) => (
              <Link key={f.label} href={f.href} className="group relative rounded-xl border bg-background/50 px-1 py-2.5 text-center transition-colors hover:border-primary/40 hover:bg-accent sm:p-4 sm:text-left">
                <f.icon className="mx-auto size-4 text-muted-foreground group-hover:text-primary sm:mx-0" />
                <p className="mt-2 text-xl font-bold sm:text-2xl">{f.n}</p>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs"><span className="sm:hidden">{f.curto}</span><span className="hidden sm:inline">{f.label}</span></p>
                {i < funil.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-card text-muted-foreground sm:block" />}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
              Editando agora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editando ? (
              <div className="flex gap-4">
                <VideoThumb hue={editando.hue} headline={editando.headline} className="w-24 shrink-0" showPlay={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{editando.titulo}</p>
                  <p className="text-xs text-muted-foreground">{editando.produto} · bruto {fmtDur(editando.duracaoBruto)}</p>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="font-medium text-primary">{ETAPAS[editando.etapa].nome}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(editando.progresso)}%</span>
                  </div>
                  <Progress value={editando.progresso} className="mt-1.5" />
                  <p className="mt-2 text-xs text-muted-foreground">{ETAPAS[editando.etapa].detalhe}</p>
                  <Button variant="link" size="sm" className="mt-2 h-auto px-0" asChild><Link href="/fila">Ver fila completa <ArrowRight /></Link></Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum vídeo em edição. <Link className="font-medium text-primary" href="/biblioteca?upload=1">Enviar um bruto</Link></div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Prontos para aprovar</CardTitle>
              <CardDescription className="mt-1">Assista, aprove ou peça ajustes</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/aprovacao">Ver todos</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-none">
              {videos.filter((v) => ["aprovacao", "aprovado", "agendado"].includes(v.status)).map((v) => (
                <Link key={v.id} href={`/aprovacao/${v.id}`} className="group w-32 shrink-0 sm:w-36">
                  <VideoThumb hue={v.hue} headline={v.headline} className="transition-transform group-hover:-translate-y-0.5 group-hover:shadow-lg" />
                  <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug">{v.titulo}</p>
                  <div className="mt-1"><StatusBadge status={v.status} /></div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Seu estilo de edição</CardTitle>
            <CardDescription className="mt-1">O editor aprendeu essas regras com os seus vídeos aprovados</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild><Link href="/configuracoes">Ajustar</Link></Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["Capa 0.1s", "1.1x", "Corta respiros", "Mantém a última tentativa", "Redução de ruído", "Qualidade original", "🚨 no “cuidado”", "Imagens onde aponta", "Bubble pop nas fotos", "Click no “clica”", "Clean, sem CTAs"].map((r) => (
            <span key={r} className="rounded-full border bg-background/60 px-3 py-1 text-xs font-medium">{r}</span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
