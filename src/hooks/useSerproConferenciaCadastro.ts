import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BadgeTone } from '@/components/ds';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao } from '@/hooks/useSerproPagamentos';
import { anoDe, useMatrizPgdasd, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';

/**
 * Conferência do cadastro contra o que a Receita mostra e contra o próprio monitoramento. Só lê o que já está salvo (sem custo).
 * A Receita só é comparada onde já temos dado dela: a declaração PGDAS-D é consultada só para clientes que o cadastro diz serem do Simples,
 * então "entrega PGDAS-D mas o cadastro não é Simples" só aparece para quem já teve a declaração consultada.
 */
export type TipoProblema = 'sem_declaracao_ano' | 'sem_declaracao_recente' | 'pgdas_fora_do_simples' | 'saida_com_status_ativo' | 'pj_sem_regime';

export const ROTULO_PROBLEMA: Record<TipoProblema, string> = {
  sem_declaracao_ano: 'Simples sem declaração no ano',
  sem_declaracao_recente: 'Simples sem declaração recente',
  pgdas_fora_do_simples: 'PGDAS-D fora do Simples',
  saida_com_status_ativo: 'Ativo com data de saída',
  pj_sem_regime: 'PJ ativa sem regime',
};

export interface Problema { tipo: TipoProblema; tom: BadgeTone; titulo: string; detalhe: string }

export interface LinhaConferencia {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  problemas: Problema[];
}

export interface ContatoCadastro {
  id: string;
  name: string | null;
  razao_social: string | null; display_name: string | null;
  document: string | null;
  tax_regime: string | null;
  status_cliente: string | null;
  data_saida_cliente: string | null;
}

export interface DeclaracaoResumo { contact_id: string; periodo_apuracao: string }

export interface ResumoConferencia {
  linhas: LinhaConferencia[];
  totalAtivos: number;
  carregando: boolean;
}

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const indiceMes = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const rotuloMes = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const REGIMES: Record<string, string> = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento', nao_aplica: 'Não se aplica' };

/** Função pura: a mesma entrada dá sempre a mesma conferência. */
export function montarConferencia(contatos: ContatoCadastro[], simples: LinhaPgdasd[], declaracoes: DeclaracaoResumo[]): Omit<ResumoConferencia, 'carregando'> {
  const ativos = contatos.filter((c) => c.status_cliente === STATUS_MONITORADO);
  const porContato = new Map<string, Problema[]>();
  const somar = (id: string, p: Problema) => porContato.set(id, [...(porContato.get(id) ?? []), p]);
  const simplesPor = new Map(simples.map((l) => [l.contact_id, l]));
  const ultimaDecl = new Map<string, string>();
  for (const d of declaracoes) {
    const pa = d.periodo_apuracao.slice(0, 7);
    if (pa > (ultimaDecl.get(d.contact_id) ?? '')) ultimaDecl.set(d.contact_id, pa);
  }

  for (const c of ativos) {
    const doc = digitos(c.document);

    if (c.data_saida_cliente) {
      somar(c.id, {
        tipo: 'saida_com_status_ativo', tom: 'warn', titulo: `Ativo, mas com data de saída em ${dataBR(c.data_saida_cliente)}`,
        detalhe: 'Se o cliente saiu, mude o status no cadastro; se ficou, limpe a data. Enquanto estiver Ativo, entra no monitoramento e nas consultas ao Serpro.',
      });
    }

    if (doc.length === 14 && !c.tax_regime) {
      somar(c.id, {
        tipo: 'pj_sem_regime', tom: 'warn', titulo: 'PJ ativa sem regime tributário',
        detalhe: 'Sem regime, o cliente fica de fora das telas por regime (PGDAS, DCTFWeb e MIT). Preencha o regime no cadastro.',
      });
    }

    // Entrega PGDAS-D (há declaração da Receita), mas o cadastro não diz Simples.
    const ultima = ultimaDecl.get(c.id);
    if (ultima && c.tax_regime !== 'simples_nacional') {
      somar(c.id, {
        tipo: 'pgdas_fora_do_simples', tom: 'danger', titulo: `Entrega PGDAS-D, mas o cadastro diz ${c.tax_regime ? REGIMES[c.tax_regime] ?? c.tax_regime : 'sem regime'}`,
        detalhe: `A Receita tem declaração do Simples para este CNPJ (última de ${rotuloMes(ultima)}). Confirme o regime e corrija o cadastro.`,
      });
    }

    // Simples: olha o que a consulta do ano pôde ver. A última competência que já venceu na data da consulta é o mês anterior ao anterior (vence dia 20).
    const l = simplesPor.get(c.id);
    if (l && !l.filial && l.consultadoEm) {
      const consulta = l.consultadoEm.slice(0, 10);
      const mesConsulta = Number(consulta.slice(5, 7));
      const referencia = indiceMes(consulta) - 2;
      const doAno = l.declaracoes.map((d) => d.periodo_apuracao.slice(0, 7));
      if (doAno.length === 0) {
        if (mesConsulta >= 4) {
          somar(c.id, {
            tipo: 'sem_declaracao_ano', tom: 'warn', titulo: `Nenhuma declaração PGDAS-D em ${consulta.slice(0, 4)}`,
            detalhe: `Consultado em ${dataBR(consulta)}. Pode ser empresa sem movimento com declaração em atraso, baixa, exclusão do Simples ou mudança de regime: confirme com o cliente.`,
          });
        }
      } else {
        const ultimaDoAno = [...doAno].sort().pop()!;
        const lacuna = referencia - indiceMes(ultimaDoAno);
        if (lacuna >= 3) {
          somar(c.id, {
            tipo: 'sem_declaracao_recente', tom: 'warn', titulo: `Sem declaração desde ${rotuloMes(ultimaDoAno)}`,
            detalhe: `A última declaração do ano é de ${rotuloMes(ultimaDoAno)} e, na consulta de ${dataBR(consulta)}, já tinham vencido mais ${lacuna} competências sem declaração. Confira com o cliente e no PGDAS.`,
          });
        }
      }
    }
  }

  const linhas: LinhaConferencia[] = [];
  for (const c of ativos) {
    const problemas = porContato.get(c.id);
    if (!problemas?.length) continue;
    linhas.push({ contact_id: c.id, nome: c.razao_social || c.name || 'Cliente', documento: c.document ?? '', regime: c.tax_regime, problemas });
  }
  const peso = (l: LinhaConferencia) => Math.max(...l.problemas.map((p) => (p.tom === 'danger' ? 3 : 2)));
  linhas.sort((a, b) => peso(b) - peso(a) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { linhas, totalAtivos: ativos.length };
}

export function useConferenciaCadastro(): ResumoConferencia {
  const { company } = useCompany();
  const ano = anoDe(competenciaPadrao());
  const simples = useMatrizPgdasd(ano);
  const contatos = useQuery({
    queryKey: ['serpro-conferencia-contatos', company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchAllPages<ContatoCadastro>(() => supabase.from('contacts')
      .select('id, name, razao_social, display_name, document, tax_regime, status_cliente, data_saida_cliente')
      .eq('company_id', company!.id).eq('status_cliente', STATUS_MONITORADO).order('name').order('id')),
  });
  const declaracoes = useQuery({
    queryKey: ['serpro-conferencia-declaracoes', company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchAllPages<DeclaracaoResumo>(() => supabase.from('serpro_pgdasd_declaracoes')
      .select('contact_id, periodo_apuracao').eq('company_id', company!.id).order('id')),
  });
  const carregando = simples.isLoading || contatos.isLoading || declaracoes.isLoading;
  const resumo = useMemo(() => montarConferencia(contatos.data ?? [], simples.data ?? [], declaracoes.data ?? []), [contatos.data, simples.data, declaracoes.data]);
  return { ...resumo, carregando };
}
