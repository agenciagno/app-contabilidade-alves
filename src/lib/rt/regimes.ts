/**
 * Cálculo dos três regimes atuais. Tudo em base anual (12 meses).
 *
 * A separação entre "carga de consumo" e "resto" é o eixo do diagnóstico: a reforma
 * substitui PIS, Cofins, ICMS, ISS e IPI — e não encosta em IRPJ, CSLL e CPP. Comparar
 * o DAS inteiro com CBS+IBS seria comparar coisas diferentes.
 */

import {
  ANEXO_LABEL,
  CSLL_ALIQUOTA,
  FAIXAS,
  FATOR_R_LIMITE,
  IRPJ_ADICIONAL,
  IRPJ_ADICIONAL_LIMITE_ANUAL,
  IRPJ_ALIQUOTA,
  LC224_ACRESCIMO,
  LC224_LIMITE,
  PIS_COFINS_CUMULATIVO,
  PIS_COFINS_NAO_CUMULATIVO,
  PRESUNCAO,
  REGIME_LABEL,
  REPARTICAO,
  SUBLIMITE_ICMS_ISS,
  TETO_ISS_5A_FAIXA,
  TETO_SIMPLES,
  type Anexo,
  type ReparticaoFaixa,
  type Setor,
} from './tabelas';
import type { DiagnosticoInput, LinhaTributo, ResultadoRegime } from './types';

/** Faixa do Simples correspondente ao RBT12. */
function faixaDe(anexo: Anexo, rbt12: number) {
  const faixas = FAIXAS[anexo];
  return faixas.find((f) => rbt12 <= f.ate) ?? faixas[faixas.length - 1];
}

/** Anexo aplicável: setor + Fator R (LC 123/2006, art. 18, §§5º-J e 5º-M). */
export function definirAnexo(
  setor: Setor,
  rbt12: number,
  folha12m?: number,
  atividadeAnexoIV?: boolean
): { anexo: Anexo; fatorR?: number; observacao?: string } {
  if (setor === 'comercio') return { anexo: 'I' };
  if (setor === 'industria') return { anexo: 'II' };
  if (atividadeAnexoIV) return { anexo: 'IV' };

  if (folha12m === undefined || folha12m === null || rbt12 <= 0) {
    return {
      anexo: 'V',
      observacao:
        'Sem a folha dos últimos 12 meses não dá para apurar o Fator R. Usamos o Anexo V, que é o cenário mais conservador — com a folha informada o resultado pode melhorar.',
    };
  }

  const fatorR = folha12m / rbt12;
  return {
    anexo: fatorR >= FATOR_R_LIMITE ? 'III' : 'V',
    fatorR,
    observacao:
      fatorR >= FATOR_R_LIMITE
        ? `Fator R de ${(fatorR * 100).toFixed(1)}% (folha ÷ faturamento) ficou em 28% ou mais, então vale o Anexo III, que é mais barato.`
        : `Fator R de ${(fatorR * 100).toFixed(1)}% ficou abaixo de 28%, então vale o Anexo V. Aumentar a folha (inclusive pró-labore) pode migrar a empresa para o Anexo III.`,
  };
}

/**
 * Repartição da faixa, já aplicando o teto de ISS de 5% da 5ª faixa dos Anexos III e IV.
 * Acima do gatilho o ISS trava em 5% da receita e a diferença vai para os federais.
 */
function reparticaoEfetiva(anexo: Anexo, faixa: number, aliquotaEfetiva: number): ReparticaoFaixa {
  const base = REPARTICAO[anexo][faixa - 1];
  const teto = TETO_ISS_5A_FAIXA[anexo];
  if (faixa !== 5 || !teto || aliquotaEfetiva <= teto.gatilho) return base;

  // Os fatores da lei produzem valores absolutos sobre a receita; converte-se em share
  // dividindo pela alíquota efetiva.
  const excedente = aliquotaEfetiva - 0.05;
  const share = (fator: number) => (excedente * fator) / aliquotaEfetiva;
  return {
    irpj: share(teto.fatores.irpj),
    csll: share(teto.fatores.csll),
    cofins: share(teto.fatores.cofins),
    pis: share(teto.fatores.pis),
    cpp: share(teto.fatores.cpp),
    iss: 0.05 / aliquotaEfetiva,
  };
}

