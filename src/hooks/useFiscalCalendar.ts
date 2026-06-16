import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notifyCalendarLaunched } from '@/lib/fiscal-notifications';


export interface FiscalObligationCatalog {
  id: string;
  name: string;
  code: string | null;
  applies_to: string[] | null;
  is_custom?: boolean | null;
  description?: string | null;
  due_rule?: string | null;
  holiday_adjustment?: string | null;
}

export interface FiscalCalendarEffectiveRow {
  id: string;
  obligation_id: string;
  company_id: string;
  year: number;
  month: number;
  adjusted_due_date: string;
  internal_delivery_date: string;
  adjusted_due_date_override: string | null;
  internal_delivery_date_override: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  overridden_by: string | null;
  fiscal_obligations_catalog: FiscalObligationCatalog | null;
}

export function useFiscalCalendar(year: number, month: number, enabled: boolean = true) {
  return useQuery<FiscalCalendarEffectiveRow[]>({
    queryKey: ['fiscal-calendar', year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_calendar_effective')
        .select('*, fiscal_obligations_catalog!inner(id, name, code, applies_to, is_custom, description, due_rule, holiday_adjustment)')
        .eq('year', year)
        .eq('month', month)
        .order('adjusted_due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FiscalCalendarEffectiveRow[];
    },
    enabled,
  });
}

export function useCalculateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-fiscal-calendar`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ year, month }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`calculate-fiscal-calendar falhou: ${res.status} ${text}`);
      }
      return { year, month };
    },
    onSuccess: ({ year, month }) => {
      toast.success('Calendário calculado. Revise as datas e confirme.');
      qc.invalidateQueries({ queryKey: ['fiscal-calendar', year, month] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao calcular calendário'),
  });
}

export interface LaunchMeta {
  launched_at: string;
  launched_by: string;
  task_ids: string[];
}

const launchKey = (companyId: string, y: number, m: number) =>
  `fiscal-calendar-launch:${companyId}:${y}-${m}`;

export function loadLaunchMeta(companyId: string, year: number, month: number): LaunchMeta | null {
  try {
    const raw = localStorage.getItem(launchKey(companyId, year, month));
    if (!raw) return null;
    return JSON.parse(raw) as LaunchMeta;
  } catch {
    return null;
  }
}

export function saveLaunchMeta(companyId: string, year: number, month: number, meta: LaunchMeta) {
  try {
    localStorage.setItem(launchKey(companyId, year, month), JSON.stringify(meta));
  } catch {}
}

export function clearLaunchMeta(companyId: string, year: number, month: number) {
  try {
    localStorage.removeItem(launchKey(companyId, year, month));
  } catch {}
}

export function useConfirmMonthlyTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      year,
      month,
      companyId,
      launchedBy,
    }: {
      year: number;
      month: number;
      companyId?: string | null;
      launchedBy?: string;
    }) => {
      // Capture timestamp slightly before RPC to account for clock skew
      const beforeTs = new Date(Date.now() - 2000).toISOString();
      const { data, error } = await (supabase as any).rpc('generate_monthly_fiscal_tasks', {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      const tasksCreated: number =
        (data && typeof data === 'object' && 'tasks_created' in data
          ? (data as any).tasks_created
          : Array.isArray(data) && data[0]?.tasks_created) ?? 0;

      // Try to capture IDs of just-created tasks for rollback support
      let taskIds: string[] = [];
      if (companyId && tasksCreated > 0) {
        const { data: created } = await supabase
          .from('fiscal_tasks')
          .select('id')
          .eq('company_id', companyId)
          .gte('created_at', beforeTs);
        taskIds = (created ?? []).map((r: any) => r.id as string);
      }

      if (companyId) {
        saveLaunchMeta(companyId, year, month, {
          launched_at: new Date().toISOString(),
          launched_by: launchedBy ?? 'Usuário',
          task_ids: taskIds,
        });
        // Fire-and-forget notifications to each responsible
        notifyCalendarLaunched({ companyId, year, month, taskIds }).catch(() => {});
      }

      return { tasksCreated, year, month };
    },

    onSuccess: ({ tasksCreated, year, month }) => {
      const label = `${String(month).padStart(2, '0')}/${year}`;
      if (tasksCreated === 0) {
        toast.info(`ℹ️ Todas as tarefas deste mês já foram lançadas`);
      } else {
        toast.success(`✅ ${tasksCreated} tarefas lançadas para ${label}`);
      }
      qc.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao lançar tarefas'),
  });
}

export function useRollbackMonthlyTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      year,
      month,
      companyId,
    }: {
      year: number;
      month: number;
      companyId: string;
    }) => {
      const meta = loadLaunchMeta(companyId, year, month);
      const ids = meta?.task_ids ?? [];
      if (ids.length === 0) {
        return { removed: 0, preserved: 0, year, month };
      }
      const { data: rows, error: selErr } = await supabase
        .from('fiscal_tasks')
        .select('id, status, created_at, updated_at')
        .in('id', ids);
      if (selErr) throw selErr;

      const deletable: string[] = [];
      let preserved = 0;
      (rows ?? []).forEach((r: any) => {
        const untouched =
          r.status === 'a_fazer' &&
          new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() < 2000;
        if (untouched) deletable.push(r.id);
        else preserved += 1;
      });

      if (deletable.length > 0) {
        const { error: delErr } = await supabase.from('fiscal_tasks').delete().in('id', deletable);
        if (delErr) throw delErr;
      }

      clearLaunchMeta(companyId, year, month);
      return { removed: deletable.length, preserved, year, month };
    },
    onSuccess: ({ removed, preserved, year, month }) => {
      const label = `${String(month).padStart(2, '0')}/${year}`;
      toast.success(`Lançamento de ${label} desfeito — ${removed} removidas, ${preserved} preservadas.`);
      qc.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao desfazer lançamento'),
  });
}

export function useSaveOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      adjusted_due_date_override: string | null;
      internal_delivery_date_override: string | null;
      override_reason: string | null;
      overridden_by: string | null;
    }) => {
      const { id, ...rest } = params;
      const hasAny =
        rest.adjusted_due_date_override !== null || rest.internal_delivery_date_override !== null;
      const { error } = await (supabase as any)
        .from('fiscal_calendar')
        .update({
          ...rest,
          overridden_at: hasAny ? new Date().toISOString() : null,
          overridden_by: hasAny ? rest.overridden_by : null,
          override_reason: hasAny ? rest.override_reason : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ajuste salvo');
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao salvar ajuste'),
  });
}

export function useRemoveOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('fiscal_calendar')
        .update({
          adjusted_due_date_override: null,
          internal_delivery_date_override: null,
          override_reason: null,
          overridden_at: null,
          overridden_by: null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ajuste removido');
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover ajuste'),
  });
}
