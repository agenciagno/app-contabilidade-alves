-- Notificação em tempo real de boleto pago (webhook Sicoob) — novo type no CHECK existente de
-- notifications. Inserida pela function sicoob-webhook-boletos assim que o pagamento é confirmado,
-- só para admins/super_admin e colaboradores com o módulo 'financeiro' liberado (mesmo critério
-- de acesso usado pelo ModuleGuard da rota /boletos: isSuperAdmin || isAdmin || 'financeiro' em
-- allowed_modules).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago'
  ]));
