-- EditaJá · 006 · "Em alta" com dados do mercado (TikTok Brasil), atualizados por um robô diário.
-- Rodar depois do 005_tendencias_headline.sql.
-- Quem escreve aqui é só o worker (service role). Todo usuário logado pode LER: é o "Kalodata" da plataforma.

-- ───────────── nichos que o robô acompanha (o dono da plataforma edita) ─────────────
create table public.nichos_mercado (
  id         text primary key,                      -- ex.: 'achadinhos'
  nome       text not null,                         -- ex.: 'Achadinhos'
  hashtags   text[] not null default '{}',          -- buscadas no TikTok (sem #)
  buscas     text[] not null default '{}',          -- palavras buscadas no TikTok
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────── hashtags em alta no Brasil (TikTok Creative Center) ─────────────
create table public.hashtags_mercado (
  coletado_em date not null default current_date,
  periodo     smallint not null check (periodo in (7, 30, 90)),
  pais        text not null default 'BR',
  hashtag     text not null,
  posicao     int,
  posts       bigint,
  views       bigint,
  tendencia   text,                                  -- rising | falling | stable
  estagio     text,                                  -- rising | peaking | steady | declining
  momento_pct real,
  curva       jsonb,                                 -- popularidade dia a dia
  setores     text[],
  primary key (coletado_em, periodo, pais, hashtag)
);
create index on public.hashtags_mercado (hashtag, coletado_em desc);

-- ───────────── perfis: views medianas (para a nota de viral) ─────────────
create table public.perfis_mercado (
  perfil         text primary key,                   -- @usuario
  seguidores     bigint,
  mediana_views  bigint,                             -- mediana dos últimos ~10 vídeos
  atualizado_em  timestamptz not null default now()
);

-- ───────────── ganchos modelo: frases parecidas contam juntas ─────────────
create table public.ganchos_mercado (
  id          uuid primary key default gen_random_uuid(),
  texto       text not null unique,                  -- forma "modelo" do gancho (normalizada pelo worker)
  tipo        text,                                  -- alerta | preco | teste | surpresa | pergunta | antes_depois | outro
  nicho_id    text references public.nichos_mercado on delete set null,
  destaque    boolean not null default false,        -- curadoria do dono
  oculto      boolean not null default false,        -- curadoria do dono
  created_at  timestamptz not null default now()
);

-- ───────────── vídeos que viralizaram ─────────────
-- Uma linha por vídeo; as métricas ficam na última coleta (série histórica em metricas_mercado).
create table public.videos_mercado (
  tiktok_id     text primary key,
  url           text not null,
  perfil        text,
  nicho_id      text references public.nichos_mercado on delete set null,
  legenda       text,
  hashtags      text[] not null default '{}',
  musica        text,
  capa_url      text,
  duracao_s     real,
  postado_em    timestamptz,
  views         bigint not null default 0,
  curtidas      bigint not null default 0,
  compartilhamentos bigint not null default 0,
  comentarios   bigint not null default 0,
  salvos        bigint not null default 0,
  nota_viral    real,                                -- views ÷ mediana de views do perfil
  gancho_falado text,                                -- primeiros segundos transcritos
  texto_tela    text,
  produto       text,                                -- o que a IA acha que está sendo vendido
  gancho_id     uuid references public.ganchos_mercado on delete set null,
  analisado_em  timestamptz,
  coletado_em   timestamptz not null default now()
);
create index on public.videos_mercado (nicho_id, postado_em desc);
create index on public.videos_mercado (gancho_id);
create index on public.videos_mercado (nota_viral desc) where nota_viral is not null;

create table public.metricas_mercado (
  tiktok_id   text not null references public.videos_mercado on delete cascade,
  coletado_em date not null default current_date,
  views       bigint not null default 0,
  curtidas    bigint not null default 0,
  compartilhamentos bigint not null default 0,
  primary key (tiktok_id, coletado_em)
);

-- ───────────── leitura liberada para quem está logado ─────────────
alter table public.nichos_mercado   enable row level security;
alter table public.hashtags_mercado enable row level security;
alter table public.perfis_mercado   enable row level security;
alter table public.ganchos_mercado  enable row level security;
alter table public.videos_mercado   enable row level security;
alter table public.metricas_mercado enable row level security;
create policy "ler" on public.nichos_mercado   for select to authenticated using (true);
create policy "ler" on public.hashtags_mercado for select to authenticated using (true);
create policy "ler" on public.ganchos_mercado  for select to authenticated using (not oculto);
create policy "ler" on public.videos_mercado   for select to authenticated using (true);
create policy "ler" on public.metricas_mercado for select to authenticated using (true);
-- perfis_mercado: só o worker (sem policy = ninguém lê pelo app)

-- ───────────── ranking de ganchos do mercado ─────────────
-- Nota média dos vídeos postados na janela, comparada com a janela anterior do mesmo tamanho.
create or replace function public.ranking_mercado(p_dias int default 30, p_nicho text default null)
returns table (gancho_id uuid, texto text, tipo text, videos bigint, media_views numeric, nota_media numeric, nota_anterior numeric, variacao_pct numeric)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select v.gancho_id, v.views, v.nota_viral,
           (v.postado_em >= now() - make_interval(days => p_dias)) as atual
    from public.videos_mercado v
    where v.gancho_id is not null
      and v.postado_em >= now() - make_interval(days => 2 * p_dias)
      and (p_nicho is null or v.nicho_id = p_nicho)
  )
  select g.id, g.texto, g.tipo,
         count(*) filter (where b.atual),
         round(avg(b.views) filter (where b.atual)),
         round(avg(b.nota_viral) filter (where b.atual)::numeric, 2),
         round(avg(b.nota_viral) filter (where not b.atual)::numeric, 2),
         round(100 * (avg(b.nota_viral) filter (where b.atual) / nullif(avg(b.nota_viral) filter (where not b.atual), 0) - 1)::numeric)
  from base b join public.ganchos_mercado g on g.id = b.gancho_id
  where not g.oculto
  group by g.id, g.texto, g.tipo
  having count(*) filter (where b.atual) >= 2
  order by g.destaque desc, 6 desc nulls last;
$$;
grant execute on function public.ranking_mercado(int, text) to authenticated;

-- nichos iniciais (editáveis)
insert into public.nichos_mercado (id, nome, hashtags, buscas) values
  ('achadinhos', 'Achadinhos', '{achadinhos,achadinhosshopee,tiktokshopbrasil}', '{achadinhos tiktok shop}'),
  ('beleza',     'Beleza e skincare', '{skincare,serum,cuidadoscomapele}', '{serum facial,creme celulite}'),
  ('moda',       'Moda e camisas de time', '{camisadetime,modamasculina,gremio}', '{camisa de time original}'),
  ('eletronicos','Eletrônicos', '{smartwatch,eletronicos,gadgets}', '{smartwatch barato}');
