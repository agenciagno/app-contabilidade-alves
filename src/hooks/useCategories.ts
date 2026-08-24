import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useActiveCompany } from '@/contexts/CompanyContext';

export type CategoryScope = 'interno' | 'cliente';

export interface Category {
  id: string;
  company_id: string;
  name: string;
  type: 'receita' | 'despesa';
  color: string;
  icon: string;
  parent_id: string | null;
  show_in_dre: boolean;
  scope: CategoryScope;
  created_at: string;
  updated_at: string;
}

export type CategoryInsert = Omit<Category, 'id' | 'created_at' | 'updated_at' | 'parent_id' | 'show_in_dre' | 'scope'> & { parent_id?: string | null; show_in_dre?: boolean };
export type CategoryUpdate = Partial<Omit<Category, 'id' | 'company_id' | 'created_at' | 'updated_at'>>;

/**
 * Rótulos do scope 'cliente' pro `CategoryFormDialog` (mesmo texto de
 * `ClientCategories.tsx`) — fonte única pra quem abre esse dialog fora da tela
 * Categorias (Lançamentos, Recorrências): cliente não tem DRE nem o conceito
 * de "evento contábil", então nem o termo nem o toggle fazem sentido pra ele.
 */
export const CLIENT_CATEGORY_LABELS = {
  dialogTitleNew: 'Nova Categoria',
  dialogTitleEdit: 'Editar Categoria',
  parentQuestion: 'Pertence a qual Categoria Principal? (Opcional)',
  parentPlaceholder: 'Nenhuma (esta é uma Categoria Principal)',
  parentNoneOption: 'Nenhuma (Categoria Principal)',
  parentHelper: 'Se não selecionar, esta será uma categoria principal. Se selecionar, será uma subcategoria.',
};

// Eventos Contábeis (scope 'interno', bookkeeping da própria empresa) × Categorias (scope
// 'cliente', módulo Financeiro vendido a clientes) são isolados mesmo dentro da mesma
// company_id — decisão de 22/07/2026. Sem override, o scope é resolvido pela mesma regra usada
// em Lançamentos (isInternalCompany): empresa interna da CA vê 'interno', cliente externo do
// módulo vê 'cliente'. O único lugar que passa override é a tela "Categorias" (preview do
// módulo vendido, acessada pela própria equipe da CA).
export function useCategories(scopeOverride?: CategoryScope) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId, isInternalCompany } = useActiveCompany();
  const scope: CategoryScope = scopeOverride ?? (isInternalCompany ? 'interno' : 'cliente');
  // Cliente não tem DRE nem o conceito de "evento contábil" — os toasts usam o
  // mesmo termo que a tela Categorias já mostra pra ele.
  const msg = scope === 'cliente'
    ? {
        criado: 'Categoria criada com sucesso!', erroCriar: 'Erro ao criar categoria',
        atualizado: 'Categoria atualizada!', erroAtualizar: 'Erro ao atualizar categoria',
        excluido: 'Categoria excluída!', erroExcluir: 'Erro ao excluir categoria',
      }
    : {
        criado: 'Evento contábil criado com sucesso!', erroCriar: 'Erro ao criar evento contábil',
        atualizado: 'Evento contábil atualizado!', erroAtualizar: 'Erro ao atualizar evento contábil',
        excluido: 'Evento contábil excluído!', erroExcluir: 'Erro ao excluir evento contábil',
      };

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['categories', activeCompanyId, scope],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('company_id', activeCompanyId!)
        .eq('scope', scope)
        .order('name');

      if (error) throw error;
      return data as Category[];
    },
    enabled: !!activeCompanyId,
    staleTime: 1000 * 60, // 1 minute - categories change less often
    gcTime: 1000 * 60 * 10,
  });

  const createCategory = useMutation({
    mutationFn: async (category: Omit<CategoryInsert, 'company_id'>) => {
      if (!activeCompanyId) throw new Error('Empresa em contexto não definida');

      const { data, error } = await supabase
        .from('categories')
        .insert({ ...category, company_id: activeCompanyId, scope })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: msg.criado });
    },
    onError: (error: Error) => {
      toast({ title: msg.erroCriar, description: error.message, variant: 'destructive' });
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
      toast({ title: msg.atualizado });
    },
    onError: (error: Error) => {
      toast({ title: msg.erroAtualizar, description: error.message, variant: 'destructive' });
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
      toast({ title: msg.excluido });
    },
    onError: (error: Error) => {
      toast({ title: msg.erroExcluir, description: error.message, variant: 'destructive' });
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
