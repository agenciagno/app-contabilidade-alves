import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';
import { montarCruzamento, OBRIGACOES_CRUZADAS, type ContatoCruzamento, type TarefaCruzamento } from '@/lib/cruzamentoReceita';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

interface TarefaDb {
  id: string; contact_id: string | null; status: string; due_date: string | null; competence_year: number | null; competence_month: number | null;
  fiscal_obligations_catalog: { name: string | null } | null;
}

/** Tarefas do ano das obrigações que têm fonte na Receita, mais os contatos (para dizer por que um cliente está fora do monitoramento). Só leitura. */
export function useCruzamentoReceita(carteira: LinhaCarteira[], competencia: string, hoje: string) {
  const { company } = useCompany();
  const ano = Number(competencia.slice(0, 4));

  const tarefas = useQuery({
    queryKey: ['cruzamento-tarefas', company?.id, ano],
    enabled: !!company?.id,
    queryFn: async (): Promise<TarefaCruzamento[]> => {
      const catalogo = await fetchAllPages<{ id: string; name: string }>(
        () => supabase.from('fiscal_obligations_catalog').select('id, name').in('name', [...OBRIGACOES_CRUZADAS]).order('id'));
      if (catalogo.length === 0) return [];
      const linhas = await fetchAllPages<TarefaDb>(
        () => supabase.from('fiscal_tasks').select('id, contact_id, status, due_date, competence_year, competence_month, fiscal_obligations_catalog(name)')
          .eq('company_id', company!.id).eq('competence_year', ano).in('obligation_id', catalogo.map((c) => c.id)).order('id'));
      return linhas
        .filter((t) => t.competence_year !== null && t.competence_month !== null && t.fiscal_obligations_catalog?.name)
        .map((t) => ({
          id: t.id, contact_id: t.contact_id, obrigacao: t.fiscal_obligations_catalog!.name!, competence_year: t.competence_year!, competence_month: t.competence_month!,
          status: t.status, due_date: t.due_date,
        }));
    },
  });

  const contatos = useQuery({
    queryKey: ['cruzamento-contatos', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<ContatoCruzamento[]> => {
      const linhas = await fetchAllPages<{ id: string; name: string | null; display_name: string | null; document: string | null; tax_regime: string | null; status_cliente: string | null }>(
        () => supabase.from('contacts').select('id, name, display_name, document, tax_regime, status_cliente').eq('company_id', company!.id).order('id'));
      return linhas.map((c) => ({ id: c.id, nome: c.display_name || c.name || 'Cliente', documento: c.document, regime: c.tax_regime, status_cliente: c.status_cliente }));
    },
  });

  const linhas = useMemo(
    () => montarCruzamento(tarefas.data ?? [], contatos.data ?? [], carteira, hoje, competencia),
    [tarefas.data, contatos.data, carteira, hoje, competencia],
  );
  return { linhas, carregando: tarefas.isLoading || contatos.isLoading, erro: tarefas.error ?? contatos.error ?? null };
}
