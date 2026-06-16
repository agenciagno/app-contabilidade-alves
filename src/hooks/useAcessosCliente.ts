import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PORTAL_LABELS: Record<string, string> = {
  gov_br: 'GOV.BR',
  siare: 'SIARE (MG)',
  ecac: 'eCac',
  prefeitura_nfse: 'Prefeitura / NFS-e',
  sefaz_estadual: 'SEFAZ Estadual',
  certificado_digital: 'Certificado Digital',
  esocial: 'e-Social',
  conectividade_social: 'Conectividade Social',
  outros: 'Outros',
};

export const PORTAL_OPTIONS = Object.entries(PORTAL_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export type PortalTipo = keyof typeof PORTAL_LABELS;

export interface AcessoPortal {
  id: string;
  contact_id: string;
  company_id: string;
  portal: PortalTipo;
  portal_label: string | null;
  login: string | null;
  validade_certificado: string | null;
  observacao: string | null;
  anexo_url: string | null;
  updated_at: string;
  atualizado_por: string | null;
}
export interface SalvarAcessoInput {
  acesso_id?: string;
  contact_id: string;
  portal: PortalTipo;
  portal_label?: string | null;
  login?: string | null;
  senha?: string;
  validade_certificado?: string | null;
  observacao?: string | null;
}

export function useAcessosCliente(contactId: string | undefined) {
  return useQuery({
    queryKey: ['acessos-portais', contactId],
    queryFn: async (): Promise<AcessoPortal[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('acessos_portais')
        .select(
          'id, contact_id, company_id, portal, portal_label, login, validade_certificado, observacao, anexo_url, updated_at, atualizado_por'
        )
        .eq('contact_id', contactId)
        .order('portal', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcessoPortal[];
    },
    enabled: !!contactId,
  });
}

export function useSalvarAcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarAcessoInput) => {
      const { data, error } = await supabase.functions.invoke('cofre-salvar', {
        body: input,
      });
      if (error) {
        const mensagem = (error as any)?.context?.json?.error
          ?? (error as any)?.message
          ?? 'Falha ao chamar Edge Function cofre-salvar.';
        throw new Error(mensagem);
      }
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao salvar acesso.');
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['acessos-portais', vars.contact_id] });
    },
  });
}

export function useExcluirAcesso(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acessoId: string) => {
      const { error } = await supabase.from('acessos_portais').delete().eq('id', acessoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acessos-portais', contactId] });
    },
  });
}

export function useRevelarSenha() {
  return useMutation({
    mutationFn: async (vars: { acesso_id: string; acao: 'REVELAR' | 'COPIAR' }) => {
      const { data, error } = await supabase.functions.invoke('cofre-revelar', {
        body: vars,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao revelar senha.');
      return data.senha as string;
    },
  });
}
