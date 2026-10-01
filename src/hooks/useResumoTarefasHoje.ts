import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchValidFiscalContactIds } from '@/lib/fiscal-filters';

export interface ResumoTarefasHoje {
  /** Abertas com vencimento hoje. */
  vencemHoje: number;
  /** Concluídas hoje. */
  entreguesHoje: number;
  /** Abertas com vencimento antes de hoje. */
  vencidas: number;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Resumo do dia no header (Tarefas): vencem hoje / entregues hoje / vencidas.
 * Mesmo recorte da tela de Tarefas — clientes elegíveis ao Fiscal e, para
 * colaborador, só as tarefas dele. Usa contagem no banco (head), sem baixar
 * linhas, então não esbarra no teto de 1000 do PostgREST.
 */
export function useResumoTarefasHoje(enabled: boolean) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { isColaborador } = useUserRole();
  const companyId = company?.id;

  const { data: profileId } = useQuery({
    queryKey: ['current-profile-fiscal-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single();
      if (error) throw error;
      return data.id as string;
    },
    enabled: enabled && !!user?.id,
  });

  return useQuery<ResumoTarefasHoje>({
    queryKey: ['fiscal-resumo-hoje', companyId, isColaborador, profileId, isoDay(new Date())],
    enabled: enabled && !!companyId && (!isColaborador || !!profileId),
    // Contagem barata; recarrega ao voltar pra aba e a cada 5 min.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const validContactIds = await fetchValidFiscalContactIds(companyId!);
      const hoje = isoDay(new Date());
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);

      const base = () => {
        let q = (supabase as any)
          .from('fiscal_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId);
        // Tarefa sem cliente sempre conta; com cliente, só se elegível ao Fiscal.
        q = validContactIds.length > 0
          ? q.or(`contact_id.in.(${validContactIds.join(',')}),contact_id.is.null`)
          : q.is('contact_id', null);
        if (isColaborador && profileId) q = q.eq('responsible_id', profileId);
        return q;
      };

      const [vencem, entregues, vencidas] = await Promise.all([
        base().neq('status', 'concluido').eq('due_date', hoje),
        base().eq('status', 'concluido').gte('completed_at', inicioHoje.toISOString()),
        base().neq('status', 'concluido').lt('due_date', hoje),
      ]);
      for (const r of [vencem, entregues, vencidas]) if (r.error) throw r.error;

      return {
        vencemHoje: vencem.count ?? 0,
        entreguesHoje: entregues.count ?? 0,
        vencidas: vencidas.count ?? 0,
      };
    },
  });
}
