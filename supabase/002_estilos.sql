-- EditaJá · 002 · Estilos, referências e aprendizado
-- Rodar depois do 001_schema.sql.
-- Ideia: cada estilo tem versões imutáveis (perfil + regras). Toda mudança cria
-- uma versão nova; "desfazer" = criar versão nova copiando uma antiga.

-- ───────────── tipos ─────────────
create type origem_tipo as enum ('inicial', 'voce', 'colaborador', 'aprendizado');
create type referencia_tipo as enum ('video', 'som', 'imagem');
create type sugestao_status as enum ('pendente', 'aplicada', 'descartada');
create type feedback_tipo as enum ('aprovacao', 'recusa');

-- ───────────── estilos ─────────────
create table public.estilos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  slug          text not null,                       -- ex.: 'clean', 'unboxing'
  nome          text not null,
  descricao     text,
  padrao        boolean not null default false,
  versao_atual  int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, slug)
);
create unique index estilos_um_padrao on public.estilos (owner_id) where padrao;

create table public.estilo_versoes (
  id          uuid primary key default gen_random_uuid(),
  estilo_id   uuid not null references public.estilos on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  n           int not null,
  perfil      jsonb not null,     -- velocidade, capa_0_1s, cortes, headline, imagens, sons, proibido…
  regras      jsonb not null default '[]',  -- [{id, texto, tipo: fixa|preferencia|proibido, origem}]
  autor       text not null,      -- 'Você', 'Recusa aprendida', …
  motivo      text,
  origem_tipo origem_tipo not null default 'voce',
  origem_ref  text,               -- vídeo/pasta/colaborador que originou
  mudancas    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (estilo_id, n)
);
create index on public.estilo_versoes (estilo_id, n desc);

-- versão atual pronta para o worker
create view public.estilo_atual with (security_invoker = true) as
  select e.id as estilo_id, e.owner_id, e.slug, e.nome, v.n, v.perfil, v.regras
  from public.estilos e
  join public.estilo_versoes v on v.estilo_id = e.id and v.n = e.versao_atual;

-- ───────────── referências ─────────────
create table public.referencias (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users on delete cascade,
  estilo_id    uuid references public.estilos on delete set null,
  nome         text not null,
  tipo         referencia_tipo not null,
  storage_path text,              -- bucket 'referencias' (ou 'biblioteca' para imagens)
  tamanho_mb   numeric,
  origem_tipo  origem_tipo not null default 'voce',
  origem_nome  text,              -- nome do(a) colaborador(a) ou pasta inicial
  produto      text,              -- imagens por produto
  analise      jsonb not null default '{"status":"analisando"}',
  created_at   timestamptz not null default now(),
  check (origem_tipo <> 'colaborador' or origem_nome is not null)
);
create index on public.referencias (owner_id, tipo);
create index on public.referencias (estilo_id);

-- ───────────── aprendizado ─────────────
create table public.sugestoes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users on delete cascade,
  estilo_id       uuid not null references public.estilos on delete cascade,
  video_id        uuid references public.videos on delete set null,
  referencia_id   uuid references public.referencias on delete set null,
  tipo            feedback_tipo not null,
  comentario      text,
  motivos         text[] not null default '{}',
  proposta        jsonb not null,   -- {texto, regra:{…}, patch:{…perfil}}
  status          sugestao_status not null default 'pendente',
  versao_aplicada int,              -- n da versão criada ao aplicar
  created_at      timestamptz not null default now()
);
create index on public.sugestoes (owner_id, status);
create index on public.sugestoes (estilo_id);
create index on public.sugestoes (video_id);

-- vídeo escolhe o estilo; guarda a versão usada na edição
alter table public.videos
  add column estilo_id uuid references public.estilos on delete set null,
  add column estilo_versao int;
create index on public.videos (estilo_id);

-- ───────────── funções ─────────────
-- cria versão nova a partir da atual (ou de outra, p/ desfazer) de forma atômica
create or replace function public.nova_versao_estilo(
  p_estilo uuid, p_perfil jsonb, p_regras jsonb, p_autor text, p_motivo text,
  p_origem origem_tipo default 'voce', p_origem_ref text default null, p_mudancas text[] default '{}'
) returns int
language plpgsql security invoker set search_path = '' as $$
declare v_n int;
begin
  perform 1 from public.estilos where id = p_estilo for update;  -- serializa versões do mesmo estilo
  if not found then raise exception 'estilo não encontrado'; end if;
  select coalesce(max(n), 0) + 1 into v_n from public.estilo_versoes where estilo_id = p_estilo;
  insert into public.estilo_versoes (estilo_id, n, perfil, regras, autor, motivo, origem_tipo, origem_ref, mudancas)
  values (p_estilo, v_n, p_perfil, p_regras, p_autor, p_motivo, p_origem, p_origem_ref, p_mudancas);
  update public.estilos set versao_atual = v_n, updated_at = now() where id = p_estilo;
  return v_n;
end $$;

