import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export interface DeclaracaoRow {
  id: string;
  contact_id: string;
  periodo_apuracao: string;
  numero_declaracao: string;
  tipo: 'original' | 'retificadora';
  transmitida_em: string | null;
  malha: string | null;
  recibo_path: string | null;
  declaracao_path: string | null;
  maed_notificacao_path: string | null;
  maed_darf_path: string | null;
  visivel_portal: boolean;
}

export interface DasRow {
  id: string;
  contact_id: string;
  periodo_apuracao: string;
  numero_das: string;
  tipo_operacao: string | null;
  emitido_em: string | null;
  das_pago: boolean | null;
  vencimento: string | null;
  limite_acolhimento: string | null;
  valor_total: number | null;
  das_path: string | null;
  extrato_path: string | null;
  visivel_portal: boolean;
}

export interface LinhaPgdasd {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  /** Filial: o PGDAS-D é da matriz, então a consulta é bloqueada. */
  filial: boolean;
  /** Consulta do ANO (null = ainda não consultado: diferente de "sem declaração"). */
  consultadoEm: string | null;
  declaracoes: DeclaracaoRow[];
  das: DasRow[];
  /** Quantas vezes cada número de documento aparece em Pagamentos (Onda 1): confere o DAS e pega pagamento em duplicidade. */
  pagamentosPorDocumento: Map<string, number>;
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Período de apuração no formato AAAA-MM. */
export const anoDe = (pa: string) => Number(pa.slice(0, 4));

export function declaracaoVigente(l: LinhaPgdasd, pa: string): DeclaracaoRow | null {
  const doMes = l.declaracoes.filter((d) => d.periodo_apuracao.slice(0, 7) === pa);
  if (!doMes.length) return null;
  return [...doMes].sort((a, b) => (b.transmitida_em ?? '').localeCompare(a.transmitida_em ?? ''))[0];
}

export function dasDoPeriodo(l: LinhaPgdasd, pa: string): DasRow[] {
  return l.das
    .filter((d) => d.periodo_apuracao.slice(0, 7) === pa)
    .sort((a, b) => (b.emitido_em ?? '').localeCompare(a.emitido_em ?? ''));
}

export type StatusPgdas = 'filial' | 'nao_consultado' | 'sem_declaracao' | 'transmitida' | 'retificada';
export function statusPgdas(l: LinhaPgdasd, pa: string): StatusPgdas {
  if (l.filial) return 'filial';
  if (!l.consultadoEm) return 'nao_consultado';
  const d = declaracaoVigente(l, pa);
  if (!d) return 'sem_declaracao';
  return d.tipo === 'retificadora' ? 'retificada' : 'transmitida';
}

export type StatusDas = 'filial' | 'nao_consultado' | 'sem_das' | 'pago' | 'nao_pago' | 'parcial';
export function statusDas(l: LinhaPgdasd, pa: string): StatusDas {
  if (l.filial) return 'filial';
  if (!l.consultadoEm) return 'nao_consultado';
  const lista = dasDoPeriodo(l, pa);
  if (!lista.length) return 'sem_das';
  const pagos = lista.filter((d) => d.das_pago === true).length;
  if (pagos === lista.length) return 'pago';
  return pagos > 0 ? 'parcial' : 'nao_pago';
}

/** Mais de um DAS pago no período, ou o mesmo DAS com mais de um pagamento na Receita (Onda 1). */
export function duplicidadeDas(l: LinhaPgdasd, pa: string): boolean {
  const lista = dasDoPeriodo(l, pa);
  if (lista.filter((d) => d.das_pago === true).length > 1) return true;
  return lista.some((d) => (l.pagamentosPorDocumento.get(d.numero_das) ?? 0) > 1);
}

export function useMatrizPgdasd(ano: number) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-pgdasd-matriz', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaPgdasd[]> => {
      const companyId = company!.id;
      const inicio = `${ano}-01-01`;
      const fim = `${ano}-12-31`;
      const todos = async <T,>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
        const out: T[] = [];
        for (let de = 0; ; de += 1000) {
          const { data, error } = await pagina(de, de + 999);
          if (error) throw error;
          out.push(...(data ?? []));
          if (!data || data.length < 1000) break; // PostgREST corta em 1000 linhas por página
        }
        return out;
      };

      const contatos = await todos((de, ate) => supabase.from('contacts')
        .select('id, name, display_name, document, tax_regime')
        .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).eq('tax_regime', 'simples_nacional')
        .order('name').range(de, ate));
      const consultas = await todos((de, ate) => supabase.from('serpro_pgdasd_consultas')
        .select('contact_id, consultado_em').eq('company_id', companyId).eq('ano', ano).range(de, ate));
      const declaracoes = await todos((de, ate) => supabase.from('serpro_pgdasd_declaracoes')
        .select('*').eq('company_id', companyId).gte('periodo_apuracao', inicio).lte('periodo_apuracao', fim).range(de, ate));
      const das = await todos((de, ate) => supabase.from('serpro_pgdasd_das')
        .select('*').eq('company_id', companyId).gte('periodo_apuracao', inicio).lte('periodo_apuracao', fim).range(de, ate));
      const pagos = await todos((de, ate) => supabase.from('serpro_pagamentos')
        .select('contact_id, numero_documento').eq('company_id', companyId).eq('tipo_sigla', 'DAS').gte('periodo_apuracao', inicio).lte('periodo_apuracao', fim).range(de, ate));

      const consultaPor = new Map(consultas.map((c) => [c.contact_id, c.consultado_em]));
      const agrupar = <T extends { contact_id: string }>(linhas: T[]) => {
        const m = new Map<string, T[]>();
        for (const l of linhas) { const a = m.get(l.contact_id) ?? []; a.push(l); m.set(l.contact_id, a); }
        return m;
      };
      const declPor = agrupar(declaracoes as unknown as DeclaracaoRow[]);
      const dasPor = agrupar(das as unknown as DasRow[]);
      const pagPor = new Map<string, Map<string, number>>();
      for (const p of pagos) {
        const m = pagPor.get(p.contact_id) ?? new Map<string, number>();
        m.set(p.numero_documento, (m.get(p.numero_documento) ?? 0) + 1);
        pagPor.set(p.contact_id, m);
      }

      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaPgdasd => ({
          contact_id: c.id,
          nome: c.display_name || c.name || 'Cliente',
          documento: c.document ?? '',
          regime: c.tax_regime ?? null,
          filial: digitos(c.document).slice(8, 12) !== '0001',
          consultadoEm: consultaPor.get(c.id) ?? null,
          declaracoes: declPor.get(c.id) ?? [],
          das: dasPor.get(c.id) ?? [],
          pagamentosPorDocumento: pagPor.get(c.id) ?? new Map(),
        }));
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-pgdasd)
export interface ResultadoPgdasd {
  ok: boolean;
  recente?: boolean;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
  declaracoes?: number;
  das?: number;
  novas?: number;
  sem_declaracao?: boolean;
  jaBaixado?: boolean;
  url?: string;
  jaGerado?: boolean;
  numero_das?: string;
  vencimento?: string | null;
  valor_total?: number | null;
}

