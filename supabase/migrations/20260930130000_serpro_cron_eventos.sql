-- Serpro Caixa Postal: rotina diária de detecção de mensagens novas, 07:30 horário de Brasília (10:30 UTC).
-- Chama a edge function serpro-caixa-postal (action rotina_eventos): 2 chamadas /Monitorar, não cobradas, sem ciência.
-- Mesmo padrão dos outros agendamentos do projeto (chave anon pública no cabeçalho; a função tem trava de 12 h).
-- APLICAR SÓ DEPOIS de a função serpro-caixa-postal estar implantada.
select cron.schedule(
  'serpro-caixa-postal-eventos-0730',
  '30 10 * * *',
  $$
  select net.http_post(
    url := 'https://bapydjfdfiozbmsbrnfb.supabase.co/functions/v1/serpro-caixa-postal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcHlkamZkZmlvemJtc2JybmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM4MzksImV4cCI6MjA5MzIxOTgzOX0.h1b7LuAF5qv2QyGd57up9YmZGHrEKsTuiLKmPWzjBaw'
    ),
    body := jsonb_build_object('action', 'rotina_eventos')
  );
  $$
);
