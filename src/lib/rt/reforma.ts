/**
 * Cenário pós-reforma (CBS + IBS) e a decisão do Simples: continuar no DAS unificado
 * ou passar IBS/CBS para o regime regular ("híbrido", art. 41, §3º da LC 214/2025).
 */

import { REDUCOES_SETORIAIS } from './tabelas';
import type {
  DiagnosticoInput,
  ResultadoHibrido,
  ResultadoReforma,
  ResultadoRegime,
} from './types';

export function calcularPosReforma(input: DiagnosticoInput): ResultadoReforma {
  const { faturamento12m: receita, comprasComCredito12m = 0 } = input;
  const observacoes: string[] = [];

  const reducao = REDUCOES_SETORIAIS.find((r) => r.key === input.reducaoSetorial);
  const fator = 1 - (reducao?.reducao ?? 0);

  const aliquotaCbs = input.aliquotaCbs * fator;
  const aliquotaIbs = input.aliquotaIbs * fator;
  const aliquotaTotal = aliquotaCbs + aliquotaIbs;

  const debito = receita * aliquotaTotal;
  const credito = comprasComCredito12m * aliquotaTotal;
  const liquido = Math.max(0, debito - credito);

  if (reducao && reducao.reducao > 0) {
    observacoes.push(
      `Aplicada a redução de ${(reducao.reducao * 100).toFixed(0)}% prevista para ${reducao.label.toLowerCase()} — ${reducao.fundamento}.`
    );
  }
  if (comprasComCredito12m > 0) {
    observacoes.push(
      `Na reforma quase toda compra com nota gera crédito. As compras informadas geram R$ ${(credito / 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} de crédito por mês, que abatem do imposto devido.`
    );
  } else {
    observacoes.push(
      'Nenhuma compra com direito a crédito foi informada. Como a reforma é não cumulativa (quase tudo com nota gera crédito), o valor real tende a ser menor que o mostrado aqui.'
    );
  }

  return {
    aliquotaCbs,
    aliquotaIbs,
    aliquotaTotal,
    reducaoAplicada: reducao?.reducao ?? 0,
    debito,
    credito,
    liquido,
    aliquotaEfetiva: liquido / receita,
    observacoes,
  };
}

/**
 * Simples: unificado × regime regular de IBS/CBS.
 *
 * No unificado, IBS/CBS seguem embutidos no DAS e o cliente PJ do comprador só credita
 * a fração embutida — sempre menor que o crédito cheio (art. 47, §9º, II).
 * No híbrido, a parcela de consumo sai do DAS e o IBS/CBS é destacado por fora,
 * com crédito integral para quem compra.
 */
export function calcularHibrido(
  input: DiagnosticoInput,
  simples: ResultadoRegime,
  reforma: ResultadoReforma
): ResultadoHibrido {
  // Só a parcela de consumo que está DENTRO do DAS é retirada dele.
  const consumoNoDas = simples.linhas
    .filter((l) => l.consumo && !l.foraDoDas)
    .reduce((s, l) => s + l.valor, 0);
  const foraDoDas = simples.linhas
    .filter((l) => l.foraDoDas)
    .reduce((s, l) => s + l.valor, 0);

  const unificadoTotal = simples.totalAnual;
  const hibridoDasResidual = simples.totalAnual - consumoNoDas - foraDoDas;
  const hibridoCbsIbs = reforma.liquido;
  const hibridoTotal = hibridoDasResidual + hibridoCbsIbs;
  const diferenca = hibridoTotal - unificadoTotal;

  const pctB2B = (input.pctB2B ?? 0) / 100;
  // No unificado o comprador credita só o que está embutido no DAS; no híbrido, o cheio.
  const creditoRepassadoUnificado = consumoNoDas * pctB2B;
  const creditoRepassadoHibrido = reforma.debito * pctB2B;
  const ganhoDeCredito = creditoRepassadoHibrido - creditoRepassadoUnificado;

  let recomendacao: ResultadoHibrido['recomendacao'];
  let justificativa: string;

  const custoDoHibrido = diferenca;
  // Todo texto de recomendação fala em valor mensal — é a unidade em que o dono decide.
  const porMes = (v: number) =>
    `R$ ${Math.abs(v / 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

  if (input.pctB2B === undefined || input.pctB2B === null) {
    recomendacao = 'analise_individual';
    justificativa =
      'Sem saber quanto da receita vai para outras empresas, não dá para fechar a recomendação: o ganho do regime regular está justamente no crédito que você repassa a clientes PJ.';
  } else if (custoDoHibrido <= 0 && ganhoDeCredito > 0) {
    recomendacao = 'hibrido';
    justificativa = `O regime regular sai mais barato (economia de ${porMes(custoDoHibrido)} por mês) e ainda repassa mais crédito aos seus clientes empresa. Nos dois lados ele ganha.`;
  } else if (pctB2B >= 0.5 && ganhoDeCredito > custoDoHibrido) {
    recomendacao = 'hibrido';
    justificativa = `Você paga ${porMes(custoDoHibrido)} a mais por mês no regime regular, mas passa a repassar ${porMes(ganhoDeCredito)} a mais de crédito por mês para seus clientes empresa. Com ${(pctB2B * 100).toFixed(0)}% das vendas indo para PJ, esse crédito vira argumento de preço e de permanência do cliente.`;
  } else if (pctB2B < 0.3) {
    recomendacao = 'unificado';
    justificativa = `Com só ${(pctB2B * 100).toFixed(0)}% das vendas indo para outras empresas, o crédito cheio quase não tem para quem ser repassado — quem compra como consumidor final não aproveita crédito. Ficar no DAS unificado mantém a simplicidade e ${custoDoHibrido > 0 ? 'sai mais barato' : 'não custa mais caro'}.`;
  } else {
    recomendacao = 'analise_individual';
    justificativa = `O resultado ficou apertado: o regime regular ${custoDoHibrido > 0 ? `custa ${porMes(custoDoHibrido)} a mais por mês` : 'sai mais barato'} e devolve ${porMes(ganhoDeCredito)} a mais de crédito por mês aos clientes PJ. Vale sentar com o contador e olhar a carteira de clientes um a um antes de decidir.`;
  }

  return {
    unificadoTotal,
    hibridoDasResidual,
    hibridoCbsIbs,
    hibridoTotal,
    diferenca,
    creditoRepassadoUnificado,
    creditoRepassadoHibrido,
    recomendacao,
    justificativa,
  };
}
