import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

/** Procurações do e-CAC que o sistema usa (códigos da documentação "Serviços x Procurações"). Mesma lista da função serpro-procuracoes. */
export const PROCURACOES_BASE: { codigo: string; rotulo: string }[] = [
  { codigo: '00146', rotulo: 'PGDAS-D e DEFIS' },
  { codigo: '00006', rotulo: 'Caixa Postal' },
  { codigo: '00004', rotulo: 'Pagamentos (comprovantes)' },
  { codigo: '00060', rotulo: 'Regime de apuração (Simples)' },
  { codigo: '00002', rotulo: 'Situação fiscal' },
  { codigo: '00103', rotulo: 'DCTFWeb' },
  { codigo: '00050', rotulo: 'Domicílio Tributário (DTE)' },
  { codigo: '00051', rotulo: 'e-Processo' },
];
const ROTULO_DO = new Map(PROCURACOES_BASE.map((p) => [p.codigo, p.rotulo]));

export const DIAS_AVISO_PROCURACAO = 60;
/** Mapeou há menos que isto: pede confirmação antes de mapear de novo (a função também não cobra duas vezes em lote). */
export const HORAS_MAPA_RECENTE = 12;

interface ProcuracaoRow { contact_id: string; codigo_procuracao: string; status: string; data_fim: string | null; verificado_em: string | null }

export type SituacaoProcuracao = 'total' | 'parcial' | 'sem' | 'vencida' | 'nao_mapeado';

export interface LinhaProcuracao {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  filial: boolean;
  situacao: SituacaoProcuracao;
  /** Menor data de fim entre as procurações ativas (AAAA-MM-DD). */
  venceEm: string | null;
  diasParaVencer: number | null;
  /** Serviços sem procuração ativa (rótulos). */
  faltam: string[];
  mapeadoEm: string | null;
  /**
   * O sensor diário grátis da Caixa Postal devolveu "x" (sem procuração) para um cliente que o mapa pago dava como completo ou parcial:
   * data da última leitura do sensor. Quando o cliente outorgar de novo e o sensor voltar a ler, some. Mapear (R$ 0,24) confirma.
   */
  perdidaEm: string | null;
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export function derivarProcuracao(rows: ProcuracaoRow[], hoje = hojeISO()): Pick<LinhaProcuracao, 'situacao' | 'venceEm' | 'diasParaVencer' | 'faltam' | 'mapeadoEm'> {
  const base = rows.filter((r) => ROTULO_DO.has(r.codigo_procuracao));
  if (!base.length) return { situacao: 'nao_mapeado', venceEm: null, diasParaVencer: null, faltam: [], mapeadoEm: null };

  // A data manda: "ativa" gravada há semanas pode já ter vencido.
  const vigente = (r: ProcuracaoRow) => r.status === 'ativa' && (!r.data_fim || r.data_fim >= hoje);
  const ativas = base.filter(vigente);
  const faltam = PROCURACOES_BASE.filter((p) => !ativas.some((r) => r.codigo_procuracao === p.codigo)).map((p) => p.rotulo);
  const datas = ativas.map((r) => r.data_fim).filter((d): d is string => !!d).sort();
  const venceEm = datas[0] ?? null;
  const mapeadoEm = base.map((r) => r.verificado_em).filter((v): v is string => !!v).sort().pop() ?? null;

  let situacao: SituacaoProcuracao;
  if (faltam.length === 0) situacao = 'total';
  else if (ativas.length > 0) situacao = 'parcial';
  else if (base.some((r) => r.status === 'expirada' || (r.status === 'ativa' && r.data_fim && r.data_fim < hoje))) situacao = 'vencida';
  else situacao = 'sem';
  return { situacao, venceEm, diasParaVencer: venceEm ? diasEntre(hoje, venceEm) : null, faltam, mapeadoEm };
}

export const vencendo = (l: LinhaProcuracao) => l.diasParaVencer !== null && l.diasParaVencer <= DIAS_AVISO_PROCURACAO;

export function useProcuracoes() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-procuracoes', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaProcuracao[]> => {
      const companyId = company!.id;
      const contatos = await fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null; tax_regime: string | null }>(
        () => supabase.from('contacts').select('id, name, razao_social, display_name, document, tax_regime')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).order('name').order('id'));
      const linhas = await fetchAllPages<ProcuracaoRow>(
        () => supabase.from('serpro_procuracoes').select('contact_id, codigo_procuracao, status, data_fim, verificado_em')
          .eq('company_id', companyId).eq('fonte', 'integra_procuracoes').order('contact_id').order('codigo_procuracao'));
      const sonda = await fetchAllPages<{ contact_id: string; status: string; verificado_em: string | null }>(
        () => supabase.from('serpro_procuracoes').select('contact_id, status, verificado_em')
          .eq('company_id', companyId).eq('fonte', 'sonda_caixa_postal').eq('codigo_procuracao', '00006').order('contact_id'));
      const sondaAusente = new Map(sonda.filter((x) => x.status === 'ausente').map((x) => [x.contact_id, x.verificado_em]));
      const porCliente = new Map<string, ProcuracaoRow[]>();
      for (const r of linhas) { const a = porCliente.get(r.contact_id) ?? []; a.push(r); porCliente.set(r.contact_id, a); }

      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaProcuracao => {
          const d = derivarProcuracao(porCliente.get(c.id) ?? []);
          return {
            contact_id: c.id,
            nome: c.razao_social || c.name || 'Cliente',
            documento: c.document ?? '',
            regime: c.tax_regime ?? null,
            filial: digitos(c.document).slice(8, 12) !== '0001',
            ...d,
            perdidaEm: d.situacao === 'total' || d.situacao === 'parcial' ? sondaAusente.get(c.id) ?? null : null,
          };
        });
    },
  });
}

export interface ResultadoMapa { ok: boolean; foraDoMonitoramento?: boolean; error?: string; codigos?: string[] }

/** Mapeia UM cliente (1 consulta ao Serpro, cobrada mesmo quando volta vazia). */
export function useMapearProcuracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId: string }) => invocarSerpro<ResultadoMapa>('serpro-procuracoes', { action: 'mapear', contact_id: v.contactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serpro-procuracoes'] });
      qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
    },
  });
}
