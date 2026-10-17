-- 17/10/2026 (pedido de Gabriel): a aba Cadastro do Super Perfil ganha o box "Responsável técnico"
-- (Nome, CPF, CNPJ, CRC, UF/CRC, Cargo), no molde do Makro.
-- Só colunas novas, nulas e sem default: não reescreve a tabela. Lock curto, falha em vez de enfileirar.
set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists resp_tecnico_nome text,
  add column if not exists resp_tecnico_cpf text,
  add column if not exists resp_tecnico_cnpj text,
  add column if not exists resp_tecnico_crc text,
  add column if not exists resp_tecnico_uf_crc text,
  add column if not exists resp_tecnico_cargo text;
