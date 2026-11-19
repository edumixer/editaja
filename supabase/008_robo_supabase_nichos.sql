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
