-- 011: estilo "Clean" com nome neutro, prévia real de ganchos/CTAs e excluir vídeos da Biblioteca.

-- 1) nome neutro do estilo (o id/slug "clean" não muda: vídeos e versões continuam ligados)
update public.estilos set nome = 'Clean' where nome = 'Clean do Eduardo';
update public.estilo_versoes set regras = replace(replace(regras::text, 'Pedido do Eduardo', 'Regra padrão'), 'Recusa do Eduardo', 'Recusa aprendida')::jsonb
  where regras::text like '%Eduardo%';
do $$
declare def text;
begin
  select pg_get_functiondef('public.semear_estilos(uuid, boolean)'::regprocedure) into def;
  def := replace(replace(def, 'Clean do Eduardo', 'Clean'), 'Pedido do Eduardo', 'Regra padrão');
  execute def;
end $$;

-- 2) prévia de "Hooks e CTAs": o app pede ({"status":"pedida"}), o editor na nuvem transcreve e
--    grava o que foi FALADO: {"status":"pronta","hooks":[{texto,s,e}],"ctas":[...],"fonte":"ia|pausas"}
alter table public.videos add column if not exists deteccao jsonb;

-- 3) excluir vídeo: o dono também apaga os arquivos editados dele
create policy "editados próprios - apagar" on storage.objects for delete
  using (bucket_id = 'editados' and (storage.foldername(name))[1] = (select auth.uid())::text);
