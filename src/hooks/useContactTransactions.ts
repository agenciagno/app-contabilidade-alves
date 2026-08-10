import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetch-all';

export interface ContactTransaction {
  id: string;
  description: string;
  amount: number;
  paid_amount: number | null;
  type: 'receita' | 'despesa';
  date: string;
  due_date: string | null;
  is_paid: boolean;
  bank_id: string | null;
  category: { id: string; name: string; color: string | null } | null;
  bank: { id: string; name: string } | null;
}

export function useContactTransactions(contactId: string | undefined, invisibleBankIds?: string[]) {
  return useQuery({
    queryKey: ['contact-transactions', contactId, invisibleBankIds],
    queryFn: async () => {
      if (!contactId) return [];

      // fetchAllPages: o status de inadimplência é derivado da lista completa —
      // se o PostgREST cortar em 1000, título vencido pode sumir do cálculo.
      return fetchAllPages<ContactTransaction>(() => {
        let query = supabase
          .from('transactions')
          .select(`
            id,
            description,
            amount,
            paid_amount,
            type,
            date,
            due_date,
            is_paid,
            bank_id,
            category:categories(id, name, color),
            bank:banks(id, name)
          `)
          .is('deleted_at', null)
          .eq('contact_id', contactId);

        // Exclude transactions from invisible banks
        if (invisibleBankIds && invisibleBankIds.length > 0) {
          const notInFilter = invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
          query = query.or(`bank_id.is.null,and(${notInFilter})`);
        }

        return query.order('date', { ascending: false }).order('id', { ascending: false });
      });
    },
    enabled: !!contactId,
  });
}

export function useContactFinancialStatus(contactId: string | undefined, transactions?: ContactTransaction[]) {
  const today = new Date().toISOString().split('T')[0];
  
  if (!transactions) return { isInadimplente: false, overdueCount: 0 };
  
  const overdueTransactions = transactions.filter(
    t => !t.is_paid && t.due_date && t.due_date < today
  );
  
  return {
    isInadimplente: overdueTransactions.length > 0,
    overdueCount: overdueTransactions.length,
  };
}
