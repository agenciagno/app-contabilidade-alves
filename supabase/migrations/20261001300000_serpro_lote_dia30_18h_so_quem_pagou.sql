-- Serpro — 01/10/2026: ajuste final do lote do dia 30, aprovado por Gabriel ("não preciso gastar cartucho com DAS que não foi pago").
--   · As duas rotinas passam a rodar às 18:00 (Simples, 2 disparos de 5 em 5 min) e 18:10 (Presumido e Real), horário de Brasília = 21:00, 21:05, 21:10 e 21:15 UTC.
--   · Simples: antes de decidir, relê o sensor gratuito de pagamentos (E0701) e consulta só quem tem evento de pagamento a partir do dia 1 do mês.
--     Teste com os DAS de 08/2026: o sensor marcou os 82 clientes que pagaram (nenhum furo). Presumido e Real continua com todos.
--   · Os interruptores continuam DESLIGADOS (padrão).
-- O comando é copiado do job antigo (mesma chave anon pública e tempo limite de 120 s); os jobs antigos das 07:10 e 07:20 são removidos.
do $$
declare
  cmd_s text;
  cmd_p text;
begin
  select command into cmd_s from cron.job where jobname = 'serpro-pag-lote-simples-0710-0715';
  select command into cmd_p from cron.job where jobname = 'serpro-pag-lote-presumido-real-0720-0725';
  if cmd_s is null or cmd_p is null then raise exception 'jobs do lote do dia 30 não encontrados'; end if;
  perform cron.unschedule('serpro-pag-lote-simples-0710-0715');
  perform cron.unschedule('serpro-pag-lote-presumido-real-0720-0725');
  perform cron.schedule('serpro-pag-lote-simples-1800-1805', '0,5 21 * * *', cmd_s);
  perform cron.schedule('serpro-pag-lote-presumido-real-1810-1815', '10,15 21 * * *', cmd_p);
end $$;

comment on column public.serpro_config.auto_lote_pagamentos_simples is 'Consulta do dia 30 às 18:00 (serpro-pagamentos, action rotina_lote_simples): relê o sensor E0701 e consulta Pagamentos só dos clientes do Simples (matriz) com pagamento no mês. Custa 1 consulta por cliente consultado. Padrão: desligado.';
comment on column public.serpro_config.auto_lote_pagamentos_presumido_real is 'Consulta completa do dia 30 às 18:10 (serpro-pagamentos, action rotina_lote_presumido_real): consulta Pagamentos de TODOS os clientes do Presumido e do Real (matriz). Custa 1 consulta por cliente. Padrão: desligado.';
