import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export type Modalidade = 'PARCSN' | 'PARCSN-ESP' | 'PERTSN' | 'RELPSN' | 'PARCMEI' | 'PARCMEI-ESP' | 'PERTMEI' | 'RELPMEI';
/** Simples e MEI (09/10/2026): cada cliente usa as 4 do seu regime; a primeira de cada grupo é a ordinária. */
export const MODALIDADES: { mod: Modalidade; rotulo: string; mei?: boolean }[] = [
  { mod: 'PARCSN', rotulo: 'Parcelamento ordinário' },
  { mod: 'PARCSN-ESP', rotulo: 'Parcelamento especial' },
  { mod: 'PERTSN', rotulo: 'PERT-SN' },
  { mod: 'RELPSN', rotulo: 'RELP-SN' },
  { mod: 'PARCMEI', rotulo: 'Parcelamento do MEI', mei: true },
  { mod: 'PARCMEI-ESP', rotulo: 'Parcelamento especial do MEI', mei: true },
  { mod: 'PERTMEI', rotulo: 'PERT-MEI', mei: true },
  { mod: 'RELPMEI', rotulo: 'RELP-MEI', mei: true },
];
export const modalidadesDoRegime = (regime: string | null) => MODALIDADES.filter((m) => !!m.mei === (regime === 'mei'));
export const ROTULO_MOD = Object.fromEntries(MODALIDADES.map((m) => [m.mod, m.rotulo])) as Record<Modalidade, string>;

export interface PedidoRow { id: string; contact_id: string; modalidade: Modalidade; numero: number; data_pedido: string | null; situacao: string | null; data_situacao: string | null; ativo: boolean }
export interface ParcelaRow { id: string; contact_id: string; modalidade: Modalidade; parcela: number; valor: number | null }
export interface GuiaRow { id: string; contact_id: string; modalidade: Modalidade; parcela: number; gerado_em: string }
export interface ConsultaRow { contact_id: string; modalidade: Modalidade; consultado_em: string; pedidos: number; ativos: number; sem_procuracao: boolean; erro: string | null }

