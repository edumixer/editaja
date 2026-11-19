"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase, modoReal } from "@/lib/supabase";

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = React.useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [nome, setNome] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { router.push("/"); return; }
    setBusy(true);
    const r = modo === "entrar"
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } });
    setBusy(false);
    if (r.error) { toast.error("Não deu certo", { description: r.error.message }); return; }
    if (modo === "criar" && !r.data.session) { toast.success("Conta criada!", { description: "Confirme pelo link que mandamos no seu e-mail." }); return; }
    router.push("/");
  };

  return (
    <div className="fixed inset-0 z-50 grid overflow-y-auto bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <div className="brand-gradient absolute inset-0 opacity-90" />
        <div className="absolute -left-20 top-1/3 size-96 rounded-full bg-white/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 text-lg font-bold">EditaJá</div>
          <div>
            <p className="text-4xl font-bold leading-tight tracking-tight">Do bruto ao post<br />em minutos.</p>
            <p className="mt-4 max-w-md text-white/80">Cortes, 1.1x, sons, imagens de referência, legenda e agendamento. Você só aprova.</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-white/80"><Sparkles className="size-4" /> Feito para criadores de TikTok e Reels</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-5">
          <Logo className="lg:hidden" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{modo === "entrar" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{modoReal ? "Entre para enviar e aprovar seus vídeos." : "Modo demonstração: qualquer e-mail funciona."}</p>
          </div>
          <Tabs value={modo} onValueChange={(v) => setModo(v as "entrar" | "criar")}>
            <TabsList className="w-full"><TabsTrigger value="entrar" className="flex-1">Entrar</TabsTrigger><TabsTrigger value="criar" className="flex-1">Criar conta</TabsTrigger></TabsList>
          </Tabs>
          {modo === "criar" && <div className="grid gap-2"><Label htmlFor="nome">Nome</Label><Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>}
          <div className="grid gap-2"><Label htmlFor="email">E-mail</Label>
            <div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="senha">Senha</Label>
            <div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="senha" type="password" className="pl-9" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} autoComplete={modo === "entrar" ? "current-password" : "new-password"} /></div>
          </div>
          <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{modo === "entrar" ? "Entrar" : "Criar conta grátis"}</Button>
        </form>
      </div>
    </div>
  );
}
