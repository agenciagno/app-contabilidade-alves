import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';

export function usePendingApprovals() {
  const { isSuperAdmin } = useUserRole();
  const { company } = useCompany();
  const companyId = company?.id;

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-approvals-count', companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('status_active', false)
        .eq('company_id', companyId!);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: isSuperAdmin && !!companyId,
  });

  return { pendingCount };
}
