-- EditaJá · 004 · Ganchos e Legendas (textos de referência) e Roteiros (opcional)
-- Rodar depois do 003_produtos_combinacoes.sql.

-- ───────────── Ganchos e Legendas ─────────────
-- Exemplos que o Eduardo alimenta. O worker usa os mais relevantes (do produto, com estrela) como
-- exemplos para o Claude escrever legenda, descrição e hashtags de cada vídeo no mesmo jeito.
create type texto_tipo   as enum ('gancho', 'legenda', 'descricao', 'hashtags', 'cta');
create type texto_origem as enum ('minha', 'outro', 'viral');

create table public.textos_referencia (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  tipo        texto_tipo not null,
  texto       text not null check (length(texto) between 1 and 4000),
  produto_id  uuid references public.produtos on delete cascade,   -- null = vale para qualquer produto
  origem      texto_origem not null default 'minha',
  autor       text,                                                 -- nome do criador quando origem = 'outro'
  destaque    boolean not null default false,                       -- performou bem: pesa mais
  created_at  timestamptz not null default now()
);
create index on public.textos_referencia (owner_id, tipo, produto_id);

-- ───────────── Roteiros (opcional) ─────────────
-- Quem não usa roteiro segue o fluxo normal; nada no vídeo depende desta tabela.
create table public.roteiros (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  produto_id  uuid not null references public.produtos on delete cascade,
  titulo      text not null,
  ganchos     text[] not null check (cardinality(ganchos) >= 1),
  ctas        text[] not null check (cardinality(ctas) >= 1),
  corpo       text not null default '',
  qtd_videos  int not null default 1 check (qtd_videos >= 1),
  inicio      date,                                                 -- opcional: 1 versão por dia no calendário
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.roteiros (owner_id, produto_id);
create trigger roteiros_touch before update on public.roteiros
  for each row execute function public.touch_updated_at();

-- vídeo gravado a partir de um roteiro (opcional) e a data planejada de cada versão
alter table public.videos
  add column roteiro_id    uuid references public.roteiros on delete set null,
  add column data_planejada date;
create index on public.videos (roteiro_id);

-- ───────────── RLS ─────────────
alter table public.textos_referencia enable row level security;
alter table public.roteiros          enable row level security;
create policy "dono" on public.textos_referencia for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dono" on public.roteiros for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- produto do texto/roteiro precisa ser do mesmo dono
create or replace function public.checar_produto_do_dono_generico() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.produto_id is not null and not exists (
    select 1 from public.produtos p where p.id = new.produto_id and p.owner_id = new.owner_id) then
    raise exception 'produto não pertence a este usuário';
  end if;
  return new;
end $$;
create trigger textos_checar_produto before insert or update of produto_id on public.textos_referencia
  for each row execute function public.checar_produto_do_dono_generico();
create trigger roteiros_checar_produto before insert or update of produto_id on public.roteiros
  for each row execute function public.checar_produto_do_dono_generico();

-- ───────────── conteúdo inicial ─────────────
-- Ganchos, legendas, hashtags e CTAs que já existiam nos vídeos do Eduardo (os da prévia).
create or replace function public.semear_textos(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g uuid; s uuid;
begin
  if exists (select 1 from public.textos_referencia where owner_id = p_owner) then return; end if;
  select id into g from public.produtos where owner_id = p_owner and slug = 'camisas-gremio';
  select id into s from public.produtos where owner_id = p_owner and slug = 'serum-facil';
  insert into public.textos_referencia (owner_id, tipo, texto, produto_id, origem, destaque) values
    (p_owner, 'gancho',   'Cuidado com camisa falsa do Grêmio', g, 'minha', true),
    (p_owner, 'gancho',   'Seu sérum pode ser FALSO', s, 'minha', true),
    (p_owner, 'gancho',   'Não compre antes de ver isso', null, 'viral', true),
    (p_owner, 'legenda',  'Gremista, olha o acabamento dessa camisa 💙🖤🤍', g, 'minha', true),
    (p_owner, 'legenda',  'O sérum que todo mundo tá falando ✨', s, 'minha', false),
    (p_owner, 'hashtags', '#gremio #camisadogremio #tricolor #achadinhos #blackfriday', g, 'minha', true),
    (p_owner, 'hashtags', '#skincare #serum #autocuidado #achadinhos', s, 'minha', false),
    (p_owner, 'cta',      'Clica no carrinho aqui embaixo e garante o seu', null, 'minha', true),
    (p_owner, 'cta',      'Comenta EU QUERO que eu te mando o link', null, 'minha', false);
end $$;
revoke execute on function public.semear_textos(uuid) from public, anon, authenticated;
