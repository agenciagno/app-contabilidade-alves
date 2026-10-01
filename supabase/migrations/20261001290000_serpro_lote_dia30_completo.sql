-- Serpro — 01/10/2026: o lote do dia 30 do Simples passa a ser COMPLETO (todos os clientes do Simples, matriz), como o do Presumido e Real.
-- Decisão de Gabriel: durante o mês, quem pagou aparece pela rotina gratuita diária (sensor E0701); no dia 30 vêm os detalhes dos pagamentos.
-- Só atualiza a descrição das colunas; os interruptores continuam DESLIGADOS (padrão).
comment on column public.serpro_config.auto_lote_pagamentos_simples is 'Consulta completa do dia 30 (serpro-pagamentos, action rotina_lote_simples): consulta Pagamentos de TODOS os clientes do Simples (matriz). Custa 1 consulta por cliente. Padrão: desligado.';
comment on column public.serpro_config.auto_lote_pagamentos_presumido_real is 'Consulta completa do dia 30 (serpro-pagamentos, action rotina_lote_presumido_real): consulta Pagamentos de TODOS os clientes do Presumido e do Real (matriz). Custa 1 consulta por cliente. Padrão: desligado.';
