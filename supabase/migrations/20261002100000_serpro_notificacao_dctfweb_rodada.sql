-- Notificações — 02/10/2026: o sino "Mensagens e-CAC" do topo passa a mostrar só os avisos das rotinas DIÁRIAS gratuitas (mensagem nova, pagamento novo,
-- movimento na DCTFWeb, procuração perdida). O aviso das RODADAS da DCTFWeb/MIT (mensal e de atualização) usava o mesmo tipo do aviso diário (serpro_dctfweb)
-- e cairia no sino errado: ganha tipo próprio, que fica nas Notificações Federais (prefixo serpro_).
-- A lista de tipos permitidos é a que está no banco hoje (inclui os gestao360_*), mais o tipo novo.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed', 'coverage_started', 'coverage_ended', 'popup', 'boleto_pago',
    'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento', 'serpro_pgdas_prazo',
    'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta'
  ]));

-- Avisos de rodada que já existem (todos começam com "DCTFWeb e MIT"; o aviso diário diz "clientes com movimento na DCTFWeb").
update public.notifications set type = 'serpro_dctfweb_rodada' where type = 'serpro_dctfweb' and title like 'DCTFWeb e MIT%';
