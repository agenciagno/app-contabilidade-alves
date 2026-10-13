-- 13/10/2026 (pedido de Gabriel): botão exclusivo do 13º honorário em lote, dentro de Boletos.
--   · boleto_controls.tipo separa o boleto do 13º do ciclo mensal. O "Gerar lote" bloqueia cliente que já tem
--     boleto com vencimento no mesmo MÊS; sem esta coluna, um 13º vencendo em novembro faria o lote mensal de
--     novembro pular o honorário normal do cliente (e o 13º seria barrado por um boleto mensal do mês).
--   · 'mensal' = tudo o que já existe (lote, avulso, sincronizado do Sicoob). '13_p1' / '13_p2' = parcelas do 13º.
set local lock_timeout = '3s';

alter table public.boleto_controls
  add column tipo text not null default 'mensal';

alter table public.boleto_controls
  add constraint boleto_controls_tipo_check check (tipo in ('mensal', '13_p1', '13_p2'));

comment on column public.boleto_controls.tipo is 'mensal (padrão: lote, avulso e sincronizados) | 13_p1 | 13_p2 (parcelas do 13º honorário, botão próprio em Boletos).';
