-- 012: imagens do produto no vídeo, com lugar e tempo sugeridos pelo editor e ajustáveis na Aprovação
alter table public.videos add column if not exists imagens jsonb;
alter table public.videos add column if not exists imagens_ajustadas boolean not null default false;
comment on column public.videos.imagens is 'Imagens do produto no vídeo final: [{id, rotulo, imagem_id, path, de, ate, x, y, largura, angulo, motivo}] (tempos no vídeo final, x/y = canto de cima à esquerda em fração da tela)';
comment on column public.videos.imagens_ajustadas is 'true = a pessoa posicionou as imagens na Aprovação; o editor usa exatamente essas';
