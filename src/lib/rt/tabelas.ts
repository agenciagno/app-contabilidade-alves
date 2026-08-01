/**
 * Tabelas legais do cálculo tributário — Calculadora RT.
 *
 * Todos os números aqui vêm do texto oficial das leis (Planalto), não de estimativa:
 *  - Anexos I a V e tabelas de "Percentual de Repartição dos Tributos": LC 123/2006
 *    (redação da LC 155/2016, vigência 01/01/2018).
 *  - Presunção de IRPJ/CSLL: Lei 9.249/1995, arts. 15 e 20.
 *  - PIS/Cofins cumulativo e não cumulativo: Lei 9.718/1998 e Leis 10.637/2002 e 10.833/2003.
 *  - Teto da soma CBS+IBS: art. 18 da LC 214/2025.
 *
 * Nada aqui pode ser "arredondado no olho": a repartição é o que separa a parcela do DAS
 * que a reforma substitui (Cofins, PIS, ICMS, ISS, IPI) da que ela não toca (IRPJ, CSLL, CPP).
 */

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';
export type Setor = 'comercio' | 'industria' | 'servico';
export type RegimeAtual = 'simples_nacional' | 'lucro_presumido' | 'lucro_real';

/** Uma faixa do Simples: teto de RBT12, alíquota nominal e parcela a deduzir. */
export interface FaixaSimples {
  faixa: 1 | 2 | 3 | 4 | 5 | 6;
  ate: number;
  aliquotaNominal: number;
  deduzir: number;
}

/** Repartição do DAS entre tributos, por faixa (soma 100%). */
export interface ReparticaoFaixa {
  irpj: number;
  csll: number;
  cofins: number;
  pis: number;
  cpp: number;
  icms?: number;
  iss?: number;
  ipi?: number;
}

export const TETO_SIMPLES = 4_800_000;
export const SUBLIMITE_ICMS_ISS = 3_600_000;

/** Faixas — LC 123/2006, Anexos I a V (vigência 01/01/2018). */
export const FAIXAS: Record<Anexo, FaixaSimples[]> = {
  I: [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.04, deduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.073, deduzir: 5_940 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.095, deduzir: 13_860 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.107, deduzir: 22_500 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.143, deduzir: 87_300 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.19, deduzir: 378_000 },
  ],
  II: [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.045, deduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.078, deduzir: 5_940 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.1, deduzir: 13_860 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.112, deduzir: 22_500 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.147, deduzir: 85_500 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.3, deduzir: 720_000 },
  ],
  III: [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.06, deduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.112, deduzir: 9_360 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.135, deduzir: 17_640 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.16, deduzir: 35_640 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.21, deduzir: 125_640 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.33, deduzir: 648_000 },
  ],
  IV: [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.045, deduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.09, deduzir: 8_100 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.102, deduzir: 12_420 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.14, deduzir: 39_780 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.22, deduzir: 183_780 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.33, deduzir: 828_000 },
  ],
  V: [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.155, deduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.18, deduzir: 4_500 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.195, deduzir: 9_900 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.205, deduzir: 17_100 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.23, deduzir: 62_100 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.305, deduzir: 540_000 },
  ],
};

/**
 * "Percentual de Repartição dos Tributos" — LC 123/2006, Anexos I a V.
 * Índice do array = faixa − 1. Valores em fração (0,055 = 5,50%).
 *
 * Na 6ª faixa não há ICMS/ISS: acima do sublimite esses tributos saem do DAS e são
 * recolhidos por fora, direto ao estado/município (art. 13-A).
 */
export const REPARTICAO: Record<Anexo, ReparticaoFaixa[]> = {
  I: [
    { irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.415, icms: 0.34 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.415, icms: 0.34 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, icms: 0.335 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, icms: 0.335 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, icms: 0.335 },
    { irpj: 0.135, csll: 0.1, cofins: 0.2827, pis: 0.0613, cpp: 0.421 },
  ],
  II: [
    { irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, ipi: 0.075, icms: 0.32 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, ipi: 0.075, icms: 0.32 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, ipi: 0.075, icms: 0.32 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, ipi: 0.075, icms: 0.32 },
    { irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, ipi: 0.075, icms: 0.32 },
    { irpj: 0.085, csll: 0.075, cofins: 0.2096, pis: 0.0454, cpp: 0.235, ipi: 0.35 },
  ],
  III: [
    { irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss: 0.335 },
    { irpj: 0.04, csll: 0.035, cofins: 0.1405, pis: 0.0305, cpp: 0.434, iss: 0.32 },
    { irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss: 0.325 },
    { irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss: 0.325 },
    { irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss: 0.335 },
    { irpj: 0.35, csll: 0.15, cofins: 0.1603, pis: 0.0347, cpp: 0.305 },
  ],
  IV: [
    { irpj: 0.188, csll: 0.152, cofins: 0.1767, pis: 0.0383, cpp: 0, iss: 0.445 },
    { irpj: 0.198, csll: 0.152, cofins: 0.2055, pis: 0.0445, cpp: 0, iss: 0.4 },
    { irpj: 0.208, csll: 0.152, cofins: 0.1973, pis: 0.0427, cpp: 0, iss: 0.4 },
    { irpj: 0.178, csll: 0.192, cofins: 0.189, pis: 0.041, cpp: 0, iss: 0.4 },
    { irpj: 0.188, csll: 0.192, cofins: 0.1808, pis: 0.0392, cpp: 0, iss: 0.4 },
    { irpj: 0.535, csll: 0.215, cofins: 0.2055, pis: 0.0445, cpp: 0 },
  ],
  V: [
    { irpj: 0.25, csll: 0.15, cofins: 0.141, pis: 0.0305, cpp: 0.2885, iss: 0.14 },
    { irpj: 0.23, csll: 0.15, cofins: 0.141, pis: 0.0305, cpp: 0.2785, iss: 0.17 },
    { irpj: 0.24, csll: 0.15, cofins: 0.1492, pis: 0.0323, cpp: 0.2385, iss: 0.19 },
    { irpj: 0.21, csll: 0.15, cofins: 0.1574, pis: 0.0341, cpp: 0.2385, iss: 0.21 },
    { irpj: 0.23, csll: 0.125, cofins: 0.141, pis: 0.0305, cpp: 0.2385, iss: 0.235 },
    { irpj: 0.35, csll: 0.155, cofins: 0.1644, pis: 0.0356, cpp: 0.295 },
  ],
};

