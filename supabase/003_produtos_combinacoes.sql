-- EditaJá · 003 · Produtos (com pasta de imagens), hooks × CTAs e análise completa de referência
-- Rodar depois do 002_estilos.sql.

-- ───────────── produtos ─────────────
create type imagem_rotulo as enum ('produto', 'original', 'falso', 'detalhe', 'print');

create table public.produtos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  slug       text not null,
  nome       text not null,
  descricao  text,
  palavras   text[] not null default '{}',   -- como o produto é falado (ajuda a achar o momento da imagem)
  pasta_origem text,                         -- 'biblioteca/camisas-gremio/' quando veio do conteúdo inicial
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.produto_imagens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users on delete cascade,
  produto_id   uuid not null references public.produtos on delete cascade,
  nome         text not null,
  rotulo       imagem_rotulo not null default 'produto',
  storage_path text not null,                -- bucket 'biblioteca': <uid>/produtos/<produto_id>/<arquivo>
  tamanho_kb   int,
  ordem        int not null default 0,
  origem       text,                         -- 'Conteúdo inicial · biblioteca/…' ou 'Enviado por você'
  created_at   timestamptz not null default now()
);
create index on public.produto_imagens (produto_id, ordem);

create trigger produtos_touch before update on public.produtos
  for each row execute function public.touch_updated_at();

-- ───────────── vídeos: produto, hooks × CTAs ─────────────
-- combinacoes: {"automatico": true|false, "hooks": [{id,texto,s,e}], "ctas": [{id,texto,s,e}]}
-- Cada combinação vira um vídeo filho (origem_id = bruto pai) com hook_idx/cta_idx.
alter table public.videos
  add column produto_id  uuid references public.produtos on delete set null,
  add column combinacoes jsonb,
  add column origem_id   uuid references public.videos on delete cascade,
  add column hook_idx    int,
  add column cta_idx     int,
  add column variante    text;               -- "Gancho 1 + CTA 2"
create index on public.videos (produto_id);
create index on public.videos (origem_id);

-- ───────────── referência: análise completa ─────────────
-- analise (jsonb) passa a guardar: duracao_s, resumo, transcricao[], legendas{fonte,tamanho,cor,contorno,posicao,
-- palavras_por_tela,estilo}, headline{texto,ate_s,posicao,emoji}, ritmo{cortes_por_min,pausa_max_s,plano_medio_s},
-- imagens[{t,lado,inclinacao,duracao_s,o_que}], sons[{t,som,gatilho}], camera, regras[].
alter table public.referencias
  add column transcricao text,               -- texto corrido, para busca
  add column analisado_em timestamptz,
  add column modelo text;                    -- quem analisou (ex.: whisper + claude)

-- ───────────── RLS ─────────────
alter table public.produtos        enable row level security;
alter table public.produto_imagens enable row level security;
create policy "dono" on public.produtos        for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dono" on public.produto_imagens for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- vídeo só pode apontar para produto do mesmo dono
create or replace function public.checar_produto_do_dono() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.produto_id is not null and not exists (
    select 1 from public.produtos p where p.id = new.produto_id and p.owner_id = new.owner_id) then
    raise exception 'produto não pertence a este usuário';
  end if;
  return new;
end $$;
create trigger videos_checar_produto before insert or update of produto_id on public.videos
  for each row execute function public.checar_produto_do_dono();

-- ───────────── conteúdo inicial: biblioteca/ vira produtos ─────────────
create or replace function public.semear_produtos(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if exists (select 1 from public.produtos where owner_id = p_owner) then return; end if;

  insert into public.produtos (owner_id, slug, nome, descricao, palavras, pasta_origem)
  values (p_owner, 'camisas-gremio', 'Camisas do Grêmio', 'Camisas oficiais.', '{camisa,grêmio,tricolor,manto}', 'biblioteca/camisas-gremio/')
  returning id into v;
  insert into public.produto_imagens (owner_id, produto_id, nome, rotulo, storage_path, ordem, origem) values
    (p_owner, v, 'camisa-1.png', 'produto',  p_owner || '/inicial/biblioteca/camisas-gremio/camisa-1.png', 1, 'Conteúdo inicial · biblioteca/camisas-gremio/'),
    (p_owner, v, 'camisa-2.png', 'detalhe',  p_owner || '/inicial/biblioteca/camisas-gremio/camisa-2.png', 2, 'Conteúdo inicial · biblioteca/camisas-gremio/'),
    (p_owner, v, 'camisa-3.png', 'original', p_owner || '/inicial/biblioteca/camisas-gremio/camisa-3.png', 3, 'Conteúdo inicial · biblioteca/camisas-gremio/');

  insert into public.produtos (owner_id, slug, nome, descricao, palavras, pasta_origem)
  values (p_owner, 'serum-facil', 'Sérum Facil', 'Comparação original x falso.', '{sérum,serum,facil}', 'biblioteca/serum-facil/')
  returning id into v;
  insert into public.produto_imagens (owner_id, produto_id, nome, rotulo, storage_path, ordem, origem) values
    (p_owner, v, 'produto-serum.png', 'original', p_owner || '/inicial/biblioteca/serum-facil/produto-serum.png', 1, 'Conteúdo inicial · biblioteca/serum-facil/'),
    (p_owner, v, 'falso-1.png', 'falso', p_owner || '/inicial/biblioteca/falsos-genericos/falso-1.png', 2, 'Conteúdo inicial · biblioteca/falsos-genericos/'),
    (p_owner, v, 'falso-2.png', 'falso', p_owner || '/inicial/biblioteca/falsos-genericos/falso-2.png', 3, 'Conteúdo inicial · biblioteca/falsos-genericos/');

  insert into public.produtos (owner_id, slug, nome, descricao, palavras, pasta_origem)
  values (p_owner, 'smartwatch', 'Smartwatch', 'Relógio inteligente.', '{relógio,smartwatch,garmin}', 'biblioteca/')
  returning id into v;
  insert into public.produto_imagens (owner_id, produto_id, nome, rotulo, storage_path, ordem, origem) values
    (p_owner, v, 'garmin_referencia.png', 'produto', p_owner || '/inicial/biblioteca/garmin_referencia.png', 1, 'Conteúdo inicial · biblioteca/');

  insert into public.produtos (owner_id, slug, nome, palavras) values
    (p_owner, 'lisinha-clarinha', 'Lisinha e Clarinha', '{lisinha,clarinha}'),
    (p_owner, 'creme-celulite', 'Creme celulite e estria', '{creme,celulite,estria}');

  -- imagens soltas da 002 viram imagens de produto; tira da tabela de referências
  delete from public.referencias where owner_id = p_owner and tipo = 'imagem' and origem_tipo = 'inicial';
end $$;
revoke execute on function public.semear_produtos(uuid) from public, anon, authenticated;

-- Contas novas começam sem produtos (cada cliente cria os seus). Só a conta do Eduardo recebe a biblioteca,
-- via worker/importar_pastas.py.