export function calcularSimples(input: DiagnosticoInput): ResultadoRegime {
  const { faturamento12m: rbt12, setor, folha12m, atividadeAnexoIV } = input;
  const observacoes: string[] = [];

  if (rbt12 > TETO_SIMPLES) {
    return {
      regime: 'simples_nacional',
      label: REGIME_LABEL.simples_nacional,
      totalAnual: 0,
      cargaConsumo: 0,
      cargaNaoConsumo: 0,
      aliquotaEfetiva: 0,
      aliquotaEfetivaConsumo: 0,
      linhas: [],
      indisponivel: `Faturamento acima do teto de R$ ${TETO_SIMPLES.toLocaleString('pt-BR')} — a empresa não pode optar pelo Simples Nacional.`,
      observacoes,
    };
  }

  const { anexo, fatorR, observacao } = definirAnexo(setor, rbt12, folha12m, atividadeAnexoIV);
  if (observacao) observacoes.push(observacao);

  const f = faixaDe(anexo, rbt12);
  const aliquotaEfetiva = (rbt12 * f.aliquotaNominal - f.deduzir) / rbt12;
  const das = rbt12 * aliquotaEfetiva;
  const rep = reparticaoEfetiva(anexo, f.faixa, aliquotaEfetiva);

  const linhas: LinhaTributo[] = [
    { tributo: 'IRPJ', valor: das * rep.irpj, consumo: false },
    { tributo: 'CSLL', valor: das * rep.csll, consumo: false },
    { tributo: 'CPP (INSS patronal)', valor: das * rep.cpp, consumo: false },
    { tributo: 'Cofins', valor: das * rep.cofins, consumo: true },
    { tributo: 'PIS/Pasep', valor: das * rep.pis, consumo: true },
  ];
  if (rep.ipi) linhas.push({ tributo: 'IPI', valor: das * rep.ipi, consumo: true });
  if (rep.icms) linhas.push({ tributo: 'ICMS', valor: das * rep.icms, consumo: true });
  if (rep.iss) linhas.push({ tributo: 'ISS', valor: das * rep.iss, consumo: true });

  observacoes.push(
    `${ANEXO_LABEL[anexo]}, ${f.faixa}ª faixa. Alíquota efetiva de ${(aliquotaEfetiva * 100).toFixed(2)}% — calculada por (RBT12 × ${(f.aliquotaNominal * 100).toFixed(2)}% − R$ ${f.deduzir.toLocaleString('pt-BR')}) ÷ RBT12.`
  );

  // Acima do sublimite, ICMS/ISS saem do DAS e vão direto ao estado/município (art. 13-A).
  if (rbt12 > SUBLIMITE_ICMS_ISS) {
    const aliqExtra =
      setor === 'servico' ? (input.aliquotaIss ?? 5) / 100 : (input.aliquotaIcms ?? 18) / 100;
    const nome = setor === 'servico' ? 'ISS' : 'ICMS';
    linhas.push({
      tributo: `${nome} (fora do DAS, acima do sublimite)`,
      valor: rbt12 * aliqExtra,
      consumo: true,
      foraDoDas: true,
    });
    observacoes.push(
      `Acima do sublimite de R$ ${SUBLIMITE_ICMS_ISS.toLocaleString('pt-BR')}, o ${nome} sai do DAS e passa a ser recolhido direto ao ${setor === 'servico' ? 'município' : 'estado'}, pela alíquota cheia.`
    );
  }

  const totalAnual = linhas.reduce((s, l) => s + l.valor, 0);
  const cargaConsumo = linhas.filter((l) => l.consumo).reduce((s, l) => s + l.valor, 0);

  return {
    regime: 'simples_nacional',
    label: REGIME_LABEL.simples_nacional,
    totalAnual,
    cargaConsumo,
    cargaNaoConsumo: totalAnual - cargaConsumo,
    aliquotaEfetiva: totalAnual / rbt12,
    aliquotaEfetivaConsumo: cargaConsumo / rbt12,
    linhas,
    anexo,
    fatorR,
    observacoes,
  };
}

