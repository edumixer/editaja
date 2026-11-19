"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Clock, Instagram, Link2, Send, ShieldCheck, Sparkles, Zap, Facebook, Building2, Music2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoThumb } from "@/components/video-thumb";
import { StatusBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import type { Video } from "@/lib/data";
import { cn } from "@/lib/utils";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MELHORES = ["12:00", "18:30", "19:30", "21:00"];

function startOfWeek(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function ConectarInstagram({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const passos = [
    { icon: Building2, t: "Conta Profissional no Instagram", d: "Configurações › Tipo de conta › Mudar para conta profissional (Criador ou Empresa)." },
    { icon: Facebook, t: "Vincular a uma Página do Facebook", d: "A API oficial da Meta exige que a conta esteja ligada a uma Página." },
    { icon: ShieldCheck, t: "Autorizar o EditaJá", d: "Login com Facebook e permissão para publicar Reels. Nunca pedimos sua senha." },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Instagram className="size-5" /> Conectar Instagram</DialogTitle>
          <DialogDescription>Publicação automática pela API oficial do Instagram (Meta Graph API).</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {passos.map((p, i) => (
            <li key={p.t} className="flex gap-3 rounded-xl border p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><p.icon className="size-4" /></span>
              <div><p className="text-sm font-medium">{i + 1}. {p.t}</p><p className="mt-0.5 text-xs text-muted-foreground">{p.d}</p></div>
            </li>
          ))}
        </ol>
        <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Integração preparada. A conexão real é liberada no próximo passo, depois que o app for aprovado pela Meta.</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Depois</Button>
          <Button variant="brand" onClick={() => { onOpenChange(false); toast("Conexão com Instagram em breve", { description: "Você vai receber um aviso quando estiver liberada." }); }}>
            <Facebook /> Continuar com Facebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgendarDialog({ v, onClose }: { v: Video | null; onClose: () => void }) {
  const { agendar, publicarAgora } = useStore();
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  const [data, setData] = React.useState(ymd(amanha));
  const [hora, setHora] = React.useState("19:30");
  const [ig, setIg] = React.useState(true);
  const [tt, setTt] = React.useState(false);
  if (!v) return null;
  return (
    <Dialog open={!!v} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agendar publicação</DialogTitle>
          <DialogDescription>{v.titulo}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4">
          <VideoThumb hue={v.hue} headline={v.headline} className="w-24 shrink-0" showPlay={false} />
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-medium">{v.legenda}</p>
            <p className="line-clamp-3 text-xs text-muted-foreground">{v.descricao}</p>
            <p className="text-xs text-primary">{v.hashtags?.join(" ")}</p>
            <Link href={`/aprovacao/${v.id}`} className="text-xs font-medium underline-offset-4 hover:underline">Editar textos</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2"><Label htmlFor="d">Data</Label><Input id="d" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="h">Horário</Label><Input id="h" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> Melhores horários para o seu público</p>
          <div className="flex flex-wrap gap-1.5">
            {MELHORES.map((h) => <button key={h} onClick={() => setHora(h)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", hora === h ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{h}</button>)}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><Instagram className="size-4" /> Instagram Reels</span><Switch checked={ig} onCheckedChange={setIg} /></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><Music2 className="size-4" /> TikTok <Badge variant="secondary">em breve</Badge></span><Switch checked={tt} onCheckedChange={setTt} disabled /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { publicarAgora(v.id); onClose(); toast.success("Publicado (simulação)"); }}><Zap /> Publicar agora</Button>
          <Button variant="brand" onClick={() => { agendar(v.id, `${data}T${hora}:00`); onClose(); toast.success("Agendado!", { description: `${new Date(`${data}T${hora}:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })} às ${hora}` }); }}>
            <CalendarClock /> Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Publicar() {
  const params = useSearchParams();
  const { videos } = useStore();
  const [conectar, setConectar] = React.useState(false);
  const [sel, setSel] = React.useState<Video | null>(null);
  const [semana, setSemana] = React.useState(() => startOfWeek(new Date()));
  React.useEffect(() => {
    const id = params.get("video");
    if (id) { const v = videos.find((x) => x.id === id); if (v && v.status === "aprovado") setSel(v); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const prontos = videos.filter((v) => v.status === "aprovado");
  const agendados = videos.filter((v) => (v.status === "agendado" || v.status === "publicado") && v.agendadoPara);
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setDate(d.getDate() + i); return d; });
  const hoje = ymd(new Date());

  return (
    <>
      <PageHeader title="Publicação" description="Agende os vídeos aprovados e publique direto no Instagram." />

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] text-white shadow-lg"><Instagram className="size-6" /></div>
          <div className="flex-1">
            <p className="flex items-center gap-2 font-semibold">Instagram <Badge variant="warning">Não conectado</Badge></p>
            <p className="mt-0.5 text-sm text-muted-foreground">Conecte sua conta Profissional (ligada a uma Página do Facebook) para publicar Reels automaticamente.</p>
          </div>
          <Button variant="brand" onClick={() => setConectar(true)}><Link2 /> Conectar conta</Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:order-2">
          <CardHeader>
            <CardTitle className="text-base">Prontos para agendar</CardTitle>
            <CardDescription>Aprovados, com legenda gerada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {prontos.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum vídeo aprovado aguardando. <Link href="/aprovacao" className="font-medium text-primary">Revisar vídeos</Link></p>}
            {prontos.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <VideoThumb hue={v.hue} className="w-11 shrink-0 rounded-lg" showPlay={false} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.legenda}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSel(v)}><CalendarClock /> Agendar</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:order-1 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Calendário</CardTitle>
              <CardDescription className="mt-1">{dias[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – {dias[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</CardDescription>
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="outline" aria-label="Semana anterior" onClick={() => setSemana((s) => { const d = new Date(s); d.setDate(d.getDate() - 7); return d; })}><ChevronLeft /></Button>
              <Button size="sm" variant="outline" onClick={() => setSemana(startOfWeek(new Date()))}>Hoje</Button>
              <Button size="icon-sm" variant="outline" aria-label="Próxima semana" onClick={() => setSemana((s) => { const d = new Date(s); d.setDate(d.getDate() + 7); return d; })}><ChevronRight /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {dias.map((d) => {
                const k = ymd(d);
                const posts = agendados.filter((v) => v.agendadoPara!.slice(0, 10) === k);
                return (
                  <div key={k} className={cn("min-h-36 rounded-xl border p-1.5 sm:min-h-44 sm:p-2", k === hoje && "border-primary/50 bg-accent/40")}>
                    <p className="text-center text-[10px] font-medium uppercase text-muted-foreground sm:text-left">{DIAS[d.getDay()]}</p>
                    <p className={cn("text-center text-sm font-semibold sm:text-left", k === hoje && "text-primary")}>{d.getDate()}</p>
                    <div className="mt-1.5 space-y-1">
                      {posts.map((v) => (
                        <Link key={v.id} href={`/aprovacao/${v.id}`} className={cn("block rounded-md p-1 text-[10px] leading-tight sm:p-1.5", v.status === "publicado" ? "bg-success/12 text-success" : "bg-primary/12 text-primary")}>
                          <span className="flex items-center gap-0.5 font-semibold">{v.status === "publicado" ? <Check className="size-2.5" /> : <Clock className="size-2.5" />}{v.agendadoPara!.slice(11, 16)}</span>
                          <span className="hidden truncate sm:block">{v.produto}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Agendados e publicados</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {agendados.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-5 py-3">
              <VideoThumb hue={v.hue} className="w-9 shrink-0 rounded-md" showPlay={false} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.titulo}</p>
                <p className="text-xs text-muted-foreground">{new Date(v.agendadoPara!).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · Instagram</p>
              </div>
              <StatusBadge status={v.status} />
              {v.status === "agendado" && <Button variant="ghost" size="icon-sm" aria-label="Publicar agora"><Send /></Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      <ConectarInstagram open={conectar} onOpenChange={setConectar} />
      <AgendarDialog v={sel} onClose={() => setSel(null)} />
    </>
  );
}

export default function Page() {
  return <Suspense><Publicar /></Suspense>;
}
