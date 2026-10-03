import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Agenda oficial da Receita (planilha ADE do mês): rascunho do calendário para revisar, editar e aprovar.
// Tabelas novas ainda não estão nos tipos gerados do Supabase, por isso `as any` (mesmo padrão de useFiscalCalendar).

export interface AgendaResumoItem {
  obligation_id: string;
  nome: string;
  regra: string;
  oficial: string | null;
  final: string;
  fonte: 'receita' | 'regra';
  divergente: boolean;
  linhas: string[];
  sem_linha_oficial: boolean;
}

export interface AgendaImportacao {
  id: string;
  ano: number;
  mes: number;
  fonte: 'receita' | 'regras';
  ade_titulo: string | null;
  pagina_url: string | null;
  xlsx_url: string | null;
  itens_tributos: number;
  itens_declaracoes: number;
  resumo: AgendaResumoItem[];
  baixado_em: string | null;
  created_at: string;
}

export interface AgendaAprovacao {
  importacao_id: string;
  aprovado_por: string | null;
  aprovado_em: string;
  tarefas_criadas: number;
}

export function useAgendaReceita(year: number, month: number) {
  const importacao = useQuery<AgendaImportacao | null>({
    queryKey: ['agenda-receita', year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agenda_receita_importacoes')
        .select('*')
        .eq('ano', year)
        .eq('mes', month)
        .maybeSingle();
      if (error) throw error;
      return (data as AgendaImportacao | null) ?? null;
    },
  });

  const importacaoId = importacao.data?.id;
  const aprovacao = useQuery<AgendaAprovacao | null>({
    queryKey: ['agenda-receita-aprovacao', importacaoId],
    enabled: !!importacaoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agenda_receita_aprovacoes')
        .select('importacao_id, aprovado_por, aprovado_em, tarefas_criadas')
        .eq('importacao_id', importacaoId)
        .maybeSingle();
      if (error) throw error;
      return (data as AgendaAprovacao | null) ?? null;
    },
  });

  return {
    importacao: importacao.data ?? null,
    aprovacao: aprovacao.data ?? null,
    isLoading: importacao.isLoading || (!!importacaoId && aprovacao.isLoading),
  };
}

export interface ResumoObrigacao {
  obligation_id: string;
  lancadas: number;
  a_lancar: number;
  sem_responsavel: number;
}
export interface ResumoCalendario {
  obrigacoes: ResumoObrigacao[];
  clientes_a_lancar: number;
}

/** Por obrigação: tarefas já lançadas e a lançar no mês (a conta é feita no banco). */
export function useResumoCalendario(year: number, month: number) {
  return useQuery<ResumoCalendario>({
    queryKey: ['calendario-resumo', year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_calendario_resumo', { p_ano: year, p_mes: month });
      if (error) throw error;
      return data as ResumoCalendario;
    },
  });
}

const invalidarLancamento = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['agenda-receita-aprovacao', 'calendario-resumo', 'fiscal-clientes-sem-tarefas', 'fiscal-tasks', 'fiscal-cliente-tarefas']) {
    qc.invalidateQueries({ queryKey: [k] });
  }
};

/** Um clique: aprova a agenda do mês e lança as tarefas (tudo numa transação no banco). */
export function useAprovarELancar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string) => {
      const { data, error } = await (supabase as any).rpc('agenda_receita_aprovar_e_lancar', { p_importacao_id: importacaoId });
      if (error) throw error;
      return data as { tarefas: number; ano: number; mes: number };
    },
    onSuccess: (r) => {
      toast.success(`✅ ${r.tarefas} tarefa${r.tarefas === 1 ? '' : 's'} lançada${r.tarefas === 1 ? '' : 's'} para ${String(r.mes).padStart(2, '0')}/${r.ano}`);
      invalidarLancamento(qc);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao aprovar e lançar'),
  });
}

/** Desfaz o lançamento: apaga só cards intocados (a fazer, sem edição) e o mês volta a rascunho. */
export function useDesfazerAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string) => {
      const { data, error } = await (supabase as any).rpc('agenda_receita_desfazer', { p_importacao_id: importacaoId });
      if (error) throw error;
      return data as { removidas: number; preservadas: number };
    },
    onSuccess: (r) => {
      toast.success(`Lançamento desfeito: ${r.removidas} removidas${r.preservadas ? `, ${r.preservadas} preservadas (já mexidas)` : ''}.`);
      invalidarLancamento(qc);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao desfazer o lançamento'),
  });
}

/** Baixa a planilha de novo (ex.: a Receita publicou uma ADE retificadora). Bloqueado no servidor se o mês já foi aprovado. */
export function useAtualizarAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data, error } = await supabase.functions.invoke('agenda-receita', { body: { action: 'importar', ano: year, mes: month } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo ?? data?.error ?? 'Não foi possível atualizar a agenda');
      return data as { oficiais: number; divergentes: number };
    },
    onSuccess: (r) => {
      toast.success(`Agenda atualizada da Receita: ${r.oficiais} obrigações com data oficial.`);
      qc.invalidateQueries({ queryKey: ['agenda-receita'] });
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar a agenda'),
  });
}
