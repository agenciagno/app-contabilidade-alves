-- Serpro Pagamentos: lote do dia 30 (aprovado por Gabriel, 01/10/2026), em duas rotinas separadas.
-- Disparam todo dia: Simples às 07:10 e 07:15; Presumido e Real às 07:20 e 07:25 (horário de Brasília = 10:10, 10:15, 10:20 e 10:25 UTC).
-- A função serpro-pagamentos (actions rotina_lote_simples e rotina_lote_presumido_real) decide: interruptor de Tech (PADRÃO DESLIGADO) e data
-- (dia 30; em fevereiro, o último dia). Desligado ou fora do dia, responde sem chamar o Serpro e sem custo. Cada disparo faz até 60 clientes.
-- O comando é copiado do job da rotina do PGDAS-D (mesma chave anon pública e mesmo tempo limite de 120 s), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-pagamentos estar implantada.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-pgdas-rotina-0800';
  if cmd is null then raise exception 'job serpro-pgdas-rotina-0800 não encontrado'; end if;
  cmd := replace(cmd, 'serpro-pgdasd', 'serpro-pagamentos');
  perform cron.schedule('serpro-pag-lote-simples-0710-0715', '10,15 10 * * *', replace(cmd, 'rotina_pgdas', 'rotina_lote_simples'));
  perform cron.schedule('serpro-pag-lote-presumido-real-0720-0725', '20,25 10 * * *', replace(cmd, 'rotina_pgdas', 'rotina_lote_presumido_real'));
end $$;
