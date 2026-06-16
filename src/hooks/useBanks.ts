import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createGlobalLog } from '@/hooks/useGlobalLogs';

export interface Bank {
  id: string;
  company_id: string;
  name: string;
  bank_code: string | null;
  agency: string | null;
  account_number: string | null;
  initial_balance: number;
  current_balance: number;
  color: string;
  is_active: boolean;
  is_invisible: boolean;
  created_at: string;
  updated_at: string;
}

export type BankInsert = Omit<Bank, 'id' | 'created_at' | 'updated_at' | 'current_balance'> & { is_invisible?: boolean };
export type BankUpdate = Partial<Omit<Bank, 'id' | 'company_id' | 'created_at' | 'updated_at'>>;

export function useBanks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: banks = [], isLoading, error } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banks')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Bank[];
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const createBank = useMutation({
    mutationFn: async (bank: Omit<BankInsert, 'company_id'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('banks')
        .insert({ 
          ...bank, 
          company_id: profile.company_id,
          current_balance: bank.initial_balance 
        })
        .select()
        .single();

      if (error) throw error;
      
      await createGlobalLog({
        action: 'ADICAO',
        module: 'BANCOS',
        entityId: data.id,
        entityName: bank.name,
        details: `Banco "${bank.name}" criado com saldo inicial de R$ ${Number(bank.initial_balance).toFixed(2)}`,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      toast({ title: 'Banco criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar banco', description: error.message, variant: 'destructive' });
    },
  });

  const updateBank = useMutation({
    mutationFn: async ({ id, ...updates }: BankUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('banks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast({ title: 'Banco atualizado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar banco', description: error.message, variant: 'destructive' });
    },
  });

  const deleteBank = useMutation({
    mutationFn: async (id: string) => {
      // Get bank info before deleting
      const { data: bank } = await supabase
        .from('banks')
        .select('name')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('banks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      if (bank) {
        await createGlobalLog({
          action: 'EXCLUSAO',
          module: 'BANCOS',
          entityId: id,
          entityName: bank.name,
          details: `Banco "${bank.name}" excluído`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      toast({ title: 'Banco excluído!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir banco', description: error.message, variant: 'destructive' });
    },
  });

  return {
    banks,
    isLoading,
    error,
    createBank,
    updateBank,
    deleteBank,
  };
}
