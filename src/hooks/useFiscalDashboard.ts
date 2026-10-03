import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchAllPages } from '@/lib/fetch-all';


export interface FiscalTaskRow {
  id: string;
  status: string;
  title?: string | null;
  due_date: string | null;
  fiscal_due_date: string | null;
  completed_at: string | null;
  created_at: string | null;
  responsible_id: string | null;
  contact_id: string | null;
  department: string | null;
  contacts?: { tax_regime: string | null; name?: string | null; document?: string | null } | null;
  fiscal_obligations_catalog?: { name: string | null } | null;
}

export interface CollaboratorRow {
  id: string;
  full_name: string | null;
}

export interface UpcomingTaskRow {
  id: string;
  title: string | null;
  status: string;
  due_date: string | null;
  fiscal_due_date: string | null;
  contacts: { name: string | null } | null;
  responsible: { full_name: string | null } | null;
  fiscal_obligations_catalog: { name: string | null } | null;
}

export interface Task48hRow {
  id: string;
  title: string | null;
  status: string;
  fiscal_due_date: string | null;
  responsible_id: string | null;
  department: string | null;
  contacts: { name: string | null; tax_regime: string | null } | null;
  responsible: { full_name: string | null } | null;
  fiscal_obligations_catalog: { name: string | null } | null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};


