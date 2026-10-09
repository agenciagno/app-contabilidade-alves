/**
 * Mais dados da Receita no que já existe (Rodada 5 do Monitoramento, 09/10/2026), pela função `serpro-extras`:
 * DTE (Caixa Postal), regime de apuração (Simples), e-Processo (tela própria) e vínculos da CA na Redesim (Procurações e Certificados).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';
import type { Selo } from '@/lib/monitorEstados';

export interface DteRow { contact_id: string; consultado_em: string; indicador: number | null; status: string | null }
export interface RegimeRow { contact_id: string; ano: number; regime: string | null; data_opcao: string | null; consultado_em: string }
export interface EProcessoRow { id: string; contact_id: string; numero: string; relacao: string | null; data_protocolo: string | null; tipo: string | null; subtipo: string | null; localizacao: string | null; situacao: string | null; ultimo_encaminhamento: string | null }
export interface EProcessoConsulta { contact_id: string; consultado_em: string; total: number }
export interface VinculoRow { cnpj: string; contact_id: string | null; tipo_estabelecimento: string | null; situacao: string | null; uf: string | null; municipio: string | null; consultado_em: string }

export interface ResultadoExtra { ok: boolean; error?: string; semProcuracao?: boolean; foraDoMonitoramento?: boolean; indicador?: number; status?: string | null; regime?: string | null; processos?: number; vinculos?: number }

/** DTE: aderiu (0 ou 2) é em dia; só Caixa Postal do Simples (1) ou não aderiu (-1) é pendência. Não entra na situação da linha. */
export function seloDte(d: DteRow | null | undefined): Selo | null {
  if (!d) return { estado: 'nao_verificado', motivo: 'DTE não consultado' };
  switch (d.indicador) {
    case 0: return { estado: 'em_dia', motivo: 'Aderiu ao DTE' };
    case 2: return { estado: 'em_dia', motivo: 'Aderiu ao DTE e ao DTE-SN' };
    case 1: return { estado: 'pendencia', motivo: 'Só DTE do Simples' };
    case -1: return { estado: 'pendencia', motivo: 'Não aderiu ao DTE' };
    default: return { estado: 'nao_verificado', motivo: 'DTE: CNPJ não reconhecido' };
  }
}

export const rotuloRegime = (r: string | null | undefined) => {
  const v = (r ?? '').toLowerCase();
  if (!v) return null;
  if (v === 'sem_opcao') return 'Sem opção no ano';
  if (v.includes('caixa')) return 'Regime de caixa';
  if (v.includes('compet')) return 'Regime de competência';
  return r ?? null;
};

export function useDteMapa(enabled = true) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-dte', company?.id],
    enabled: enabled && !!company?.id,
    queryFn: async () => new Map((await fetchAllPages<DteRow>(() => supabase.from('serpro_dte').select('contact_id, consultado_em, indicador, status').eq('company_id', company!.id).order('contact_id'))).map((d) => [d.contact_id, d])),
  });
}

export function useRegimeMapa(ano: number) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-regime', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async () => new Map((await fetchAllPages<RegimeRow>(() => supabase.from('serpro_regime_apuracao').select('contact_id, ano, regime, data_opcao, consultado_em').eq('company_id', company!.id).eq('ano', ano).order('contact_id'))).map((d) => [d.contact_id, d])),
  });
}

export interface LinhaEProcesso { contact_id: string; nome: string; documento: string; regime: string | null; filial: boolean; consulta: EProcessoConsulta | null; processos: EProcessoRow[] }

export function useMatrizEProcesso() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-eprocesso', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaEProcesso[]> => {
      const companyId = company!.id;
      const [contatos, consultas, processos] = await Promise.all([
        fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null; tax_regime: string | null }>(
          () => supabase.from('contacts').select('id, name, razao_social, display_name, document, tax_regime').eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).order('name').order('id')),
        fetchAllPages<EProcessoConsulta>(() => supabase.from('serpro_eprocesso_consultas').select('contact_id, consultado_em, total').eq('company_id', companyId).order('contact_id')),
        fetchAllPages<EProcessoRow>(() => supabase.from('serpro_eprocessos').select('id, contact_id, numero, relacao, data_protocolo, tipo, subtipo, localizacao, situacao, ultimo_encaminhamento').eq('company_id', companyId).order('data_protocolo', { ascending: false }).order('id')),
      ]);
      const cPor = new Map(consultas.map((c) => [c.contact_id, c]));
      const pPor = new Map<string, EProcessoRow[]>();
      for (const p of processos) pPor.set(p.contact_id, [...(pPor.get(p.contact_id) ?? []), p]);
      const dig = (v: string | null) => (v ?? '').replace(/\D/g, '');
      return contatos
        .filter((c) => { const d = dig(c.document); return d.length === 14 && !['26764962000100', '08801596000130'].includes(d); })
        .map((c) => ({
          contact_id: c.id, nome: c.razao_social || c.name || 'Cliente', documento: c.document ?? '', regime: c.tax_regime ?? null,
          filial: dig(c.document).slice(8, 12) !== '0001', consulta: cPor.get(c.id) ?? null, processos: pPor.get(c.id) ?? [],
        }));
    },
  });
}

export function useVinculosRedesim() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-redesim', company?.id],
    enabled: !!company?.id,
    queryFn: async () => fetchAllPages<VinculoRow>(() => supabase.from('serpro_redesim_vinculos').select('cnpj, contact_id, tipo_estabelecimento, situacao, uf, municipio, consultado_em').eq('company_id', company!.id).order('cnpj')),
  });
}

function useAcao(action: string, chaves: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId?: string; ano?: number }) => invocarSerpro<ResultadoExtra>('serpro-extras', { action, contact_id: v.contactId, ano: v.ano }),
    onSuccess: () => { for (const k of [...chaves, ['serpro-consumo']]) qc.invalidateQueries({ queryKey: k }); },
  });
}

export const useConsultarDte = () => useAcao('dte', [['serpro-dte']]);
export const useConsultarRegime = () => useAcao('regime', [['serpro-regime']]);
export const useConsultarEProcesso = () => useAcao('eprocesso', [['serpro-eprocesso']]);
export const useAtualizarVinculos = () => useAcao('vinculos', [['serpro-redesim']]);
