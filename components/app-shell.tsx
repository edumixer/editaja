"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import * as Sheet from "@radix-ui/react-dialog";
import {
  LayoutDashboard, FolderOpen, ListVideo, CheckCircle2, CalendarClock, Settings, Palette, Package, Upload, Bell, Search, Sparkles, LogOut, CreditCard, User, Menu, X, Quote, ScrollText, Flame, Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";

type Item = { href: string; label: string; short?: string; desc: string; icon: React.ElementType; tag?: string };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Criar vídeos", itens: [
    { href: "/", label: "Painel", desc: "Resumo do dia e próximos passos", icon: LayoutDashboard },
    { href: "/biblioteca", label: "Biblioteca", desc: "Seus vídeos brutos e editados", icon: FolderOpen },
    { href: "/fila", label: "Fila de edição", short: "Fila", desc: "Vídeos que a IA está editando", icon: ListVideo },
    { href: "/aprovacao", label: "Aprovação", desc: "Assista e aprove antes de postar", icon: CheckCircle2 },
    { href: "/reels", label: "Reels de vídeos longos", short: "Reels", desc: "Cortes de lives, podcasts e links", icon: Scissors, tag: "novo" },
    { href: "/publicar", label: "Publicação", short: "Publicar", desc: "Agende e poste no TikTok", icon: CalendarClock },
  ] },
  { titulo: "Descobrir", itens: [
    { href: "/em-alta", label: "Em alta", desc: "O que está viralizando no TikTok", icon: Flame, tag: "novo" },
  ] },
  { titulo: "Ensinar a IA", itens: [
    { href: "/produtos", label: "Produtos", desc: "O que você vende, fotos e links", icon: Package },
    { href: "/ganchos", label: "Ganchos e Legendas", short: "Ganchos", desc: "Seus textos de exemplo para a IA", icon: Quote },
    { href: "/roteiros", label: "Roteiros", desc: "Falas prontas para gravar", icon: ScrollText, tag: "opcional" },
    { href: "/estilos", label: "Estilos e Referências", short: "Estilos", desc: "Como a IA corta, sons e imagens", icon: Palette },
  ] },
  { titulo: "Conta", itens: [
    { href: "/configuracoes", label: "Configurações", desc: "Perfil, TikTok e assinatura", icon: Settings },
  ] },
];
const NAV = GRUPOS.flatMap((g) => g.itens);
const item = (href: string) => NAV.find((n) => n.href === href)!;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}


function SidebarConteudo({ path, badge, onNavigate }: { path: string; badge: (href: string) => number; onNavigate?: () => void }) {
  return (
    <>
        <div className="flex h-16 items-center px-5"><Logo /></div>
        <div className="px-3">
          <Button asChild variant="brand" className="w-full justify-start">
            <Link href="/biblioteca?upload=1" onClick={onNavigate}><Upload /> Enviar vídeo</Link>
          </Button>
        </div>
        <nav className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.titulo}</p>
              {g.itens.map((n) => {
                const active = isActive(path, n.href);
                const b = badge(n.href);
                return (
                  <Link key={n.href} href={n.href} onClick={onNavigate}
                    className={cn("group flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      active && "bg-card text-foreground shadow-xs ring-1 ring-border")}>
                    <n.icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">{n.label}
                        {n.tag && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", n.tag === "novo" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{n.tag}</span>}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">{n.desc}</span>
                    </span>
                    {b > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{b}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="m-3 shrink-0 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Plano Criador</div>
          <p className="mt-1 text-xs text-muted-foreground">23 de 60 vídeos editados este mês</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="brand-gradient h-full w-[38%]" /></div>
          <Button variant="outline" size="sm" className="mt-3 w-full" asChild><Link href="/configuracoes?aba=plano" onClick={onNavigate}>Fazer upgrade</Link></Button>
        </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => setMenu(false), [path]);
  const { videos, modoReal, sessao, carregando } = useStore();
  React.useEffect(() => {
    if (modoReal && !carregando && !sessao && path !== "/entrar") router.replace("/entrar");
  }, [modoReal, carregando, sessao, path, router]);
  if (path === "/entrar") return <>{children}</>;
  const pendentes = videos.filter((v) => v.status === "aprovacao").length;
  const editando = videos.filter((v) => ["editando", "fila", "recusado"].includes(v.status)).length;
  const badge = (href: string) => (href === "/aprovacao" ? pendentes : href === "/fila" ? editando : 0);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar lg:flex">
        <SidebarConteudo path={path} badge={badge} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl sm:h-16 sm:px-6">
          <Sheet.Root open={menu} onOpenChange={setMenu}>
            <Sheet.Trigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Abrir menu"><Menu className="size-5" /></Button>
            </Sheet.Trigger>
            <Sheet.Portal>
              <Sheet.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" />
              <Sheet.Content className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[300px] flex-col overflow-y-auto border-r bg-sidebar pb-safe shadow-2xl outline-none lg:hidden">
                <Sheet.Title className="sr-only">Menu</Sheet.Title>
                <Sheet.Description className="sr-only">Todas as telas do EditaJá</Sheet.Description>
                <Sheet.Close asChild><Button variant="ghost" size="icon" className="absolute right-2 top-3" aria-label="Fechar menu"><X className="size-5" /></Button></Sheet.Close>
                <SidebarConteudo path={path} badge={badge} onNavigate={() => setMenu(false)} />
              </Sheet.Content>
            </Sheet.Portal>
          </Sheet.Root>
          <Link href="/" className="lg:hidden" aria-label="Painel"><LogoMark className="size-8" /></Link>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar vídeos, produtos, legendas…" className="h-10 w-full rounded-lg border bg-card pl-9 pr-16 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30" />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">Ctrl K</kbd>
          </div>
          <span className="min-w-0 flex-1 truncate text-base font-semibold sm:hidden">{NAV.find((n) => isActive(path, n.href))?.label}</span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
              <Bell className="size-[18px]" />
              {pendentes > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive ring-2 ring-background" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                <Avatar className="size-8 sm:size-9"><AvatarFallback className="brand-gradient text-white">ED</AvatarFallback></Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Eduardo · Plano Criador</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/biblioteca"><FolderOpen /> Biblioteca</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/reels"><Scissors /> Reels de vídeos longos</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/em-alta"><Flame /> Em alta</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/produtos"><Package /> Produtos</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/ganchos"><Quote /> Ganchos e Legendas</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/roteiros"><ScrollText /> Roteiros</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/estilos"><Palette /> Estilos e Referências</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/configuracoes"><User /> Perfil e estilo</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/configuracoes?aba=plano"><CreditCard /> Assinatura</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { supabase?.auth.signOut(); router.push("/entrar"); }}><LogOut /> Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl lg:hidden pb-safe">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1.5">
          {[item("/"), item("/em-alta"), { href: "/biblioteca?upload=1", label: "Enviar", icon: Upload, fab: true }, item("/fila"), item("/aprovacao")].map((n) => {
            const fab = "fab" in n;
            const active = !fab && isActive(path, n.href);
            const b = badge(n.href);
            if (fab) return (
              <Link key="fab" href={n.href} className="flex flex-col items-center">
                <span className="brand-gradient -mt-5 grid size-13 place-items-center rounded-2xl text-white shadow-lg shadow-primary/40 ring-4 ring-background"><n.icon className="size-5" /></span>
                <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">{n.label}</span>
              </Link>
            );
            return (
              <Link key={n.href} href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-muted-foreground", active && "text-primary")}>
                <n.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
                {"short" in n && n.short ? n.short : n.label}
                {b > 0 && <span className="absolute right-[22%] top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">{b}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
