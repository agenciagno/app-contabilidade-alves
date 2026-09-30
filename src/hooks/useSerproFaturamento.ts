import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { declaracaoVigente, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';

export interface MesValor { mes: string; valor: number }
export interface TributosDeclarados { irpj: number; csll: number; cofins: number; pis: number; cpp: number; icms: number; ipi: number; iss: number; total: number }

/** Leitura completa do PDF (coluna `dados`). Só o que a tela usa. */
export interface DadosLeitura {
  rpa: { interno: number; externo: number; total: number } | null;
  rbt12: { interno: number; externo: number; total: number } | null;
  rba: { interno: number; externo: number; total: number } | null;
  historico_interno: MesValor[];
  historico_externo: MesValor[];
  folha: MesValor[];
  debito_declarado: TributosDeclarados | null;
  municipio: string | null;
  uf: string | null;
  impedido_icms_iss: boolean | null;
  numero_recibo: string | null;
}

export interface FaturamentoRow {
  id: string;
  contact_id: string;
  declaracao_id: string | null;
  periodo_apuracao: string;
  numero_declaracao: string;
  tipo: 'original' | 'retificadora' | null;
  transmitida_em: string | null;
  regime_apuracao: 'competencia' | 'caixa' | null;
  rpa_total: number | null;
  rbt12_total: number | null;
  rba_total: number | null;
  rbaa_total: number | null;
  limite_total: number | null;
  sublimite: number | null;
  fator_r_aplica: boolean | null;
  fator_r_texto: string | null;
  confiavel: boolean;
  avisos: string[];
  dados: DadosLeitura | null;
  lido_em: string;
  aplicado_fiscal_em: string | null;
}

/** Teto anual do Simples Nacional. O limite proporcionalizado do PDF (empresa aberta no ano) tem prioridade. */
export const LIMITE_SIMPLES = 4_800_000;

export function useFaturamentoAno(ano: number) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-faturamento', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async (): Promise<FaturamentoRow[]> =>
      fetchAllPages<FaturamentoRow>(() => supabase.from('serpro_faturamento').select('*')
        .eq('company_id', company!.id).gte('periodo_apuracao', `${ano}-01-01`).lte('periodo_apuracao', `${ano}-12-31`)
        .order('periodo_apuracao').order('id')),
  });
}

/** Leitura da declaração vigente do período (a mesma que a tela PGDAS mostra). */
export function faturamentoVigente(l: LinhaPgdasd, linhas: FaturamentoRow[], pa: string): FaturamentoRow | null {
  const d = declaracaoVigente(l, pa);
  if (!d) return null;
  return linhas.find((f) => f.contact_id === l.contact_id && (f.declaracao_id === d.id || f.numero_declaracao === d.numero_declaracao)) ?? null;
}

// ---------------------------------------------------------------- limites
/**
 * O acompanhamento olha o maior entre o acumulado do ano (RBA) e o dos últimos 12 meses (RBT12), para avisar cedo.
 * É apoio à decisão do contador, não conclusão jurídica de exclusão do Simples.
 */
export function baseLimite(f: FaturamentoRow): { valor: number; rotulo: string } | null {
  const a = f.rba_total, b = f.rbt12_total;
  if (a === null && b === null) return null;
  return (a ?? -1) >= (b ?? -1) ? { valor: a as number, rotulo: 'no ano' } : { valor: b as number, rotulo: 'em 12 meses' };
}

export const limiteDe = (f: FaturamentoRow) => (f.limite_total && f.limite_total > 0 ? f.limite_total : LIMITE_SIMPLES);

export function percentualLimite(f: FaturamentoRow): number | null {
  const base = baseLimite(f);
  return base ? (base.valor / limiteDe(f)) * 100 : null;
}

export type NivelLimite = 'regular' | 'atencao' | 'critico' | 'acima';
/** Mesmos cortes da seção de Faturamento do Fiscal: 80% atenção, 95% crítico. Só vale para leitura confiável. */
export function nivelLimite(f: FaturamentoRow): NivelLimite | null {
  if (!f.confiavel) return null;
  const p = percentualLimite(f);
  if (p === null) return null;
  if (p > 100) return 'acima';
  if (p >= 95) return 'critico';
  if (p >= 80) return 'atencao';
  return 'regular';
}

export const ROTULO_NIVEL_LIMITE: Record<NivelLimite, string> = { regular: 'Regular', atencao: 'Atenção', critico: 'Crítico', acima: 'Acima do limite' };

export type NivelSublimite = 'regular' | 'perto' | 'acima';
export function nivelSublimite(f: FaturamentoRow): NivelSublimite | null {
  if (!f.confiavel || !f.sublimite) return null;
  const base = baseLimite(f);
  if (!base) return null;
  if (base.valor > f.sublimite) return 'acima';
  return base.valor >= 0.8 * f.sublimite ? 'perto' : 'regular';
}

/** Folha dos 12 meses ÷ RBT12, calculada do PDF, só como referência: o valor oficial é o que a Receita escreve em "Fator r". */
export function fatorRCalculado(f: FaturamentoRow): number | null {
  if (!f.dados || !f.rbt12_total || f.rbt12_total <= 0) return null;
  return f.dados.folha.reduce((s, m) => s + m.valor, 0) / f.rbt12_total;
}

// ---------------------------------------------------------------- ações (edge function serpro-pgdasd)
export interface ResultadoFaturamento {
  ok: boolean;
  baixou?: boolean;
  confiavel?: boolean;
  avisos?: string[];
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-faturamento'] });
    qc.invalidateQueries({ queryKey: ['serpro-pgdasd-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useLerFaturamento() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; periodo: string }) =>
      invocarSerpro<ResultadoFaturamento>('serpro-pgdasd', { action: 'ler_faturamento', contact_id: v.contactId, periodo: v.periodo }),
    onSuccess: invalidar,
  });
}
