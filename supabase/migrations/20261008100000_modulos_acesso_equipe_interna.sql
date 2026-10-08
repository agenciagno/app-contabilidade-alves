-- Módulos de Acesso da equipe interna reorganizados (08/10/2026).
-- (Suporte já está em todos os perfis internos; o padrão novo vale pelo formulário de usuário.)
-- Só ACRESCENTA chaves — nada é removido nem renomeado, então ninguém perde acesso.

-- 1) Situação Fiscal e Procurações ganharam chave própria (antes seguiam a do
--    Dashboard Federal). Quem já tinha o Dashboard Federal continua vendo os dois.
update public.profiles p
   set allowed_modules = (
     select array_agg(distinct k)
       from unnest(p.allowed_modules || array['monitoramento_situacao_fiscal','monitoramento_procuracoes']) k
   )
 where 'dashboard_federal' = any(p.allowed_modules)
   and not (p.allowed_modules @> array['monitoramento_situacao_fiscal','monitoramento_procuracoes']);

-- 2) O plano da CA precisa listar as chaves novas, senão o admin deixa de ver os itens.
--    As chaves tech_* ficam de fora de propósito: com o grupo Tech sem submódulo no
--    plano, todos os itens valem (plano "grosso" interno); listar um só desligaria os outros.
update public.companies c
   set plan_modules = (
     select array_agg(distinct k)
       from unnest(c.plan_modules || array['monitoramento_situacao_fiscal','monitoramento_procuracoes']) k
   )
 where c.is_internal
   and not (c.plan_modules @> array['monitoramento_situacao_fiscal','monitoramento_procuracoes']);
