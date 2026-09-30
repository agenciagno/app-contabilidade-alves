-- Serpro — agendamento das duas rotinas em SQL (sem HTTP, sem chave): 08:00 e 08:05 horário de Brasília (11:00 e 11:05 UTC), depois dos sensores das 07:30–07:40.
-- serpro_criar_tarefas_receita: cria tarefa fiscal a partir do que a Receita mandou (ver migration anterior). Roda todo dia.
-- serpro_avisar_vencimento_das: só age no dia do vencimento do DAS (dia 20, ou a segunda seguinte); nos outros dias devolve 0 sem fazer nada.
-- APLICAR SÓ DEPOIS de a migration 20261001240000 estar aplicada.
select cron.schedule('serpro-tarefas-receita-0800', '0 11 * * *', $$select public.serpro_criar_tarefas_receita();$$);
select cron.schedule('serpro-aviso-das-0805', '5 11 * * *', $$select public.serpro_avisar_vencimento_das();$$);
