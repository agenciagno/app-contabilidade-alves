-- Serpro — 01/10/2026: rotina MENSAL da DCTFWeb e da MIT, decidida por Gabriel ("consulta mensal só de quem estiver com Movimento Novo; sem consulta inaugural").
--   · Interruptor em Tech (padrão LIGADO: Gabriel aprovou a rotina). A rotina cobra 2 consultas por cliente consultado (recibo da DCTFWeb + apurações da MIT, R$ 0,24 cada).
--   · Escopo: clientes ativos do Lucro Presumido e do Lucro Real (matriz) marcados como "movimento novo" pelo sensor gratuito diário (evento E0301, 07:40).
--     Quem não teve movimento desde a última consulta não é consultado nem cobrado. Competência da consulta = mês anterior ao da rodada.
--   · Cron: de 5 em 5 minutos das 20:00 às 20:25 (horário de Brasília = 23:00 a 23:25 UTC). A função serpro-dctfweb (action rotina_dctfweb) decide pela DATA:
--     dia 30 de cada mês (em fevereiro, o último dia do mês). Nos outros dias responde sem chamar o Serpro e sem custo.
--     Cada disparo consulta até 20 clientes; quem já foi tentado no dia é pulado, então os 6 horários cobrem a carteira sem cobrar duas vezes.
--   · Aviso no sino com o tipo que já existe (serpro_dctfweb): não precisa mexer na lista de tipos.
-- O comando é copiado do job da Situação Fiscal (mesma chave anon pública e tempo limite de 120 s), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-dctfweb estar implantada.
alter table public.serpro_config add column auto_rotina_dctfweb boolean not null default true;
comment on column public.serpro_config.auto_rotina_dctfweb is 'Rotina mensal da DCTFWeb e MIT (serpro-dctfweb, action rotina_dctfweb): no dia 30, consulta só os clientes do Presumido e do Real marcados como "movimento novo" (recibo do mês anterior + MIT do ano). Custa 2 consultas por cliente consultado. Padrão: ligado.';

do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-sitfis-bimestral-1900-1955';
  if cmd is null then raise exception 'job serpro-sitfis-bimestral-1900-1955 não encontrado'; end if;
  cmd := replace(replace(cmd, 'serpro-sitfis', 'serpro-dctfweb'), 'rotina_sitfis', 'rotina_dctfweb');
  if position('serpro-dctfweb' in cmd) = 0 or position('rotina_dctfweb' in cmd) = 0 then raise exception 'comando do cron não foi adaptado: %', cmd; end if;
  perform cron.schedule('serpro-dctfweb-mensal-2000-2025', '0,5,10,15,20,25 23 * * *', cmd);
end $$;
