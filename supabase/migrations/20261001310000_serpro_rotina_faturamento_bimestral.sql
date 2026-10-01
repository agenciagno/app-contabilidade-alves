-- Serpro — 01/10/2026: leitura bimestral do PDF da declaração para o faturamento (opção C de Gabriel, "a cada bimestre, primeira leitura em 30 de outubro").
--   · Interruptor em Tech (padrão LIGADO: Gabriel decidiu a data de início). A rotina cobra 1 consulta por declaração ainda não baixada (R$ 0,24).
--   · Novo tipo de aviso no sino: serpro_faturamento (resumo de quantos estão acima do limite, em atenção ou perto do sublimite).
--   · Cron: de 5 em 5 minutos das 18:20 às 18:55 (horário de Brasília = 21:20 a 21:55 UTC). A função serpro-pgdasd (action rotina_faturamento) decide pela DATA:
--     dia 30 dos meses pares (out, dez, fev [último dia], abr, jun, ago). Nos outros dias responde sem chamar o Serpro e sem custo.
--     Cada disparo lê até 60 clientes; quem já foi lido é pulado, então os 8 horários cobrem a carteira sem cobrar duas vezes.
-- O comando é copiado do job do lote do Simples (mesma chave anon pública e tempo limite de 120 s), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-pgdasd estar implantada.
alter table public.serpro_config add column auto_leitura_faturamento boolean not null default true;
comment on column public.serpro_config.auto_leitura_faturamento is 'Leitura bimestral do PDF da declaração do PGDAS-D (serpro-pgdasd, action rotina_faturamento): a cada dois meses, no dia 30, lê a declaração do mês anterior de todos os clientes do Simples (matriz). Custa 1 consulta por declaração baixada. Padrão: ligado.';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_das_vencimento', 'serpro_pgdas_prazo', 'serpro_faturamento'
  ]));

do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-pag-lote-simples-1800-1805';
  if cmd is null then raise exception 'job serpro-pag-lote-simples-1800-1805 não encontrado'; end if;
  cmd := replace(replace(cmd, 'serpro-pagamentos', 'serpro-pgdasd'), 'rotina_lote_simples', 'rotina_faturamento');
  perform cron.schedule('serpro-faturamento-bimestral-1820-1855', '20,25,30,35,40,45,50,55 21 * * *', cmd);
end $$;
