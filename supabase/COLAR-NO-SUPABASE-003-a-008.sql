-- EditaJá · colar inteiro no Supabase > SQL Editor > New query > Run (banco editaja). Roda os passos 003 a 008 de uma vez.

-- ===================== 003_produtos_combinacoes.sql =====================
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

-- ===================== 004_textos_roteiros.sql =====================
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

-- ===================== 005_tendencias_headline.sql =====================
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

-- ===================== 006_mercado_tiktok.sql =====================
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

-- ===================== 007_velocidade_ctas_pesquisa.sql =====================
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

-- ===================== 008_robo_supabase_nichos.sql =====================
-- EditaJá · 008 · Robô do "Em alta" rodando no próprio Supabase (Edge Functions + pg_cron) e nichos com palavras-chave.
-- Rodar depois do 007. Substitui o worker/tendencias.py do Modal (que continua como alternativa).

-- ───────────── nichos: palavras que identificam o nicho de um produto pesquisado ─────────────
alter table public.nichos_mercado
  add column palavras  text[] not null default '{}',   -- ex.: relógio, smartwatch → Eletrônicos
  add column descricao text,
  add column ordem     smallint not null default 0;

insert into public.nichos_mercado (id, nome, hashtags, buscas, palavras, descricao, ordem) values
  ('achadinhos', 'Achadinhos e casa', '{achadinhos,achadinhosshopee,tiktokshopbrasil,casaorganizada}', '{achadinhos tiktok shop,achadinho casa}',
     '{achadinho,organizador,casa,decoracao,limpeza,banheiro,quarto,lampada,luminaria,utilidade}', 'Utilidades, organização e achados baratos', 1),
  ('beleza', 'Beleza e skincare', '{skincare,serum,cuidadoscomapele,maquiagem}', '{serum facial,creme celulite,maquiagem barata}',
     '{serum,sérum,creme,pele,celulite,estria,maquiagem,batom,base,perfume,cabelo,shampoo,skincare,protetor,unha}', 'Pele, cabelo, maquiagem e perfumes', 2),
  ('moda', 'Moda e camisas de time', '{camisadetime,modamasculina,modafeminina,gremio}', '{camisa de time original,look barato}',
     '{camisa,camiseta,time,gremio,grêmio,flamengo,corinthians,vestido,calca,calça,tenis,tênis,bolsa,look,roupa,oculos,óculos,bone,boné}', 'Roupas, calçados, acessórios e camisas de time', 3),
  ('eletronicos', 'Eletrônicos', '{smartwatch,eletronicos,gadgets,fonedeouvido}', '{smartwatch barato,fone bluetooth}',
     '{relogio,relógio,smartwatch,fone,celular,carregador,caixa de som,tablet,notebook,camera,câmera,gadget,led,drone,teclado,mouse}', 'Relógios, fones, celulares e gadgets', 4),
  ('esportes', 'Esportes e fitness', '{futebol,fitness,academia,treinoemcasa}', '{bola de futebol,acessorio academia}',
     '{bola,futebol,chuteira,academia,treino,fitness,halter,corda,bicicleta,bike,yoga,corrida,whey,suplemento,garrafa}', 'Futebol, academia, treino e suplementos', 5),
  ('cozinha', 'Cozinha', '{airfryer,cozinhapratica,receitafacil}', '{air fryer acessorio,utensilio cozinha}',
     '{air fryer,airfryer,panela,cozinha,faca,liquidificador,cafeteira,pote,marmita,utensilio,utensílio,forma}', 'Air fryer, panelas e utensílios', 6),
  ('infantil', 'Infantil e bebê', '{maternidade,bebe,brinquedos}', '{brinquedo educativo,achadinho bebe}',
     '{bebe,bebê,crianca,criança,brinquedo,infantil,fralda,mamadeira,escolar,mochila}', 'Brinquedos, bebê e volta às aulas', 7),
  ('pets', 'Pets', '{petshop,cachorro,gato}', '{acessorio pet,brinquedo cachorro}',
     '{pet,cachorro,gato,coleira,racao,ração,caminha,arranhador,petisco}', 'Acessórios e brinquedos para pets', 8)
on conflict (id) do update set nome = excluded.nome, hashtags = excluded.hashtags, buscas = excluded.buscas,
  palavras = excluded.palavras, descricao = excluded.descricao, ordem = excluded.ordem;

-- ───────────── pesquisas guardam o nicho detectado ─────────────
alter table public.pesquisas_mercado add column nicho_id text references public.nichos_mercado on delete set null;

-- ───────────── execuções do robô (Apify roda em segundo plano; o robô volta depois para buscar) ─────────────
create table public.execucoes_robo (
  id            bigint generated always as identity primary key,
  tipo          text not null check (tipo in ('hashtags', 'videos', 'perfis', 'remedir', 'comentarios')),
  nicho_id      text references public.nichos_mercado on delete set null,
  periodo       smallint,
  run_id        text not null,
  dataset_id    text not null,
  status        text not null default 'rodando',          -- rodando | pronto | falhou
  erro          text,
  criado_em     timestamptz not null default now(),
  processado_em timestamptz
);
create index on public.execucoes_robo (status, criado_em);
alter table public.execucoes_robo enable row level security;   -- sem policy: só o robô (service role)

-- Ganchos do mercado por nicho (atalho para a tela e para a pesquisa).
create or replace function public.ganchos_do_nicho(p_nicho text, p_dias int default 30, p_limite int default 8)
returns table (texto text, tipo text, videos bigint, perfis bigint, media_views numeric)
language sql stable security invoker set search_path = '' as $$
  select g.texto, g.tipo, count(*), count(distinct v.perfil), round(avg(v.views))
  from public.videos_mercado v join public.ganchos_mercado g on g.id = v.gancho_id
  where not g.oculto and v.nicho_id = p_nicho and v.views >= 1000
    and v.postado_em >= now() - make_interval(days => p_dias)
  group by g.texto, g.tipo
  having count(distinct v.perfil) >= 2
  order by avg(v.views) desc
  limit p_limite;
$$;
grant execute on function public.ganchos_do_nicho(text, int, int) to authenticated;

-- ───────────── senha interna do robô (o agendador manda, a Edge Function confere) ─────────────
create table public.config_robo (chave text primary key, valor text not null);
alter table public.config_robo enable row level security;      -- sem policy: ninguém lê pelo app
insert into public.config_robo values ('token', encode(extensions.gen_random_bytes(24), 'hex')) on conflict do nothing;

-- ───────────── agenda (horário de Brasília = UTC-3) ─────────────
-- Depois de publicar as Edge Functions, trocar <PROJETO> pelo id do projeto e rodar:
--   create extension if not exists pg_cron; create extension if not exists pg_net;
--   select cron.schedule('robo-iniciar',   '0 6 * * *',     $c$ select net.http_post('https://<PROJETO>.supabase.co/functions/v1/mercado-robo',
--     jsonb_build_object('etapa','iniciar'), headers => jsonb_build_object('content-type','application/json','x-robo-token',(select valor from public.config_robo where chave='token')), timeout_milliseconds => 60000) $c$);
--   select cron.schedule('robo-processar', '*/15 6-9 * * *', $c$ select net.http_post('https://<PROJETO>.supabase.co/functions/v1/mercado-robo',
--     jsonb_build_object('etapa','processar'), headers => jsonb_build_object('content-type','application/json','x-robo-token',(select valor from public.config_robo where chave='token')), timeout_milliseconds => 60000) $c$);
