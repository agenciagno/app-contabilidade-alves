import { supabase } from '@/integrations/supabase/client';

type NotifRow = {
  user_id: string;
  company_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  action_url?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

async function insertNotifications(rows: NotifRow[]) {
  if (!rows.length) return;
  const { error } = await (supabase as any).from('notifications').insert(rows);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[fiscal-notifications] insert failed:', error.message);
  }
}

/**
 * Notifies all admins (and super admins) of the same company that a fiscal task was completed.
 * Excludes the profile who performed the action.
 */
export async function notifyTaskCompleted(params: {
  taskId: string;
  taskTitle: string;
  contactName: string;
  completedByProfileId: string | null;
  completedByName: string;
  companyId: string | null;
}) {
  const { taskId, taskTitle, contactName, completedByProfileId, completedByName, companyId } = params;
  if (!companyId) return;

  // Find admins of the company
  const { data: admins, error } = await (supabase as any)
    .from('profiles')
    .select('id, user_id, role, is_super_admin')
    .eq('company_id', companyId);
  if (error || !admins) return;

  const recipients = (admins as any[]).filter(
    (p) =>
      p.user_id &&
      p.id !== completedByProfileId &&
      (p.role === 'admin' || p.is_super_admin === true),
  );

  const rows: NotifRow[] = recipients.map((p) => ({
    user_id: p.user_id,
    company_id: companyId,
    type: 'task_completed',
    title: 'Tarefa concluída',
    body: `${taskTitle} — ${contactName} foi concluída por ${completedByName}`,
    action_url: '/fiscal/tarefas',
    reference_type: 'fiscal_task',
    reference_id: taskId,
  }));
  await insertNotifications(rows);
}

/**
 * Notifies the new responsible collaborator that a fiscal task was assigned to them.
 */
export async function notifyTaskAssigned(params: {
  taskId: string;
  taskTitle: string;
  contactName: string;
  newResponsibleProfileId: string;
  companyId: string | null;
  actorUserId?: string | null;
}) {
  const { taskId, taskTitle, contactName, newResponsibleProfileId, companyId, actorUserId } = params;
  if (!companyId || !newResponsibleProfileId) return;

  const { data: profile, error } = await (supabase as any)
    .from('profiles')
    .select('user_id')
    .eq('id', newResponsibleProfileId)
    .maybeSingle();
  if (error || !profile?.user_id) return;
  if (actorUserId && profile.user_id === actorUserId) return;

  await insertNotifications([
    {
      user_id: profile.user_id,
      company_id: companyId,
      type: 'task_assigned',
      title: 'Nova tarefa atribuída',
      body: `${taskTitle} — ${contactName} foi atribuída a você`,
      action_url: '/fiscal/tarefas',
      reference_type: 'fiscal_task',
      reference_id: taskId,
    },
  ]);
}

/**
 * After a monthly calendar launch, notifies each collaborator about the count of tasks assigned.
 */
export async function notifyCalendarLaunched(params: {
  companyId: string | null;
  year: number;
  month: number;
  taskIds: string[];
}) {
  const { companyId, year, month, taskIds } = params;
  if (!companyId || !taskIds.length) return;

  const { data: rows } = await (supabase as any)
    .from('fiscal_tasks')
    .select('id, responsible_id')
    .in('id', taskIds);
  if (!rows || rows.length === 0) return;

  const counts = new Map<string, number>();
  (rows as any[]).forEach((r) => {
    if (!r.responsible_id) return;
    counts.set(r.responsible_id, (counts.get(r.responsible_id) ?? 0) + 1);
  });
  if (counts.size === 0) return;

  const profileIds = Array.from(counts.keys());
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, user_id')
    .in('id', profileIds);
  if (!profiles) return;

  const label = `${String(month).padStart(2, '0')}/${year}`;
  const notifs: NotifRow[] = (profiles as any[])
    .filter((p) => p.user_id)
    .map((p) => {
      const n = counts.get(p.id) ?? 0;
      return {
        user_id: p.user_id,
        company_id: companyId,
        type: 'calendar_generated',
        title: 'Calendário fiscal lançado',
        body: `Você recebeu ${n} nova${n === 1 ? '' : 's'} tarefa${n === 1 ? '' : 's'} para ${label}`,
        action_url: '/fiscal/tarefas',
        reference_type: 'fiscal_calendar',
        reference_id: null,
      };
    });

  await insertNotifications(notifs);
}
