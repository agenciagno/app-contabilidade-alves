-- Serpro DCTFWeb: rotina diária do sensor E0301 (movimento na DCTFWeb), 07:40 horário de Brasília (10:40 UTC), 5 min depois dos Pagamentos.
-- Chama a edge function serpro-dctfweb (action rotina_eventos): 2 chamadas /Monitorar, não cobradas.
-- Mesmo padrão dos outros agendamentos do projeto (chave anon pública no cabeçalho; a função tem trava de 12 h).
-- APLICAR SÓ DEPOIS de a função serpro-dctfweb estar implantada.
select cron.schedule(
  'serpro-dctfweb-eventos-0740',
  '40 10 * * *',
  $$
  select net.http_post(
    url := 'https://bapydjfdfiozbmsbrnfb.supabase.co/functions/v1/serpro-dctfweb',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcHlkamZkZmlvemJtc2JybmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM4MzksImV4cCI6MjA5MzIxOTgzOX0.h1b7LuAF5qv2QyGd57up9YmZGHrEKsTuiLKmPWzjBaw'
    ),
    body := jsonb_build_object('action', 'rotina_eventos')
  );
  $$
);
