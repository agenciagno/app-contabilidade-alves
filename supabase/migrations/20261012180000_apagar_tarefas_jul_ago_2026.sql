-- 12/10/2026 (pedido de Gabriel): apagar todas as tarefas com vencimento (due_date, o mesmo filtro de mês do Kanban) em julho e agosto de 2026.
-- Ficam as de setembro em diante. Antes de apagar, cópia completa das tarefas e das notificações ligadas a elas (cascade) em tabelas de backup
-- sem acesso pela API (RLS ligado, sem política). Restaurar: insert into fiscal_tasks select * from fiscal_tasks_bak_jul_ago_2026; e o mesmo para notifications.
-- Apagar as tabelas de backup quando Gabriel confirmar que não precisa mais.
create table public.fiscal_tasks_bak_jul_ago_2026 as
  select * from public.fiscal_tasks where due_date between date '2026-07-01' and date '2026-08-31';
create table public.notifications_bak_jul_ago_2026 as
  select n.* from public.notifications n where n.task_id in (select id from public.fiscal_tasks_bak_jul_ago_2026);

alter table public.fiscal_tasks_bak_jul_ago_2026 enable row level security;
alter table public.notifications_bak_jul_ago_2026 enable row level security;
revoke all on public.fiscal_tasks_bak_jul_ago_2026 from anon, authenticated;
revoke all on public.notifications_bak_jul_ago_2026 from anon, authenticated;
comment on table public.fiscal_tasks_bak_jul_ago_2026 is 'Backup das tarefas de jul/ago 2026 apagadas em 12/10/2026. Temporário.';
comment on table public.notifications_bak_jul_ago_2026 is 'Backup das notificações ligadas às tarefas de jul/ago 2026 apagadas em 12/10/2026. Temporário.';

do $$
declare n_bak integer; n_del integer;
begin
  select count(*) into n_bak from public.fiscal_tasks_bak_jul_ago_2026;
  delete from public.fiscal_tasks t using public.fiscal_tasks_bak_jul_ago_2026 b where t.id = b.id;
  get diagnostics n_del = row_count;
  if n_del <> n_bak then
    raise exception 'apagou % tarefas, esperava %', n_del, n_bak;
  end if;
  raise notice 'tarefas de jul/ago 2026 apagadas: %', n_del;
end $$;
