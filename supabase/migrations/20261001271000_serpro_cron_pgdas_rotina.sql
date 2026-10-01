-- Serpro PGDAS-D: rotina automática (dia 16 e dia seguinte ao prazo), decidida por Gabriel em 01/10/2026.
-- Dispara todo dia às 07:45, 07:50, 07:55 e 08:00 (horário de Brasília = 10:45, 10:50, 10:55 e 11:00 UTC). A função serpro-pgdasd (action rotina_pgdas)
-- decide pela DATA o que fazer: dia 16 = carteira do Simples; dia seguinte ao prazo = só quem não transmitiu; qualquer outro dia = nada, sem custo.
-- Cada disparo faz até 60 clientes, e quem já foi feito no dia é pulado (os 4 horários cobrem a carteira sem cobrar duas vezes).
-- Termina antes do aviso do prazo (08:10). O pedido espera até 120 s pela resposta, que fica no registro do pg_net (resumo do que foi consultado).
-- O comando é copiado do job da DCTFWeb (mesma chave anon pública do projeto), trocando só a função e a ação.
-- APLICAR SÓ DEPOIS de a função serpro-pgdasd estar implantada.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'serpro-dctfweb-eventos-0740';
  if cmd is null then raise exception 'job serpro-dctfweb-eventos-0740 não encontrado'; end if;
  cmd := replace(replace(cmd, 'serpro-dctfweb', 'serpro-pgdasd'), 'rotina_eventos', 'rotina_pgdas');
  cmd := replace(cmd, 'body := ', 'timeout_milliseconds := 120000, body := ');
  perform cron.schedule('serpro-pgdas-rotina-0745-0755', '45,50,55 10 * * *', cmd);
  perform cron.schedule('serpro-pgdas-rotina-0800', '0 11 * * *', cmd);
end $$;
