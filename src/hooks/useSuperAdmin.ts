import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useSuperAdmin() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_super_admin, allowed_modules')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    isSuperAdmin: data?.is_super_admin ?? false,
    allowedModules: (data?.allowed_modules as string[]) ?? ['financeiro', 'crm', 'relatorios'],
    isLoading,
  };
}
