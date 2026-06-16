import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactRecurring {
  id: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  frequency: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  category?: { id: string; name: string; color: string } | null;
}

const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export function useContactRecurrings(contactId: string) {
  const query = useQuery({
    queryKey: ['contact-recurrings', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select(`
          id,
          description,
          amount,
          type,
          frequency,
          is_active,
          start_date,
          end_date,
          category:categories(id, name, color)
        `)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ContactRecurring[];
    },
    enabled: !!contactId,
  });

  return {
    ...query,
    frequencyLabels,
  };
}
