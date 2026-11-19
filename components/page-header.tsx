"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, X } from "lucide-react";

/** "Como funciona" de cada tela: aparece aberto na primeira visita e depois fica no botão de ajuda. */
const AJUDA: Record<string, { titulo: string; passos: string[] }> = {
  "/": { titulo: "Seu painel", passos: ["Veja quantos vídeos estão em cada etapa: editando, para aprovar e agendados.", "Toque num vídeo para abrir.", "Use o botão Enviar (lá embaixo no celular) para mandar um vídeo bruto."] },
  "/biblioteca": { titulo: "Biblioteca", passos: ["Envie o vídeo bruto do jeito que gravou. Arquivos grandes vão em partes e o envio continua se a internet cair.", "Escolha o produto, o estilo e, se quiser, os ganchos e CTAs.", "Toque em Editar: o vídeo vai para a fila e você recebe um aviso quando ficar pronto."] },
  "/fila": { titulo: "Fila de edição", passos: ["Aqui ficam os vídeos sendo editados, com a etapa em que cada um está.", "Não precisa fazer nada: quando terminar, o vídeo vai sozinho para Aprovação."] },
  "/aprovacao": { titulo: "Aprovação", passos: ["Assista cada vídeo editado.", "Gostou? Aprove: a legenda, a descrição e as hashtags são geradas no seu estilo.", "Algo errado? Toque em Pedir ajuste e diga o quê. O editor refaz e aprende para os próximos."] },
  "/publicar": { titulo: "Publicação", passos: ["Os vídeos aprovados aparecem aqui.", "Escolha dia e horário para postar, ou publique agora.", "O calendário mostra tudo o que está planejado."] },
  "/produtos": { titulo: "Produtos", passos: ["Cadastre cada produto que você divulga.", "Envie as fotos dele (original, falso, detalhes). O editor só usa as fotos do produto do vídeo.", "Escreva as palavras que você fala sobre ele, para o editor saber quando colocar cada foto."] },
  "/em-alta": { titulo: "Em alta no TikTok", passos: ["Pesquise qualquer produto (ex.: relógio, bola de futebol): a plataforma lê vídeos reais do TikTok e mostra os ganchos e CTAs que estão dando certo para ele e para o nicho dele.", "Escolha um nicho para ver só o que viraliza nele: vídeos prestes a viralizar, virais, ganchos, CTAs e hashtags.", "Tudo é atualizado sozinho todo dia de manhã. Um gancho só entra no ranking se 2 ou mais perfis diferentes usaram.", "Gostou de um gancho? Copie e salve na sua Biblioteca em Ganchos e Legendas."] },
  "/ganchos": { titulo: "Ganchos e Legendas", passos: ["Biblioteca: guarde ganchos, legendas, hashtags e CTAs que deram certo. Marque com ★ os melhores.", "Aprender com vídeos: cole links do TikTok de páginas que você admira. A IA copia o jeito de escrever, nunca as frases.", "Pronto: toda legenda gerada na Aprovação já sai nesse estilo."] },
  "/roteiros": { titulo: "Roteiros (opcional)", passos: ["Escolha o produto e marque os ganchos e CTAs que quer testar.", "Escreva o meio do vídeo (ou toque em Sugerir).", "Grave tudo de uma vez: o editor monta um vídeo para cada combinação. Quem não usa roteiro segue normal."] },
  "/estilos": { titulo: "Estilos e Referências", passos: ["Um estilo é o jeito de editar: cortes, sons, imagens, headline.", "Envie vídeos de referência: o editor analisa e cria as regras.", "Cada ajuste que você pede na Aprovação vira uma sugestão de regra aqui."] },
  "/reels": { titulo: "Reels de vídeos longos", passos: ["Cole o link de um vídeo, podcast ou live já encerrada, ou envie o arquivo. Só use conteúdo seu ou de quem te autorizou.", "Escolha quantos cortes, a duração e se quer legendas e gancho escrito.", "A IA acha os melhores momentos, dá uma nota de viral para cada um e enquadra em 9:16 seguindo o rosto.", "Gostou de um corte? Toque em Editar no EditaJá: ele entra na fila com as suas regras (1.1x, sem respiros, capa) e depois vai para Aprovação."] },
  "/configuracoes": { titulo: "Configurações", passos: ["Seu perfil, as contas do TikTok conectadas e o seu plano."] },
};

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  const path = usePathname();
  const ajuda = AJUDA[path];
  const chave = `editaja:ajuda:${path}`;
  const [aberta, setAberta] = React.useState(false);
  React.useEffect(() => { try { setAberta(!localStorage.getItem(chave)); } catch {} }, [chave]);
  const fechar = () => { setAberta(false); try { localStorage.setItem(chave, "1"); } catch {} };

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
            {ajuda && !aberta && (
              <button onClick={() => setAberta(true)} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Como funciona esta tela">
                <CircleHelp className="size-5" />
              </button>
            )}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {ajuda && aberta && (
        <div className="relative mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 pr-12">
          <p className="text-sm font-semibold">Como funciona: {ajuda.titulo}</p>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ajuda.passos.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="brand-gradient grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
          <button onClick={fechar} className="mt-3 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">Entendi</button>
          <button onClick={fechar} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent" aria-label="Fechar ajuda"><X className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
