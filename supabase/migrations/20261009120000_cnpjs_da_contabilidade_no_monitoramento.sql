-- 09/10/2026 (pedido de Gabriel): os dois CNPJs da Contabilidade (26.764.962/0001-00 e 08.801.596/0001-30) entram no monitoramento como qualquer cliente.
-- Cinco funções tinham a lista `array['26764962000100', '08801596000130']` para excluí-los (avisos do DAS e do PGDAS-D, tarefas da Receita, foto diária e alertas da Gestão 360°).
-- Recria cada uma com a definição que está no banco hoje, trocando só a lista por vazia (`<> all ('{}')` é sempre verdadeiro).
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%26764962000100%' and p.prosrc like '%08801596000130%'
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'array[''26764962000100'', ''08801596000130'']', 'array[]::text[]');
    if position('26764962000100' in def) > 0 then raise exception 'exclusão não removida em %', f.oid::regprocedure; end if;
    execute def;
  end loop;
end $$;
