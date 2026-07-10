import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createGlobalLog } from '@/hooks/useGlobalLogs';
import { isEffectivelyPaid } from '@/lib/financial-utils';

export interface Transaction {
  id: string;
  company_id: string;
  category_id: string | null;
  bank_id: string | null;
  contact_id: string | null;
  party_id: string | null;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  date: string | null;
  issue_date: string | null;
  due_date: string | null;
  expected_date: string | null;
  is_paid: boolean;
  paid_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  category?: { id: string; name: string; color: string } | null;
  bank?: { id: string; name: string; color: string } | null;
  contact?: { id: string; name: string; type: string } | null;
}

export type TransactionInsert = {
  category_id?: string | null;
  bank_id?: string | null;
  contact_id?: string | null;
  party_id?: string | null;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  date?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  expected_date?: string | null;
  is_paid?: boolean;
  paid_amount?: number | null;
  notes?: string | null;
};

export type TransactionUpdate = Partial<TransactionInsert>;

export function useTransactions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const seen = new Map<string, Transaction>();
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            *,
            category:categories(id, name, color),
            bank:banks(id, name, color),
            contact:contacts(id, name, type)
          `)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        for (const row of (data as Transaction[])) {
          if (!seen.has(row.id)) seen.set(row.id, row);
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return Array.from(seen.values());
    },
    staleTime: 1000 * 30, // 30 seconds - data is fresh
    gcTime: 1000 * 60 * 5, // 5 minutes - garbage collection
  });

  const createTransaction = useMutation({
    mutationFn: async (transaction: TransactionInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...transaction, company_id: profile.company_id })
        .select()
        .single();

      if (error) throw error;
      
      // Log to global audit
      await createGlobalLog({
        action: 'ADICAO',
        module: 'FINANCEIRO',
        entityId: data.id,
        entityName: transaction.description,
        details: `Transação "${transaction.description}" criada - ${transaction.type === 'receita' ? 'Receita' : 'Despesa'} de R$ ${Number(transaction.amount).toFixed(2)}`,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-prior'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-period'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      toast({ title: 'Transação criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar transação', description: error.message, variant: 'destructive' });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...updates }: TransactionUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-prior'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-period'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      toast({ title: 'Transação atualizada!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar transação', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      // Get transaction info before soft-deleting for logging
      const { data: transaction } = await supabase
        .from('transactions')
        .select('description, amount, type')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      // Log deletion
      if (transaction) {
        await createGlobalLog({
          action: 'EXCLUSAO',
          module: 'FINANCEIRO',
          entityId: id,
          entityName: transaction.description,
          details: `Transação "${transaction.description}" excluída - ${transaction.type === 'receita' ? 'Receita' : 'Despesa'} de R$ ${Number(transaction.amount).toFixed(2)}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-prior'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-period'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      toast({ title: 'Transação excluída!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir transação', description: error.message, variant: 'destructive' });
    },
  });

  const togglePaid = useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      if (is_paid) {
        // Strict rule: check if date (payment date) exists
        const { data: txn } = await supabase
          .from('transactions')
          .select('amount, paid_amount, date')
          .eq('id', id)
          .single();
        
        if (!txn?.date) {
          throw new Error('SETTLEMENT_BLOCKED');
        }
        
        const paid_amount = txn?.paid_amount ?? txn?.amount ?? 0;
        const { error } = await supabase
          .from('transactions')
          .update({ is_paid: true, paid_amount })
          .eq('id', id);
        if (error) throw error;
      } else {
        // When unmarking, clear paid_amount
        const { error } = await supabase
          .from('transactions')
          .update({ is_paid: false, paid_amount: null })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-prior'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-period'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
    },
    onError: (error: Error) => {
      if (error.message === 'SETTLEMENT_BLOCKED') {
        toast({ title: 'Para liquidar a transação, a Data de Pagamento e o Valor Recebido são obrigatórios.', variant: 'destructive' });
      }
    },
  });


  const bulkSettleWithDate = useMutation({
    mutationFn: async ({ ids, paymentDate }: { ids: string[]; paymentDate: string }) => {
      const { data: txns, error: fetchErr } = await supabase
        .from('transactions')
        .select('id, amount, paid_amount')
        .in('id', ids);
      if (fetchErr) throw fetchErr;

      for (const txn of (txns || [])) {
        const paid_amount = txn.paid_amount ?? txn.amount;
        const { error } = await supabase
          .from('transactions')
          .update({ is_paid: true, date: paymentDate, paid_amount })
          .eq('id', txn.id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-prior'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-period'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      toast({ title: `${vars.ids.length} transação(ões) liquidada(s) com sucesso!` });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao liquidar em massa', description: error.message, variant: 'destructive' });
    },
  });



  const bulkCreateTransactions = useMutation({
    mutationFn: async (transactions: TransactionInsert[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const withCompany = transactions.map(t => ({
        ...t,
        company_id: profile.company_id,
      }));

      const BATCH_SIZE = 500;
      let totalInserted = 0;
      for (let i = 0; i < withCompany.length; i += BATCH_SIZE) {
        const batch = withCompany.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('transactions').insert(batch);
        if (error) throw error;
        totalInserted += batch.length;
      }

      await createGlobalLog({
        action: 'ADICAO',
        module: 'FINANCEIRO',
        details: `${totalInserted} transações importadas via planilha`,
      });

      return totalInserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      toast({ title: `${count} transações importadas com sucesso!` });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro na importação em massa', description: error.message, variant: 'destructive' });
    },
  });

  // Calculate totals using strict isEffectivelyPaid rule
  const totals = transactions.reduce(
    (acc, t) => {
      const paid = isEffectivelyPaid(t);
      const effectiveAmt = paid && t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
      if (t.type === 'receita') {
        acc.receitas += effectiveAmt;
        if (paid) acc.receitasPagas += effectiveAmt;
      } else {
        acc.despesas += effectiveAmt;
        if (paid) acc.despesasPagas += effectiveAmt;
      }
      return acc;
    },
    { receitas: 0, despesas: 0, receitasPagas: 0, despesasPagas: 0 }
  );

  return {
    transactions,
    isLoading,
    error,
    totals,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    togglePaid,
    
    bulkSettleWithDate,
    bulkCreateTransactions,
  };
}
