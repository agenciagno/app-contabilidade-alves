import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TrashItem {
  id: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  due_date: string | null;
  date: string | null;
  deleted_at: string;
  contact?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  bank?: { id: string; name: string } | null;
}

export function useTrash(searchTerm: string, dateFrom?: string, dateTo?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['trash-items', searchTerm, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          id, description, amount, type, due_date, date, deleted_at,
          contact:contacts(id, name),
          category:categories(id, name),
          bank:banks(id, name)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`description.ilike.%${searchTerm}%`);
      }
      if (dateFrom) {
        query = query.gte('deleted_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('deleted_at', dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TrashItem[];
    },
    staleTime: 1000 * 15,
  });

  const restoreTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({ deleted_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast({ title: 'Transação restaurada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao restaurar', description: error.message, variant: 'destructive' });
    },
  });

  const permanentDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast({ title: 'Transação excluída permanentemente!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    },
  });

  return { items, isLoading, restoreTransaction, permanentDelete };
}
