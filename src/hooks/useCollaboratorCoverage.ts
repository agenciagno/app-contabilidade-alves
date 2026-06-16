import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface Collaborator {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  status_active: boolean;
}

export interface CoverageRow {
  id: string;
  company_id: string;
  absent_profile_id: string;
  covering_profile_id: string;
  start_date: string;
  end_date: string | null;
  reason: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

async function fetchProfileIdsWithActiveClients(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('responsible_id, tax_regime')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .not('responsible_id', 'is', null)
    .not('tax_regime', 'is', null);
  if (error) throw error;
  return Array.from(new Set(
    (data ?? [])
      .filter((r: any) => {
        const v = (r.tax_regime ?? '').toString().trim();
        return v !== '' && v.toLowerCase() !== 'nenhum';
      })
      .map((r: any) => r.responsible_id)
      .filter(Boolean)
  ));
}

export function useClientCountByProfile() {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<Record<string, number>>({
    queryKey: ['client-count-by-profile', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('responsible_id, tax_regime')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('responsible_id', 'is', null)
        .not('tax_regime', 'is', null);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        const v = (r.tax_regime ?? '').toString().trim();
        if (v === '' || v.toLowerCase() === 'nenhum') return;
        if (!r.responsible_id) return;
        map[r.responsible_id] = (map[r.responsible_id] ?? 0) + 1;
      });
      return map;
    },
  });
}

export function useCollaborators() {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<Collaborator[]>({
    queryKey: ['collaborators-with-clients', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const ids = await fetchProfileIdsWithActiveClients(companyId);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, avatar_url, status_active')
        .eq('company_id', companyId)
        .eq('status_active', true)
        .in('id', ids)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
    enabled: !!companyId,
  });
}

/** All active profiles with fiscal module access (for "Para:" destination of transfers). */
export function useAllFiscalProfiles() {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<Collaborator[]>({
    queryKey: ['all-fiscal-profiles', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, avatar_url, status_active')
        .eq('company_id', companyId)
        .eq('status_active', true)
        .or('role.in.(admin,super_admin),allowed_modules.cs.{fiscal}')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
    enabled: !!companyId,
  });
}

export interface CollaboratorDetailTask {
  id: string;
  title: string | null;
  status: string;
  due_date: string | null;
  contacts: { name: string | null } | null;
  fiscal_obligations_catalog: { name: string | null } | null;
}

export function useCollaboratorDetails(profileId: string | null, year: number, month: number) {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery({
    queryKey: ['collaborator-details', companyId, profileId, year, month],
    enabled: !!companyId && !!profileId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: monthData, error: e1 } = await (supabase as any)
        .from('fiscal_tasks')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .eq('responsible_id', profileId);
      if (e1) throw e1;
      const total = (monthData ?? []).length;
      const done = (monthData ?? []).filter((t: any) => t.status === 'concluido').length;

      const { data: upcoming, error: e2 } = await (supabase as any)
        .from('fiscal_tasks')
        .select('id, title, status, due_date, contacts(name), fiscal_obligations_catalog(name)')
        .eq('company_id', companyId)
        .eq('responsible_id', profileId)
        .neq('status', 'concluido')
        .gte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(5);
      if (e2) throw e2;

      return {
        total,
        done,
        upcoming: (upcoming ?? []) as CollaboratorDetailTask[],
      };
    },
  });
}

export function useCoverages() {
  const { company } = useCompany();
  const companyId = company?.id;
  const queryClient = useQueryClient();

  const query = useQuery<CoverageRow[]>({
    queryKey: ['coverages', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await (supabase as any)
        .from('collaborator_coverage')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
    enabled: !!companyId,
  });

  const createCoverage = useMutation({
    mutationFn: async (input: {
      absent_profile_id: string;
      covering_profile_id: string;
      start_date: string;
      end_date: string | null;
      reason: string;
      created_by: string | null;
    }) => {
      if (!companyId) throw new Error('No company');
      const { error } = await (supabase as any).from('collaborator_coverage').insert({
        company_id: companyId,
        is_active: true,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coverages', companyId] }),
  });

  const endCoverage = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any)
        .from('collaborator_coverage')
        .update({ is_active: false, end_date: today })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coverages', companyId] }),
  });

  return { coverages: query.data ?? [], isLoading: query.isLoading, createCoverage, endCoverage };
}

export function usePendingTasksByProfile(year: number, month: number) {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<Record<string, number>>({
    queryKey: ['pending-tasks-by-profile', companyId, year, month],
    queryFn: async () => {
      if (!companyId) return {};
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('responsible_id, status')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((row: any) => {
        if (row.status === 'concluido') return;
        const key = row.responsible_id ?? '__none__';
        map[key] = (map[key] ?? 0) + 1;
      });
      return map;
    },
    enabled: !!companyId,
  });
}
