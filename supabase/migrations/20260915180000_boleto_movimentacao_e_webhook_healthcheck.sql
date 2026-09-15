-- 1. Nova origem de baixa: a sincronização em lote via Movimentação (action movimentacao_sync,
--    tipoMovimento=5 Liquidação) não é o webhook nem uma conciliação manual — precisa do próprio
--    valor pra não ficar mascarada como 'webhook_sicoob' nos boletos que ela atualizar.
alter table public.boleto_controls drop constraint boleto_controls_origem_baixa_check;
alter table public.boleto_controls add constraint boleto_controls_origem_baixa_check
  check (origem_baixa = any (array['manual', 'webhook_sicoob', 'conciliacao', 'movimentacao_lote']));

-- 2. Healthcheck diário do webhook de baixa — sem isso, se o Sicoob desativar o webhook sozinho
--    (ex.: depois de falhas repetidas de entrega), a baixa em tempo real para de chegar em
--    silêncio, sem ninguém perceber. Roda 10 min depois do daily-boleto-sync (mesmo horário-base,
--    07h BRT), reativa sozinho se achar o webhook inativo (action webhook_healthcheck).
create or replace function public.run_webhook_healthcheck()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://bapydjfdfiozbmsbrnfb.supabase.co/functions/v1/sicoob-boletos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcHlkamZkZmlvemJtc2JybmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM4MzksImV4cCI6MjA5MzIxOTgzOX0.h1b7LuAF5qv2QyGd57up9YmZGHrEKsTuiLKmPWzjBaw'
    ),
    body := jsonb_build_object('action', 'webhook_healthcheck'),
    timeout_milliseconds := 30000
  );
end;
$function$;

select cron.schedule(
  'daily-webhook-healthcheck',
  '10 10 * * *',
  $$select public.run_webhook_healthcheck();$$
);
