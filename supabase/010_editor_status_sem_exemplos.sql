-- 010 (25/11/2026): status do editor + sementes sem o exemplo fictício (Camisas do Grêmio)

-- 1) O editor (computador ou nuvem) avisa a cada ~20 s que está ligado; a tela "Fila de edição" lê só este horário.
create or replace function public.editor_status() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select nullif(valor, '')::timestamptz from public.config_robo where chave = 'editor_visto_em'
$$;
revoke execute on function public.editor_status() from public, anon;
grant execute on function public.editor_status() to authenticated;

-- 2) Textos iniciais: só exemplos gerais (nenhum produto de exemplo).
create or replace function public.semear_textos(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.textos_referencia where owner_id = p_owner) then return; end if;
  insert into public.textos_referencia (owner_id, tipo, texto, produto_id, origem, destaque) values
    (p_owner, 'gancho',   'Não compre antes de ver isso', null, 'viral', true),
    (p_owner, 'legenda',  'Original x falso: você saberia diferenciar? 👀', null, 'viral', true),
    (p_owner, 'hashtags', '#tiktokmademebuyit #achadinhos #review', null, 'minha', false),
    (p_owner, 'cta',      'Comenta EU QUERO que eu te mando o link', null, 'minha', false);
end $$;

-- 3) Estilos iniciais: tira as imagens da camisa do Grêmio das referências semeadas.
do $do$
declare src text;
begin
  select prosrc into src from pg_proc where proname = 'semear_estilos' and pronamespace = 'public'::regnamespace;
  src := regexp_replace(src, '\n[^\n]*camisa-[0-9]\.png[^\n]*', '', 'g');
  execute format('create or replace function public.semear_estilos(p_owner uuid, p_com_arquivos boolean default false) returns void language plpgsql security definer set search_path = '''' as %L', src);
end $do$;
