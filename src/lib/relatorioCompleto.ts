/**
 * Relatório Completo da Empresa (R3 da varredura do Monitoramento, 10/10/2026): "como está minha empresa por completo?".
 * Amplia o Relatório de Situação Fiscal (score + plano de ação) com obrigações do ano mês a mês, pagamentos, faturamento,
 * parcelamentos, comunicações, e-Processo, procuração e certificado. Função pura: só o que já está salvo, sem consultar a Receita.
 * Decisões de Gabriel (10/10/2026): valores em R$ no PDF; ano corrente até o mês anterior; envio manual (e em lote pela tela).
 */
import { estadoDctfweb, estadoMit, type DctfwebRow, type LinhaDctfwebMit, type MitConsultaRow, type MitRow } from '@/hooks/useSerproDctfweb';
import type { GuiaDctfweb } from '@/hooks/useGuiasCliente';
import { dasUnificado } from '@/hooks/useSerproDasUnificado';
import { declaracaoVigente, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import type { PagamentoRow } from '@/hooks/useSerproPagamentos';
import {
  ROTULO_MOD, competenciaAtual, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes, rotuloParcela, somaValor, type LinhaParcelamentos,
} from '@/hooks/useSerproParcelamentos';
import type { LinhaEProcesso } from '@/hooks/useSerproExtras';
import type { SitfisRow } from '@/hooks/useSerproSitfis';
import { seloDas, seloDctfwebColuna, seloMitColuna, seloPgdasMes, seloProcuracao, type EstadoMonitor } from '@/lib/monitorEstados';
import { calcularScore, montarPlanoAcao, type AcaoPlano, type RelatorioFaturamento, type Score } from '@/lib/relatoriosCliente';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

export type Veredito = 'regular' | 'atencao' | 'pendencias';
export const ROTULO_VEREDITO: Record<Veredito, string> = {
  regular: 'Regular', atencao: 'Regular, com pontos de atenção', pendencias: 'Com pendências',
};

/** Uma célula da grade mês a mês: texto curto e o estado (para a cor). `null` = não se aplica ao mês. */
export interface CelulaMes { texto: string; estado: EstadoMonitor }

export interface MesRelatorio {
  pa: string;
  /** Simples: PGDAS-D e DAS. Presumido/Real: DCTFWeb e MIT. */
  a: CelulaMes | null;
  b: CelulaMes | null;
  /** Guia/DAS pago no mês (soma dos documentos do período), com a data do último pagamento. */
  pago: number | null;
  pagoEm: string | null;
}

export interface RelatorioCompleto {
  contactId: string;
  nome: string;
  documento: string;
  regime: string;
  responsavel: string | null;
  /** AAAA-MM: último mês coberto (mês anterior ao de geração). */
  competencia: string;
  ano: number;
  score: Score;
  plano: AcaoPlano[];
  veredito: Veredito;
  situacao: {
    resultado: string;
    geradoEm: string | null;
    categorias: string[];
    certidao: { tipo: string | null; validade: string | null; texto: string };
  };
  obrigacoes: { colunas: [string, string]; meses: MesRelatorio[] } | null;
  pagamentos: { total: number; quantidade: number; porTipo: { tipo: string; quantidade: number; total: number }[] };
  faturamento: { periodo: string; rbt12: number | null; percentualLimite: number | null; limite: number } | null;
  parcelamentos: { ativos: string[]; atrasadas: { parcela: string; valor: number | null }[]; valorAtrasado: number; doMes: number | null } | null;
  comunicacoes: { abertas: number; intimacoes: number; exclusaoSimples: number };
  eprocessos: { consultado: boolean; lista: { numero: string; tipo: string; situacao: string | null; protocolo: string | null }[] };
  procuracao: string;
  certificado: string;
}

export interface EntradaRelatorio {
  linha: LinhaCarteira;
  competencia: string;
  hoje: string;
  abertura: string | null;
  pgdas: LinhaPgdasd | null;
  dctf: { base: LinhaDctfwebMit | null; ano: DctfwebRow[]; mit: { apuracoes: MitRow[]; consulta: MitConsultaRow | null } | null; guias: GuiaDctfweb[] } | null;
  pagamentos: PagamentoRow[];
  sitfis: SitfisRow | null;
  faturamento: RelatorioFaturamento | null;
  parcelamentos: LinhaParcelamentos | null;
  eprocesso: LinhaEProcesso | null;
  certificado: { validade: string; dias: number } | null;
}

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

function mesesAte(ano: number, ate: string): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const pa = `${ano}-${String(m).padStart(2, '0')}`;
    if (pa > ate) break;
    out.push(pa);
  }
  return out;
}

export function vereditoDe(plano: AcaoPlano[]): Veredito {
  if (plano.some((a) => a.prioridade <= 2)) return 'pendencias';
  return plano.length > 0 ? 'atencao' : 'regular';
}

const celula = (s: { estado: EstadoMonitor; motivo: string } | null): CelulaMes | null => (s ? { texto: s.motivo, estado: s.estado } : null);

function pagosNoMes(pagamentos: PagamentoRow[], sigla: string, pa: string) {
  const docs = pagamentos.filter((p) => p.tipo_sigla === sigla && (p.periodo_apuracao ?? '').slice(0, 7) === pa);
  if (!docs.length) return { pago: null, pagoEm: null };
  return {
    pago: docs.reduce((s, p) => s + (p.valor_total ?? 0), 0),
    pagoEm: docs.map((p) => p.data_arrecadacao).filter((x): x is string => !!x).sort().pop() ?? null,
  };
}

