import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useActiveCompany } from '@/contexts/CompanyContext';

export interface FinancialGoal {
  id: string;
  company_id: string;
  title: string;
  target_value: number;
  current_value: number;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialGoalInput {
  title: string;
  target_value: number;
  current_value?: number;
  start_date: string;
  end_date: string;
  notes?: string | null;
}

// Meta financeira livre (título, valor alvo, período) — progresso é o valor atual informado
// manualmente pelo usuário (sem tentar inferir de alguma métrica do sistema).
export function useFinancialGoals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId;

  const query = useQuery({
    queryKey: ['financial-goals', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<FinancialGoal[]> => {
      const { data, error } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('company_id', companyId!)
        .order('end_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FinancialGoal[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: FinancialGoalInput) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { error } = await supabase.from('financial_goals').insert({
        company_id: companyId,
        title: input.title,
        target_value: input.target_value,
        current_value: input.current_value ?? 0,
        start_date: input.start_date,
        end_date: input.end_date,
        notes: input.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-goals'] });
      toast({ title: 'Meta criada!' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao criar meta', description: e.message, variant: 'destructive' }),
  });

  const updateProgress = useMutation({
    mutationFn: async ({ id, current_value }: { id: string; current_value: number }) => {
      const { error } = await supabase.from('financial_goals').update({ current_value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-goals'] });
      toast({ title: 'Progresso atualizado!' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao atualizar progresso', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('financial_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-goals'] });
      toast({ title: 'Meta removida.' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover meta', description: e.message, variant: 'destructive' }),
  });

  return { ...query, goals: query.data ?? [], create, updateProgress, remove };
}
