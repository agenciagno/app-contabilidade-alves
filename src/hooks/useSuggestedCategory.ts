import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Sugestão de categoria por histórico de contraparte (regra simples, sem IA).
// Retorna a última categoria usada em lançamentos do mesmo tipo para a contraparte
// informada (prioriza party_id; se ausente, usa contact_id).
export function useSuggestedCategory(params: {
  partyId?: string | null;
  contactId?: string | null;
  type: 'receita' | 'despesa';
  enabled?: boolean;
}) {
  const { partyId, contactId, type, enabled = true } = params;
  const key = partyId ? `party:${partyId}` : contactId ? `contact:${contactId}` : null;

  return useQuery({
    queryKey: ['suggested-category', key, type],
    enabled: enabled && !!key,
    staleTime: 1000 * 60,
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('category_id, created_at')
        .is('deleted_at', null)
        .eq('is_transfer', false)
        .eq('type', type)
        .not('category_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (partyId) query = query.eq('party_id', partyId);
      else if (contactId) query = query.eq('contact_id', contactId);

      const { data, error } = await query;
      if (error) throw error;
      return (data?.[0]?.category_id ?? null) as string | null;
    },
  });
}
