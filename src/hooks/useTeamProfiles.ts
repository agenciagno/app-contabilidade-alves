import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface TeamProfile {
  id: string;
  full_name: string | null;
}

/**
 * Usuários internos ativos (mesma lista da rota Equipe) para os menus de responsável.
 * Filtra pela empresa do usuário logado: super admin lê perfis de todas as empresas
 * (RLS), então sem esse filtro os usuários das empresas do sistema externo vazam.
 */
export function useTeamProfiles(enabled = true) {
  const { company } = useCompany();
  const companyId = company?.id;

  return useQuery<TeamProfile[]>({
    queryKey: ['team-profiles', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId!)
        .eq('status_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!companyId,
  });
}
