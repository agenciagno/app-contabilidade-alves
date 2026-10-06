-- Agenda o monitor semanal da situação cadastral do CNPJ (função cnpj-situacao), 06/10/2026. Domingo, horário de Brasília = UTC-3.
--   · cnpj-situacao-rotina-dom: todo minuto das 06:00 às 08:59 (09:00 a 11:59 UTC). Cada disparo confere até 3 clientes (limite do cnpj.ws público);
--     227 CNPJs levam cerca de 76 minutos. Sem ninguém pendente, o disparo só lê a fila e sai.
--   · cnpj-situacao-resumo-dom: 09:00 BRT, um aviso aos admins com o fechamento da semana (conferidos, mudanças, quem ficou sem consulta).
-- O comando é copiado do job da Situação Fiscal (mesma chave anon pública e tempo limite de 120 s), trocando só a função e a ação.
-- APLICADO SÓ DEPOIS de a função cnpj-situacao estar implantada e testada.
do $$
declare
  base text;
begin
  select command into base from cron.job where jobname = 'serpro-sitfis-bimestral-1900-1955';
  if base is null then raise exception 'job serpro-sitfis-bimestral-1900-1955 não encontrado'; end if;
  base := replace(base, 'serpro-sitfis', 'cnpj-situacao');
  perform cron.schedule('cnpj-situacao-rotina-dom', '* 9-11 * * 0', replace(base, 'rotina_sitfis', 'rotina'));
  perform cron.schedule('cnpj-situacao-resumo-dom', '0 12 * * 0', replace(base, 'rotina_sitfis', 'resumo'));
end $$;
