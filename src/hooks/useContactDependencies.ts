import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactDependencies {
  transactionCount: number;
  recurringCount: number;
  hasDependencies: boolean;
}

export function useContactDependencies(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-dependencies', contactId],
    queryFn: async (): Promise<ContactDependencies> => {
      if (!contactId) {
        return { transactionCount: 0, recurringCount: 0, hasDependencies: false };
      }

      // Count transactions
      const { count: transactionCount, error: txError } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('contact_id', contactId);

      if (txError) throw txError;

      // Count recurring transactions
      const { count: recurringCount, error: recError } = await supabase
        .from('recurring_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId);

      if (recError) throw recError;

      const txCount = transactionCount || 0;
      const recCount = recurringCount || 0;

      return {
        transactionCount: txCount,
        recurringCount: recCount,
        hasDependencies: txCount > 0 || recCount > 0,
      };
    },
    enabled: !!contactId,
  });
}
