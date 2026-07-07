import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PortalTipo } from './useAcessosCliente';

export interface CofreGlobalRow {
  contact_id: string;
  nome_cliente: string;
  acesso_id: string;
  portal: PortalTipo;
  portal_label: string | null;
  login: string | null;
  observacao: string | null;
  validade_certificado: string | null;
  senha_atualizada_em: string | null;
  alerta_vencimento: boolean;
}

export function useCofreGlobal() {
  return useQuery({
    queryKey: ['cofre-global'],
    queryFn: async (): Promise<CofreGlobalRow[]> => {
      const { data, error } = await (supabase as any)
        .from('vw_cofre_global')
        .select(
          'contact_id, nome_cliente:cliente_nome, acesso_id, portal, portal_label, login, observacao, validade_certificado, senha_atualizada_em, alerta_vencimento'
        )
        .order('cliente_nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CofreGlobalRow[];
    },
  });
}
