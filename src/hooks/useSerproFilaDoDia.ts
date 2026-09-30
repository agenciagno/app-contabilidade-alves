import { useMemo } from 'react';
import type { BadgeTone } from '@/components/ds';
import {
  CATEGORIAS, STATUS_MONITORADO, diasParaPrazo, seloCaixa, useClientesCaixa, useMensagensCriticas,
  type ClienteCaixa, type MensagemComCliente,
} from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao, useMatrizPagamentos, type LinhaPagamentos } from '@/hooks/useSerproPagamentos';
import { useMatrizDctfwebMit, type LinhaDctfwebMit } from '@/hooks/useSerproDctfweb';
import { useProcuracoes, type LinhaProcuracao } from '@/hooks/useSerproProcuracoes';
import { competenciaAtual, estadoParcelamento, parcelasAtrasadas, rotuloParcela, useMatrizParcelamentos, type LinhaParcelamentos } from '@/hooks/useSerproParcelamentos';
import { estadoSitfis, useMatrizSitfis, type LinhaSitfis } from '@/hooks/useSerproSitfis';

/**
 * Fila do dia: junta, por cliente, o que a Receita mexeu ou avisou e pede ação. Só lê o que já está salvo (nenhuma chamada ao Serpro, custo zero).
 * Os avisos dos sensores somem sozinhos quando a equipe consulta aquele cliente na tela própria.
 */
export type MotivoFila = 'intimacao' | 'mensagem_nova' | 'pagamento_novo' | 'dctfweb' | 'procuracao' | 'parcela_atrasada' | 'sitfis';

export const MOTIVOS_FILA: Record<MotivoFila, { rotulo: string; rota: string; dica: string }> = {
  intimacao: { rotulo: 'Mensagem que exige ação', rota: '/dashboard-federal/intimacoes', dica: 'Abre a tela de Termos de Intimação já filtrada neste cliente.' },
  mensagem_nova: { rotulo: 'Mensagem nova', rota: '/mensagens', dica: 'Abre Mensagens e-CAC já filtrada neste cliente. Consultar custa uma consulta ao Serpro.' },
  pagamento_novo: { rotulo: 'Pagamento novo', rota: '/dashboard-federal/pagamentos', dica: 'Abre Pagamentos já filtrada neste cliente. O aviso some quando você consulta.' },
  dctfweb: { rotulo: 'Movimento na DCTFWeb', rota: '/dashboard-federal/dctfweb-mit', dica: 'Abre DCTFWeb e MIT já filtrada neste cliente. O aviso some quando você consulta.' },
  procuracao: { rotulo: 'Procuração', rota: '/dashboard-federal/procuracoes', dica: 'Abre Procurações já filtrada neste cliente.' },
  parcela_atrasada: { rotulo: 'Parcela em atraso', rota: '/dashboard-federal/parcelamentos', dica: 'Abre Parcelamentos já filtrada neste cliente.' },
  sitfis: { rotulo: 'Pendência na Situação Fiscal', rota: '/dashboard-federal/situacao-fiscal', dica: 'Abre Situação Fiscal já filtrada neste cliente.' },
};

export interface MotivoItem {
  motivo: MotivoFila;
  texto: string;
  detalhe: string | null;
  tom: BadgeTone;
  /** Quanto maior, mais alto o cliente sobe na fila. */
  peso: number;
}

export interface ItemFila {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  motivos: MotivoItem[];
  prioridade: number;
}

export interface ResumoFila {
  itens: ItemFila[];
  /** Clientes ativos acompanhados (base para "X de Y"). */
  totalAtivos: number;
  /** Fora da fila de propósito: estado permanente, não novidade do dia. */
  caixasComMensagemNaoLida: number;
  semProcuracao: number;
  carregando: boolean;
}

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const SEM_DADOS: never[] = [];

export interface DadosFila {
  caixa: ClienteCaixa[];
  criticas: MensagemComCliente[];
  pagamentos: LinhaPagamentos[];
  dctfweb: LinhaDctfwebMit[];
  procuracoes: LinhaProcuracao[];
  parcelamentos: LinhaParcelamentos[];
  sitfis: LinhaSitfis[];
}

