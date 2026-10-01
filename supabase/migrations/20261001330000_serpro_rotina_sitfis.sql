-- Serpro — 01/10/2026: rotina bimestral da Situação Fiscal, decidida por Gabriel ("consulta bimestral, rodada um em 30/10, sem rodada inaugural").
--   · A cada dois meses (dia 30 de outubro, dezembro, fevereiro [último dia], abril, junho e agosto) gera o relatório de todos os clientes ativos de matriz.
--     Cada relatório é uma chamada /Emitir (R$ 0,32, cobrada também quando volta 202); o pedido de protocolo (/Apoiar) é gratuito.
--   · Interruptor em Tech (padrão LIGADO: Gabriel aprovou a data de início). Não há rodada de atualização antes de 30/10.
--   · Tipo de aviso novo no sino: serpro_sitfis.
--   · Cron de 5 em 5 minutos das 19:00 às 19:55 (horário de Brasília = 22:00 a 22:55 UTC): cada disparo faz um lote de até 30. A função decide pela data;
--     fora do dia 30 dos meses pares responde sem chamar o Serpro e sem custo.
-- O comando é copiado do job da DEFIS (mesma chave anon pública e tempo limite de 120 s), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-sitfis estar implantada.
alter table public.serpro_config add column auto_rotina_sitfis boolean not null default true;
comment on column public.serpro_config.auto_rotina_sitfis is 'Rotina bimestral da Situação Fiscal (serpro-sitfis, action rotina_sitfis): no dia 30 dos meses pares, gera o relatório de todos os clientes ativos de matriz. Custa R$ 0,32 por relatório (Emitir). Padrão: ligado.';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_das_vencimento', 'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis'
  ]));

do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-defis-anual-0820-0830';
  if cmd is null then raise exception 'job serpro-defis-anual-0820-0830 não encontrado'; end if;
  cmd := replace(replace(cmd, 'serpro-defis', 'serpro-sitfis'), 'rotina_defis', 'rotina_sitfis');
  perform cron.schedule('serpro-sitfis-bimestral-1900-1955', '0,5,10,15,20,25,30,35,40,45,50,55 22 * * *', cmd);
end $$;
