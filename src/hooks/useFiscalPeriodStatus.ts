import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface FiscalPeriodStatusRow {
  id: string;
  company_id: string;
  contact_id: string | null;
  competence_year: number;
  competence_month: number;
  status: 'open' | 'closed' | 'reopened';
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

/** Status for a single (year, month) at the global level (contact_id IS NULL). */
export function useFiscalPeriodStatus(year: number, month: number) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  return useQuery<FiscalPeriodStatusRow | null>({
    queryKey: ['fiscal-period-status', companyId, year, month],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_period_status')
        .select('*')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .is('contact_id', null)
        .maybeSingle();
      if (error) throw error;
      return (data as FiscalPeriodStatusRow | null) ?? null;
    },
  });
}

/** Map of "YYYY-M" -> true for all globally-closed periods of the company. */
export function useClosedPeriodsMap() {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  return useQuery<Set<string>>({
    queryKey: ['fiscal-period-status', 'closed-set', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_period_status')
        .select('competence_year, competence_month, status')
        .eq('company_id', companyId)
        .is('contact_id', null)
        .eq('status', 'closed');
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => set.add(`${r.competence_year}-${r.competence_month}`));
      return set;
    },
  });
}

export function periodKey(year: number | null | undefined, month: number | null | undefined) {
  if (!year || !month) return '';
  return `${year}-${month}`;
}

export function useClosePeriod() {
  const qc = useQueryClient();
  const { company } = useCompany();
  const companyId = (company as any)?.id;

  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Check if a row already exists (may be reopened previously)
      const { data: existing } = await (supabase as any)
        .from('fiscal_period_status')
        .select('id')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .is('contact_id', null)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from('fiscal_period_status')
          .update({
            status: 'closed',
            closed_by: user.id,
            closed_at: new Date().toISOString(),
            reopened_by: null,
            reopened_at: null,
            reopen_reason: null,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('fiscal_period_status')
          .insert({
            company_id: companyId,
            contact_id: null,
            competence_year: year,
            competence_month: month,
            status: 'closed',
            closed_by: user.id,
            closed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Competência encerrada');
      qc.invalidateQueries({ queryKey: ['fiscal-period-status'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao encerrar competência'),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  const { company } = useCompany();
  const companyId = (company as any)?.id;

  return useMutation({
    mutationFn: async ({ year, month, reason }: { year: number; month: number; reason: string }) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await (supabase as any)
        .from('fiscal_period_status')
        .update({
          status: 'reopened',
          reopened_by: user.id,
          reopened_at: new Date().toISOString(),
          reopen_reason: reason,
        })
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .is('contact_id', null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Competência reaberta');
      qc.invalidateQueries({ queryKey: ['fiscal-period-status'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao reabrir competência'),
  });
}
