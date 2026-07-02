import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type RtStatus = 'nao_iniciado' | 'em_analise' | 'adequado' | 'acao_necessaria';

export interface RtItems {
  cnae_compat: boolean;
  cadastro_ok: boolean;
  simulacao: boolean;
  informado: boolean;
  regime_revisado: boolean;
}

export interface RtChecklistRow {
  id: string;
  company_id: string;
  contact_id: string;
  status: RtStatus;
  cnae_compat: boolean;
  cadastro_ok: boolean;
  simulacao: boolean;
  informado: boolean;
  regime_revisado: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RtState {
  status: RtStatus;
  items: RtItems;
  updated_at: string;
}

export const emptyRtItems = (): RtItems => ({
  cnae_compat: false,
  cadastro_ok: false,
  simulacao: false,
  informado: false,
  regime_revisado: false,
});

export const defaultRtState = (): RtState => ({
  status: 'nao_iniciado',
  items: emptyRtItems(),
  updated_at: new Date().toISOString(),
});

export function useRtChecklist(companyId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['rt-checklist', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_rt_checklist')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      const rows = (data ?? []) as RtChecklistRow[];
      const map: Record<string, RtState> = {};
      for (const r of rows) {
        map[r.contact_id] = {
          status: r.status,
          items: {
            cnae_compat: r.cnae_compat,
            cadastro_ok: r.cadastro_ok,
            simulacao: r.simulacao,
            informado: r.informado,
            regime_revisado: r.regime_revisado,
          },
          updated_at: r.updated_at,
        };
      }
      return map;
    },
    enabled: !!companyId,
  });

  const mutation = useMutation({
    mutationFn: async (params: { contactId: string; status: RtStatus; items: RtItems }) => {
      const { contactId, status, items } = params;
      const { error } = await (supabase as any)
        .from('client_rt_checklist')
        .upsert(
          {
            company_id: companyId,
            contact_id: contactId,
            status,
            ...items,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id,contact_id' },
        );
      if (error) throw error;
      return { contactId, status, items };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rt-checklist', companyId] });
    },
  });

  return {
    states: query.data ?? {},
    isLoading: query.isLoading,
    upsert: mutation.mutate,
    savingContactId: mutation.isPending ? (mutation.variables?.contactId ?? null) : null,
  };
}
