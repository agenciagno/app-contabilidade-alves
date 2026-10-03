import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Tela Obrigações e declarações: números por obrigação, clientes de cada uma (com o cruzamento com a Receita),
// marcar/remover direto da tela e de onde vem a data (regra do sistema ou planilha da Receita).
// Funções novas ainda não estão nos tipos gerados, por isso `as any` (mesmo padrão de useFiscalCalendar).

export interface ResumoObrigacao {
  obligation_id: string;
  clientes: number;
  abertas: number;
  divergencias: number;
  revisar: number;
  proximo_data: string | null;
  proximo_fonte: 'receita' | 'regra' | null;
  tem_mapeamento: boolean;
}
export interface ResumoObrigacoes {
  obrigacoes: ResumoObrigacao[];
  clientes_com_divergencia: number;
  com_data_receita: number;
  sem_clientes: number;
}

export function useObrigacoesResumo() {
  return useQuery<ResumoObrigacoes>({
    queryKey: ['obrigacoes-resumo'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_obrigacoes_resumo');
      if (error) throw error;
      return data as ResumoObrigacoes;
    },
  });
}

export interface ClienteDaObrigacao {
  contact_id: string;
  nome: string;
  regime: string | null;
  marcada: boolean;
  divergencia: 'falta' | 'sobra' | 'revisar' | null;
  motivo: string | null;
}

export function useObrigacaoClientes(obligationId: string | null) {
  return useQuery<ClienteDaObrigacao[]>({
    queryKey: ['obrigacao-clientes', obligationId],
    enabled: !!obligationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_obrigacao_clientes', { p_obligation_id: obligationId });
      if (error) throw error;
      return (data ?? []) as ClienteDaObrigacao[];
    },
  });
}

/** Marca ou remove a obrigação de um cliente e já atualiza o card dele (só mês aprovado; nunca tarefa mexida). */
export function useAlterarObrigacaoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, obligationId, marcar }: { contactId: string; obligationId: string; marcar: boolean }) => {
      const { data, error } = await (supabase as any).rpc('fiscal_cliente_obrigacao_alterar', {
        p_contact_id: contactId, p_obligation_id: obligationId, p_marcar: marcar,
      });
      if (error) throw error;
      return data as { card?: { criadas?: number; removidas?: number } };
    },
    onSuccess: (r, v) => {
      const card = r?.card;
      const extra = [card?.criadas ? `${card.criadas} tarefa(s) lançada(s)` : null, card?.removidas ? `${card.removidas} removida(s)` : null].filter(Boolean).join(', ');
      toast.success(`${v.marcar ? 'Obrigação marcada' : 'Obrigação removida'}${extra ? ` · ${extra}` : ''}.`);
      for (const k of ['obrigacao-clientes', 'obrigacoes-resumo', 'client-obligations', 'client-obligations-count', 'fiscal-tasks', 'fiscal-cliente-tarefas', 'fiscal-clientes-sem-tarefas', 'calendario-resumo']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao alterar a obrigação do cliente'),
  });
}

/** Datas da obrigação lidas do calendário (fonte única), do mês passado em diante. */
export interface DataDaObrigacao {
  id: string;
  year: number;
  month: number;
  competence_month: number;
  competence_year: number;
  effective_due_date: string;
  effective_delivery_date: string;
  adjusted_due_date: string;
  has_override: boolean;
  fonte: 'receita' | 'regra';
}

export function useDatasDaObrigacao(obligationId: string | null) {
  return useQuery<DataDaObrigacao[]>({
    queryKey: ['obrigacao-datas', obligationId],
    enabled: !!obligationId,
    queryFn: async () => {
      const ref = new Date();
      ref.setMonth(ref.getMonth() - 1);
      const { data, error } = await (supabase as any)
        .from('fiscal_calendar_effective')
        .select('id, year, month, competence_year, competence_month, effective_due_date, effective_delivery_date, adjusted_due_date, has_override, fonte')
        .eq('obligation_id', obligationId)
        .gte('effective_due_date', ref.toISOString().slice(0, 10))
        .order('effective_due_date', { ascending: true })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as DataDaObrigacao[];
    },
  });
}

export type OrigemData = 'regra' | 'declaracao' | 'codigos';
export interface MapeamentoObrigacao {
  tipo: OrigemData;
  valor: string;
}

/** De onde vem a data: regra do sistema (sem mapeamento) ou linha da planilha da Receita. */
export function useMapeamentoObrigacao(obligationId: string | null | undefined) {
  return useQuery<MapeamentoObrigacao>({
    queryKey: ['obrigacao-mapeamento', obligationId],
    enabled: !!obligationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agenda_receita_mapeamento')
        .select('aba, campo, padrao, codigos')
        .eq('obligation_id', obligationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { tipo: 'regra', valor: '' };
      if (data.codigos?.length) return { tipo: 'codigos', valor: (data.codigos as string[]).join(', ') };
      return { tipo: 'declaracao', valor: String(data.padrao ?? '').replace(/^\^/, '').replace(/\\(.)/g, '$1') };
    },
  });
}

export async function salvarMapeamento(obligationId: string, tipo: OrigemData, valor: string) {
  const { error } = await (supabase as any).rpc('agenda_receita_mapeamento_salvar', {
    p_obligation_id: obligationId, p_tipo: tipo, p_valor: valor || null,
  });
  if (error) throw error;
}
