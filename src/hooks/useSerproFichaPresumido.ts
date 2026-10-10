/**
 * Ficha mês a mês do Lucro Presumido e do Real (10/10/2026): o que já está salvo de UM cliente no ano, sem chamar o Serpro.
 * DCTFWeb (um recibo por mês), apurações da MIT (o ano vem inteiro numa consulta), guias da DCTFWeb e DARF avulso.
 * As chaves começam com as mesmas das telas, então consultar ou gerar guia atualiza a ficha.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';
import type { DctfwebRow, MitConsultaRow, MitRow } from '@/hooks/useSerproDctfweb';
import type { GuiaDctfweb } from '@/hooks/useGuiasCliente';

/** Meses AAAA-MM de janeiro de `ano` até `ate` (inclusive). */
export function mesesDoAno(ano: number, ate: string): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const k = `${ano}-${String(m).padStart(2, '0')}`;
    if (k <= ate) out.push(k);
  }
  return out;
}

/**
 * Meses em que ainda não há consulta da DCTFWeb e já dá para consultar: do começo do ano até `ate`, antes do mês corrente
 * (a DCTFWeb do mês corrente só é entregue no mês seguinte) e não antes da abertura da empresa.
 */
export function mesesFaltantes(consultados: Set<string> | undefined, ano: number, ate: string, mesAtual: string, abertura?: string | null): string[] {
  const aberturaMes = abertura ? abertura.slice(0, 7) : null;
  return mesesDoAno(ano, ate).filter((m) => m < mesAtual && !consultados?.has(m) && (!aberturaMes || m >= aberturaMes));
}

const dentroDoAno = (ano: number) => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` });

export function useDctfwebAnoCliente(contactId: string, ano: number) {
  return useQuery({
    queryKey: ['serpro-dctfweb-matriz', 'ficha', 'dctfweb', contactId, ano],
    queryFn: async (): Promise<DctfwebRow[]> => {
      const { de, ate } = dentroDoAno(ano);
      // Colunas explícitas: o caminho do recibo nunca sai do servidor.
      return fetchAllPages<DctfwebRow>(() => supabase.from('serpro_dctfweb')
        .select('id, contact_id, competencia, status, consultado_em').eq('contact_id', contactId).gte('competencia', de).lte('competencia', ate).order('competencia').order('id'));
    },
  });
}

export function useMitAnoCliente(contactId: string, ano: number) {
  return useQuery({
    queryKey: ['serpro-dctfweb-matriz', 'ficha', 'mit', contactId, ano],
    queryFn: async (): Promise<{ apuracoes: MitRow[]; consulta: MitConsultaRow | null }> => {
      const { de, ate } = dentroDoAno(ano);
      const apuracoes = await fetchAllPages<MitRow>(() => supabase.from('serpro_mit_apuracoes')
        .select('id, contact_id, periodo, id_apuracao, situacao, data_encerramento, evento_especial, valor_total')
        .eq('contact_id', contactId).gte('periodo', de).lte('periodo', ate).order('periodo').order('id'));
      const { data, error } = await supabase.from('serpro_mit_consultas').select('contact_id, ano, consultado_em, apuracoes')
        .eq('contact_id', contactId).eq('ano', ano).maybeSingle();
      if (error) throw error;
      return { apuracoes, consulta: (data as MitConsultaRow | null) ?? null };
    },
  });
}

export function useGuiasDctfwebCliente(contactId: string, ano: number) {
  return useQuery({
    queryKey: ['dctfweb-guias', 'cliente', contactId, ano],
    queryFn: async (): Promise<GuiaDctfweb[]> => {
      const { de, ate } = dentroDoAno(ano);
      return fetchAllPages<GuiaDctfweb>(() => supabase.from('serpro_dctfweb_guias')
        .select('id, contact_id, competencia, data_pagamento, emitido_em')
        .eq('contact_id', contactId).gte('competencia', de).lte('competencia', ate).order('emitido_em', { ascending: false }).order('id'));
    },
  });
}

/** Meses com consulta da DCTFWeb de todos os clientes no ano (alimenta o "Completar o ano" em lote). */
export function useDctfwebAno(ano: number) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-dctfweb-matriz', 'ano', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { de, ate } = dentroDoAno(ano);
      const rows = await fetchAllPages<{ contact_id: string; competencia: string }>(() => supabase.from('serpro_dctfweb')
        .select('contact_id, competencia').eq('company_id', company!.id).gte('competencia', de).lte('competencia', ate).order('contact_id').order('competencia'));
      const m = new Map<string, Set<string>>();
      for (const r of rows) { const s = m.get(r.contact_id) ?? new Set<string>(); s.add(r.competencia.slice(0, 7)); m.set(r.contact_id, s); }
      return m;
    },
  });
}
