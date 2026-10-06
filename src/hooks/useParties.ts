import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { toast } from 'sonner';

export type PartyTipo = 'cliente' | 'fornecedor' | 'ambos';

export interface Party {
  id: string;
  company_id: string;
  tipo: PartyTipo;
  nome: string;
  display_name: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  complemento: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  observacoes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartyInput {
  tipo: PartyTipo;
  nome: string;
  display_name?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  cep?: string | null;
  address?: string | null;
  address_number?: string | null;
  complemento?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  observacoes?: string | null;
  is_active?: boolean;
}

/** Cadastro com lançamentos vinculados: excluir deixaria esses lançamentos sem cliente/fornecedor. */
export class PartyInUseError extends Error {
  count: number;
  constructor(count: number) {
    super(`Cadastro vinculado a ${count} lançamento(s).`);
    this.count = count;
  }
}

export const useParties = () => {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId;

  const query = useQuery({
    queryKey: ['parties', companyId],
    queryFn: async (): Promise<Party[]> => {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .eq('company_id', companyId!)
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

  // Só exclui cadastro sem lançamentos: a FK de transactions.party_id é ON DELETE SET NULL, então
  // excluir um cadastro em uso apagaria o nome do cliente/fornecedor do histórico. Nesse caso a
  // tela oferece desativar (PartyInUseError).
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('party_id', id);
      if (countError) throw countError;
      if (count && count > 0) throw new PartyInUseError(count);

      const { data, error } = await supabase.from('parties').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Não foi possível excluir este cadastro.');
    },
    onSuccess: () => {
      toast.success('Cadastro excluído!');
      qc.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (e: Error) => {
      if (e instanceof PartyInUseError) return; // a tela explica e oferece desativar
      toast.error('Erro ao excluir', { description: e.message });
    },
  });

  return { ...query, create, update, toggleActive, remove };
};