export interface LinhaParcelamentos {
  contact_id: string;
  nome: string;
  documento: string;
  /** simples_nacional ou mei: decide quais modalidades a consulta olha. */
  regime: string | null;
  /** Filial: o parcelamento é do CNPJ da matriz, então a consulta é bloqueada. */
  filial: boolean;
  consultas: ConsultaRow[];
  pedidos: PedidoRow[];
  parcelas: ParcelaRow[];
  guias: GuiaRow[];
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Mês corrente no formato AAAAMM, pelo horário de Brasília. */
export const competenciaAtual = (agora = new Date()) => {
  const d = new Date(agora.getTime() - 3 * 3600_000).toISOString();
  return Number(d.slice(0, 4) + d.slice(5, 7));
};
export const rotuloParcela = (p: number) => `${String(p).slice(4)}/${String(p).slice(0, 4)}`;

export const consultadoEm = (l: LinhaParcelamentos): string | null =>
  l.consultas.reduce<string | null>((max, c) => (!max || c.consultado_em > max ? c.consultado_em : max), null);

export const pedidosAtivos = (l: LinhaParcelamentos) => l.pedidos.filter((p) => p.ativo);
export const modalidadesAtivas = (l: LinhaParcelamentos): Modalidade[] => [...new Set(pedidosAtivos(l).map((p) => p.modalidade))];

export const parcelasAtrasadas = (l: LinhaParcelamentos, atual = competenciaAtual()) => l.parcelas.filter((p) => p.parcela < atual);
export const parcelasDoMes = (l: LinhaParcelamentos, atual = competenciaAtual()) => l.parcelas.filter((p) => p.parcela === atual);
export const somaValor = (ps: ParcelaRow[]) => ps.reduce((s, p) => s + (p.valor ?? 0), 0);

export type EstadoParcelamento = 'filial' | 'nao_consultado' | 'sem_parcelamento' | 'em_dia' | 'atrasado';
export function estadoParcelamento(l: LinhaParcelamentos, atual = competenciaAtual()): EstadoParcelamento {
  if (l.filial) return 'filial';
  if (!l.consultas.length) return 'nao_consultado';
  if (!pedidosAtivos(l).length) return 'sem_parcelamento';
  return parcelasAtrasadas(l, atual).length ? 'atrasado' : 'em_dia';
}

/** Quantas chamadas o próximo "Consultar" deve fazer (estimativa igual à regra da função): 1ª vez = 4 modalidades; depois, PARCSN + as que já tiveram pedido; mais 1 por modalidade ativa. */
export function chamadasDaConsulta(l: LinhaParcelamentos): number {
  const doRegime = modalidadesDoRegime(l.regime);
  if (!l.consultas.length) return doRegime.length + modalidadesAtivas(l).length;
  const comHistorico = new Set(l.consultas.filter((c) => c.pedidos > 0).map((c) => c.modalidade));
  comHistorico.add(doRegime[0].mod);
  return comHistorico.size + modalidadesAtivas(l).length;
}

export function useMatrizParcelamentos() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-parcelamentos-matriz', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaParcelamentos[]> => {
      const companyId = company!.id;
      const contatos = await fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null; tax_regime: string | null }>(
        () => supabase.from('contacts').select('id, name, razao_social, display_name, document, tax_regime')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).in('tax_regime', ['simples_nacional', 'mei']).order('name').order('id'));
      const consultas = await fetchAllPages<ConsultaRow>(
        () => supabase.from('serpro_parcelamentos_consultas').select('contact_id, modalidade, consultado_em, pedidos, ativos, sem_procuracao, erro').eq('company_id', companyId).order('contact_id').order('modalidade'));
      const pedidos = await fetchAllPages<PedidoRow>(
        () => supabase.from('serpro_parcelamentos').select('id, contact_id, modalidade, numero, data_pedido, situacao, data_situacao, ativo').eq('company_id', companyId).order('contact_id').order('numero'));
      const parcelas = await fetchAllPages<ParcelaRow>(
        () => supabase.from('serpro_parcelas_abertas').select('id, contact_id, modalidade, parcela, valor').eq('company_id', companyId).order('contact_id').order('parcela'));
      // Só o que a tela usa: o caminho do PDF nunca sai do servidor.
      const guias = await fetchAllPages<GuiaRow>(
        () => supabase.from('serpro_parcelas_guias').select('id, contact_id, modalidade, parcela, gerado_em').eq('company_id', companyId).order('gerado_em', { ascending: false }).order('id'));

      const agrupar = <T extends { contact_id: string }>(linhas: T[]) => {
        const m = new Map<string, T[]>();
        for (const l of linhas) { const a = m.get(l.contact_id) ?? []; a.push(l); m.set(l.contact_id, a); }
        return m;
      };
      const cPor = agrupar(consultas), pPor = agrupar(pedidos), aPor = agrupar(parcelas), gPor = agrupar(guias);
      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaParcelamentos => ({
          contact_id: c.id,
          nome: c.razao_social || c.name || 'Cliente',
          documento: c.document ?? '',
          regime: c.tax_regime ?? null,
          filial: digitos(c.document).slice(8, 12) !== '0001',
          consultas: cPor.get(c.id) ?? [],
          pedidos: pPor.get(c.id) ?? [],
          parcelas: aPor.get(c.id) ?? [],
          guias: gPor.get(c.id) ?? [],
        }));
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-parcelamentos)
export interface ResultadoParcelamentos {
  ok: boolean;
  recente?: boolean;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
  consultadas?: number;
  ativos?: number;
  parcelas?: number;
  modalidades?: { modalidade: Modalidade; pedidos: number; ativos: number; parcelas: number; semProcuracao?: boolean; erro?: string }[];
  url?: string;
  jaGerado?: boolean;
  id?: string | null;
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-parcelamentos-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useConsultarParcelamentos() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; force?: boolean; todas?: boolean }) =>
      invocarSerpro<ResultadoParcelamentos>('serpro-parcelamentos', { action: 'consultar', contact_id: v.contactId, force: v.force, todas: v.todas }),
    onSuccess: () => invalidar(),
  });
}

export function useGerarGuiaParcela() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; modalidade: Modalidade; parcela: number; novo?: boolean }) =>
      invocarSerpro<ResultadoParcelamentos>('serpro-parcelamentos', {
        action: 'gerar_guia', contact_id: v.contactId, modalidade: v.modalidade, parcela: v.parcela, confirmar_emissao: true, novo: v.novo,
      }),
    onSuccess: () => invalidar(),
  });
}

export function useLinkGuia() {
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<ResultadoParcelamentos>('serpro-parcelamentos', { action: 'link', id: v.id }),
  });
}
