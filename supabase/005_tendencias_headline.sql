-- EditaJá · 005 · Ganchos em alta (por período e época), referências do TikTok e headline opcional
-- Rodar depois do 004_textos_roteiros.sql.

-- ───────────── headline opcional e reação de surpresa ─────────────
-- headline_ativa = false: o vídeo sai sem texto na tela. x/y = centro do texto, em fração da tela (0 a 1).
alter table public.videos
  add column headline_ativa boolean not null default true,
  add column headline_x     real check (headline_x between 0 and 1),
  add column headline_y     real check (headline_y between 0 and 1),
  add column gancho_texto   text,                 -- gancho usado neste vídeo (alimenta o ranking)
  add column surpresas      jsonb;                -- reações de surpresa achadas pelo editor (só sugestão)
create index on public.videos (owner_id, gancho_texto) where gancho_texto is not null;

-- ───────────── métricas dos vídeos publicados ─────────────
-- Uma linha por vídeo por dia de coleta (o worker lê as estatísticas do TikTok depois de publicar).
create table public.metricas_video (
  video_id      uuid not null references public.videos on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  coletado_em   date not null default current_date,
  views         bigint not null default 0 check (views >= 0),
  curtidas      bigint not null default 0 check (curtidas >= 0),
  compartilhamentos bigint not null default 0 check (compartilhamentos >= 0),
  comentarios   bigint not null default 0 check (comentarios >= 0),
  primary key (video_id, coletado_em)
);
create index on public.metricas_video (owner_id, coletado_em);
alter table public.metricas_video enable row level security;
create policy "dono" on public.metricas_video for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- quem não quer entrar no ranking da comunidade desliga aqui (anônimo de qualquer forma)
alter table public.profiles add column compartilhar_ganchos boolean not null default true;

-- ───────────── referências vindas do TikTok ─────────────
alter table public.textos_referencia
  add column fonte_url text,                       -- link do vídeo do TikTok de onde veio
  add column perfil    text;                       -- @página de referência
create index on public.textos_referencia (owner_id, perfil) where perfil is not null;

-- ───────────── ranking: meus ganchos ─────────────
-- Views do período (última coleta de cada vídeo dentro da janela), por gancho. Roda com o RLS de quem chama.
create or replace function public.ranking_ganchos(p_inicio date, p_fim date)
returns table (gancho text, videos bigint, views bigint, media_views numeric)
language sql stable security invoker set search_path = '' as $$
  with ult as (
    select distinct on (m.video_id) m.video_id, m.views
    from public.metricas_video m
    where m.coletado_em between p_inicio and p_fim
    order by m.video_id, m.coletado_em desc
  )
  select lower(trim(v.gancho_texto)), count(*), sum(u.views), round(avg(u.views))
  from public.videos v join ult u on u.video_id = v.id
  where v.gancho_texto is not null
  group by 1
  order by 4 desc;
$$;

-- ───────────── ranking: comunidade (anônimo) ─────────────
-- Soma de todas as contas que aceitaram compartilhar. Só aparece gancho usado por 3+ criadores diferentes,
-- e nunca sai quem usou: só o texto, quantos criadores, quantos vídeos e a média de views.
create or replace function public.ranking_comunidade(p_inicio date, p_fim date)
returns table (gancho text, criadores bigint, videos bigint, media_views numeric)
language sql stable security definer set search_path = '' as $$
  with ult as (
    select distinct on (m.video_id) m.video_id, m.views
    from public.metricas_video m
    where m.coletado_em between p_inicio and p_fim
    order by m.video_id, m.coletado_em desc
  )
  select lower(trim(v.gancho_texto)), count(distinct v.owner_id), count(*), round(avg(u.views))
  from public.videos v
  join ult u on u.video_id = v.id
  join public.profiles p on p.id = v.owner_id and p.compartilhar_ganchos
  where v.gancho_texto is not null
  group by 1
  having count(distinct v.owner_id) >= 3
  order by 4 desc
  limit 50;
$$;
revoke execute on function public.ranking_comunidade(date, date) from public, anon;
grant execute on function public.ranking_comunidade(date, date) to authenticated;