function useCurrentProfileId() {
  const { user } = useAuth();
  const { isColaborador } = useUserRole();
  return useQuery({
    queryKey: ['current-profile-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
    enabled: !!user?.id && isColaborador,
  });
}

const TASK_COLUMNS =
  'id, status, title, due_date, fiscal_due_date, completed_at, created_at, responsible_id, contact_id, department, contacts(tax_regime, name, document), fiscal_obligations_catalog(name)';

/**
 * Tarefas que VENCEM no mês (fiscal_due_date), a mesma base do Calendário Fiscal e do calendário deste dashboard.
 * Antes filtrava por competência (o mês anterior ao vencimento): "Outubro" mostrava um mês vazio, "Setembro" mostrava as tarefas de
 * outubro e o calendário não marcava nenhuma. Pagina (fetchAllPages): o PostgREST corta em 1.000 linhas e o mês já passa disso.
 */
export function useFiscalTasksOfMonth(year: number, month: number) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();

  return useQuery<FiscalTaskRow[]>({
    queryKey: ['fiscal-dashboard', 'tasks', companyId, year, month, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () => {
      const mm = String(month).padStart(2, '0');
      const last = String(new Date(year, month, 0).getDate()).padStart(2, '0');
      return fetchAllPages<FiscalTaskRow>(() => {
        let q = (supabase as any)
          .from('fiscal_tasks')
          .select(TASK_COLUMNS)
          .eq('company_id', companyId)
          .gte('fiscal_due_date', `${year}-${mm}-01`)
          .lte('fiscal_due_date', `${year}-${mm}-${last}`)
          .order('id', { ascending: true });
        if (isColaborador && profileId) q = q.eq('responsible_id', profileId);
        return q;
      });
    },
  });
}

/** Tudo que já venceu e não foi concluído, de qualquer mês (o "vencido" de verdade, não só o do mês aberto). */
export function useFiscalOverdueTasks() {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();
  const hoje = today();

  return useQuery<FiscalTaskRow[]>({
    queryKey: ['fiscal-dashboard', 'overdue', companyId, hoje, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () =>
      fetchAllPages<FiscalTaskRow>(() => {
        let q = (supabase as any)
          .from('fiscal_tasks')
          .select(TASK_COLUMNS)
          .eq('company_id', companyId)
          .neq('status', 'concluido')
          .lt('due_date', hoje)
          .order('id', { ascending: true });
        if (isColaborador && profileId) q = q.eq('responsible_id', profileId);
        return q;
      }),
  });
}

/** Não concluídas que vencem de hoje até daqui a `days` dias (qualquer mês). */
export function useFiscalDueSoon(days = 7) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();
  const de = today();
  const ate = inDays(days);

  return useQuery<FiscalTaskRow[]>({
    queryKey: ['fiscal-dashboard', 'due-soon', companyId, de, days, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () =>
      fetchAllPages<FiscalTaskRow>(() => {
        let q = (supabase as any)
          .from('fiscal_tasks')
          .select(TASK_COLUMNS)
          .eq('company_id', companyId)
          .neq('status', 'concluido')
          .gte('due_date', de)
          .lte('due_date', ate)
          .order('id', { ascending: true });
        if (isColaborador && profileId) q = q.eq('responsible_id', profileId);
        return q;
      }),
  });
}

export function useFiscalTasksPrevMonth(year: number, month: number) {
  const prev = month === 1
    ? { y: year - 1, m: 12 }
    : { y: year, m: month - 1 };
  return useFiscalTasksOfMonth(prev.y, prev.m);
}

export function useFiscalUpcomingTasksRange(startDate: string, endDate: string) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();

  return useQuery<Task48hRow[]>({
    queryKey: ['fiscal-dashboard', 'tasks-upcoming', companyId, startDate, endDate, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () => {
      let q = (supabase as any)
        .from('fiscal_tasks')
        .select(
          'id, title, status, fiscal_due_date, responsible_id, department, contacts(name, tax_regime), responsible:profiles!fiscal_tasks_responsible_id_fkey(full_name), fiscal_obligations_catalog(name)'
        )
        .eq('company_id', companyId)
        .neq('status', 'concluido')
        .gte('fiscal_due_date', startDate)
        .lte('fiscal_due_date', endDate)
        .order('fiscal_due_date', { ascending: true })
        .limit(100);
      if (isColaborador && profileId) {
        q = q.eq('responsible_id', profileId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task48hRow[];
    },
  });
}

// Backward-compat alias (default 48h window)
export function useFiscalTasks48h() {
  return useFiscalUpcomingTasksRange(today(), inDays(2));
}

export function useFiscalCollaborators() {
  const { company } = useCompany();
  const companyId = (company as any)?.id;

  return useQuery<CollaboratorRow[]>({
    queryKey: ['fiscal-dashboard', 'collaborators-with-clients', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: contactRows, error: e1 } = await supabase
        .from('contacts')
        .select('responsible_id, tax_regime')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .not('responsible_id', 'is', null)
        .not('tax_regime', 'is', null);
      if (e1) throw e1;
      const ids = Array.from(new Set(
        (contactRows ?? [])
          .filter((r: any) => {
            const v = (r.tax_regime ?? '').toString().trim();
            return v !== '' && v.toLowerCase() !== 'nenhum';
          })
          .map((r: any) => r.responsible_id)
          .filter(Boolean)
      ));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('status_active', true)
        .in('id', ids);
      if (error) throw error;
      return (data ?? []) as CollaboratorRow[];
    },
  });
}

export function useUpcomingFiscalTasks() {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();

  return useQuery<UpcomingTaskRow[]>({
    queryKey: ['fiscal-dashboard', 'upcoming', companyId, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () => {
      let q = (supabase as any)
        .from('fiscal_tasks')
        .select(
          'id, title, status, due_date, fiscal_due_date, contacts(name), responsible:profiles!fiscal_tasks_responsible_id_fkey(full_name), fiscal_obligations_catalog(name)'
        )
        .eq('company_id', companyId)
        .neq('status', 'concluido')
        .gte('due_date', today())
        .lte('due_date', inDays(7))
        .order('due_date', { ascending: true })
        .limit(20);
      if (isColaborador && profileId) {
        q = q.eq('responsible_id', profileId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UpcomingTaskRow[];
    },
  });
}

// Conclui várias tarefas de uma vez (Calendário Fiscal > Sheet do dia), numa única
// chamada — mesmo padrão do `deleteTasks` em useFiscalTasks.ts.
export function useCompleteFiscalTasks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any)
        .from('fiscal_tasks')
        .update({ status: 'concluido', completed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-dashboard'] });
      toast({
        title: ids.length > 1 ? `${ids.length} tarefas concluídas com sucesso` : 'Tarefa concluída com sucesso',
      });
    },
    onError: () => {
      toast({ title: 'Erro ao concluir tarefas', variant: 'destructive' });
    },
  });
}

// Kept for backward compat in case other modules import it
export { fetchValidFiscalContactIds } from '@/lib/fiscal-filters';