export function montarRelatorioCompleto(e: EntradaRelatorio): RelatorioCompleto {
  const l = e.linha;
  const ano = Number(e.competencia.slice(0, 4));
  const score = calcularScore(l);
  const plano = montarPlanoAcao(l, score);
  const meses = mesesAte(ano, e.competencia).filter((m) => !e.abertura || m >= e.abertura.slice(0, 7));

  let obrigacoes: RelatorioCompleto['obrigacoes'] = null;
  if (l.regime === 'simples_nacional' && e.pgdas && !e.pgdas.filial) {
    const pg = e.pgdas;
    obrigacoes = {
      colunas: ['PGDAS-D', 'DAS'],
      meses: meses.map((m) => {
        const decl = seloPgdasMes(pg, m, e.hoje, e.abertura);
        const das = dasUnificado(pg, e.pagamentos, m, e.hoje);
        // Mesma regra da ficha do Simples: sem declaração e sem DAS, a coluna do DAS fica vazia.
        return { pa: m, a: celula(decl), b: !declaracaoVigente(pg, m) && das.estado === 'sem_das' ? null : celula(seloDas(das)), ...pagosNoMes(e.pagamentos, 'DAS', m) };
      }),
    };
  } else if ((l.regime === 'lucro_presumido' || l.regime === 'lucro_real') && e.dctf?.base && !e.dctf.base.filial) {
    const d = e.dctf;
    obrigacoes = {
      colunas: ['DCTFWeb', 'MIT'],
      meses: meses.map((m) => {
        const dctf = d.ano.find((x) => x.competencia.slice(0, 7) === m) ?? null;
        const doMes: LinhaDctfwebMit = { ...d.base!, dctfweb: dctf, mit: (d.mit?.apuracoes ?? []).filter((a) => a.periodo.slice(0, 7) === m), mitConsultado: d.mit?.consulta ?? null };
        return { pa: m, a: celula(seloDctfwebColuna(estadoDctfweb(doMes))), b: celula(seloMitColuna(estadoMit(doMes))), ...pagosNoMes(e.pagamentos, 'DARF', m) };
      }),
    };
  }

  const doAno = e.pagamentos.filter((p) => (p.periodo_apuracao ?? '').slice(0, 4) === String(ano));
  const porTipo = new Map<string, { quantidade: number; total: number }>();
  for (const p of doAno) {
    const t = porTipo.get(p.tipo_sigla) ?? { quantidade: 0, total: 0 };
    t.quantidade++; t.total += p.valor_total ?? 0;
    porTipo.set(p.tipo_sigla, t);
  }

  const sf = e.sitfis;
  const resultado = !sf ? 'Sem relatório da Receita' : !sf.confiavel || !sf.resultado || sf.resultado === 'nao_lido' ? 'A conferir no PDF da Receita'
    : sf.resultado === 'sem_pendencias' ? 'Sem pendências' : 'Com pendências';
  const cert = l.certidao;
  const certTexto = { regular: 'Regular', irregular: 'Irregular', vencida: 'Vencida', sem_leitura: 'Sem leitura' }[cert.situacao];

  let parcelamentos: RelatorioCompleto['parcelamentos'] = null;
  if (e.parcelamentos) {
    const atual = competenciaAtual();
    const atrasadas = parcelasAtrasadas(e.parcelamentos, atual);
    const doMes = parcelasDoMes(e.parcelamentos, atual);
    parcelamentos = {
      ativos: modalidadesAtivas(e.parcelamentos).map((m) => ROTULO_MOD[m]),
      atrasadas: atrasadas.map((p) => ({ parcela: rotuloParcela(p.parcela), valor: p.valor })),
      valorAtrasado: somaValor(atrasadas),
      doMes: doMes.length ? somaValor(doMes) : null,
    };
  }

  const proc = seloProcuracao(l.procuracao);

  return {
    contactId: l.contact_id, nome: l.nome, documento: l.documento, regime: l.regimeRotulo, responsavel: l.responsavel?.nome ?? null,
    competencia: e.competencia, ano, score, plano, veredito: vereditoDe(plano),
    situacao: {
      resultado, geradoEm: sf?.gerado_em ?? null, categorias: sf?.categorias ?? [],
      certidao: { tipo: cert.tipo, validade: cert.validade, texto: certTexto },
    },
    obrigacoes,
    pagamentos: {
      total: doAno.reduce((s, p) => s + (p.valor_total ?? 0), 0), quantidade: doAno.length,
      porTipo: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.total - a.total),
    },
    faturamento: e.faturamento ? { periodo: e.faturamento.periodo, rbt12: e.faturamento.rbt12 ?? e.faturamento.somaMeses, percentualLimite: e.faturamento.percentualLimite, limite: e.faturamento.limite } : null,
    parcelamentos,
    comunicacoes: { abertas: l.mensagens.total, intimacoes: l.mensagens.intimacoes, exclusaoSimples: l.mensagens.exclusaoSimples },
    eprocessos: {
      consultado: !!e.eprocesso?.consulta,
      lista: (e.eprocesso?.processos ?? []).map((p) => ({ numero: p.numero, tipo: p.tipo ?? 'Processo', situacao: p.situacao, protocolo: p.data_protocolo })),
    },
    procuracao: proc ? proc.motivo : 'Não verificada',
    certificado: !e.certificado ? 'Nenhum certificado do cliente cadastrado'
      : e.certificado.dias < 0 ? `Vencido em ${dataBR(e.certificado.validade)}`
      : `Válido até ${dataBR(e.certificado.validade)}${e.certificado.dias <= 30 ? ` (vence em ${e.certificado.dias} dias)` : ''}`,
  };
}
