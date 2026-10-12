-- 12/10/2026 (pedido de Gabriel): o box "Datas" do Operacional do cliente ganha Paralisação nas 4 esferas,
-- Início do Fiscal, Início do Pessoal e Balanço de abertura (print do Makro).
-- Abertura, Baixa (`data_encerramento_*`) e Início/Fim do contrato (`data_inicio_contrato`, `data_saida_cliente`) já existem.
-- Só colunas novas, nulas e sem default: não reescreve a tabela. Lock curto, falha em vez de enfileirar.
set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists data_paralisacao_junta date,
  add column if not exists data_paralisacao_rf date,
  add column if not exists data_paralisacao_prefeitura date,
  add column if not exists data_paralisacao_estado date,
  add column if not exists data_inicio_fiscal date,
  add column if not exists data_inicio_pessoal date,
  add column if not exists data_balanco_abertura date;
