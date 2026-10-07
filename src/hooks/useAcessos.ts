import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Contas da pessoa logada — um login pode ter vários acessos (um por empresa;
 * no futuro também o Portal do Cliente). A conta ativa é da SESSÃO de login,
 * guardada no banco (`trocar_conta`); o banco confere o acesso a cada consulta.
 */
export interface Acesso {
  tipo: 'empresa' | 'portal';
  company_id: string;
  contact_id: string | null;
  nome: string;
  documento: string | null;
  papel: string;
  atual: boolean;
}

/** Avisa as outras abas que a conta mudou (a sessão é compartilhada entre elas). */
export const CONTA_TROCADA_KEY = 'ca-conta-trocada';

export const PAPEL_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  colaborador: 'Colaborador',
  portal: 'Portal do Cliente',
};

export async function buscarAcessos(): Promise<Acesso[]> {
  const { data, error } = await (supabase as any).rpc('meus_acessos');
  if (error) throw error;
  return (data ?? []) as Acesso[];
}

export function useAcessos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meus-acessos', user?.id],
    queryFn: buscarAcessos,
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });
}

/**
 * Troca a conta da sessão e recarrega o app inteiro: cache, menus e permissões
 * carregados são da conta anterior. As outras abas recarregam pelo aviso.
 */
export async function trocarConta(companyId: string, destino = '/') {
  const { error } = await (supabase as any).rpc('trocar_conta', { p_company_id: companyId });
  if (error) throw error;
  try {
    localStorage.setItem(CONTA_TROCADA_KEY, String(Date.now()));
  } catch {
    /* sem storage: as outras abas só mudam ao recarregar */
  }
  window.location.assign(destino);
}
