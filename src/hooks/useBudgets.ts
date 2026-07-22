import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';
import { useCategories } from '@/hooks/useCategories';
import { createGlobalLog } from '@/hooks/useGlobalLogs';

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budget: number; // meta
  realizado: number;
  pct: number; // realizado / meta (0..1+)
  over: boolean;
  budgetId?: string;
}

// Orçamento por categoria (meta x realizado) para um mês 'YYYY-MM'.
// Reaproveita dre_budgets (unique company/category/month) e a RPC get_category_breakdown
// para o realizado (que já exclui transferências).
export function useBudgets(monthYear: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id;
  const { categories } = useCategories();

  const start = `${monthYear}-01`;
  const [y, m] = monthYear.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthYear}-${String(lastDay).padStart(2, '0')}`;

  const budgetsQuery = useQuery({
    queryKey: ['dre-budgets', companyId, monthYear],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dre_budgets')
        .select('id, category_id, budget_value')
        .eq('month_year', monthYear);
      if (error) throw error;
      return (data ?? []) as { id: string; category_id: string; budget_value: number }[];
    },
  });

  const realizadoQuery = useQuery({
    queryKey: ['budget-realizado', companyId, monthYear],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_category_breakdown', {
        p_type: 'despesa',
        p_start_date: start,
        p_end_date: end,
        p_limit: 1000,
      });
      if (error) throw error;
      const map: Record<string, number> = {};
      (data as any[] | null)?.forEach((r) => {
        if (r.category_id) map[r.category_id] = Number(r.total ?? 0);
      });
      return map;
    },
  });

  const budgets = budgetsQuery.data ?? [];
  const realizadoMap = realizadoQuery.data ?? {};

  const rows: BudgetRow[] = budgets
    .map((b) => {
      const cat = categories.find((c) => c.id === b.category_id);
      const budget = Number(b.budget_value);
      const realizado = realizadoMap[b.category_id] ?? 0;
      return {
        categoryId: b.category_id,
        categoryName: cat?.name ?? 'Categoria',
        categoryColor: cat?.color ?? '#6B7280',
        budget,
        realizado,
        pct: budget > 0 ? realizado / budget : 0,
        over: realizado > budget,
        budgetId: b.id,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalRealizado = rows.reduce((s, r) => s + r.realizado, 0);
  const overCount = rows.filter((r) => r.over).length;

  const upsertBudget = useMutation({
    mutationFn: async ({ categoryId, budgetValue }: { categoryId: string; budgetValue: number }) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { error } = await supabase
        .from('dre_budgets')
        .upsert(
          { company_id: companyId, category_id: categoryId, month_year: monthYear, budget_value: budgetValue },
          { onConflict: 'company_id,category_id,month_year' }
        );
      if (error) throw error;
      await createGlobalLog({
        action: 'ALTERACAO',
        module: 'FINANCEIRO',
        entityId: categoryId,
        entityName: categories.find((c) => c.id === categoryId)?.name ?? 'Categoria',
        details: `Orçamento de ${monthYear} definido em R$ ${budgetValue.toFixed(2)}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dre-budgets'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      toast({ title: 'Orçamento salvo!' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar orçamento', description: e.message, variant: 'destructive' }),
  });

  const deleteBudget = useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from('dre_budgets').delete().eq('id', budgetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dre-budgets'] });
      toast({ title: 'Orçamento removido.' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover orçamento', description: e.message, variant: 'destructive' }),
  });

  return {
    rows,
    totalBudget,
    totalRealizado,
    overCount,
    isLoading: budgetsQuery.isLoading || realizadoQuery.isLoading,
    upsertBudget,
    deleteBudget,
    despesaCategories: categories.filter((c) => c.type === 'despesa'),
  };
}
