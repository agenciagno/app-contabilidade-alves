-- Liquidação semi-automática de boletos: botão "Liquidar" na tela de Boletos vincula um boleto
-- PAGO ao lançamento de honorários correspondente e liquida a transação (is_paid, paid_amount,
-- date, bank_id) — ver roadmap.md 15/09/2026.
--
-- Regra explícita do Gabriel: só vale daqui pra frente. Nenhum boleto que já está PAGO hoje (nem
-- as transações já liquidadas manualmente) pode ser tocado por este fluxo novo — 2 exemplos reais
-- de liquidação manual feita hoje que não podem ser alterados. `liquidacao_habilitada` nasce true
-- pra tudo, e o backfill abaixo desliga pra quem já é PAGO no momento desta migration — funciona
-- como um corte: só boleto que vira PAGO depois de agora fica elegível pro botão.

alter table public.boleto_controls
  add column if not exists transaction_id uuid references public.transactions(id),
  add column if not exists liquidacao_habilitada boolean not null default true;

update public.boleto_controls
set liquidacao_habilitada = false
where status = 'PAGO';

create index if not exists idx_boleto_controls_transaction_id
  on public.boleto_controls(transaction_id)
  where transaction_id is not null;

comment on column public.boleto_controls.transaction_id is
  'Lançamento (transactions) liquidado a partir deste boleto via botão "Liquidar" — null enquanto não vinculado.';
comment on column public.boleto_controls.liquidacao_habilitada is
  'false = boleto já estava PAGO antes do fluxo de liquidação existir (15/09/2026); nunca elegível pro botão "Liquidar", mesmo que perca o transaction_id.';
