-- Sensor E0701: marca cliente sem procuração para pagamentos (evento volta "x").
alter table public.serpro_pagamentos_sensor add column sem_procuracao boolean not null default false;
comment on column public.serpro_pagamentos_sensor.sem_procuracao is 'true quando o evento E0701 voltou "x" (sem procuração para pagamentos) na última rodada.';
