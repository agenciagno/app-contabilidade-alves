-- Duas sincronizações extras de boletos pagos com o Sicoob, além da das 7h (daily-boleto-sync).
-- pg_cron roda em UTC; horário de Brasília = UTC-3 (sem horário de verão).
--   11h BRT = 14:00 UTC
--   15h BRT = 18:00 UTC
-- Reaproveita run_daily_boleto_sync(), que é idempotente (find_orphans só atualiza o que mudou).
select cron.schedule('boleto-sync-11h', '0 14 * * *', 'select public.run_daily_boleto_sync();');
select cron.schedule('boleto-sync-15h', '0 18 * * *', 'select public.run_daily_boleto_sync();');
