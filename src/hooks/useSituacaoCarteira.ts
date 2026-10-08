import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';
import { hojeBR } from '@/lib/prazosFederais';
import { atualizacoes, montarCarteira, type EntradaCarteira, type ResponsavelCliente } from '@/lib/situacaoCarteira';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { STATUS_MONITORADO, useClientesCaixa, useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useFaturamentoAno } from '@/hooks/useSerproFaturamento';
import { useMatrizDefis } from '@/hooks/useSerproDefis';
import { useProcuracoes } from '@/hooks/useSerproProcuracoes';
import { useMatrizSitfis } from '@/hooks/useSerproSitfis';
import { useMatrizDctfwebMit } from '@/hooks/useSerproDctfweb';

/** Do cadastro de cada cliente ativo: data de abertura (define de que mês a PGDAS-D passa a ser cobrada) e responsável. */
function useCadastroCarteira() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['situacao-carteira-cadastro', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const contatos = await fetchAllPages<{ id: string; data_abertura_receita: string | null; data_abertura_rf: string | null; responsible_id: string | null }>(
        () => supabase.from('contacts').select('id, data_abertura_receita, data_abertura_rf, responsible_id')
          .eq('company_id', company!.id).eq('status_cliente', STATUS_MONITORADO).order('id'));
      return {
        aberturas: new Map(contatos.map((c) => [c.id, c.data_abertura_receita || c.data_abertura_rf || null] as const)),
        responsavelDe: new Map(contatos.flatMap((c) => (c.responsible_id ? [[c.id, c.responsible_id] as const] : []))),
      };
    },
  });
}

/**
 * Do cadastro, para as listas de Monitoramento: responsável (com o nome da equipe) e data de abertura de cada cliente ativo.
 * Reaproveita a mesma consulta do Portal 360° (o React Query divide o cache).
 */
export function useCadastroMonitor() {
  const cadastro = useCadastroCarteira();
  const equipe = useTeamProfiles();
  const responsaveis = useMemo(() => {
    const nomes = new Map((equipe.data ?? []).map((p) => [p.id, p.full_name?.trim() || 'Sem nome'] as const));
    const m = new Map<string, ResponsavelCliente>();
    for (const [contato, id] of cadastro.data?.responsavelDe ?? []) m.set(contato, { id, nome: nomes.get(id) ?? 'Responsável inativo' });
    return m;
  }, [cadastro.data, equipe.data]);
  return {
    responsaveis,
    aberturas: cadastro.data?.aberturas ?? new Map<string, string | null>(),
    carregando: cadastro.isLoading || equipe.isLoading,
  };
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
  const cadastro = useCadastroCarteira();
  const equipe = useTeamProfiles();

  const fontes = [clientes, mensagens, procuracoes, pagamentos, pgdas, faturamento, defis, sitfis, dctfwebMit, cadastro, equipe];
  const carregando = fontes.some((f) => f.isLoading);
  const erro = fontes.find((f) => f.error)?.error ?? null;

  const responsaveis = useMemo(() => {
    const nomes = new Map((equipe.data ?? []).map((p) => [p.id, p.full_name?.trim() || 'Sem nome'] as const));
    const m = new Map<string, ResponsavelCliente>();
    for (const [contato, id] of cadastro.data?.responsavelDe ?? []) m.set(contato, { id, nome: nomes.get(id) ?? 'Responsável inativo' });
    return m;
  }, [cadastro.data, equipe.data]);

  const entrada = useMemo<EntradaCarteira | null>(() => {
    if (carregando) return null;
    return {
      hoje, competencia,
      clientes: clientes.data ?? [],
      aberturas: cadastro.data?.aberturas ?? new Map(),
      responsaveis,
      mensagens: mensagens.data ?? [],
      procuracoes: procuracoes.data ?? [],
      pagamentos: pagamentos.data ?? [],
      pgdas: pgdas.data ?? [],
      defis: defis.data ?? [],
      sitfis: sitfis.data ?? [],
      dctfwebMit: dctfwebMit.data ?? [],
      faturamento: faturamento.data ?? [],
    };
  }, [carregando, hoje, competencia, clientes.data, cadastro.data, responsaveis, mensagens.data, procuracoes.data, pagamentos.data, pgdas.data, defis.data, sitfis.data, dctfwebMit.data, faturamento.data]);

  const linhas = useMemo(() => (entrada ? montarCarteira(entrada) : []), [entrada]);
  const fontesAtualizadas = useMemo(() => (entrada ? atualizacoes(entrada) : []), [entrada]);

  return { linhas, carregando, erro, competencia, hoje, fontesAtualizadas, faturamento: faturamento.data ?? [] };
}
