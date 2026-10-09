import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export type TipoPa = 'ME' | 'TR' | 'AN';
export const ROTULO_TIPO_PA: Record<TipoPa, string> = { ME: 'Mensal', TR: 'Trimestral', AN: 'Anual' };

export interface DarfRow {
  id: string;
  contact_id: string;
  codigo_receita: string;
  extensao: string;
  tipo_pa: TipoPa;
  data_pa: string;
  vencimento: string;
  valor_imposto: number;
  data_consolidacao: string;
  valor_principal: number | null;
  valor_multa: number | null;
  percentual_multa: number | null;
  valor_juros: number | null;
  percentual_juros: number | null;
  valor_total: number | null;
  valido_ate: string | null;
  numero_documento: string | null;
  codigo_barras: string | null;
  created_at: string;
  contacts: { name: string | null; razao_social: string | null; display_name: string | null; document: string | null } | null;
}

export interface ClienteDarf { id: string; nome: string; documento: string }

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Clientes ativos com CNPJ: os que podem ter DARF gerado. */
export function useClientesDarf() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-darf-clientes', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<ClienteDarf[]> => {
      const contatos = await fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null }>(
        () => supabase.from('contacts').select('id, name, razao_social, display_name, document')
          .eq('company_id', company!.id).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).order('name').order('id'));
      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c) => ({ id: c.id, nome: c.razao_social || c.name || 'Cliente', documento: c.document ?? '' }));
    },
  });
}

/** Histórico de DARFs gerados. Colunas explícitas: o caminho do PDF nunca sai do servidor. */
export function useDarfsGerados() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-darfs', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<DarfRow[]> =>
      fetchAllPages<DarfRow>(() => supabase.from('serpro_darfs')
        .select('id, contact_id, codigo_receita, extensao, tipo_pa, data_pa, vencimento, valor_imposto, data_consolidacao, valor_principal, valor_multa, percentual_multa, valor_juros, percentual_juros, valor_total, valido_ate, numero_documento, codigo_barras, created_at, contacts(name, razao_social, display_name, document)')
        .eq('company_id', company!.id).order('created_at', { ascending: false }).order('id')),
  });
}

export interface EntradaDarfTela {
  contactId: string;
  receita: string;
  extensao: string;
  tipoPa: TipoPa;
  dataPa: string;
  vencimento: string;
  valorImposto: string;
  dataConsolidacao: string;
  numeroReferencia?: string;
  observacao?: string;
}

export interface ResultadoDarf {
  ok: boolean;
  error?: string;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  jaGerado?: boolean;
  jaTem?: boolean;
  id?: string;
  url?: string;
  valor_total?: number | null;
  valido_ate?: string | null;
  codigo_barras?: string;
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-darfs'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useGerarDarf() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: EntradaDarfTela & { novo?: boolean }) =>
      invocarSerpro<ResultadoDarf>('serpro-darf', {
        action: 'gerar', contact_id: v.contactId, receita: v.receita, extensao: v.extensao, tipo_pa: v.tipoPa, data_pa: v.dataPa,
        vencimento: v.vencimento, valor_imposto: v.valorImposto, data_consolidacao: v.dataConsolidacao,
        numero_referencia: v.numeroReferencia, observacao: v.observacao, confirmar_emissao: true, novo: v.novo,
      }),
    onSuccess: () => invalidar(),
  });
}

export function useCodigoBarrasDarf() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<ResultadoDarf>('serpro-darf', { action: 'codigo_barras', id: v.id }),
    onSuccess: () => invalidar(),
  });
}

export function useLinkDarf() {
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<ResultadoDarf>('serpro-darf', { action: 'link', id: v.id }),
  });
}

/** Hoje (Brasília) se for dia útil; senão, a próxima segunda. Feriado nacional não é tratado: a Receita pode recusar. */
export function proximoDiaUtil(agora = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 3600_000);
  const dia = d.getUTCDay();
  if (dia === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (dia === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
