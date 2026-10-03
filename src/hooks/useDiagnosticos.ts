import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';
import { fetchAllPages } from '@/lib/fetch-all';
import type { PerfilContato } from '@/lib/diagnosticos';

/** Do cadastro dos clientes ativos: o que o Perfil precisa (porte, cidade, início do contrato, atividade e se tem como avisar). */
export function usePerfilCarteira() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['diagnosticos-perfil', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, PerfilContato>> => {
      const linhas = await fetchAllPages<{ id: string; porte: string | null; city: string | null; state: string | null; data_inicio_contrato: string | null; cnae_principal: { codigo?: string; descricao?: string } | null; email: string | null; whatsapp: string | null; phone: string | null }>(
        () => supabase.from('contacts').select('id, porte, city, state, data_inicio_contrato, cnae_principal, email, whatsapp, phone')
          .eq('company_id', company!.id).eq('status_cliente', STATUS_MONITORADO).order('id'));
      return new Map(linhas.map((c) => [c.id, {
        contact_id: c.id, porte: c.porte, cidade: c.city, uf: c.state, inicioContrato: c.data_inicio_contrato,
        cnae: c.cnae_principal?.codigo ? { codigo: String(c.cnae_principal.codigo), descricao: String(c.cnae_principal.descricao ?? '') } : null,
        temEmail: !!c.email?.trim(), temWhatsapp: (c.whatsapp || c.phone || '').replace(/\D/g, '').length >= 10,
      } as PerfilContato] as const));
    },
  });
}

export interface FotoCarteira {
  dia: string; monitorados: number; pgdas_clientes_em_falta: number; pgdas_competencias_em_falta: number;
  mensagens_clientes: number; sem_procuracao: number; sitfis_com_pendencia: number;
}

/** Foto diária da carteira (rotina das 08:20). O histórico começa no dia em que a rotina foi ligada. */
export function useFotosCarteira() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['carteira-snapshots', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<FotoCarteira[]> => fetchAllPages<FotoCarteira>(() => supabase.from('carteira_snapshots')
      .select('dia, monitorados, pgdas_clientes_em_falta, pgdas_competencias_em_falta, mensagens_clientes, sem_procuracao, sitfis_com_pendencia')
      .eq('company_id', company!.id).order('dia')),
  });
}
