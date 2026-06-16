import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

      const { data, error } = await query.order('date', { ascending: false });

      if (error) throw error;
      return data as ContactTransaction[];
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