/** IRPJ + adicional de 10% sobre o que passar de R$ 240 mil/ano de base. */
function irpjComAdicional(basePresumida: number) {
  const principal = basePresumida * IRPJ_ALIQUOTA;
  const adicional = Math.max(0, basePresumida - IRPJ_ADICIONAL_LIMITE_ANUAL) * IRPJ_ADICIONAL;
  return { principal, adicional };
}

export function calcularPresumido(input: DiagnosticoInput): ResultadoRegime {
  const { faturamento12m: receita, setor } = input;
  const observacoes: string[] = [];
  const p = PRESUNCAO[setor];

  // LC 224/2025: +10 pontos na presunção da parcela acima de R$ 5 milhões.
  const acimaDoLimite = Math.max(0, receita - LC224_LIMITE);
  const ateOLimite = receita - acimaDoLimite;
  const baseIrpj = ateOLimite * p.irpj + acimaDoLimite * (p.irpj + LC224_ACRESCIMO);
  const baseCsll = ateOLimite * p.csll + acimaDoLimite * (p.csll + LC224_ACRESCIMO);

  if (acimaDoLimite > 0) {
    observacoes.push(
      `Sobre a receita acima de R$ ${LC224_LIMITE.toLocaleString('pt-BR')} aplicamos o acréscimo de 10 pontos na presunção (LC 224/2025). Essa regra está sendo questionada na Justiça — se a empresa tiver liminar, o valor cai.`
    );
  }

  const { principal, adicional } = irpjComAdicional(baseIrpj);
  const pisCofins = receita * PIS_COFINS_CUMULATIVO;

  const linhas: LinhaTributo[] = [
    { tributo: 'IRPJ (15% sobre a base presumida)', valor: principal, consumo: false },
    { tributo: 'CSLL (9% sobre a base presumida)', valor: baseCsll * CSLL_ALIQUOTA, consumo: false },
    { tributo: 'PIS/Cofins cumulativo (3,65%)', valor: pisCofins, consumo: true },
  ];
  if (adicional > 0) {
    linhas.splice(1, 0, { tributo: 'IRPJ — adicional de 10%', valor: adicional, consumo: false });
  }

  if (setor === 'servico') {
    const iss = (input.aliquotaIss ?? 5) / 100;
    linhas.push({ tributo: `ISS (${(iss * 100).toFixed(2)}%)`, valor: receita * iss, consumo: true });
  } else {
    const icms = (input.aliquotaIcms ?? 18) / 100;
    linhas.push({ tributo: `ICMS (${(icms * 100).toFixed(2)}%)`, valor: receita * icms, consumo: true });
  }

  observacoes.push(
    `Presunção de ${(p.irpj * 100).toFixed(0)}% para IRPJ e ${(p.csll * 100).toFixed(0)}% para CSLL, conforme a atividade (Lei 9.249/1995). No Presumido o PIS/Cofins é cumulativo: 3,65% sobre o faturamento, sem direito a crédito.`
  );
  observacoes.push(
    'A CPP (INSS patronal, cerca de 20% da folha) é recolhida à parte e não entra nesta conta — ela não muda com a reforma.'
  );

  const totalAnual = linhas.reduce((s, l) => s + l.valor, 0);
  const cargaConsumo = linhas.filter((l) => l.consumo).reduce((s, l) => s + l.valor, 0);

  return {
    regime: 'lucro_presumido',
    label: REGIME_LABEL.lucro_presumido,
    totalAnual,
    cargaConsumo,
    cargaNaoConsumo: totalAnual - cargaConsumo,
    aliquotaEfetiva: totalAnual / receita,
    aliquotaEfetivaConsumo: cargaConsumo / receita,
    linhas,
    observacoes,
  };
}

