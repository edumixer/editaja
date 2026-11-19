-- EditaJá · 009 · Data e hora em que o vídeo foi editado (mostrada na fila de aprovação).
-- O banco marca sozinho quando o vídeo chega em "aprovacao", então o editor no PC não precisa mudar.
alter table public.videos add column if not exists editado_em timestamptz;

create or replace function public.marcar_editado_em() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'aprovacao' and (tg_op = 'INSERT' or old.status is distinct from 'aprovacao') then
    new.editado_em = now();
  end if;
  return new;
end $$;

create or replace trigger videos_editado_em before insert or update of status on public.videos
  for each row execute function public.marcar_editado_em();

-- vídeos que já estavam prontos: usa a última atualização
update public.videos set editado_em = updated_at
 where editado_em is null and status in ('aprovacao','aprovado','agendado','publicado');
