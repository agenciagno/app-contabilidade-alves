-- Serpro — tela de procurações e alerta de vencimento (30/09/2026)
-- Novo type no CHECK de notifications: aviso semanal "procurações vencendo" (inserido pela function serpro-procuracoes, action rotina_vencimentos).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao'
  ]));
