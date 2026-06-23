import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';


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
  contacts?: { tax_regime: string | null; name?: string | null } | null;
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

export function useFiscalTasksOfMonth(year: number, month: number) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  const { isColaborador } = useUserRole();
  const { data: profileId } = useCurrentProfileId();

  return useQuery<FiscalTaskRow[]>({
    queryKey: ['fiscal-dashboard', 'tasks', companyId, year, month, isColaborador, profileId],
    enabled: !!companyId && (!isColaborador || !!profileId),
    queryFn: async () => {
      let q = (supabase as any)
        .from('fiscal_tasks')
        .select('id, status, title, due_date, fiscal_due_date, completed_at, created_at, responsible_id, contact_id, contacts(tax_regime, name), fiscal_obligations_catalog(name)')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month);
      if (isColaborador && profileId) {
        q = q.eq('responsible_id', profileId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FiscalTaskRow[];
    },
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
          'id, title, status, fiscal_due_date, responsible_id, contacts(name, tax_regime), responsible:profiles!fiscal_tasks_responsible_id_fkey(full_name), fiscal_obligations_catalog(name)'
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

// Kept for backward compat in case other modules import it
export { fetchValidFiscalContactIds } from '@/lib/fiscal-filters';
