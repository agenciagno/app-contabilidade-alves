import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface AcessoTipo {
  id: string;
  nome: string;
}

/** Tipos de acesso criados pela equipe (tabela `acesso_tipos`, 12/10/2026), além dos portais fixos. */
export function useAcessoTipos() {
  return useQuery({
    queryKey: ['acesso-tipos'],
    queryFn: async (): Promise<AcessoTipo[]> => {
      const { data, error } = await (supabase as any)
        .from('acesso_tipos')
        .select('id, nome')
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcessoTipo[];
    },
  });
}

export function useCriarAcessoTipo() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (nome: string): Promise<AcessoTipo> => {
      if (!company?.id) throw new Error('Empresa não encontrada.');
      const { data, error } = await (supabase as any)
        .from('acesso_tipos')
        .insert({ nome: nome.trim(), company_id: company.id })
        .select('id, nome')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('Esse tipo de acesso já existe na lista.');
        if (error.code === '23514') throw new Error('Use entre 2 e 60 letras no nome do tipo.');
        if (error.code === '42501') throw new Error('Você não tem permissão para criar tipos de acesso.');
        throw error;
      }
      return data as AcessoTipo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acesso-tipos'] }),
  });
}
