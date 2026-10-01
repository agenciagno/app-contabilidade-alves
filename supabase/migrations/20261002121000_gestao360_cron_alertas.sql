-- Gestão 360° · Rodada 2: agenda os alertas da equipe. 08:15 de Brasília (11:15 UTC), depois das rotinas das 07:30 às 08:10.
-- APLICAR SÓ DEPOIS de a migration 20261002120000 estar aplicada. Para pausar tudo: desligar os 4 interruptores em Tech > Rotinas, ou cron.unschedule('gestao360-alertas-0815').
select cron.schedule('gestao360-alertas-0815', '15 11 * * *', $$select public.gestao360_alertas_equipe();$$);
