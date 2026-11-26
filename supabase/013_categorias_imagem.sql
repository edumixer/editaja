-- EditaJá · 013 · Categorias de imagem personalizadas
-- Além das etiquetas fixas (produto, original, falso, detalhe, print), cada conta cria as próprias categorias,
-- ex.: "Oficial" com as frases "loja oficial", "compre aqui". Quando a pessoa FALA uma dessas frases,
-- o editor coloca a imagem do produto marcada com essa categoria (inclinada, sem animação, com Bubble pop).

-- 1) a etiqueta da imagem passa a aceitar também o id de uma categoria criada pela pessoa
alter table public.produto_imagens alter column rotulo drop default;
alter table public.produto_imagens alter column rotulo type text using rotulo::text;
alter table public.produto_imagens alter column rotulo set default 'produto';

-- 2) categorias da conta (valem para todos os produtos; as imagens continuam separadas por produto)
create table if not exists public.categorias_imagem (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  nome       text not null check (length(trim(nome)) between 1 and 40),
  gatilhos   text[] not null default '{}',          -- palavras ou frases faladas que chamam a imagem
  lugar      text not null default 'direita' check (lugar in ('direita', 'esquerda', 'centro')),
  tamanho    text not null default 'media' check (tamanho in ('pequena', 'media', 'grande')),
  duracao    numeric not null default 2 check (duracao between 0.5 and 8),   -- segundos na tela
  reserva    text check (reserva in ('produto', 'original', 'detalhe', 'print')),  -- sem imagem desta categoria no produto: usa esta
  hue        int not null default 280,
  created_at timestamptz not null default now()
);
create index if not exists categorias_imagem_owner on public.categorias_imagem (owner_id);

alter table public.categorias_imagem enable row level security;
create policy "dono" on public.categorias_imagem for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

comment on table public.categorias_imagem is 'Categorias de imagem criadas pela pessoa (além de produto/original/falso/detalhe/print). produto_imagens.rotulo = id da categoria.';
