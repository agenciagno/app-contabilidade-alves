import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';
import { hojeBR } from '@/lib/prazosFederais';
import { atualizacoes, montarCarteira, type EntradaCarteira } from '@/lib/situacaoCarteira';
import { STATUS_MONITORADO, useClientesCaixa, useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useFaturamentoAno } from '@/hooks/useSerproFaturamento';
import { useMatrizDefis } from '@/hooks/useSerproDefis';
import { useProcuracoes } from '@/hooks/useSerproProcuracoes';
import { useMatrizSitfis } from '@/hooks/useSerproSitfis';
import { useMatrizDctfwebMit } from '@/hooks/useSerproDctfweb';

/** Data de abertura de cada cliente ativo: define de que mês a PGDAS-D passa a ser cobrada. */
function useAberturas() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['situacao-carteira-aberturas', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const contatos = await fetchAllPages<{ id: string; data_abertura_receita: string | null; data_abertura_rf: string | null }>(
        () => supabase.from('contacts').select('id, data_abertura_receita, data_abertura_rf')
          .eq('company_id', company!.id).eq('status_cliente', STATUS_MONITORADO).order('id'));
      return new Map(contatos.map((c) => [c.id, c.data_abertura_receita || c.data_abertura_rf || null] as const));
    },
  });
}

/**
 * Uma linha por cliente monitorado, com o estado de cada fonte do Serpro já salva. Só leitura: não chama o Serpro e não custa nada.
 * Junta os mesmos hooks que o Dashboard Federal usa; o React Query reaproveita o cache entre as telas.
 */
export function useSituacaoCarteira() {
  const competencia = competenciaPadrao();
  const ano = anoDe(competencia);
  const hoje = hojeBR();

  const clientes = useClientesCaixa();
  const mensagens = useMensagensCriticas();
  const procuracoes = useProcuracoes();
  const pagamentos = useMatrizPagamentos(competencia);
  const pgdas = useMatrizPgdasd(ano);
  const faturamento = useFaturamentoAno(ano);
  const defis = useMatrizDefis();
  const sitfis = useMatrizSitfis();
  const dctfwebMit = useMatrizDctfwebMit(competencia);
  const aberturas = useAberturas();

  const fontes = [clientes, mensagens, procuracoes, pagamentos, pgdas, faturamento, defis, sitfis, dctfwebMit, aberturas];
  const carregando = fontes.some((f) => f.isLoading);
  const erro = fontes.find((f) => f.error)?.error ?? null;

  const entrada = useMemo<EntradaCarteira | null>(() => {
    if (carregando) return null;
    return {
      hoje, competencia,
      clientes: clientes.data ?? [],
      aberturas: aberturas.data ?? new Map(),
      mensagens: mensagens.data ?? [],
      procuracoes: procuracoes.data ?? [],
      pagamentos: pagamentos.data ?? [],
      pgdas: pgdas.data ?? [],
      defis: defis.data ?? [],
      sitfis: sitfis.data ?? [],
      dctfwebMit: dctfwebMit.data ?? [],
      faturamento: faturamento.data ?? [],
    };
  }, [carregando, hoje, competencia, clientes.data, aberturas.data, mensagens.data, procuracoes.data, pagamentos.data, pgdas.data, defis.data, sitfis.data, dctfwebMit.data, faturamento.data]);

  const linhas = useMemo(() => (entrada ? montarCarteira(entrada) : []), [entrada]);
  const fontesAtualizadas = useMemo(() => (entrada ? atualizacoes(entrada) : []), [entrada]);

  return { linhas, carregando, erro, competencia, hoje, fontesAtualizadas };
}
