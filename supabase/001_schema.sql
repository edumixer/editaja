-- EditaJá: esquema inicial (multiusuário, cada conta só vê o que é seu)

create type public.video_status as enum ('enviando','fila','editando','aprovacao','recusado','aprovado','agendado','publicado','erro');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  instagram text,
  nicho text,
  plano text not null default 'gratis',
  regras jsonb not null default '{"velocidade":1.1,"capa":true,"cortes":true,"ruido":true,"cuidado_emoji":true,"imagens_apontadas":true,"sons_fixos":true,"clean":true,"unboxing":false}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  produto text,
  headline text,
  status public.video_status not null default 'enviando',
  etapa smallint not null default 0,
  progresso real not null default 0,
  versao int not null default 1,
  opcoes jsonb not null default '{}'::jsonb,       -- multi hook×CTA, unboxing, etc.
  bruto_path text,                                  -- storage: brutos/<owner>/<id>/<arquivo>
  editado_path text,                                -- storage: editados/<owner>/<id>/v<versao>.mp4
  duracao_bruto real,
  duracao_final real,
  stats jsonb not null default '{}'::jsonb,         -- cortes, imagens, sons
  legenda text,
  descricao text,
  hashtags text[] not null default '{}',
  agendado_para timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_owner_status_idx on public.videos (owner_id, status);
create index videos_fila_idx on public.videos (status, created_at) where status in ('fila','recusado');

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  versao int not null,
  texto text not null,
  created_at timestamptz not null default now()
);
create index comentarios_video_idx on public.comentarios (video_id);

-- updated_at automático
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger videos_touch before update on public.videos for each row execute function public.touch_updated_at();

-- perfil criado no cadastro
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id, nome) values (new.id, new.raw_user_meta_data->>'nome'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: dono vê e altera só o que é seu (o worker usa a service key e ignora RLS)
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.comentarios enable row level security;

create policy "perfil próprio" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "vídeos próprios" on public.videos for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "comentários próprios" on public.comentarios for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Storage: buckets privados, pasta = id do dono
insert into storage.buckets (id, name, public, file_size_limit) values
  ('brutos','brutos',false, 4294967296),
  ('editados','editados',false, 1073741824),
  ('biblioteca','biblioteca',false, 104857600)
on conflict (id) do nothing;

create policy "arquivos próprios - ler" on storage.objects for select to authenticated
  using (bucket_id in ('brutos','editados','biblioteca') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "arquivos próprios - enviar" on storage.objects for insert to authenticated
  with check (bucket_id in ('brutos','biblioteca') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "arquivos próprios - apagar" on storage.objects for delete to authenticated
  using (bucket_id in ('brutos','biblioteca') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime para a fila atualizar sozinha na tela
alter publication supabase_realtime add table public.videos;
