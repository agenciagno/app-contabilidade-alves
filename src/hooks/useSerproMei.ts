/**
 * MEI no Monitoramento (Rodada 4, 09/10/2026): DAS do MEI, dívida ativa, CCMEI e situação no MEI, pela função `serpro-mei`.
 * PGMEI e CCMEI não exigem procuração. Os parcelamentos do MEI ficam na tela Parcelamentos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export interface DasMeiRow { id: string; contact_id: string; periodo: string; numero_das: string | null; vencimento: string | null; limite_acolhimento: string | null; valor_total: number | null; data_pagamento: string | null; emitido_em: string }
export interface DividaMeiRow { contact_id: string; ano: number; consultado_em: string; itens: { periodo: string; tributo: string; valor: number; ente: string; situacao: string }[]; total: number }
export interface CcmeiRow { id: string; contact_id: string; emitido_em: string }
export interface SituacaoMeiRow { contact_id: string; consultado_em: string; situacao_cadastral: string | null; optante_mei: boolean | null; enquadramento: string | null }

export interface LinhaMei {
  contact_id: string;
  nome: string;
  documento: string;
  das: DasMeiRow[];
  divida: DividaMeiRow | null;
  ccmei: CcmeiRow | null;
  situacao: SituacaoMeiRow | null;
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Clientes ativos com regime MEI, com o que já foi guardado de cada serviço (ano corrente para a dívida ativa). */
export function useMatrizMei(ano: number) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-mei-matriz', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaMei[]> => {
      const companyId = company!.id;
      const contatos = await fetchAllPages<{ id: string; name: string | null; display_name: string | null; document: string | null }>(
        () => supabase.from('contacts').select('id, name, display_name, document')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).eq('tax_regime', 'mei').order('name').order('id'));
      const ids = contatos.map((c) => c.id);
      if (!ids.length) return [];
      const [das, divida, ccmei, situacao] = await Promise.all([
        fetchAllPages<DasMeiRow>(() => supabase.from('serpro_mei_das')
          .select('id, contact_id, periodo, numero_das, vencimento, limite_acolhimento, valor_total, data_pagamento, emitido_em')
          .in('contact_id', ids).order('emitido_em', { ascending: false }).order('id')),
        fetchAllPages<DividaMeiRow>(() => supabase.from('serpro_mei_divida').select('contact_id, ano, consultado_em, itens, total').in('contact_id', ids).eq('ano', ano).order('contact_id')),
        fetchAllPages<CcmeiRow>(() => supabase.from('serpro_mei_ccmei').select('id, contact_id, emitido_em').in('contact_id', ids).order('emitido_em', { ascending: false }).order('id')),
        fetchAllPages<SituacaoMeiRow>(() => supabase.from('serpro_mei_situacao').select('contact_id, consultado_em, situacao_cadastral, optante_mei, enquadramento').in('contact_id', ids).order('contact_id')),
      ]);
      const agrupar = <T extends { contact_id: string }>(xs: T[]) => { const m = new Map<string, T[]>(); for (const x of xs) m.set(x.contact_id, [...(m.get(x.contact_id) ?? []), x]); return m; };
      const dPor = agrupar(das), cPor = agrupar(ccmei);
      const dvPor = new Map(divida.map((d) => [d.contact_id, d]));
      const sPor = new Map(situacao.map((s) => [s.contact_id, s]));
      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaMei => ({
          contact_id: c.id, nome: c.display_name || c.name || 'Cliente', documento: c.document ?? '',
          das: dPor.get(c.id) ?? [], divida: dvPor.get(c.id) ?? null, ccmei: cPor.get(c.id)?.[0] ?? null, situacao: sPor.get(c.id) ?? null,
        }));
    },
  });
}

/** DAS do MEI guardado do período e ainda pagável (o servidor devolve esse arquivo sem emitir outro). */
export function dasMeiValido(l: LinhaMei, pa: string, hoje: string): DasMeiRow | null {
  return l.das.find((d) => d.periodo.slice(0, 7) === pa && !d.data_pagamento && (d.limite_acolhimento ?? d.vencimento ?? '') >= hoje) ?? null;
}

export const ultimaBuscaMei = (l: LinhaMei): string | null =>
  [l.divida?.consultado_em, l.situacao?.consultado_em, l.ccmei?.emitido_em, l.das[0]?.emitido_em].filter((x): x is string => !!x).sort().pop() ?? null;

// ---------------------------------------------------------------- ações
export interface ResultadoMei { ok: boolean; jaGerado?: boolean; url?: string; id?: string | null; error?: string; foraDoMonitoramento?: boolean; debitos?: number; total?: number; situacao?: string | null; optante?: boolean | null }

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-mei-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useGerarDasMei() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; periodo: string; dataPagamento?: string }) =>
      invocarSerpro<ResultadoMei>('serpro-mei', { action: 'gerar_das', contact_id: v.contactId, periodo: v.periodo, confirmar_emissao: true, data_pagamento: v.dataPagamento }),
    onSuccess: () => invalidar(),
  });
}

export function useDividaAtivaMei() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; ano: number }) => invocarSerpro<ResultadoMei>('serpro-mei', { action: 'divida_ativa', contact_id: v.contactId, ano: v.ano }),
    onSuccess: () => invalidar(),
  });
}

export function useEmitirCcmei() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string }) => invocarSerpro<ResultadoMei>('serpro-mei', { action: 'ccmei', contact_id: v.contactId, confirmar_emissao: true }),
    onSuccess: () => invalidar(),
  });
}

export function useSituacaoMei() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string }) => invocarSerpro<ResultadoMei>('serpro-mei', { action: 'situacao', contact_id: v.contactId }),
    onSuccess: () => invalidar(),
  });
}

export function useLinkMei() {
  return useMutation({
    mutationFn: (v: { tipo: 'das' | 'ccmei'; id: string }) => invocarSerpro<ResultadoMei>('serpro-mei', { action: 'link', tipo: v.tipo, id: v.id }),
  });
}
