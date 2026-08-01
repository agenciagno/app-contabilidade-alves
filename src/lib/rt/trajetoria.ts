/**
 * Trajetória da carga sobre consumo, ano a ano, de 2026 até 2033.
 *
 * Modela a transição do ADCT (art. 128) e da LC 214/2025 em duas frentes independentes:
 *
 *  Federal (PIS/Cofins → CBS)
 *    2026 ......... PIS/Cofins normais. CBS entra a 0,9% só para teste, compensável — sem
 *                   efeito de caixa, por isso não entra na conta.
 *    2027 em diante CBS cheia; PIS e Cofins extintos.
 *
 *  Estadual/municipal (ICMS/ISS → IBS)
 *    2026–2028 .... ICMS e ISS integrais; IBS a 0,1%, também só teste.
 *    2029–2032 .... ICMS/ISS caem para 9/10, 8/10, 7/10 e 6/10, e o IBS ocupa o espaço
 *                   restante na mesma proporção.
 *    2033 ......... ICMS e ISS extintos; IBS integral.
 *
 * A faixa sombreada do gráfico não é margem de erro inventada: é o mesmo cálculo rodado
 * sem nenhum aproveitamento de crédito. Ela mostra o quanto o crédito das compras muda o
 * resultado — a variável que mais pesa e que depende da operação de cada empresa.
 */

import type { DiagnosticoInput, ResultadoRegime } from './types';

export interface PontoTrajetoria {
  ano: number;
  rotulo: string;
  /** Carga anual no cenário com o crédito informado. */
  valor: number;
  /** Mesma carga sem aproveitar crédito nenhum — teto da faixa. */
  valorSemCredito: number;
  /** Carga como % do faturamento (cenário central). */
  percentual: number;
  marco?: string;
}

/** Fração de ICMS/ISS ainda cobrada em cada ano (ADCT, art. 128). */
const FRACAO_ICMS_ISS: Record<number, number> = {
  2026: 1, 2027: 1, 2028: 1, 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6, 2033: 0,
};

const MARCOS: Record<number, string> = {
  2026: 'Hoje',
  2027: '1ª virada',
  2029: 'Início da fase final',
  2033: 'Reforma plena',
};

export function calcularTrajetoria(
  input: DiagnosticoInput,
  atual: ResultadoRegime,
  aliquotaCbsEfetiva: number,
  aliquotaIbsEfetiva: number,
  simplesFicaNoUnificado: boolean
): PontoTrajetoria[] {
  const receita = input.faturamento12m;
  const compras = input.comprasComCredito12m ?? 0;
  const anos = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

  // Quem fica no DAS unificado atravessa a transição sem mudança: IBS e CBS seguem
  // embutidos e as tabelas do Simples não foram alteradas. Linha reta, e é a verdade.
  if (simplesFicaNoUnificado) {
    return anos.map((ano) => ({
      ano,
      rotulo: String(ano),
      valor: atual.cargaConsumo,
      valorSemCredito: atual.cargaConsumo,
      percentual: atual.cargaConsumo / receita,
      marco: MARCOS[ano],
    }));
  }

  // Separa a carga de hoje nas duas frentes que caminham em ritmos diferentes.
  const federalHoje = atual.linhas
    .filter((l) => l.consumo && /PIS|Cofins/i.test(l.tributo))
    .reduce((s, l) => s + l.valor, 0);
  const estadualHoje = atual.linhas
    .filter((l) => l.consumo && /ICMS|ISS|IPI/i.test(l.tributo))
    .reduce((s, l) => s + l.valor, 0);

  const calcular = (ano: number, comCredito: boolean) => {
    const baseCredito = comCredito ? compras : 0;
    const fracaoAntiga = FRACAO_ICMS_ISS[ano];
    const fracaoIbs = 1 - fracaoAntiga;

    // Federal: vira CBS de uma vez em 2027.
    const federal =
      ano <= 2026
        ? federalHoje
        : Math.max(0, (receita - baseCredito) * aliquotaCbsEfetiva);

    // Estadual/municipal: parte ainda em ICMS/ISS, parte já em IBS.
    const estadual =
      estadualHoje * fracaoAntiga +
      Math.max(0, (receita - baseCredito) * aliquotaIbsEfetiva) * fracaoIbs;

    return federal + estadual;
  };

  return anos.map((ano) => {
    const valor = calcular(ano, true);
    return {
      ano,
      rotulo: String(ano),
      valor,
      valorSemCredito: calcular(ano, false),
      percentual: valor / receita,
      marco: MARCOS[ano],
    };
  });
}

/** Etapas da linha do tempo — texto de apoio, sem número calculado. */
export interface EtapaTransicao {
  id: string;
  rotulo: string;
  titulo: string;
  texto: string;
  destaque?: boolean;
}

export const ETAPAS_TRANSICAO: EtapaTransicao[] = [
  {
    id: '2026',
    rotulo: '2026',
    titulo: 'Início e teste',
    texto:
      'CBS e IBS aparecem na nota com alíquota simbólica (0,9% e 0,1%), só para teste — são compensáveis e não saem do caixa. PIS, Cofins, ICMS e ISS continuam valendo normalmente. Empresas do Simples estão dispensadas dessa fase. É o momento de arrumar cadastro e sistema antes das viradas reais.',
  },
  {
    id: '2027',
    rotulo: '2027',
    titulo: 'CBS pra valer',
    texto:
      'A CBS substitui PIS e Cofins de uma vez, e o IPI vai a zero (com exceções). É a primeira virada que mexe de verdade na apuração e no caixa — e é quando o split payment começa a aparecer.',
  },
  {
    id: '2028',
    rotulo: '2028',
    titulo: 'Calibragem',
    texto:
      'Ano de ajuste antes da subida do IBS. O governo acompanha se a arrecadação ficou dentro do previsto, para chegar em 2029 sem surpresa. Na prática, para a empresa, é um ano parecido com 2027.',
  },
  {
    id: '2029-2032',
    rotulo: '2029–32',
    titulo: 'IBS sobe, ICMS e ISS caem',
    texto:
      'ICMS e ISS são cobrados a 9/10, 8/10, 7/10 e 6/10, e o IBS ocupa o espaço na mesma proporção. Os benefícios fiscais estaduais terminam de forma escalonada — vale rever em quais estados e cidades compensa operar.',
    destaque: true,
  },
  {
    id: '2033',
    rotulo: '2033',
    titulo: 'Reforma plena',
    texto:
      'ICMS e ISS extintos. Valem só CBS, IBS e o Imposto Seletivo. É o ponto de chegada — e o cenário que esta simulação projeta.',
  },
];
