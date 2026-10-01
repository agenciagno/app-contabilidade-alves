-- Serpro — 01/10/2026: rotina anual da DEFIS, decidida por Gabriel.
--   · Rodada de 15/03 (todos os que ainda não têm a DEFIS do ano) e rodada do dia seguinte ao prazo (só quem continua sem a DEFIS do ano).
--     O prazo é 31/03; fim de semana ou feriado nacional passa ao próximo dia útil (função serpro_proximo_dia_util, tabela national_holidays).
--   · Interruptor em Tech (padrão LIGADO: Gabriel aprovou as duas datas). Custa 1 consulta por cliente consultado (R$ 0,24).
--   · Tipo de aviso novo no sino: serpro_defis.
--   · Cron às 08:20, 08:25 e 08:30 (horário de Brasília = 11:20, 11:25 e 11:30 UTC); a função decide pela data. Fora das duas datas responde sem chamar o Serpro.
-- O comando é copiado do job da leitura de faturamento (mesma chave anon pública e tempo limite de 120 s), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-defis estar implantada.
create or replace function public.serpro_proximo_dia_util(p_data date)
returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v date := p_data;
begin
  while extract(dow from v) in (0, 6) or exists (select 1 from public.national_holidays h where h.date = v) loop
    v := v + 1;
  end loop;
  return v;
end;
$function$;

revoke all on function public.serpro_proximo_dia_util(date) from public, anon, authenticated;
grant execute on function public.serpro_proximo_dia_util(date) to service_role;

alter table public.serpro_config add column auto_rotina_defis boolean not null default true;
comment on column public.serpro_config.auto_rotina_defis is 'Rotina anual da DEFIS (serpro-defis, action rotina_defis): em 15/03 consulta quem ainda não entregou; no dia seguinte ao prazo, só quem continua sem a DEFIS do ano. Custa 1 consulta por cliente consultado. Padrão: ligado.';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_das_vencimento', 'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis'
  ]));

do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-faturamento-bimestral-1820-1855';
  if cmd is null then raise exception 'job serpro-faturamento-bimestral-1820-1855 não encontrado'; end if;
  cmd := replace(replace(cmd, 'serpro-pgdasd', 'serpro-defis'), 'rotina_faturamento', 'rotina_defis');
  perform cron.schedule('serpro-defis-anual-0820-0830', '20,25,30 11 * * *', cmd);
end $$;
