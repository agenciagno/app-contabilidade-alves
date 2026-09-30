-- Serpro Procurações: aviso semanal de procurações vencendo, segundas 08:00 (11:00 UTC).
-- Chama a edge function serpro-procuracoes (action rotina_vencimentos): não faz nenhuma chamada ao Serpro, só lê o que já foi mapeado.
-- Mesmo padrão dos outros agendamentos (chave anon pública no cabeçalho). APLICAR SÓ DEPOIS de a função serpro-procuracoes estar implantada.
select cron.schedule(
  'serpro-procuracoes-vencimentos-seg-0800',
  '0 11 * * 1',
  $$
  select net.http_post(
    url := 'https://bapydjfdfiozbmsbrnfb.supabase.co/functions/v1/serpro-procuracoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcHlkamZkZmlvemJtc2JybmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM4MzksImV4cCI6MjA5MzIxOTgzOX0.h1b7LuAF5qv2QyGd57up9YmZGHrEKsTuiLKmPWzjBaw'
    ),
    body := jsonb_build_object('action', 'rotina_vencimentos')
  );
  $$
);