/** Monta a fila a partir do que já está carregado nas telas. Função pura: a mesma entrada dá sempre a mesma fila. */
export function montarFila(d: DadosFila): Omit<ResumoFila, 'carregando'> {
  const clientesCaixa = (d.caixa).filter((c) => c.status_cliente === STATUS_MONITORADO);
  const itens = new Map<string, ItemFila>();
  const adicionar = (base: { contact_id: string; nome: string; documento: string; regime?: string | null }, m: MotivoItem) => {
    const atual = itens.get(base.contact_id);
    if (atual) {
      atual.motivos.push(m);
      if (!atual.regime && base.regime) atual.regime = base.regime;
    } else {
      itens.set(base.contact_id, { contact_id: base.contact_id, nome: base.nome, documento: base.documento, regime: base.regime ?? null, motivos: [m], prioridade: 0 });
    }
  };

  // Mensagens que exigem ação (intimação, malha, exclusão do Simples, MAED, cobrança, processo) ainda abertas, agrupadas por cliente.
  const porCliente = new Map<string, MensagemComCliente[]>();
  for (const m of d.criticas) {
    if (m.contacts?.status_cliente !== STATUS_MONITORADO) continue;
    if (m.situacao !== 'nova' && m.situacao !== 'em_tratamento') continue;
    const lista = porCliente.get(m.contact_id) ?? [];
    lista.push(m);
    porCliente.set(m.contact_id, lista);
  }
  for (const [contactId, msgs] of porCliente) {
    const primeira = msgs[0];
    const nome = primeira.contacts?.display_name || primeira.contacts?.name || 'Cliente';
    const validades = msgs.map((m) => m.data_validade).filter((v): v is string => !!v).sort();
    const dias = validades.length ? diasParaPrazo(validades[0]) : null;
    // A validade da mensagem costuma ser daqui a anos (2030, 2041): só importa quando está perto de vencer.
    const urgente = dias !== null && dias <= 7;
    const grave = msgs.some((m) => ['intimacao', 'malha', 'exclusao_simples'].includes(m.categoria));
    const categorias = [...new Set(msgs.map((m) => CATEGORIAS[m.categoria].label))];
    const validadeTxt = dias !== null && dias <= 30
      ? (dias < 0 ? `validade venceu em ${dataBR(validades[0])}` : dias === 0 ? 'validade termina hoje' : `validade até ${dataBR(validades[0])} (${dias} dia${dias === 1 ? '' : 's'})`)
      : null;
    adicionar(
      { contact_id: contactId, nome, documento: primeira.contacts?.document ?? '', regime: null },
      {
        motivo: 'intimacao',
        texto: msgs.length === 1 ? '1 mensagem exige ação' : `${msgs.length} mensagens exigem ação`,
        detalhe: [categorias.slice(0, 2).join(', ') + (categorias.length > 2 ? ` e mais ${categorias.length - 2}` : ''), validadeTxt].filter(Boolean).join(' · '),
        tom: urgente || grave ? 'danger' : 'warn',
        peso: urgente ? 120 : 100,
      },
    );
  }

  // Mensagem nova na Caixa Postal (novidade desde a última olhada). "Não lida" antiga não entra: é estado, não novidade.
  let caixasComMensagemNaoLida = 0;
  for (const c of clientesCaixa) {
    const estado = seloCaixa(c).estado;
    if (estado === 'nao_lida') caixasComMensagemNaoLida++;
    if (estado === 'nova') {
      adicionar(c, { motivo: 'mensagem_nova', texto: 'Mensagem nova na Caixa Postal', detalhe: c.evento_ultima_data ? `na Receita em ${dataBR(c.evento_ultima_data)}` : null, tom: 'info', peso: 50 });
    }
  }

  for (const l of d.pagamentos) {
    if (l.novo) adicionar(l, { motivo: 'pagamento_novo', texto: 'Pagamento novo na Receita', detalhe: null, tom: 'warn', peso: 30 });
  }
  for (const l of d.dctfweb) {
    if (l.novo) adicionar(l, { motivo: 'dctfweb', texto: 'Movimento na DCTFWeb', detalhe: l.movimentoEm ? `na Receita em ${dataBR(l.movimentoEm)}` : null, tom: 'warn', peso: 30 });
  }

  let semProcuracao = 0;
  for (const l of d.procuracoes) {
    if (l.filial) continue;
    if (l.situacao === 'sem') semProcuracao++;
    if (l.situacao === 'vencida') {
      adicionar(l, { motivo: 'procuracao', texto: 'Procuração vencida', detalhe: l.venceEm ? `venceu em ${dataBR(l.venceEm)}` : null, tom: 'danger', peso: 90 });
    } else if ((l.situacao === 'total' || l.situacao === 'parcial') && l.diasParaVencer !== null && l.diasParaVencer <= 60) {
      adicionar(l, {
        motivo: 'procuracao', texto: `Procuração vence em ${l.diasParaVencer} dia${l.diasParaVencer === 1 ? '' : 's'}`,
        detalhe: l.venceEm ? dataBR(l.venceEm) : null, tom: l.diasParaVencer <= 30 ? 'danger' : 'warn', peso: l.diasParaVencer <= 30 ? 75 : 65,
      });
    }
  }

  // Pendências conhecidas (vêm da última consulta da equipe, então mostram de quando é o dado).
  const atual = competenciaAtual();
  for (const l of d.parcelamentos) {
    if (l.filial || estadoParcelamento(l, atual) !== 'atrasado') continue;
    const atrasadas = parcelasAtrasadas(l, atual);
    const meses = atrasadas.map((p) => rotuloParcela(p.parcela));
    adicionar(l, {
      motivo: 'parcela_atrasada', texto: atrasadas.length === 1 ? '1 parcela em atraso' : `${atrasadas.length} parcelas em atraso`,
      detalhe: meses.slice(0, 3).join(', ') + (meses.length > 3 ? ` e mais ${meses.length - 3}` : ''), tom: 'danger', peso: 70,
    });
  }
  for (const l of d.sitfis) {
    if (l.filial || estadoSitfis(l) !== 'com_pendencias') continue;
    adicionar(l, { motivo: 'sitfis', texto: 'Pendência na Situação Fiscal', detalhe: l.ultimo?.gerado_em ? `relatório de ${dataBR(l.ultimo.gerado_em)}` : null, tom: 'danger', peso: 60 });
  }

  const lista = [...itens.values()].map((i) => {
    i.motivos.sort((a, b) => b.peso - a.peso);
    i.prioridade = i.motivos[0].peso * 100 + i.motivos.length;
    return i;
  }).sort((a, b) => b.prioridade - a.prioridade || a.nome.localeCompare(b.nome, 'pt-BR'));

  return { itens: lista, totalAtivos: clientesCaixa.length, caixasComMensagemNaoLida, semProcuracao };
}

export function useFilaDoDia(): ResumoFila {
  const competencia = competenciaPadrao();
  const caixa = useClientesCaixa();
  const criticas = useMensagensCriticas();
  const pagamentos = useMatrizPagamentos(competencia);
  const dctfweb = useMatrizDctfwebMit(competencia);
  const procuracoes = useProcuracoes();
  const parcelamentos = useMatrizParcelamentos();
  const sitfis = useMatrizSitfis();

  const carregando = [caixa, criticas, pagamentos, dctfweb, procuracoes, parcelamentos, sitfis].some((q) => q.isLoading);

  const resumo = useMemo(() => montarFila({
    caixa: caixa.data ?? SEM_DADOS, criticas: criticas.data ?? SEM_DADOS, pagamentos: pagamentos.data ?? SEM_DADOS, dctfweb: dctfweb.data ?? SEM_DADOS,
    procuracoes: procuracoes.data ?? SEM_DADOS, parcelamentos: parcelamentos.data ?? SEM_DADOS, sitfis: sitfis.data ?? SEM_DADOS,
  }), [caixa.data, criticas.data, pagamentos.data, dctfweb.data, procuracoes.data, parcelamentos.data, sitfis.data]);

  return { ...resumo, carregando };
}
