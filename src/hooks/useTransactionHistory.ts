import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GlobalLog } from '@/hooks/useGlobalLogs';

// Histórico de alterações de um lançamento (auditoria).
// Reaproveita global_logs (módulo FINANCEIRO) filtrando por entity_id = id da transação.
export function useTransactionHistory(transactionId?: string | null) {
  return useQuery({
    queryKey: ['transaction-history', transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_logs')
        .select('*')
        .eq('module', 'FINANCEIRO')
        .eq('entity_id', transactionId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GlobalLog[];
    },
  });
}
