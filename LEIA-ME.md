# EditaJá — plataforma

App Next.js (pasta raiz) + banco Supabase (`supabase/001_schema.sql`) + worker de edição sob demanda no Modal (`worker/modal_app.py`, roda o `sistema/editor.py`).

Sem variáveis de ambiente o app roda em **modo demonstração** (dados de exemplo). Para o modo real, na Vercel:

| Variável | De onde vem |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase › Project Settings › API |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase › API Keys (publishable) |
| EDITAJA_WORKER_URL | URL do endpoint `enfileirar` após `modal deploy` |
| EDITAJA_WORKER_TOKEN | o mesmo WORKER_TOKEN do secret `editaja-supabase` no Modal |

Fluxo real: login → upload retomável (TUS, partes de 6 MB) para o bucket `brutos` → `/api/editar` → worker Modal (transcrição, cortes, 1.1x, render) → `editados/` → tela de aprovação com o vídeo de verdade → legenda/hashtags → agendamento.
Pendente: imagens de referência e sons automáticos no plano (hoje o plano automático faz cortes, 1.1x, capa e headline), legenda por IA real (Claude API) e conexão Instagram (Meta Graph API).

## Estilos e Referências (aprendizado)

- Tela `/estilos`: cada estilo (ex.: "Clean do Eduardo", "Unboxing UAU") tem versões imutáveis com perfil JSON + regras. Cada regra e referência mostra a origem: Conteúdo inicial (pastas atuais), Você, Colaborador(a) com nome, ou Aprendizado (veio de um Aprovar/Recusar).
- Aprovar/Recusar na tela de aprovação cria uma **sugestão** de regra. Nada muda no estilo sem o OK em Estilos › Aprendizado. Aplicar cria versão nova; "Voltar para esta versão" também cria versão nova (nada é apagado).
- No envio do vídeo, escolhe-se o estilo; o worker lê a versão atual do estilo (`estilo_atual`) e grava `estilo_id`/`estilo_versao` no vídeo.
- Banco: `supabase/002_estilos.sql` (tabelas `estilos`, `estilo_versoes`, `referencias`, `sugestoes`; funções `aplicar_sugestao`, `restaurar_versao`; bucket `referencias`; contas novas já nascem com os estilos base).
- Conteúdo inicial: depois das migrations, rodar `worker/importar_pastas.py <uid> /mnt/project-files` (envia referencias/, biblioteca/ e sistema/sons para o Storage e semeia estilos e referências).
- Ainda simulado no preview: análise de referência (hoje heurística; no real, worker + Claude) e a tela de Estilos usa dados locais até o Supabase existir.

## Produtos, hooks × CTAs e análise de referência
- **Banco:** rodar `supabase/003_produtos_combinacoes.sql` depois da 002. Cria `produtos` e `produto_imagens` (rótulos produto/original/falso/detalhe/print) e acrescenta em `videos` as colunas `produto_id`, `combinacoes`, `origem_id`, `hook_idx`, `cta_idx` e `variante`. Também acrescenta em `referencias` as colunas `transcricao`, `analisado_em` e `modelo`.
- **Conteúdo inicial:** `worker/importar_pastas.py` sobe `biblioteca/` e chama `semear_produtos`. Camisas do Grêmio, Sérum Facil, Smartwatch, Lisinha e Clarinha e Creme celulite viram produtos. Contas novas começam sem produtos.
- **Editor:** `editar` baixa só as imagens do produto vinculado. Cada combinação gancho × CTA vira um vídeo: a primeira atualiza o vídeo pai e as outras entram como vídeos filhos (`origem_id`, `variante`). Os ganchos e CTAs são detectados na transcrição (Claude, se `ANTHROPIC_API_KEY` estiver no secret do Modal `editaja-supabase`; senão, por heurística) ou vêm do que o usuário digitou.
- **Referência:** a função/endpoint `analisar` (POST com token) transcreve, mede cortes e pausas, lê 8 quadros, grava a análise completa em `referencias.analise` e cria sugestões de regra em Aprendizado.

## Ganchos e Legendas, e Roteiros (opcional)
- **Banco:** rodar `supabase/004_textos_roteiros.sql` depois da 003. Cria `textos_referencia` (ganchos, legendas, descrições, hashtags e CTAs, por produto, com estrela para os que performaram melhor) e `roteiros`. Também acrescenta `roteiro_id` e `data_planejada` em `videos`, ambos opcionais. `importar_pastas.py` chama `semear_textos`.
- **Banco (16/11):** rodar `supabase/005_tendencias_headline.sql` depois da 004. Acrescenta em `videos` a headline opcional (`headline_ativa`, `headline_x`, `headline_y`), `gancho_texto` e `surpresas` (reações de surpresa achadas). Cria `metricas_video` (views por vídeo, vindas do TikTok) e as funções `ranking_ganchos` (só a conta) e `ranking_comunidade` (anônimo, só ganchos usados por 3 ou mais criadores) para a aba "Em alta". `/api/tiktok` lê a legenda pública de um link pelo oEmbed oficial do TikTok.
- **Mercado TikTok (16/11):** rodar `supabase/006_mercado_tiktok.sql` depois da 005 (tabelas `*_mercado` + função `ranking_mercado`, leitura para todo usuário logado). Robô: `modal secret create editaja-apify APIFY_TOKEN=…`, depois `modal deploy worker/tendencias.py` (roda todo dia 03:00 de Brasília; hashtags diárias, vídeos segunda e quinta via `DIAS_VIDEOS`). Colocar na Vercel `EDITAJA_TENDENCIAS_URL` (URL do endpoint `ler_link` que o Modal mostra) para o Aprender ler links pelo robô. Nichos ficam na tabela `nichos_mercado`.
- **Velocidade, CTAs e Pesquisar no TikTok (16/11):** rodar `supabase/007_velocidade_ctas_pesquisa.sql` depois da 006. O robô (`worker/tendencias.py`) agora calcula nota de engajamento 0–100, velocidade e ritmo (ideias da skill last30days, MIT), re-mede todo dia os vídeos dos últimos 4 dias ("prestes a viralizar"), tira o CTA da fala final, lê comentários (intenção de compra) e tem o endpoint `pesquisar`. Na Vercel: `EDITAJA_PESQUISA_URL` = URL do endpoint `pesquisar` que o Modal mostra; `EDITAJA_WORKER_TOKEN` (ou `WORKER_TOKEN`) igual ao `WORKER_TOKEN` do Modal; opcional `PESQUISAS_POR_DIA` (padrão 5). Rota: `app/api/mercado/pesquisar/route.ts` (cache de 24 h por tema). Sem essas variáveis a pesquisa mostra dados de exemplo.
- **Editor:** depois de renderizar cada vídeo, `_escrever_textos` pega os exemplos mais relevantes do produto e pede ao Claude legenda, descrição e hashtags no mesmo jeito, citando o que aparece na fala. Sem `ANTHROPIC_API_KEY`, usa uma versão simples.
- **Roteiros:** são opcionais, e o fluxo normal não depende deles. O endpoint `roteiro` (POST com token) escreve o meio do roteiro com as palavras e imagens do produto.
