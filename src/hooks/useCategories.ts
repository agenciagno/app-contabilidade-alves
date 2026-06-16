import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Category {
  id: string;
  company_id: string;
  name: string;
  type: 'receita' | 'despesa';
  color: string;
  icon: string;
  parent_id: string | null;
  show_in_dre: boolean;
  created_at: string;
  updated_at: string;
}

export type CategoryInsert = Omit<Category, 'id' | 'created_at' | 'updated_at' | 'parent_id' | 'show_in_dre'> & { parent_id?: string | null; show_in_dre?: boolean };
export type CategoryUpdate = Partial<Omit<Category, 'id' | 'company_id' | 'created_at' | 'updated_at'>>;

export function useCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Category[];
    },
    staleTime: 1000 * 60, // 1 minute - categories change less often
    gcTime: 1000 * 60 * 10,
  });

  const createCategory = useMutation({
    mutationFn: async (category: Omit<CategoryInsert, 'company_id'>) => {
      // Get user's company_id from profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('categories')
        .insert({ ...category, company_id: profile.company_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Evento contábil criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar evento contábil', description: error.message, variant: 'destructive' });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: CategoryUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Evento contábil atualizado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar evento contábil', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      // Desvincular sub-eventos órfãos antes de deletar
      await supabase
        .from('categories')
        .update({ parent_id: null })
        .eq('parent_id', id);

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Evento contábil excluído!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir evento contábil', description: error.message, variant: 'destructive' });
    },
  });

  return {
    categories,
    isLoading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