function useInvalidarPgdasd() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-pgdasd-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useConsultarPgdasd() {
  const invalidar = useInvalidarPgdasd();
  return useMutation({
    mutationFn: (v: { contactId: string; ano: number; force?: boolean }) =>
      invocarSerpro<ResultadoPgdasd>('serpro-pgdasd', { action: 'consultar', contact_id: v.contactId, ano: v.ano, force: v.force }),
    onSuccess: invalidar,
  });
}

export function useDocumentosPgdasd() {
  const invalidar = useInvalidarPgdasd();
  return useMutation({
    mutationFn: (v: { contactId: string; periodo: string }) =>
      invocarSerpro<ResultadoPgdasd>('serpro-pgdasd', { action: 'documentos', contact_id: v.contactId, periodo: v.periodo }),
    onSuccess: invalidar,
  });
}

export function useExtratoDas() {
  const invalidar = useInvalidarPgdasd();
  return useMutation({
    mutationFn: (v: { dasId: string }) => invocarSerpro<ResultadoPgdasd>('serpro-pgdasd', { action: 'extrato', das_id: v.dasId }),
    onSuccess: invalidar,
  });
}

export function useGerarDas() {
  const invalidar = useInvalidarPgdasd();
  return useMutation({
    mutationFn: (v: { contactId: string; periodo: string; novo?: boolean }) =>
      invocarSerpro<ResultadoPgdasd>('serpro-pgdasd', {
        action: 'gerar_das', contact_id: v.contactId, periodo: v.periodo, confirmar_emissao: true, novo: v.novo,
      }),
    onSuccess: invalidar,
  });
}

export type TipoArquivoPgdasd = 'declaracao' | 'recibo' | 'maed_notificacao' | 'maed_darf' | 'das' | 'extrato';
export function useLinkPgdasd() {
  return useMutation({
    mutationFn: (v: { tipo: TipoArquivoPgdasd; id: string }) => invocarSerpro<ResultadoPgdasd>('serpro-pgdasd', { action: 'link', tipo: v.tipo, id: v.id }),
  });
}

export function usePublicarPgdasd() {
  const invalidar = useInvalidarPgdasd();
  return useMutation({
    mutationFn: (v: { tabela: 'das' | 'declaracao'; id: string; visivel: boolean }) =>
      invocarSerpro<{ ok?: boolean; error?: string }>('serpro-pgdasd', { action: 'publicar', tabela: v.tabela, id: v.id, visivel_portal: v.visivel }),
    onSuccess: invalidar,
  });
}

/** Abre/baixa um PDF a partir do link assinado (10 min). */
export function abrirPdf(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}