create or replace function public.aplicar_sugestao(p_sugestao uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare s public.sugestoes; a record; v_n int;
begin
  select * into s from public.sugestoes where id = p_sugestao and status = 'pendente' for update;
  if not found then raise exception 'sugestão não encontrada ou já resolvida'; end if;
  select * into a from public.estilo_atual where estilo_id = s.estilo_id;
  v_n := public.nova_versao_estilo(
    s.estilo_id,
    a.perfil || coalesce(s.proposta -> 'patch', '{}'),
    a.regras || jsonb_build_array(s.proposta -> 'regra'),
    case s.tipo when 'recusa' then 'Recusa aprendida' else 'Aprovação aprendida' end,
    s.comentario, 'aprendizado', s.video_id::text,
    array['+ ' || (s.proposta ->> 'texto')]);
  update public.sugestoes set status = 'aplicada', versao_aplicada = v_n where id = s.id;
  return v_n;
end $$;

create or replace function public.restaurar_versao(p_estilo uuid, p_n int) returns int
language plpgsql security invoker set search_path = '' as $$
declare alvo public.estilo_versoes;
begin
  select * into alvo from public.estilo_versoes where estilo_id = p_estilo and n = p_n;
  if not found then raise exception 'versão % não existe', p_n; end if;
  return public.nova_versao_estilo(p_estilo, alvo.perfil, alvo.regras, 'Você',
    'Desfeito: voltou para a versão ' || p_n, 'voce', null, array['↺ restaurou a v' || p_n]);
end $$;

create trigger estilos_touch before update on public.estilos
  for each row execute function public.touch_updated_at();

-- ───────────── RLS (só o dono) ─────────────
alter table public.estilos        enable row level security;
alter table public.estilo_versoes enable row level security;
alter table public.referencias    enable row level security;
alter table public.sugestoes      enable row level security;

create policy "dono" on public.estilos        for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dono" on public.estilo_versoes for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dono" on public.referencias    for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dono" on public.sugestoes      for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- versões são histórico: sem update/delete pelo app (desfazer cria versão nova)
revoke update, delete on public.estilo_versoes from authenticated;

-- ───────────── storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('referencias', 'referencias', false, 2147483648)
on conflict (id) do nothing;

create policy "referencias: dono lê"    on storage.objects for select to authenticated
  using (bucket_id = 'referencias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "referencias: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'referencias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "referencias: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'referencias' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter publication supabase_realtime add table public.sugestoes, public.referencias;

-- ───────────── conteúdo inicial ─────────────
-- Chamado uma vez para a conta do Eduardo (ou no cadastro de qualquer conta nova,
-- com os mesmos estilos base). Os arquivos das pastas atuais são enviados pelo
-- script worker/importar_pastas.py para <uid>/inicial/… nos buckets.
create or replace function public.semear_estilos(p_owner uuid, p_com_arquivos boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_clean uuid; v_unb uuid;
begin
  if exists (select 1 from public.estilos where owner_id = p_owner) then return; end if;

  insert into public.estilos (owner_id, slug, nome, descricao, padrao)
  values (p_owner, 'clean', 'Clean do Eduardo', 'Cortes secos, 1.1x, imagens onde aponta, sons fixos. Sem cards nem animações.', true)
  returning id into v_clean;
  insert into public.estilos (owner_id, slug, nome, descricao)
  values (p_owner, 'unboxing', 'Unboxing UAU', 'Opcional por vídeo: o melhor UAU abre o vídeo, depois o gancho falado.')
  returning id into v_unb;

  insert into public.estilo_versoes (estilo_id, owner_id, n, perfil, regras, autor, motivo, origem_tipo, origem_ref, mudancas) values
  (v_clean, p_owner, 1,
   '{"velocidade":1.1,"capa_0_1s":true,"cortes":{"respiros":true,"repeticoes":"manter_ultima","folga_fim_frase_s":0.12},
     "reducao_ruido":true,"qualidade":"original","headline":{"emoji_alerta":["cuidado","muito cuidado"]},
     "imagens":{"inclinacao_graus":[-6,6],"animacao":false,"posicao":"onde_aponta","uma_por_falso":true},
     "sons":{"foto_entra":"Bubble pop","clica":"mouse-click","print_sozinho":"mouse-click","criar_sons":false},
     "uau_no_inicio":false,"proibido":["botoes","cards","cta_carrinho","clique_aqui","loja_oficial","animacoes_extras"]}',
   '[{"id":"r1","texto":"Todo vídeo abre com 0,1 s de capa","tipo":"fixa","origem":"COMO-USAR.md"},
     {"id":"r2","texto":"Velocidade 1.1x em todo vídeo exportado","tipo":"fixa","origem":"Pedido do Eduardo"},
     {"id":"r3","texto":"Cortes secos de respiros e repetições, mantendo a última","tipo":"fixa","origem":"estilo-referencia.md"},
     {"id":"r4","texto":"Nunca cortar o fim de sílabas/frases","tipo":"fixa","origem":"Recusa aprendida"},
     {"id":"r5","texto":"Qualidade original: resolução, cor e saturação","tipo":"fixa","origem":"Recusa aprendida"},
     {"id":"r6","texto":"Headline com 🚨 quando falar \"cuidado\"","tipo":"fixa","origem":"Pedido do Eduardo"},
     {"id":"r7","texto":"Imagens levemente inclinadas, sem animação, onde a pessoa aponta","tipo":"fixa","origem":"referencia_imagens_inclinadas.mov"},
     {"id":"r8","texto":"Bubble pop em cada foto; mouse-click em clica/clique","tipo":"fixa","origem":"sistema/sons"},
     {"id":"r9","texto":"Nunca botões, cards, CTAs ou animações extras","tipo":"proibido","origem":"Recusa aprendida"}]',
   'Conteúdo inicial', 'Regras já usadas nas edições atuais', 'inicial', 'sistema/', array['= regras atuais do editor']),
  (v_unb, p_owner, 1,
   '{"velocidade":1.1,"capa_0_1s":true,"uau_no_inicio":true,"uau_duracao_s":[1,2],"manter_reacoes":true,
     "cortar_abertura":["oi gente","hoje vou mostrar"],"sons":{"foto_entra":"Bubble pop","clica":"mouse-click","criar_sons":false}}',
   '[{"id":"u1","texto":"Melhor UAU (1–2 s, produto aparecendo) abre o vídeo","tipo":"fixa","origem":"referencia_unboxing_uau.mp4"},
     {"id":"u2","texto":"Manter reações nas surpresas","tipo":"fixa","origem":"referencia_unboxing_uau.mp4"},
     {"id":"u3","texto":"Cortar \"oi gente / hoje vou mostrar\"","tipo":"fixa","origem":"referencia_unboxing_uau.mp4"}]',
   'Conteúdo inicial', 'Referência Unboxing Uau', 'inicial', 'referencias/', array['= estilo base']);

  -- referências com arquivo só para quem importou as pastas (importar_pastas.py); conta nova recebe só os estilos
  if not p_com_arquivos then return; end if;
  insert into public.referencias (owner_id, estilo_id, nome, tipo, storage_path, origem_tipo, origem_nome, produto, analise) values
  (p_owner, v_clean, 'referencia_imagens_inclinadas.mov', 'video', p_owner || '/inicial/referencias/referencia_imagens_inclinadas.mov', 'inicial', 'referencias/', null,
   '{"status":"pronta","extraido":["imagens inclinadas","sem animação","posição onde aponta"]}'),
  (p_owner, v_unb,   'referencia_unboxing_uau.mp4', 'video', p_owner || '/inicial/referencias/referencia_unboxing_uau.mp4', 'inicial', 'referencias/', null,
   '{"status":"pronta","extraido":["UAU no início","reações mantidas"]}'),
  (p_owner, v_clean, 'Bubble pop', 'som', p_owner || '/inicial/sons/original_bubble_pop.mp3', 'inicial', 'sistema/sons/', null, '{"status":"pronta"}'),
  (p_owner, v_clean, 'mouse-click', 'som', p_owner || '/inicial/sons/original_mouse_click.mp3', 'inicial', 'sistema/sons/', null, '{"status":"pronta"}'),
  (p_owner, null, 'falso-1.png', 'imagem', p_owner || '/inicial/biblioteca/falsos-genericos/falso-1.png', 'inicial', 'biblioteca/', 'Genérico', '{"status":"pronta"}'),
  (p_owner, null, 'falso-2.png', 'imagem', p_owner || '/inicial/biblioteca/falsos-genericos/falso-2.png', 'inicial', 'biblioteca/', 'Genérico', '{"status":"pronta"}'),
  (p_owner, null, 'produto-serum.png', 'imagem', p_owner || '/inicial/biblioteca/serum-facil/produto-serum.png', 'inicial', 'biblioteca/', 'Sérum Facil', '{"status":"pronta"}'),
  (p_owner, null, 'camisa-1.png', 'imagem', p_owner || '/inicial/biblioteca/camisas-gremio/camisa-1.png', 'inicial', 'biblioteca/', 'Camisas do Grêmio', '{"status":"pronta"}'),
  (p_owner, null, 'camisa-2.png', 'imagem', p_owner || '/inicial/biblioteca/camisas-gremio/camisa-2.png', 'inicial', 'biblioteca/', 'Camisas do Grêmio', '{"status":"pronta"}'),
  (p_owner, null, 'camisa-3.png', 'imagem', p_owner || '/inicial/biblioteca/camisas-gremio/camisa-3.png', 'inicial', 'biblioteca/', 'Camisas do Grêmio', '{"status":"pronta"}'),
  (p_owner, null, 'garmin_referencia.png', 'imagem', p_owner || '/inicial/biblioteca/garmin_referencia.png', 'inicial', 'biblioteca/', 'Smartwatch', '{"status":"pronta"}');
end $$;
revoke execute on function public.semear_estilos(uuid, boolean) from public, anon, authenticated;

-- toda conta nova já nasce com os estilos base
create or replace function public.semear_estilos_novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform public.semear_estilos(new.id); return new; end $$;
create trigger perfil_semear_estilos after insert on public.profiles
  for each row execute function public.semear_estilos_novo_usuario();
