-- Corrige a rotina diária de sincronização de boletos (daily-boleto-sync):
--
-- 1. O pg_sleep(2) entre lotes não escalonava nada de verdade: net.http_post só fica visível
--    pro worker do pg_net depois que a transação inteira comita, então os 14 lotes de 15
--    contatos disparavam todos juntos mesmo assim (confirmado pelos logs do edge function,
--    todos com boot no mesmo milissegundo). Removido — só desperdiçava ~26s de execução.
-- 2. O timeout do net.http_post (default 5000ms) é curto demais pra um lote de 15 contatos,
--    cada um com 1+ chamada ao Sicoob (mTLS): 13 dos 14 lotes do dia 15/09 estouraram esse
--    timeout (net._http_response com timed_out=true), mesmo o edge function tendo terminado
--    e devolvido 200 em todos os casos. Subido pra 30000ms — a concorrência interna nova do
--    find_orphans (sicoob-boletos/index.ts, FIND_ORPHANS_CONCURRENCY=5) já deixa cada lote
--    bem mais rápido, então 30s é folga, não o normal esperado.
create or replace function public.run_daily_boleto_sync()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company_id uuid := '5cd08fcd-c095-4f08-b3a8-c02b9bf1034e';
  v_ids uuid[];
  v_total int;
  v_chunk_size int := 15;
  v_start int;
begin
  select array_agg(id) into v_ids
  from contacts
  where company_id = v_company_id
    and boleto_active = true
    and is_active = true;

  v_total := coalesce(array_length(v_ids, 1), 0);
  v_start := 1;

  while v_start <= v_total loop
    perform net.http_post(
      url := 'https://bapydjfdfiozbmsbrnfb.supabase.co/functions/v1/sicoob-boletos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcHlkamZkZmlvemJtc2JybmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM4MzksImV4cCI6MjA5MzIxOTgzOX0.h1b7LuAF5qv2QyGd57up9YmZGHrEKsTuiLKmPWzjBaw'
      ),
      body := jsonb_build_object(
        'action', 'find_orphans',
        'contact_ids', to_jsonb(v_ids[v_start : least(v_start + v_chunk_size - 1, v_total)])
      ),
      timeout_milliseconds := 30000
    );
    v_start := v_start + v_chunk_size;
  end loop;
end;
$function$;