export function calcularReal(input: DiagnosticoInput): ResultadoRegime {
  const { faturamento12m: receita, setor, comprasComCredito12m = 0, margemLucro } = input;
  const observacoes: string[] = [];

  // PIS/Cofins não cumulativo: 9,25% sobre a receita, menos crédito sobre as compras.
  const pisCofinsDebito = receita * PIS_COFINS_NAO_CUMULATIVO;
  const pisCofinsCredito = comprasComCredito12m * PIS_COFINS_NAO_CUMULATIVO;
  const pisCofins = Math.max(0, pisCofinsDebito - pisCofinsCredito);

  const linhas: LinhaTributo[] = [
    {
      tributo: 'PIS/Cofins não cumulativo (9,25%, já com crédito)',
      valor: pisCofins,
      consumo: true,
    },
  ];

  if (setor === 'servico') {
    const iss = (input.aliquotaIss ?? 5) / 100;
    linhas.push({ tributo: `ISS (${(iss * 100).toFixed(2)}%)`, valor: receita * iss, consumo: true });
  } else {
    const icms = (input.aliquotaIcms ?? 18) / 100;
    // ICMS também é não cumulativo — a compra gera crédito.
    const icmsLiquido = Math.max(0, (receita - comprasComCredito12m) * icms);
    linhas.push({
      tributo: `ICMS (${(icms * 100).toFixed(2)}%, já com crédito)`,
      valor: icmsLiquido,
      consumo: true,
    });
  }

  if (margemLucro !== undefined && margemLucro !== null) {
    const lucro = receita * (margemLucro / 100);
    const { principal, adicional } = irpjComAdicional(lucro);
    linhas.push({ tributo: 'IRPJ (15% sobre o lucro)', valor: principal, consumo: false });
    if (adicional > 0) {
      linhas.push({ tributo: 'IRPJ — adicional de 10%', valor: adicional, consumo: false });
    }
    linhas.push({ tributo: 'CSLL (9% sobre o lucro)', valor: lucro * CSLL_ALIQUOTA, consumo: false });
    observacoes.push(
      `IRPJ e CSLL calculados sobre a margem de lucro informada (${margemLucro}%). No Lucro Real quem manda é o lucro contábil apurado no LALUR — este número é uma aproximação para efeito de comparação.`
    );
  } else {
    observacoes.push(
      'IRPJ e CSLL do Lucro Real dependem do lucro contábil, que não foi informado. Estão fora desta conta — por isso o total do Lucro Real não é comparável de forma direta com os outros dois regimes.'
    );
  }

  if (comprasComCredito12m <= 0) {
    observacoes.push(
      'Sem informar compras e despesas com direito a crédito, o PIS/Cofins do Lucro Real sai pelo valor cheio de 9,25% — na prática o crédito reduz bastante esse número.'
    );
  }

  const totalAnual = linhas.reduce((s, l) => s + l.valor, 0);
  const cargaConsumo = linhas.filter((l) => l.consumo).reduce((s, l) => s + l.valor, 0);

  return {
    regime: 'lucro_real',
    label: REGIME_LABEL.lucro_real,
    totalAnual,
    cargaConsumo,
    cargaNaoConsumo: totalAnual - cargaConsumo,
    aliquotaEfetiva: totalAnual / receita,
    aliquotaEfetivaConsumo: cargaConsumo / receita,
    linhas,
    observacoes,
    indisponivel:
      margemLucro === undefined || margemLucro === null
        ? 'Comparação parcial — informe a margem de lucro para incluir IRPJ e CSLL.'
        : undefined,
  };
}
