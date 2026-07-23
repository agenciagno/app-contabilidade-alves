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

  // Empresa interna (Contabilidade Alves) × cliente externo do módulo Financeiro —
  // distingue pela presença do módulo "contatos" (CRM completo da CA, plano "grosso";
  // clientes que só compraram o Financeiro nunca têm esse módulo). Usado para decidir
  // se telas do Financeiro usam os cadastros internos (Contatos, Eventos Contábeis) ou
  // os cadastros do módulo vendido (Clientes & Fornecedores, Categorias).
  const { data: planModules } = useQuery({
    queryKey: ['own-company-plan-modules', ownCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('plan_modules')
        .eq('id', ownCompanyId!)
        .single();
      if (error) throw error;
      return (data?.plan_modules as string[]) ?? [];
    },
    enabled: !!ownCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const isInternalCompany = (planModules ?? []).some((m) => m === 'contatos' || m === 'clientes');

  return {
    ownCompanyId: ownCompanyId ?? undefined,
    activeCompanyId: ownCompanyId ?? undefined,
    isInternalCompany,
  };
}
