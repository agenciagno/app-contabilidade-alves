import type { Anexo, RegimeAtual, Setor } from './tabelas';

export interface DiagnosticoInput {
  setor: Setor;
  regimeAtual: RegimeAtual;
  /** Receita bruta dos últimos 12 meses (RBT12). */
  faturamento12m: number;
  /** Folha + encargos dos últimos 12 meses. Só serve ao Fator R (Anexo III × V). */
  folha12m?: number;
  /**
   * Compras e despesas que geram crédito, últimos 12 meses. Entra dos dois lados da
   * comparação: crédito de PIS/Cofins e ICMS no regime não cumulativo hoje, e crédito
   * de CBS/IBS na reforma. Sem esse dado a carga da reforma sai superestimada.
   */
  comprasComCredito12m?: number;
  /** Atividade do Anexo IV (construção, vigilância, limpeza, advocacia). */
  atividadeAnexoIV?: boolean;
  /** Alíquota de ICMS do estado, em % (ex.: 18). Comércio e indústria. */
  aliquotaIcms?: number;
  /** Alíquota de ISS do município, em % (ex.: 5). Serviço. */
  aliquotaIss?: number;
  /** Margem de lucro estimada, em %. Só para comparar com Lucro Real. */
  margemLucro?: number;
  /** % da receita vendida a clientes PJ do regime regular — proxy B2B × B2C. */
  pctB2B?: number;
  /** Chave de `REDUCOES_SETORIAIS`. */
  reducaoSetorial?: string;
  /** Alíquotas CBS/IBS em fração (0,088 = 8,8%). */
  aliquotaCbs: number;
  aliquotaIbs: number;
}

export interface LinhaTributo {
  tributo: string;
  valor: number;
  /** Tributo sobre consumo — é o que a reforma substitui. */
  consumo: boolean;
  /**
   * Só no Simples: tributo que já é recolhido por fora do DAS (caso do ICMS/ISS
   * acima do sublimite). Importa no cenário híbrido, onde apenas a parcela que está
   * DENTRO do DAS é retirada dele.
   */
  foraDoDas?: boolean;
}

export interface ResultadoRegime {
  regime: RegimeAtual;
  label: string;
  /** Soma de todos os tributos do regime no ano. */
  totalAnual: number;
  /** Parcela que a reforma substitui (PIS, Cofins, ICMS, ISS, IPI). */
  cargaConsumo: number;
  /** Parcela que a reforma NÃO toca (IRPJ, CSLL, CPP). */
  cargaNaoConsumo: number;
  /** Total ÷ faturamento. */
  aliquotaEfetiva: number;
  /** Carga de consumo ÷ faturamento. */
  aliquotaEfetivaConsumo: number;
  linhas: LinhaTributo[];
  anexo?: Anexo;
  fatorR?: number;
  /** Preenchido quando o regime não pôde ser calculado (ex.: acima do teto). */
  indisponivel?: string;
  observacoes: string[];
}

export interface ResultadoReforma {
  aliquotaCbs: number;
  aliquotaIbs: number;
  aliquotaTotal: number;
  /** Redução setorial aplicada (0 a 1). */
  reducaoAplicada: number;
  debito: number;
  credito: number;
  liquido: number;
  aliquotaEfetiva: number;
  observacoes: string[];
}

export interface ResultadoHibrido {
  /** Continuar com IBS/CBS embutidos no DAS. */
  unificadoTotal: number;
  /** DAS sem a parcela de consumo + CBS/IBS por fora. */
  hibridoDasResidual: number;
  hibridoCbsIbs: number;
  hibridoTotal: number;
  diferenca: number;
  /** Crédito que o cliente PJ do comprador recebe em cada cenário. */
  creditoRepassadoUnificado: number;
  creditoRepassadoHibrido: number;
  recomendacao: 'unificado' | 'hibrido' | 'analise_individual';
  justificativa: string;
}

export interface Diagnostico {
  input: DiagnosticoInput;
  geradoEm: string;
  atual: ResultadoRegime;
  comparativo: ResultadoRegime[];
  melhorRegime: ResultadoRegime | null;
  economiaMigracao: number;
  posReforma: ResultadoReforma;
  /**
   * Verdadeiro quando a empresa é do Simples e, não fazendo nada, permanece no DAS
   * unificado. Nesse caso a reforma NÃO muda a conta que ela paga: IBS/CBS seguem
   * embutidos no DAS e as tabelas do Simples não foram alteradas pela LC 214/2025.
   * O cenário de `posReforma` passa a ser o "e se optar pelo regime regular", não o
   * destino automático — tratar os dois como a mesma coisa induziria o cliente a erro.
   */
  simplesFicaNoUnificado: boolean;
  /** Variação da carga de consumo no cenário que de fato se aplica à empresa. */
  variacaoValor: number;
  variacaoPercentual: number;
  hibrido: ResultadoHibrido | null;
  /** Carga ano a ano de 2026 a 2033, para o gráfico de trajetória. */
  trajetoria: import('./trajetoria').PontoTrajetoria[];
  explicacao: string;
  alertas: string[];
}
