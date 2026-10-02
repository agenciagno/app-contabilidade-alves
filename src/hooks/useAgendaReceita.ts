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

/** Registra a aprovação (quem e quando). As tarefas são lançadas pelo fluxo existente, antes desta chamada. */
export function useAprovarAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ importacaoId, tarefas }: { importacaoId: string; tarefas: number }) => {
      const { error } = await (supabase as any).rpc('agenda_receita_aprovar', {
        p_importacao_id: importacaoId,
        p_tarefas: tarefas,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-receita-aprovacao'] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao registrar a aprovação da agenda'),
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
