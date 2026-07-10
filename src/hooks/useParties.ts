import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export type PartyTipo = 'cliente' | 'fornecedor' | 'ambos';

export interface Party {
  id: string;
  company_id: string;
  tipo: PartyTipo;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartyInput {
  tipo: PartyTipo;
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  observacoes?: string | null;
  is_active?: boolean;
}

export const useParties = () => {
  const qc = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id;

  const query = useQuery({
    queryKey: ['parties', companyId],
    queryFn: async (): Promise<Party[]> => {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Party[];
    },
    enabled: !!companyId,
  });

  const create = useMutation({
    mutationFn: async (input: PartyInput): Promise<Party> => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { data, error } = await supabase
        .from('parties')
        .insert({ ...input, company_id: companyId })
        .select('*')
        .single();
      if (error) throw error;
      return data as Party;
    },
    onSuccess: () => {
      toast.success('Cliente/Fornecedor criado!');
      qc.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (e: Error) => toast.error('Erro ao criar', { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: PartyInput & { id: string }): Promise<Party> => {
      const { data, error } = await supabase
        .from('parties')
        .update(input)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Party;
    },
    onSuccess: () => {
      toast.success('Registro atualizado!');
      qc.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (e: Error) => toast.error('Erro ao atualizar', { description: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('parties').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status alterado!');
      qc.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (e: Error) => toast.error('Erro ao alterar status', { description: e.message }),
  });

  return { ...query, create, update, toggleActive };
};
