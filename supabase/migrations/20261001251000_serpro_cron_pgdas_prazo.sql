-- Serpro — agendamento do aviso do prazo do PGDAS-D: 08:10 horário de Brasília (11:10 UTC), junto das outras rotinas em SQL (sem HTTP, sem chave, não chama o Serpro).
-- Só age no dia seguinte ao prazo (dia 20, segunda se cair no fim de semana); nos outros dias devolve 0 sem fazer nada.
-- APLICAR SÓ DEPOIS de a migration 20261001250000 estar aplicada.
select cron.schedule('serpro-aviso-pgdas-0810', '10 11 * * *', $$select public.serpro_avisar_pgdas_prazo();$$);