/**
 * Teto de ISS no Simples — LC 123/2006, nota (*) dos Anexos III, IV e V.
 * Acima do gatilho, o ISS trava em 5% da receita e a diferença é redistribuída
 * proporcionalmente aos tributos federais da mesma faixa.
 */
export const TETO_ISS_5A_FAIXA: Partial<
  Record<Anexo, { gatilho: number; fatores: Omit<ReparticaoFaixa, 'iss' | 'icms' | 'ipi'> }>
> = {
  III: {
    gatilho: 0.1492537,
    fatores: { irpj: 0.0602, csll: 0.0526, cofins: 0.1928, pis: 0.0418, cpp: 0.6526 },
  },
  IV: {
    gatilho: 0.125,
    fatores: { irpj: 0.3133, csll: 0.32, cofins: 0.3013, pis: 0.0654, cpp: 0 },
  },
};

export const FATOR_R_LIMITE = 0.28;

/** Lucro Presumido — Lei 9.249/1995, arts. 15 e 20. */
export const PRESUNCAO = {
  comercio: { irpj: 0.08, csll: 0.12 },
  industria: { irpj: 0.08, csll: 0.12 },
  servico: { irpj: 0.32, csll: 0.32 },
} as const;

/**
 * LC 224/2025 (vigor desde jan/2026, contestada judicialmente): soma 10 pontos
 * percentuais à base de presunção na parcela da receita anual acima de R$ 5 milhões.
 */
export const LC224_LIMITE = 5_000_000;
export const LC224_ACRESCIMO = 0.10;

export const IRPJ_ALIQUOTA = 0.15;
export const IRPJ_ADICIONAL = 0.10;
/** Adicional de 10% incide sobre o que exceder R$ 20 mil/mês (R$ 240 mil/ano). */
export const IRPJ_ADICIONAL_LIMITE_ANUAL = 240_000;
export const CSLL_ALIQUOTA = 0.09;

/** PIS/Cofins cumulativo (Presumido) e não cumulativo (Real). */
export const PIS_COFINS_CUMULATIVO = 0.0365;
export const PIS_COFINS_NAO_CUMULATIVO = 0.0925;

/** Teto legal da soma CBS + IBS — art. 18 da LC 214/2025. */
export const TETO_CBS_IBS = 0.265;
/**
 * Divisão usada quando a API oficial não responde. Só o teto de 26,5% é lei;
 * o split entre CBS e IBS depende de Resolução do Senado (prevista após 15/09/2026),
 * então esta separação é declaradamente uma estimativa de trabalho.
 */
export const FALLBACK_CBS = 0.088;
export const FALLBACK_IBS = 0.177;

/**
 * Reduções setoriais de CBS/IBS — LC 214/2025.
 * Lista curta e curada de propósito: a granularidade fina (NCM/NBS item a item) é da
 * calculadora oficial da RFB, não deste diagnóstico. Aqui interessa o efeito por setor.
 */
export interface ReducaoSetorial {
  key: string;
  label: string;
  reducao: number;
  fundamento: string;
}

export const REDUCOES_SETORIAIS: ReducaoSetorial[] = [
  { key: 'nenhuma', label: 'Nenhuma (alíquota cheia)', reducao: 0, fundamento: '' },
  {
    key: 'saude_educacao',
    label: 'Saúde ou educação (redução de 60%)',
    reducao: 0.6,
    fundamento: 'LC 214/2025 — redução de 60% para serviços de saúde e educação',
  },
  {
    key: 'agropecuaria',
    label: 'Agropecuária / insumos agrícolas (redução de 60%)',
    reducao: 0.6,
    fundamento: 'LC 214/2025, Anexo VIII — redução de 60%',
  },
  {
    key: 'higiene_limpeza',
    label: 'Higiene e limpeza de baixa renda (redução de 60%)',
    reducao: 0.6,
    fundamento: 'LC 214/2025 — redução de 60%',
  },
  {
    key: 'cesta_basica',
    label: 'Cesta básica nacional (alíquota zero)',
    reducao: 1,
    fundamento: 'LC 214/2025 — Cesta Básica Nacional de Alimentos, alíquota zero',
  },
];

/** Rótulo humano do anexo, usado na tela e no PDF. */
export const ANEXO_LABEL: Record<Anexo, string> = {
  I: 'Anexo I — Comércio',
  II: 'Anexo II — Indústria',
  III: 'Anexo III — Serviços (Fator R ≥ 28%)',
  IV: 'Anexo IV — Construção, vigilância, limpeza e advocacia',
  V: 'Anexo V — Serviços (Fator R < 28%)',
};

export const SETOR_LABEL: Record<Setor, string> = {
  comercio: 'Comércio',
  industria: 'Indústria',
  servico: 'Serviço',
};

export const REGIME_LABEL: Record<RegimeAtual, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
};
