import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createGlobalLog } from '@/hooks/useGlobalLogs';
import { isEffectivelyPaid } from '@/lib/financial-utils';

function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateBR(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  const [y, m, d] = v.split('-');
  return d && m && y ? `${d}/${m}/${y}` : v;
}

// Resolve os nomes das FKs que mudaram, para um histórico legível.
async function resolveNames(
  table: 'categories' | 'banks' | 'contacts' | 'parties',
  ids: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!clean.length) return {};
  const nameCol = table === 'parties' ? 'nome' : 'name';
  const { data } = await supabase.from(table).select(`id, ${nameCol}`).in('id', clean);
  const map: Record<string, string> = {};
  (data as any[] | null)?.forEach((row) => { map[row.id] = row[nameCol]; });
  return map;
}

// Monta a lista de alterações legíveis entre o lançamento antigo e as atualizações.
async function buildTransactionDiff(
  oldRow: Record<string, any>,
  updates: Record<string, any>
): Promise<string[]> {
  const changes: string[] = [];
  const changed = (k: string) => k in updates && String(oldRow[k] ?? '') !== String(updates[k] ?? '');

  if (changed('amount')) changes.push(`Valor: ${fmtMoney(oldRow.amount)} → ${fmtMoney(updates.amount)}`);
  if (changed('paid_amount')) changes.push(`Valor pago: ${fmtMoney(oldRow.paid_amount)} → ${fmtMoney(updates.paid_amount)}`);
  if (changed('description')) changes.push(`Descrição: "${oldRow.description ?? '—'}" → "${updates.description ?? '—'}"`);
  if (changed('due_date')) changes.push(`Vencimento: ${fmtDateBR(oldRow.due_date)} → ${fmtDateBR(updates.due_date)}`);
  if (changed('issue_date')) changes.push(`Emissão: ${fmtDateBR(oldRow.issue_date)} → ${fmtDateBR(updates.issue_date)}`);
  if (changed('expected_date')) changes.push(`Prevista: ${fmtDateBR(oldRow.expected_date)} → ${fmtDateBR(updates.expected_date)}`);
  if (changed('date')) changes.push(`Pagamento: ${fmtDateBR(oldRow.date)} → ${fmtDateBR(updates.date)}`);
  if (changed('is_paid')) changes.push(`Situação: ${oldRow.is_paid ? 'Pago' : 'Pendente'} → ${updates.is_paid ? 'Pago' : 'Pendente'}`);

  if (changed('category_id')) {
    const m = await resolveNames('categories', [oldRow.category_id, updates.category_id]);
    changes.push(`Evento contábil: ${oldRow.category_id ? (m[oldRow.category_id] ?? '—') : '—'} → ${updates.category_id ? (m[updates.category_id] ?? '—') : '—'}`);
  }
  if (changed('bank_id')) {
    const m = await resolveNames('banks', [oldRow.bank_id, updates.bank_id]);
    changes.push(`Conta/Banco: ${oldRow.bank_id ? (m[oldRow.bank_id] ?? '—') : '—'} → ${updates.bank_id ? (m[updates.bank_id] ?? '—') : '—'}`);
  }
  if (changed('contact_id')) {
    const m = await resolveNames('contacts', [oldRow.contact_id, updates.contact_id]);
    changes.push(`Cliente/Fornecedor: ${oldRow.contact_id ? (m[oldRow.contact_id] ?? '—') : '—'} → ${updates.contact_id ? (m[updates.contact_id] ?? '—') : '—'}`);
  }
  if (changed('party_id')) {
    const m = await resolveNames('parties', [oldRow.party_id, updates.party_id]);
    changes.push(`Contraparte: ${oldRow.party_id ? (m[oldRow.party_id] ?? '—') : '—'} → ${updates.party_id ? (m[updates.party_id] ?? '—') : '—'}`);
  }

  return changes;
}

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
  is_transfer?: boolean;
  transfer_group_id?: string | null;
  recurring_id?: string | null;
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
      // Captura o estado anterior para o histórico de alterações (auditoria).
      const { data: oldRow } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Registra o diff legível em global_logs (reaproveita o padrão do módulo).
      if (oldRow) {
        const changes = await buildTransactionDiff(oldRow, updates);
        if (changes.length) {
          await createGlobalLog({
            action: 'ALTERACAO',
            module: 'FINANCEIRO',
            entityId: id,
            entityName: (data as any)?.description ?? oldRow.description,
            details: changes.join(' · '),
          });
        }
      }

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

  // Transferência entre contas: cria as 2 pernas vinculadas (saída no banco de origem,
  // entrada no banco de destino). Não entra em receita/despesa (is_transfer=true), mas
  // afeta o saldo de cada banco via trigger update_bank_balance.
  const createTransfer = useMutation({
    mutationFn: async (input: {
      fromBankId: string;
      toBankId: string;
      amount: number;
      date: string;
      description?: string | null;
      notes?: string | null;
    }) => {
      if (input.fromBankId === input.toBankId) throw new Error('Origem e destino devem ser contas diferentes.');
      if (!(input.amount > 0)) throw new Error('Informe um valor maior que zero.');
      if (!input.date) throw new Error('Informe a data da transferência.');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      if (!profile) throw new Error('Perfil não encontrado');

      const groupId = crypto.randomUUID();
      const baseDesc = input.description?.trim() || 'Transferência entre contas';

      const legs = [
        { bank_id: input.fromBankId, type: 'despesa' as const, description: `${baseDesc} (saída)` },
        { bank_id: input.toBankId, type: 'receita' as const, description: `${baseDesc} (entrada)` },
      ].map((leg) => ({
        company_id: profile.company_id,
        bank_id: leg.bank_id,
        type: leg.type,
        description: leg.description,
        amount: input.amount,
        paid_amount: input.amount,
        date: input.date,
        issue_date: input.date,
        is_paid: true,
        is_transfer: true,
        transfer_group_id: groupId,
        category_id: null,
        contact_id: null,
        notes: input.notes || null,
      }));

      const { error } = await supabase.from('transactions').insert(legs);
      if (error) throw error;

      await createGlobalLog({
        action: 'ADICAO',
        module: 'FINANCEIRO',
        entityId: groupId,
        entityName: baseDesc,
        details: `Transferência de ${fmtMoney(input.amount)} entre contas em ${fmtDateBR(input.date)}`,
      });

      return { groupId };
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
      toast({ title: 'Transferência registrada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao registrar transferência', description: error.message, variant: 'destructive' });
    },
  });

  // Calculate totals using strict isEffectivelyPaid rule.
  // Transferências entre contas não compõem receita/despesa.
  const totals = transactions.reduce(
    (acc, t) => {
      if (t.is_transfer) return acc;
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
    createTransfer,
  };
}
