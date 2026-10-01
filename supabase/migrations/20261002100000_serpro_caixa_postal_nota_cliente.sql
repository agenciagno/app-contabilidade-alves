-- Termos de Intimação por cliente (02/10/2026): bloco de notas do CLIENTE (além da observação de cada mensagem).
-- Fica no resumo por cliente; só o backend (edge serpro-caixa-postal, action acompanhar_cliente) grava, a equipe lê.
alter table public.serpro_caixa_postal_resumo
  add column if not exists observacoes text,
  add column if not exists observacoes_atualizadas_em timestamptz,
  add column if not exists observacoes_atualizadas_por uuid;

comment on column public.serpro_caixa_postal_resumo.observacoes is 'Bloco de notas do cliente na tela Termos de Intimação (a observação de cada mensagem fica em serpro_caixa_postal_mensagens.observacoes).';
