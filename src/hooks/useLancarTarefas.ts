import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Lançar tarefas de clientes escolhidos direto do Calendário Fiscal (botão "Lançar tarefa").
// Só lança o que o cliente tem marcado no cadastro, com responsável no setor, e nunca duplica tarefa.

export interface ObrigacaoDoCliente {
  obligation_id: string;
  nome: string;
  vencimento: string;
  lancada: boolean;
  sem_responsavel: boolean;
}

export interface CandidatoLancamento {
  contact_id: string;
  nome: string;
  documento: string | null;
  regime: string | null;
  /** Status do Cliente: Suspensa/Inapta ainda recebem tarefa e pedem aviso na confirmação. */
  status_cliente: string | null;
  obrigacoes: ObrigacaoDoCliente[];
}

/** Clientes ativos com obrigação marcada que existe no calendário do mês, e o que já foi lançado de cada um. */
export function useCandidatosLancamento(year: number, month: number, enabled: boolean) {
  return useQuery<CandidatoLancamento[]>({
    queryKey: ['fiscal-lancar-candidatos', year, month],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_lancar_candidatos', { p_ano: year, p_mes: month });
      if (error) throw error;
      return (data ?? []) as CandidatoLancamento[];
    },
  });
}

export function useLancarTarefasClientes(year: number, month: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactIds, obligationIds }: { contactIds: string[]; obligationIds: string[] }) => {
      const { data, error } = await (supabase as any).rpc('fiscal_lancar_tarefas_clientes', {
        p_ano: year, p_mes: month, p_contact_ids: contactIds, p_obligation_ids: obligationIds,
      });
      if (error) throw error;
      return data as { ok: boolean; criadas: number };
    },
    onSuccess: () => {
      for (const k of ['fiscal-lancar-candidatos', 'fiscal-tasks', 'calendario-resumo', 'fiscal-clientes-sem-tarefas', 'fiscal-cliente-tarefas', 'fiscal-dashboard']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao lançar as tarefas'),
  });
}

export interface AvisoLancamento {
  contact_id: string;
  nome: string;
  status_cliente: string;
  tarefas: number;
}

/** Clientes com situação especial (Suspensa, Inapta) que vão receber tarefa no "Aprovar e lançar" do mês. */
export function useAvisosLancamento(year: number, month: number, enabled: boolean) {
  return useQuery<AvisoLancamento[]>({
    queryKey: ['fiscal-lancamento-avisos', year, month],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_lancamento_avisos', { p_ano: year, p_mes: month });
      if (error) throw error;
      return (data ?? []) as AvisoLancamento[];
    },
  });
}
