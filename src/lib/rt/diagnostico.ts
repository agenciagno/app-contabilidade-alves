/**
 * Orquestrador do diagnóstico: junta os três regimes, o cenário pós-reforma e a
 * decisão do Simples, e escreve a explicação em português de gente.
 *
 * O texto não é enfeite: o pedido era "sempre explicando por que aumentou ou diminuiu".
 * Um número sozinho não serve para o empresário decidir nada.
 */

import { calcularHibrido, calcularPosReforma } from './reforma';
import { calcularPresumido, calcularReal, calcularSimples } from './regimes';
import { calcularTrajetoria } from './trajetoria';
import {
  PIS_COFINS_CUMULATIVO,
  PIS_COFINS_NAO_CUMULATIVO,
  REGIME_LABEL,
  TETO_SIMPLES,
} from './tabelas';
import type { Diagnostico, DiagnosticoInput, ResultadoRegime } from './types';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
/** Valor anual apresentado por mês — é assim que o empresário pensa a conta. */
const mensal = (v: number) => brl(v / 12);

function explicar(
  input: DiagnosticoInput,
  atual: ResultadoRegime,
  variacaoValor: number,
  cargaHoje: number,
  cargaReforma: number,
  simplesFicaNoUnificado: boolean
): string {
  const subiu = variacaoValor > 0;
  const partes: string[] = [];

  if (simplesFicaNoUnificado) {
    // Para quem fica no DAS, anunciar um salto de carga seria simplesmente falso.
    partes.push(
      `Hoje a empresa paga ${mensal(cargaHoje)} por mês em tributos sobre consumo (${brl(cargaHoje)} no ano) — ${pct(cargaHoje / input.faturamento12m)} do faturamento. Ficando no regime unificado, que é o que acontece se ela não fizer nada, essa conta não muda: IBS e CBS continuam embutidos no DAS e as tabelas do Simples não foram alteradas pela reforma.`
    );
    partes.push(
      'O que muda para o Simples é outra coisa, e é importante: o cliente que compra de você e é empresa passa a aproveitar um crédito menor do que aproveitaria comprando de um fornecedor do regime regular. Isso mexe na sua competitividade, não no seu boleto.'
    );
    partes.push(
      `Se a empresa optar pelo regime regular na janela de setembro, aí sim a conta muda: o IBS/CBS sai do DAS e passa a ser apurado por fora, o que daria ${mensal(cargaReforma)} por mês em CBS e IBS. A comparação completa dos dois caminhos está logo abaixo.`
    );
    return partes.join(' ');
  }

  const direcao = subiu ? 'sobe' : 'cai';
  partes.push(
    `Hoje a empresa paga ${mensal(cargaHoje)} por mês em tributos sobre consumo — ${pct(cargaHoje / input.faturamento12m)} do faturamento. No cenário da reforma esse valor ${direcao} para ${mensal(cargaReforma)} por mês (${pct(cargaReforma / input.faturamento12m)}), uma diferença de ${mensal(Math.abs(variacaoValor))} por mês, ou ${brl(Math.abs(variacaoValor))} no ano.`
  );

  // O porquê muda conforme o regime de origem — é aqui que mora a explicação de verdade.
  if (atual.regime === 'lucro_presumido') {
    const semCredito = (input.comprasComCredito12m ?? 0) <= 0;
    partes.push(
      `No Lucro Presumido o PIS/Cofins de hoje é cumulativo: ${pct(PIS_COFINS_CUMULATIVO)} sobre tudo que entra, sem direito a nenhum crédito. A CBS e o IBS têm alíquota bem maior, mas são não cumulativos — quase toda compra com nota vira crédito e abate do que você deve.`
    );
    partes.push(
      semCredito
        ? 'Como não informamos compras com direito a crédito, esta simulação mostra o pior caso. Quanto mais a empresa comprar de fornecedores que emitem nota, menor fica esse número.'
        : `Foi justamente o crédito das compras (${brl(input.comprasComCredito12m ?? 0)} no ano) que segurou o resultado — sem ele a carga seria bem maior.`
    );
  } else {
    partes.push(
      `No Lucro Real a empresa já convive com a não cumulatividade: PIS/Cofins a ${pct(PIS_COFINS_NAO_CUMULATIVO)} com crédito sobre insumos. A reforma segue a mesma lógica, só que com crédito mais amplo — praticamente tudo que tem nota gera crédito, inclusive despesas que hoje ficam de fora.`
    );
  }

  if (input.setor === 'servico' && (input.comprasComCredito12m ?? 0) < input.faturamento12m * 0.2) {
    partes.push(
      'Atenção ao perfil de serviço: o custo principal costuma ser a folha de pagamento, e salário não gera crédito. Empresas de serviço com pouca compra de insumo são as que mais sentem o aumento na reforma — é o efeito mais previsível de toda a mudança.'
    );
  }

  if (input.reducaoSetorial && input.reducaoSetorial !== 'nenhuma') {
    partes.push(
      'O setor informado tem redução de alíquota prevista em lei, e ela já está aplicada no cálculo acima — sem essa redução o número seria bem mais alto.'
    );
  }

  return partes.join(' ');
}

