import { hojeBR, semZeros, vencimentoDoPeriodo } from '@/lib/prazosFederais';
import { dasDoPeriodo, type DasRow, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import type { LinhaPagamentos, PagamentoRow } from '@/hooks/useSerproPagamentos';

/**
 * "DAS pago?" numa fonte só. Duas fontes dizem a mesma coisa de formas diferentes:
 *  · PGDAS (índice do ano, R$ 0,24 por cliente): por DAS traz número, emissão e a marca "pago". Não traz vencimento, valor nem data do pagamento.
 *  · Pagamentos (PAGTOWEB): traz o documento pago, com data, valor e comprovante. Só vê o que foi pago.
 * Pago = qualquer uma das duas diz pago. Um mês com dois DAS (o 1º não pago, trocado por outro pago) conta como pago.
 * O número do DAS vem com zero à esquerda no PGDAS e sem zero no Pagamentos: o cruzamento ignora os zeros.
 */
export type EstadoDas = 'nao_simples' | 'filial' | 'nao_consultado' | 'sem_das' | 'pago' | 'a_vencer' | 'vencido';

export interface DasUnificado {
  estado: EstadoDas;
  /** AAAA-MM-DD: o do DAS gerado por aqui, ou o calculado (dia 20, segunda se cair no fim de semana). */
  vencimento: string | null;
  vencimentoCalculado: boolean;
  /** Valor do documento pago (Pagamentos) ou do DAS gerado por aqui. Desconhecido para DAS que só veio do índice. */
  valor: number | null;
  /** Data do pagamento, quando o Pagamentos já foi consultado. */
  pagoEm: string | null;
  origemPago: 'pgdas' | 'pagamentos' | 'ambos' | null;
  /** DAS do período segundo o PGDAS (mais recente primeiro). */
  das: DasRow[];
  /** Documentos DAS do período segundo o Pagamentos. */
  docs: PagamentoRow[];
  /** Cada DAS do PGDAS com o documento de Pagamentos que casa pelo número, se houver. */
  casados: { das: DasRow; doc: PagamentoRow | null }[];
}

const VAZIO: Omit<DasUnificado, 'estado'> = { vencimento: null, vencimentoCalculado: false, valor: null, pagoEm: null, origemPago: null, das: [], docs: [], casados: [] };

export function dasUnificado(pg: LinhaPgdasd | null | undefined, docsDoMes: PagamentoRow[], pa: string, hoje = hojeBR()): DasUnificado {
  if (pg?.filial) return { ...VAZIO, estado: 'filial' };
  const docs = docsDoMes.filter((d) => d.tipo_sigla === 'DAS' && (d.periodo_apuracao ?? '').slice(0, 7) === pa);
  if (!pg && !docs.length) return { ...VAZIO, estado: 'nao_simples' };

  const das = pg ? dasDoPeriodo(pg, pa) : [];
  const porNumero = new Map(docs.map((d) => [semZeros(d.numero_documento), d]));
  const casados = das.map((d) => ({ das: d, doc: porNumero.get(semZeros(d.numero_das)) ?? null }));
  const pagoPgdas = das.some((d) => d.das_pago === true);
  const pagoDocs = docs.length > 0;
  const origemPago = pagoPgdas && pagoDocs ? 'ambos' : pagoPgdas ? 'pgdas' : pagoDocs ? 'pagamentos' : null;

  const conhecido = das.map((d) => d.vencimento).filter((v): v is string => !!v).sort().pop() ?? docs[0]?.data_vencimento ?? null;
  const vencimento = conhecido ?? vencimentoDoPeriodo(pa);
  const base = { vencimento, vencimentoCalculado: !conhecido, das, docs, casados };

  if (origemPago) {
    return {
      ...base, estado: 'pago', origemPago, pagoEm: docs[0]?.data_arrecadacao ?? null,
      valor: docs[0]?.valor_total ?? das.find((d) => d.valor_total != null)?.valor_total ?? null,
    };
  }
  if (!pg?.consultadoEm) return { ...VAZIO, estado: 'nao_consultado' };
  if (!das.length) return { ...base, estado: 'sem_das', valor: null, pagoEm: null, origemPago: null };
  return {
    ...base, estado: hoje > vencimento ? 'vencido' : 'a_vencer', valor: das.find((d) => d.valor_total != null)?.valor_total ?? null, pagoEm: null, origemPago: null,
  };
}

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto para o WhatsApp do cliente. No dia diz o valor da guia; depois do vencimento não diz (multa e juros mudam o valor). */
export function mensagemLembreteDas(p: { nome: string; pa: string; valor: number | null; vencimento: string; diasAtraso: number }): string {
  const mes = `${p.pa.slice(5, 7)}/${p.pa.slice(0, 4)}`;
  if (p.diasAtraso <= 0) {
    return `Olá! Aqui é da Contabilidade Alves. Passando para lembrar que o DAS (Simples Nacional) da ${p.nome} referente a ${mes}${p.valor ? `, no valor de ${reais(p.valor)},` : ''} vence hoje, ${dataBR(p.vencimento).slice(0, 5)}. Até agora não consta o pagamento na Receita Federal. Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só nos chamar.`;
  }
  return `Olá! Aqui é da Contabilidade Alves. O DAS (Simples Nacional) da ${p.nome} referente a ${mes} venceu em ${dataBR(p.vencimento).slice(0, 5)} e ainda não consta o pagamento na Receita Federal. Pagando logo, você reduz a multa e os juros. Se precisar da guia atualizada, é só nos pedir. Se você já pagou, pode desconsiderar esta mensagem.`;
}

export interface LinhaUnificada extends LinhaPagamentos {
  /** Linha do PGDAS (só clientes do Simples). */
  simples: LinhaPgdasd | null;
  das: DasUnificado;
  /** Última consulta do cliente nas duas fontes (ISO). */
  ultimaConsulta: string | null;
}

/** Junta a matriz de Pagamentos (todos os clientes ativos) com a do PGDAS (Simples) e calcula o DAS de cada um. Função pura. */
export function unificarLinhas(pagamentos: LinhaPagamentos[], simples: LinhaPgdasd[], pa: string, hoje = hojeBR()): LinhaUnificada[] {
  const sPor = new Map(simples.map((l) => [l.contact_id, l]));
  return pagamentos.map((l) => {
    const s = sPor.get(l.contact_id) ?? null;
    const consultas = [l.consultadoEm, s?.consultadoEm].filter((x): x is string => !!x).sort();
    return { ...l, simples: s, das: dasUnificado(s, l.docs, pa, hoje), ultimaConsulta: consultas.pop() ?? null };
  });
}

export const ehSimplesConsultavel = (l: { simples: LinhaPgdasd | null }) => !!l.simples && !l.simples.filial;
