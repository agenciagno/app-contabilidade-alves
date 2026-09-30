import { useMemo } from 'react';
import type { BadgeTone } from '@/components/ds';
import { competenciaPadrao } from '@/hooks/useSerproPagamentos';
import { anoDe, useMatrizPgdasd, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import {
  fatorRCalculado, limiteDe, nivelLimite, nivelSublimite, percentualLimite, useFaturamentoAno, type FaturamentoRow,
} from '@/hooks/useSerproFaturamento';

/**
 * Oportunidades de planejamento tributário a partir da receita que a Receita mostra na declaração (PGDAS-D) já lida: Fator r, limite e sublimite do Simples.
 * Só lê o que já está salvo (sem custo). É apoio à decisão do contador, não conclusão jurídica nem promessa de economia.
 */
export type TipoOportunidade = 'fator_r' | 'limite' | 'sublimite';

export const ROTULO_OPORTUNIDADE: Record<TipoOportunidade, string> = { fator_r: 'Fator r', limite: 'Limite do Simples', sublimite: 'Sublimite (ICMS/ISS)' };

export interface Oportunidade {
  tipo: TipoOportunidade;
  tom: BadgeTone;
  titulo: string;
  detalhe: string;
}

export interface LinhaOportunidade {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  leitura: FaturamentoRow;
  /** Percentual dos últimos 12 meses (ou do ano, o maior) sobre o limite. */
  percentual: number | null;
  oportunidades: Oportunidade[];
}

export interface ResumoOportunidades {
  linhas: LinhaOportunidade[];
  /** Clientes do Simples (matriz) com uma leitura confiável do PDF: a base de comparação. */
  lidos: number;
  totalSimples: number;
  carregando: boolean;
}

const FATOR_R_ALVO = 0.28;
const FATOR_R_FOLGA = 0.30;
const MESES_PROJECAO = 12;

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const indiceMes = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const rotuloMes = (indice: number) => `${String((indice % 12) + 1).padStart(2, '0')}/${Math.floor(indice / 12)}`;

/** Série mensal (interno + externo) dos meses que o PDF lista, mais o mês da própria declaração. */
function serieMensal(f: FaturamentoRow): Map<number, number> | null {
  const d = f.dados;
  if (!d || f.rpa_total === null) return null;
  const mapa = new Map<number, number>();
  for (const m of [...d.historico_interno, ...d.historico_externo]) mapa.set(indiceMes(m.mes), (mapa.get(indiceMes(m.mes)) ?? 0) + m.valor);
  mapa.set(indiceMes(f.periodo_apuracao), f.rpa_total);
  return mapa;
}

/**
 * Em quantos meses o acumulado dos 12 meses anteriores passa de `alvo`, se os próximos meses repetirem a média dos 3 últimos.
 * Devolve null quando não passa em 12 meses ou quando o histórico do PDF não cobre os 13 meses necessários.
 */
export function mesesParaPassar(f: FaturamentoRow, alvo: number): { meses: number; em: string } | 'nunca' | 'sem_historico' {
  const serie = serieMensal(f);
  if (!serie) return 'sem_historico';
  const pa = indiceMes(f.periodo_apuracao);
  for (let i = pa - 12; i <= pa; i++) if (!serie.has(i)) return 'sem_historico';
  for (let s = 1; s <= MESES_PROJECAO; s++) {
    const p = pa + s;
    let soma = 0;
    for (let i = p - 12; i < p; i++) soma += serie.get(i)!;
    if (soma > alvo) return { meses: s, em: rotuloMes(p) };
    serie.set(p, ((serie.get(p - 1) ?? 0) + (serie.get(p - 2) ?? 0) + (serie.get(p - 3) ?? 0)) / 3);
  }
  return 'nunca';
}

function textoProjecao(f: FaturamentoRow, alvo: number, nome: string): string {
  const r = mesesParaPassar(f, alvo);
  if (r === 'sem_historico') return '';
  if (r === 'nunca') return ` No ritmo dos últimos 3 meses, não passa de ${reais(alvo)} (${nome}) nos próximos ${MESES_PROJECAO} meses.`;
  return ` No ritmo dos últimos 3 meses, passa de ${reais(alvo)} (${nome}) em cerca de ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'} (${r.em}).`;
}

/** Oportunidades de UMA leitura. Só leituras confiáveis do PDF entram (as outras já aparecem como "a conferir" no Faturamento). */
export function analisarOportunidades(f: FaturamentoRow): Oportunidade[] {
  if (!f.confiavel) return [];
  const out: Oportunidade[] = [];

  // Fator r: folha dos 12 meses ÷ RBT12. Só quando a Receita diz que se aplica à atividade.
  if (f.fator_r_aplica === true) {
    const fator = fatorRCalculado(f);
    // O PDF traz a folha dos 12 meses; com menos que isso a conta daria um fator r falso (folha ausente não é folha zero).
    const meses = f.dados?.folha.length ?? 0;
    const folha = f.dados?.folha.reduce((s, m) => s + m.valor, 0) ?? null;
    if (meses < 12 || fator === null || folha === null || !f.rbt12_total) {
      out.push({ tipo: 'fator_r', tom: 'neutral', titulo: 'Fator r sem folha completa', detalhe: 'A Receita diz que o fator r se aplica, mas a folha dos 12 meses não veio completa no PDF. Confira na declaração.' });
    } else if (fator < FATOR_R_ALVO) {
      const falta = FATOR_R_ALVO * f.rbt12_total - folha;
      out.push({
        tipo: 'fator_r', tom: 'info', titulo: `Fator r abaixo de 28% (${pct(fator)})`,
        detalhe: `Faltam cerca de ${reais(falta)} de folha nos 12 meses (${reais(falta / 12)} por mês) para chegar a 28% e poder tributar pelo Anexo III. Vale conversar sobre pró-labore e folha. Cálculo de referência: o valor oficial é o que a Receita escreve em "Fator r".`,
      });
    } else if (fator < FATOR_R_FOLGA) {
      const folga = folha - FATOR_R_ALVO * f.rbt12_total;
      out.push({
        tipo: 'fator_r', tom: 'warn', titulo: `Fator r no limite dos 28% (${pct(fator)})`,
        detalhe: `Folga de cerca de ${reais(folga)} na folha dos 12 meses. Se a folha cair ou a receita subir, passa para o Anexo V. Acompanhe todo mês.`,
      });
    }
  }

  // Limite do Simples: maior entre o acumulado do ano e o dos 12 meses (mesma regra da tela Faturamento), com projeção.
  const limite = limiteDe(f);
  const nivel = nivelLimite(f);
  const p = percentualLimite(f);
  const proj = nivel === 'acima' ? null : mesesParaPassar(f, limite);
  const vaiPassar = typeof proj === 'object' && proj !== null;
  if (nivel === 'acima') {
    out.push({ tipo: 'limite', tom: 'danger', titulo: `Acima do limite de ${reais(limite)}`, detalhe: 'Receita acima do teto do Simples. Avalie com o cliente o enquadramento e o regime antes da próxima apuração.' });
  } else if (nivel === 'critico' || nivel === 'atencao' || vaiPassar) {
    out.push({
      tipo: 'limite', tom: nivel === 'critico' ? 'danger' : nivel === 'atencao' || vaiPassar ? 'warn' : 'info',
      titulo: p !== null ? `${pct(p / 100)} do limite de ${reais(limite)}` : `Perto do limite de ${reais(limite)}`,
      detalhe: `Oportunidade de planejamento (regime, desmembramento, antecipação de decisão).${textoProjecao(f, limite, 'limite')}`,
    });
  }

  // Sublimite de ICMS/ISS.
  const sub = f.sublimite;
  const nivelSub = nivelSublimite(f);
  if (sub && nivelSub) {
    const projSub = nivelSub === 'acima' ? null : mesesParaPassar(f, sub);
    const passaSub = typeof projSub === 'object' && projSub !== null;
    if (nivelSub === 'acima') {
      out.push({ tipo: 'sublimite', tom: 'danger', titulo: `Acima do sublimite de ${reais(sub)}`, detalhe: 'ICMS e ISS passam a ser recolhidos por fora do DAS. Confirme o efeito com a Receita e com o cliente.' });
    } else if (nivelSub === 'perto' || passaSub) {
      out.push({ tipo: 'sublimite', tom: 'warn', titulo: `Perto do sublimite de ${reais(sub)}`, detalhe: `Acima dele, ICMS e ISS saem do DAS.${textoProjecao(f, sub, 'sublimite')}` });
    }
  }
  return out;
}

/** Monta as linhas a partir do que já está carregado: a leitura confiável mais recente de cada cliente do Simples. Função pura. */
export function montarOportunidades(simples: LinhaPgdasd[], leituras: FaturamentoRow[]): Omit<ResumoOportunidades, 'carregando'> {
  const ultimaPor = new Map<string, FaturamentoRow>();
  for (const f of leituras) {
    if (!f.confiavel) continue;
    const atual = ultimaPor.get(f.contact_id);
    if (!atual || f.periodo_apuracao > atual.periodo_apuracao || (f.periodo_apuracao === atual.periodo_apuracao && f.lido_em > atual.lido_em)) ultimaPor.set(f.contact_id, f);
  }
  const base = simples.filter((l) => !l.filial);
  const linhas: LinhaOportunidade[] = [];
  let lidos = 0;
  for (const l of base) {
    const f = ultimaPor.get(l.contact_id);
    if (!f) continue;
    lidos++;
    const oportunidades = analisarOportunidades(f);
    if (oportunidades.length) linhas.push({ contact_id: l.contact_id, nome: l.nome, documento: l.documento, regime: l.regime, leitura: f, percentual: percentualLimite(f), oportunidades });
  }
  const gravidade = (x: LinhaOportunidade) => Math.max(...x.oportunidades.map((o) => (o.tom === 'danger' ? 3 : o.tom === 'warn' ? 2 : 1)));
  linhas.sort((a, b) => gravidade(b) - gravidade(a) || (b.percentual ?? 0) - (a.percentual ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { linhas, lidos, totalSimples: base.length };
}

export function useOportunidades(): ResumoOportunidades {
  const competencia = competenciaPadrao();
  const ano = anoDe(competencia);
  const simples = useMatrizPgdasd(ano);
  const leituras = useFaturamentoAno(ano);
  const carregando = simples.isLoading || leituras.isLoading;
  const resumo = useMemo(() => montarOportunidades(simples.data ?? [], leituras.data ?? []), [simples.data, leituras.data]);
  return { ...resumo, carregando };
}
