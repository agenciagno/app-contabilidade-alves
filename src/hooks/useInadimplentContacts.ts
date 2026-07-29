import { useMemo } from 'react';
import { useContacts } from './useContacts';
import { useTransactions } from './useTransactions';
import { isEffectivelyPaid } from '@/lib/financial-utils';
import { startOfDay, format } from 'date-fns';

export interface InadimplentContact {
  id: string;
  name: string;
  type: 'cliente' | 'fornecedor' | 'ambos';
  overdueCount: number;
  totalOverdue: number;
  oldestDueDate: string;
}

export function useInadimplentContacts() {
  const { contacts, isLoading: contactsLoading } = useContacts();
  const { transactions, isLoading: transactionsLoading } = useTransactions();
  
  const inadimplentContacts = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const contactsMap = new Map<string, InadimplentContact>();
    
    // Recebíveis vencidos e em aberto. Só `receita`: conta a pagar vencida é dívida da CA com
    // fornecedor, não inadimplência de cliente — sem esse filtro o selo somava as duas coisas
    // (R$ 19.328 no lugar de R$ 10.492 em 29/07/2026). Regra de "pago" é a estrita, igual às RPCs.
    const overdueTransactions = transactions.filter(t => {
      if (t.type !== 'receita') return false;
      if (t.is_transfer) return false;
      if (isEffectivelyPaid(t) || !t.due_date || !t.contact_id) return false;
      return t.due_date < todayStr;
    });
    
    // Group by contact
    overdueTransactions.forEach(t => {
      const contact = contacts.find(c => c.id === t.contact_id);
      if (!contact) return;
      
      const existing = contactsMap.get(contact.id);
      if (existing) {
        existing.overdueCount += 1;
        existing.totalOverdue += Number(t.amount);
        if (t.due_date && t.due_date < existing.oldestDueDate) {
          existing.oldestDueDate = t.due_date;
        }
      } else {
        contactsMap.set(contact.id, {
          id: contact.id,
          name: contact.name,
          type: contact.type as 'cliente' | 'fornecedor' | 'ambos',
          overdueCount: 1,
          totalOverdue: Number(t.amount),
          oldestDueDate: t.due_date!,
        });
      }
    });
    
    // Convert to array and sort by oldest due date
    return Array.from(contactsMap.values()).sort(
      (a, b) => new Date(a.oldestDueDate).getTime() - new Date(b.oldestDueDate).getTime()
    );
  }, [contacts, transactions]);
  
  const totalAmount = useMemo(() => {
    return inadimplentContacts.reduce((sum, c) => sum + c.totalOverdue, 0);
  }, [inadimplentContacts]);
  
  return {
    inadimplentContacts,
    count: inadimplentContacts.length,
    totalAmount,
    isLoading: contactsLoading || transactionsLoading,
  };
}