export function gerarDiagnostico(input: DiagnosticoInput): Diagnostico {
  const simples = calcularSimples(input);
  const presumido = calcularPresumido(input);
  const real = calcularReal(input);

  const porRegime: Record<string, ResultadoRegime> = {
    simples_nacional: simples,
    lucro_presumido: presumido,
    lucro_real: real,
  };
  const atual = porRegime[input.regimeAtual];

  const comparativo = [simples, presumido, real];

  // Só compara regimes que puderam ser calculados por inteiro.
  const comparaveis = comparativo.filter((r) => !r.indisponivel);
  const melhorRegime =
    comparaveis.length > 1
      ? comparaveis.reduce((a, b) => (a.totalAnual <= b.totalAnual ? a : b))
      : null;
  const economiaMigracao =
    melhorRegime && !atual.indisponivel ? atual.totalAnual - melhorRegime.totalAnual : 0;

  const posReforma = calcularPosReforma(input);

  const cargaHoje = atual.cargaConsumo;
  const cargaReforma = posReforma.liquido;

  // O optante do Simples que não faz nada permanece no DAS unificado, e aí a reforma
  // não mexe na conta dele. Só quem opta pelo regime regular passa a pagar CBS/IBS
  // por fora. Tratar os dois como o mesmo cenário produziria um "aumento" que não existe.
  const simplesFicaNoUnificado =
    input.regimeAtual === 'simples_nacional' && !simples.indisponivel;

  const variacaoValor = simplesFicaNoUnificado ? 0 : cargaReforma - cargaHoje;
  const variacaoPercentual = cargaHoje > 0 ? variacaoValor / cargaHoje : 0;

  const hibrido =
    input.regimeAtual === 'simples_nacional' && !simples.indisponivel
      ? calcularHibrido(input, simples, posReforma)
      : null;

  const alertas: string[] = [];

  alertas.push(
    'As alíquotas de CBS e IBS ainda não foram fixadas em lei. O teto de 26,5% está na LC 214/2025, mas a divisão exata entre os dois depende de Resolução do Senado, prevista só depois de 15/09/2026. Este número é uma estimativa e vai mudar.'
  );

  if (input.regimeAtual === 'simples_nacional') {
    alertas.push(
      'Janela de decisão: de 1º a 30 de setembro de 2026 a empresa escolhe, para 2027, entre manter IBS/CBS dentro do DAS ou apurá-los pelo regime regular. Quem não faz nada permanece no unificado. Dá para cancelar a opção até 30 de novembro de 2026.'
    );
    alertas.push(
      'A opção pelo regime regular feita em setembro vale só para o 1º semestre de 2027 — há uma nova janela em março de 2027 para o 2º semestre.'
    );
  }

  if (input.faturamento12m > TETO_SIMPLES * 0.85 && input.regimeAtual === 'simples_nacional') {
    alertas.push(
      `O faturamento está perto do teto do Simples (${brl(TETO_SIMPLES)}). Vale acompanhar de perto para não ser desenquadrado no meio do ano.`
    );
  }

  if ((input.comprasComCredito12m ?? 0) <= 0 && input.regimeAtual !== 'simples_nacional') {
    alertas.push(
      'Sem informar as compras com direito a crédito, o cenário da reforma sai superestimado. Esse é o campo que mais muda o resultado — vale levantar o número real.'
    );
  }

  alertas.push(
    'A partir de 2027 entra o split payment: o imposto é separado no momento do pagamento, antes do dinheiro chegar na conta. Não muda quanto se paga, mas muda quando — e isso afeta o capital de giro.'
  );

  return {
    input,
    geradoEm: new Date().toISOString(),
    atual,
    comparativo,
    melhorRegime,
    economiaMigracao,
    posReforma,
    simplesFicaNoUnificado,
    variacaoValor,
    variacaoPercentual,
    hibrido,
    trajetoria: calcularTrajetoria(
      input,
      atual,
      posReforma.aliquotaCbs,
      posReforma.aliquotaIbs,
      simplesFicaNoUnificado
    ),
    explicacao: explicar(
      input,
      atual,
      variacaoValor,
      cargaHoje,
      cargaReforma,
      simplesFicaNoUnificado
    ),
    alertas,
  };
}

export { REGIME_LABEL };
