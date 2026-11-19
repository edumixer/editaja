"use client";
import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock, Mail, Plus, Sparkles, Wand2, Users, CreditCard, SlidersHorizontal, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { REGRAS } from "@/lib/data";
import { cn } from "@/lib/utils";

const PLANOS = [
  { nome: "Grátis", preco: "R$ 0", desc: "Para testar", itens: ["5 vídeos por mês", "Marca d'água EditaJá", "Legenda por IA"], atual: false },
  { nome: "Criador", preco: "R$ 79", desc: "Para quem posta todo dia", itens: ["60 vídeos por mês", "Sem marca d'água", "Hooks × CTAs ilimitados", "Agendamento no Instagram", "3 pessoas na equipe"], atual: true, destaque: true },
  { nome: "Agência", preco: "R$ 249", desc: "Para quem edita para clientes", itens: ["300 vídeos por mês", "Vários perfis e marcas", "Aprovação pelo cliente", "Prioridade na fila", "Suporte no WhatsApp"], atual: false },
];

function Config() {
  const params = useSearchParams();
  const [aba, setAba] = React.useState(params.get("aba") ?? "regras");
  const [regras, setRegras] = React.useState<Record<string, boolean>>(() => Object.fromEntries(REGRAS.map((r) => [r.id, !r.padraoDesligado])));
  const [velocidade, setVelocidade] = React.useState(1.1);

  return (
    <>
      <PageHeader title="Configurações" description="Seu estilo de edição, sua marca, sua equipe e seu plano." />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="mb-2 w-full justify-start overflow-x-auto scrollbar-none sm:w-auto">
          <TabsTrigger value="regras"><SlidersHorizontal /> Estilo de edição</TabsTrigger>
          <TabsTrigger value="perfil"><UserCircle /> Perfil</TabsTrigger>
          <TabsTrigger value="equipe"><Users /> Equipe</TabsTrigger>
          <TabsTrigger value="plano"><CreditCard /> Plano</TabsTrigger>
        </TabsList>

        <TabsContent value="regras" className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Regras do editor</CardTitle>
              <CardDescription>Valem para todo vídeo novo. As regras com cadeado são o padrão da sua marca.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {REGRAS.map((r) => (
                <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">{r.nome} {r.fixa && <Lock className="size-3 text-muted-foreground" />} {r.padraoDesligado && <Badge variant="secondary">opcional</Badge>}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.detalhe}</p>
                  </div>
                  <Switch checked={regras[r.id]} disabled={r.fixa} onCheckedChange={(c) => setRegras((x) => ({ ...x, [r.id]: c }))} />
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Velocidade padrão</CardTitle><CardDescription>Aplicada na exportação</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 1.1, 1.2, 1.25].map((s) => (
                    <button key={s} onClick={() => setVelocidade(s)} className={cn("rounded-lg border py-2 text-sm font-semibold tabular-nums", velocidade === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{String(s).replace(".", ",")}x</button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="size-4 text-primary" /> Instruções extras</CardTitle><CardDescription>Escreva como você falaria com um editor</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={4} defaultValue="Quando eu falar “falso, falso”, uma imagem à esquerda e outra à direita. Nunca cortar o fim das palavras." />
                <Button className="w-full" onClick={() => toast.success("Estilo salvo", { description: "Vale a partir do próximo vídeo." })}>Salvar estilo</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="perfil">
          <Card className="max-w-2xl">
            <CardHeader><CardTitle>Perfil e marca</CardTitle><CardDescription>Usado nas legendas geradas por IA</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-16"><AvatarFallback className="brand-gradient text-lg text-white">ED</AvatarFallback></Avatar>
                <Button variant="outline" size="sm">Trocar foto</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="n">Nome</Label><Input id="n" defaultValue="Eduardo" /></div>
                <div className="grid gap-2"><Label htmlFor="u">@ no Instagram</Label><Input id="u" placeholder="@seuperfil" /></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="nicho">Nicho</Label><Input id="nicho" defaultValue="Achadinhos, skincare e camisas de time" /></div>
              <div className="grid gap-2"><Label htmlFor="tom">Tom das legendas</Label>
                <div className="flex flex-wrap gap-1.5">{["Direto", "Divertido", "Alerta / Cuidado", "Review honesto"].map((t, i) => <span key={t} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", i === 2 && "border-primary bg-primary text-primary-foreground")}>{t}</span>)}</div>
              </div>
              <div className="flex justify-end"><Button onClick={() => toast.success("Perfil salvo")}>Salvar</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipe">
          <Card className="max-w-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Equipe</CardTitle><CardDescription className="mt-1">Quem pode enviar e aprovar vídeos</CardDescription></div>
              <Button size="sm"><Plus /> Convidar</Button>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {[{ n: "Eduardo", e: "Dono", i: "ED" }, { n: "Noiva", e: "Criadora · aprova", i: "NO" }, { n: "Amiga", e: "Criadora · envia", i: "AM" }].map((m) => (
                <div key={m.n} className="flex items-center gap-3 px-5 py-3">
                  <Avatar><AvatarFallback>{m.i}</AvatarFallback></Avatar>
                  <div className="flex-1"><p className="text-sm font-medium">{m.n}</p><p className="text-xs text-muted-foreground">{m.e}</p></div>
                  <Button variant="ghost" size="sm"><Mail /> Reenviar</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plano">
          <div className="grid gap-4 md:grid-cols-3">
            {PLANOS.map((p) => (
              <Card key={p.nome} className={cn("relative flex flex-col", p.destaque && "border-primary/50 shadow-xl shadow-primary/10 ring-1 ring-primary/30")}>
                {p.destaque && <Badge className="absolute -top-2.5 left-5 brand-gradient text-white"><Sparkles /> Mais escolhido</Badge>}
                <CardHeader>
                  <CardTitle>{p.nome}</CardTitle>
                  <CardDescription>{p.desc}</CardDescription>
                  <p className="mt-3 text-3xl font-bold tracking-tight">{p.preco}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-2">{p.itens.map((i) => <li key={i} className="flex items-center gap-2 text-sm"><Check className="size-4 text-success" /> {i}</li>)}</ul>
                  <Button className="mt-5 w-full" variant={p.atual ? "outline" : p.destaque ? "brand" : "default"} disabled={p.atual}>{p.atual ? "Plano atual" : "Escolher"}</Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Preços ilustrativos para o preview.</p>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function Page() {
  return <Suspense><Config /></Suspense>;
}
