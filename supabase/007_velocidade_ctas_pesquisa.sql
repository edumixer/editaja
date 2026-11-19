-- EditaJá · 007 · Velocidade, "prestes a viralizar", CTAs do mercado e pesquisa no TikTok dentro da plataforma.
-- Rodar depois do 006_mercado_tiktok.sql. Ideias de pontuação aproveitadas da skill last30days (licença MIT).

-- ───────────── novas notas nos vídeos do mercado ─────────────
alter table public.videos_mercado
  add column nota_engajamento    smallint,                 -- 0–100, escala log (views, curtidas, comentários, compart.+salvos)
  add column velocidade          real,                     -- engajamento pesado pela idade (1/√(dias+1), 1,5× na 1ª semana)
  add column ritmo               real,                     -- quantas vezes mais rápido que o normal do perfil
  add column prestes_viralizar   boolean not null default false,
  add column cta_falado          text,
  add column intencao_compra_pct real;                     -- % de comentários perguntando onde comprar, link, preço…
create index on public.videos_mercado (velocidade desc) where velocidade is not null;
create index on public.videos_mercado (postado_em desc) where prestes_viralizar;

-- ───────────── CTAs modelo (mesma ideia dos ganchos) ─────────────
create table public.ctas_mercado (
  id          uuid primary key default gen_random_uuid(),
  texto       text not null unique,
  tipo        text,                                        -- carrinho | cupom | urgencia | comentar | seguir | link_bio | outro
  nicho_id    text references public.nichos_mercado on delete set null,
  destaque    boolean not null default false,
  oculto      boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.videos_mercado add column cta_id uuid references public.ctas_mercado on delete set null;
create index on public.videos_mercado (cta_id);
alter table public.ctas_mercado enable row level security;
create policy "ler" on public.ctas_mercado for select to authenticated using (not oculto);

-- ───────────── ranking de ganchos: agora só conta se 2+ perfis diferentes usaram ─────────────
create or replace function public.ranking_mercado(p_dias int default 30, p_nicho text default null)
returns table (gancho_id uuid, texto text, tipo text, videos bigint, media_views numeric, nota_media numeric, nota_anterior numeric, variacao_pct numeric)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select v.gancho_id, v.views, v.nota_viral, v.perfil,
           (v.postado_em >= now() - make_interval(days => p_dias)) as atual
    from public.videos_mercado v
    where v.gancho_id is not null
      and v.views >= 1000
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
     and count(distinct b.perfil) filter (where b.atual) >= 2
  order by g.destaque desc, 6 desc nulls last;
$$;

-- ───────────── ranking de CTAs: views, nota de viral e intenção de compra nos comentários ─────────────
create or replace function public.ranking_ctas_mercado(p_dias int default 30, p_nicho text default null)
returns table (cta_id uuid, texto text, tipo text, videos bigint, perfis bigint, media_views numeric, nota_media numeric, intencao_compra numeric, variacao_pct numeric)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select v.cta_id, v.views, v.nota_viral, v.perfil, v.intencao_compra_pct,
           (v.postado_em >= now() - make_interval(days => p_dias)) as atual
    from public.videos_mercado v
    where v.cta_id is not null
      and v.views >= 1000
      and v.postado_em >= now() - make_interval(days => 2 * p_dias)
      and (p_nicho is null or v.nicho_id = p_nicho)
  )
  select c.id, c.texto, c.tipo,
         count(*) filter (where b.atual),
         count(distinct b.perfil) filter (where b.atual),
         round(avg(b.views) filter (where b.atual)),
         round(avg(b.nota_viral) filter (where b.atual)::numeric, 2),
         round(avg(b.intencao_compra_pct) filter (where b.atual)::numeric, 1),
         round(100 * (avg(b.nota_viral) filter (where b.atual) / nullif(avg(b.nota_viral) filter (where not b.atual), 0) - 1)::numeric)
  from base b join public.ctas_mercado c on c.id = b.cta_id
  where not c.oculto
  group by c.id, c.texto, c.tipo
  having count(*) filter (where b.atual) >= 2
     and count(distinct b.perfil) filter (where b.atual) >= 2
  order by c.destaque desc, 8 desc nulls last, 7 desc nulls last;
$$;
grant execute on function public.ranking_ctas_mercado(int, text) to authenticated;

-- ───────────── pesquisas feitas pelos usuários (cache de 24 h por tema, limite por dia) ─────────────
create table public.pesquisas_mercado (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users on delete cascade,
  tema        text not null,
  tema_norm   text not null,                               -- minúsculo, sem acento: chave do cache
  dias        smallint not null default 30 check (dias in (7, 30)),
  resultado   jsonb,                                       -- preenchido pelo robô
  criado_em   timestamptz not null default now()
);
create index on public.pesquisas_mercado (tema_norm, dias, criado_em desc);
create index on public.pesquisas_mercado (usuario_id, criado_em desc);
alter table public.pesquisas_mercado enable row level security;
create policy "ler as minhas" on public.pesquisas_mercado for select to authenticated using (usuario_id = (select auth.uid()));
create policy "criar a minha" on public.pesquisas_mercado for insert to authenticated with check (usuario_id = (select auth.uid()));

-- Quantas pesquisas novas o usuário ainda pode fazer hoje (cache não conta).
create or replace function public.pesquisas_restantes(p_limite int default 5)
returns int language sql stable security invoker set search_path = '' as $$
  select greatest(0, p_limite - count(*)::int)
  from public.pesquisas_mercado
  where usuario_id = (select auth.uid()) and criado_em > now() - interval '24 hours';
$$;
grant execute on function public.pesquisas_restantes(int) to authenticated;

-- Resultado de uma pesquisa igual feita por qualquer pessoa nas últimas 24 h (sem dizer quem pesquisou).
create or replace function public.pesquisa_em_cache(p_tema_norm text, p_dias int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select p.resultado from public.pesquisas_mercado p
  where p.tema_norm = p_tema_norm and p.dias = p_dias and p.resultado is not null
    and p.criado_em > now() - interval '24 hours'
  order by p.criado_em desc limit 1;
$$;
revoke execute on function public.pesquisa_em_cache(text, int) from public, anon;
grant execute on function public.pesquisa_em_cache(text, int) to authenticated;
