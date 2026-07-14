import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Task = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  responsible_id: string | null;
  company_id: string;
  contact_id: string;
};

const TARGET_COMPANY = '5cd08fcd-c095-4f08-b3a8-c02b9bf1034e';
const DONE_STATUSES = new Set(['concluido', 'concluida', 'concluído', 'cancelado', 'cancelada']);

function todayISO(): string {
  const d = new Date();
  // use UTC date (server runs UTC); compare with due_date (date type)
  return d.toISOString().slice(0, 10);
}

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00Z').getTime();
  const b = new Date(toISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const companyId =
      (req.headers.get('x-company-id') as string | null) ||
      (await req.json().catch(() => ({})))?.company_id ||
      TARGET_COMPANY;

    const today = todayISO();

    // Fetch open fiscal tasks for company
    const { data: tasks, error: tErr } = await supabase
      .from('fiscal_tasks')
      .select('id, title, due_date, status, responsible_id, company_id, contact_id')
      .eq('company_id', companyId);

    if (tErr) throw tErr;

    const openTasks = (tasks ?? []).filter(
      (t: Task) => t.responsible_id && !DONE_STATUSES.has((t.status || '').toLowerCase()),
    ) as Task[];

    if (openTasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, created: 0, checked: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map responsible_id (profile.id) -> user_id
    const responsibleIds = Array.from(new Set(openTasks.map((t) => t.responsible_id!).filter(Boolean)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id')
      .in('id', responsibleIds);
    const profileToUser = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.user_id) profileToUser.set(p.id, p.user_id);
    });

    // Contact names
    const contactIds = Array.from(new Set(openTasks.map((t) => t.contact_id).filter(Boolean)));
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .in('id', contactIds);
    const contactNames = new Map<string, string>();
    (contacts ?? []).forEach((c: any) => contactNames.set(c.id, c.name));

    // Determine candidate notifications
    type Cand = {
      task: Task;
      type: 'prazo_5d' | 'prazo_3d' | 'prazo_hoje' | 'prazo_atraso';
      title: string;
    };
    const candidates: Cand[] = [];

    for (const t of openTasks) {
      const days = diffDays(today, t.due_date);
      if (days === 5) candidates.push({ task: t, type: 'prazo_5d', title: 'Tarefa vence em 5 dias' });
      else if (days === 3) candidates.push({ task: t, type: 'prazo_3d', title: 'Tarefa vence em 3 dias' });
      else if (days === 0) candidates.push({ task: t, type: 'prazo_hoje', title: 'Tarefa vence hoje' });
      else if (days < 0) candidates.push({ task: t, type: 'prazo_atraso', title: 'Tarefa em atraso' });
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ ok: true, created: 0, checked: openTasks.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dedup: check existing notifications for these tasks/types
    const taskIds = Array.from(new Set(candidates.map((c) => c.task.id)));
    const types = ['prazo_5d', 'prazo_3d', 'prazo_hoje', 'prazo_atraso'];

    const { data: existing } = await supabase
      .from('notifications')
      .select('type, reference_id, created_at')
      .eq('company_id', companyId)
      .eq('reference_type', 'fiscal_task')
      .in('reference_id', taskIds)
      .in('type', types);

    // Build dedup set:
    //  - prazo_5d/3d/hoje: unique per (task,type) forever
    //  - prazo_atraso: unique per (task,type,day)
    const seenOnce = new Set<string>(); // key: `${type}:${refId}`
    const seenToday = new Set<string>(); // key: `prazo_atraso:${refId}:${YYYY-MM-DD}`
    (existing ?? []).forEach((n: any) => {
      if (n.type === 'prazo_atraso') {
        const day = (n.created_at as string).slice(0, 10);
        seenToday.add(`prazo_atraso:${n.reference_id}:${day}`);
      } else {
        seenOnce.add(`${n.type}:${n.reference_id}`);
      }
    });

    const rows: any[] = [];
    for (const c of candidates) {
      const userId = profileToUser.get(c.task.responsible_id!);
      if (!userId) continue;

      if (c.type === 'prazo_atraso') {
        const key = `prazo_atraso:${c.task.id}:${today}`;
        if (seenToday.has(key)) continue;
        seenToday.add(key);
      } else {
        const key = `${c.type}:${c.task.id}`;
        if (seenOnce.has(key)) continue;
        seenOnce.add(key);
      }

      const contactName = contactNames.get(c.task.contact_id) ?? '—';
      const [y, m, d] = c.task.due_date.split('-');
      const dueBR = `${d}/${m}/${y}`;

      rows.push({
        user_id: userId,
        company_id: companyId,
        task_id: c.task.id,
        type: c.type,
        title: c.type === 'prazo_atraso' ? 'Tarefa venceu — Em atraso' : c.title,
        body: `${c.task.title} — ${contactName} (vence ${dueBR})`,
        action_url: '/fiscal/tarefas',
        reference_type: 'fiscal_task',
        reference_id: c.task.id,
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await supabase
        .from('notifications')
        .insert(rows, { count: 'exact' });
      if (insErr) throw insErr;
      inserted = count ?? rows.length;
    }

    return new Response(
      JSON.stringify({ ok: true, created: inserted, checked: openTasks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
