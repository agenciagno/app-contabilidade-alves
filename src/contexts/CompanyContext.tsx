import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Empresa em contexto para as telas do Financeiro — sempre a própria empresa
 * do usuário logado (multi-tenant via RLS, sem troca de contexto entre
 * empresas). Cada empresa/cliente que comprar o módulo acessa com sua própria
 * conta e já enxerga só os próprios dados.
 */
export function useActiveCompany() {
  const { user } = useAuth();

  const { data: ownCompanyId } = useQuery({
    queryKey: ['own-company-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return (data?.company_id as string) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ownCompanyId: ownCompanyId ?? undefined,
    activeCompanyId: ownCompanyId ?? undefined,
  };
}
