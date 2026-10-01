import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
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

export interface LinhaMensal { metrica: 'auto_concluidas' | 'auto_criadas' | 'alertas' | 'envios' | 'relatorios'; mes: string; sub: string | null; n: number }

/** O que o sistema fez por mês no lugar da equipe (função no banco, só para a equipe da empresa). */
export function useIndicadoresMensais(meses = 6) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['indicadores-mensais', company?.id, meses],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaMensal[]> => {
      const { data, error } = await supabase.rpc('gestao360_indicadores_mensais', { p_meses: meses });
      if (error) throw error;
      return ((data as unknown as LinhaMensal[] | null) ?? []);
    },
  });
}

/** Envios ao cliente (cada um grava uma linha em client_envios): mês, canal e quem enviou. */
export function useEnviosPorMes(meses = 6) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['indicadores-envios', company?.id, meses],
    enabled: !!company?.id,
    queryFn: async () => {
      const d = new Date(); d.setMonth(d.getMonth() - (meses - 1)); d.setDate(1); d.setHours(0, 0, 0, 0);
      return fetchAllPages<{ enviado_em: string; canal: string; enviado_por: string | null }>(() => supabase.from('client_envios').select('enviado_em, canal, enviado_por')
        .eq('company_id', company!.id).gte('enviado_em', d.toISOString()).order('enviado_em'));
    },
  });
}

export interface MetricaMae { mes: string; valor: number; nota: string | null }

/** Processos manuais eliminados no mês: registrada à mão por administrador, nada é calculado nem inventado. */
export function useMetricaMae() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['metrica-mae', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<MetricaMae[]> => fetchAllPages<MetricaMae>(() => supabase.from('metrica_mae').select('mes, valor, nota').eq('company_id', company!.id).order('mes')),
  });
}

export function useSalvarMetricaMae() {
  const qc = useQueryClient();
  const { company } = useCompany();
  const { profile } = useProfile();
  return useMutation({
    mutationFn: async (v: { mes: string; valor: number; nota: string }) => {
      const { error } = await supabase.from('metrica_mae').upsert({
        company_id: company!.id, mes: v.mes, valor: v.valor, nota: v.nota.trim() || null, registrado_por: profile?.id ?? null, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'company_id,mes' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metrica-mae'] }),
  });
}
