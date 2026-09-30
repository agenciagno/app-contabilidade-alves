-- Sensor E0701: guarda a última consulta de pagamentos (qualquer mês) para apagar o aviso "pagamento novo".
alter table public.serpro_pagamentos_sensor add column ultima_consulta_em timestamptz;
comment on column public.serpro_pagamentos_sensor.ultima_consulta_em is 'Última consulta de pagamentos (qualquer mês) feita pela equipe: apaga o aviso de "pagamento novo" quando é posterior a mudou_em.';
