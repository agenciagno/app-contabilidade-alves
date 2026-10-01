-- Serpro — 01/10/2026: lote do dia 30 para validar pagamentos (aprovado por Gabriel), em duas rotinas separadas, cada uma com seu interruptor.
-- Os dois interruptores nascem DESLIGADOS: Gabriel quer apenas ter a opção de ligar em Tech quando quiser. Desligado, a rotina responde "desligada" e não chama o Serpro.
--   · Simples: consulta Pagamentos (PAGTOWEB) só de quem tem DAS do mês anterior ainda sem pagamento registrado.
--   · Presumido e Real: consulta Pagamentos de todos os clientes desses regimes (matriz), do mês anterior.
alter table public.serpro_config add column auto_lote_pagamentos_simples boolean not null default false;
alter table public.serpro_config add column auto_lote_pagamentos_presumido_real boolean not null default false;
comment on column public.serpro_config.auto_lote_pagamentos_simples is 'Lote do dia 30 (serpro-pagamentos, action rotina_lote_simples): consulta Pagamentos de quem tem DAS do mês anterior sem pagamento registrado. Custa 1 consulta por cliente. Padrão: desligado.';
comment on column public.serpro_config.auto_lote_pagamentos_presumido_real is 'Lote do dia 30 (serpro-pagamentos, action rotina_lote_presumido_real): consulta Pagamentos de todos os clientes do Presumido e do Real (matriz). Custa 1 consulta por cliente. Padrão: desligado.';
