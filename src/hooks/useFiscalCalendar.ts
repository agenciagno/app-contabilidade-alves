import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


export interface FiscalObligationCatalog {
  id: string;
  name: string;
  code: string | null;
  applies_to: string[] | null;
  is_custom?: boolean | null;
  description?: string | null;
  due_rule?: string | null;
  holiday_adjustment?: string | null;
  department?: string | null;
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
  fonte?: 'regra' | 'receita';
  effective_due_date?: string;
  effective_delivery_date?: string;
  has_override?: boolean;
  fiscal_obligations_catalog: FiscalObligationCatalog | null;
}

export function useFiscalCalendar(year: number, month: number, enabled: boolean = true) {
  return useQuery<FiscalCalendarEffectiveRow[]>({
    queryKey: ['fiscal-calendar', year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_calendar_effective')
        .select('*, fiscal_obligations_catalog!inner(id, name, code, applies_to, is_custom, description, due_rule, holiday_adjustment, department)')
        .eq('year', year)
        .eq('month', month)
        .order('adjusted_due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FiscalCalendarEffectiveRow[];
    },
    enabled,
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
