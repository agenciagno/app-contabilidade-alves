/**
 * Vocabulário único do Monitoramento (Rodada 1, 08/10/2026; plano em reports/monitorhub-hubstrom-comparativo-plano-out2026.md).
 * Toda fonte (PGDAS-D, DAS, DEFIS, Caixa Postal...) vira o mesmo selo em duas camadas: a COR diz a gravidade, o TEXTO diz o motivo.
 *
 *  · Em dia (azul #265ABA)   nada a fazer.
 *  · Pendência (amarelo)     falta fazer, ainda no prazo, ou é preciso confirmar.
 *  · Atenção (vermelho)      atrasado, irregular ou com risco.
 *  · Processando (azul claro) consulta em andamento agora.
 *  · Não verificado (cinza)  ainda não consultado ou sem acesso. Nunca conta como em dia.
 *
 * O cliente fica com o PIOR selo entre as fontes que se aplicam a ele (Atenção > Pendência > Processando > Não verificado > Em dia).
 * As regras de cada fonte não são reescritas aqui: as funções só traduzem os estados que as telas e o Portal 360° já calculam.
 * Funções puras, sem chamada ao Serpro.
 */
import type { MonitorBadgeTone } from '@/components/ds';
import type { SeloEstado } from '@/hooks/useSerproCaixaPostal';
import { declaracaoVigente, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import type { DasUnificado, EstadoDas } from '@/hooks/useSerproDasUnificado';
import type { StatusDefis } from '@/hooks/useSerproDefis';
import type { EstadoDctfweb, EstadoMit } from '@/hooks/useSerproDctfweb';
import type { EstadoSitfis } from '@/hooks/useSerproSitfis';
import { nivelLimite, nivelSublimite, percentualLimite, type FaturamentoRow } from '@/hooks/useSerproFaturamento';
import { avaliarPgdas, type LinhaCarteira } from '@/lib/situacaoCarteira';
import { vencimentoDoPeriodo } from '@/lib/prazosFederais';

export type EstadoMonitor = 'em_dia' | 'pendencia' | 'atencao' | 'processando' | 'nao_verificado';

export interface Selo {
  estado: EstadoMonitor;
  motivo: string;
}

/** Ordem de leitura na tela (faixa de contadores, legendas). */
export const ESTADOS: EstadoMonitor[] = ['em_dia', 'pendencia', 'atencao', 'processando', 'nao_verificado'];

export const ROTULO_ESTADO: Record<EstadoMonitor, string> = {
  em_dia: 'Em dia', pendencia: 'Pendência', atencao: 'Atenção', processando: 'Processando', nao_verificado: 'Não verificado',
};

export const DICA_ESTADO: Record<EstadoMonitor, string> = {
  em_dia: 'Nada a fazer.',
  pendencia: 'Falta fazer, ainda no prazo, ou é preciso confirmar.',
  atencao: 'Atrasado, irregular ou com risco.',
  processando: 'Consulta em andamento agora.',
  nao_verificado: 'Ainda não consultado ou sem acesso. Não conta como em dia.',
};

/** Tom do DsBadge. "Em dia" e "Processando" têm tom próprio (azul): o verde do sistema não é usado no Monitoramento. */
export const TOM_ESTADO: Record<EstadoMonitor, MonitorBadgeTone> = {
  em_dia: 'emdia', pendencia: 'warn', atencao: 'danger', processando: 'processando', nao_verificado: 'neutral',
};

/** Cor sólida (variável CSS) para gráficos. Muda sozinha no modo escuro. */
export const COR_ESTADO: Record<EstadoMonitor, string> = {
  em_dia: 'var(--em-dia)', pendencia: 'var(--warn)', atencao: 'var(--danger)', processando: 'var(--processando)', nao_verificado: 'var(--muted-ink-2)',
};

const PESO: Record<EstadoMonitor, number> = { atencao: 4, pendencia: 3, processando: 2, nao_verificado: 1, em_dia: 0 };

/** Pior selo da lista (ignora as fontes que não se aplicam, `null`). Empate fica com o primeiro da lista. */
export function piorSelo(selos: (Selo | null | undefined)[]): Selo | null {
  let pior: Selo | null = null;
  for (const s of selos) if (s && (!pior || PESO[s.estado] > PESO[pior.estado])) pior = s;
  return pior;
}

/** Os demais motivos que pedem algo (sem o do selo principal e sem os "em dia"), para mostrar embaixo do selo. */
export function outrosMotivos(selos: (Selo | null | undefined)[], principal: Selo | null): string[] {
  return selos
    .filter((s): s is Selo => !!s && s !== principal && s.estado !== 'em_dia')
    .sort((a, b) => PESO[b.estado] - PESO[a.estado])
    .map((s) => s.motivo);
}

export type ContagemEstados = Record<EstadoMonitor, number> & { total: number };

export function contarEstados(selos: (Selo | null | undefined)[]): ContagemEstados {
  const c: ContagemEstados = { em_dia: 0, pendencia: 0, atencao: 0, processando: 0, nao_verificado: 0, total: 0 };
  for (const s of selos) if (s) { c[s.estado]++; c.total++; }
  return c;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmData = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
const listaPas = (pas: string[]) => (pas.length <= 2 ? pas.map(sigla).join(', ') : `${pas.slice(0, 2).map(sigla).join(', ')} e mais ${pas.length - 2}`);

// ---------------------------------------------------------------- fontes da carteira (LinhaCarteira, Portal 360°)

export function seloCaixaPostal(estado: SeloEstado): Selo | null {
  switch (estado) {
    case 'todas_lidas': return { estado: 'em_dia', motivo: 'Todas lidas' };
    case 'nao_lida': return { estado: 'pendencia', motivo: 'Mensagem não lida' };
    case 'nova': return { estado: 'pendencia', motivo: 'Mensagem nova' };
    case 'sem_procuracao': return { estado: 'nao_verificado', motivo: 'Sem procuração' };
    case 'nao_verificada': return { estado: 'nao_verificado', motivo: 'Não verificada' };
    default: return null;
  }
}

/** Mensagens que pedem ação (intimação, malha, exclusão...), com a situação "nova" ou "em tratamento". */
export function seloIntimacoes(l: Pick<LinhaCarteira, 'mensagens' | 'caixa'>): Selo | null {
  if (Object.keys(l.mensagens.danger).length) {
    return { estado: 'atencao', motivo: l.mensagens.intimacoes ? `Intimação em aberto${l.mensagens.intimacoes > 1 ? ` (${l.mensagens.intimacoes})` : ''}` : 'Mensagem crítica em aberto' };
  }
  if (Object.keys(l.mensagens.atencao).length) return { estado: 'pendencia', motivo: 'Mensagem a tratar' };
  if (l.caixa === 'sem_procuracao' || l.caixa === 'nao_verificada') return { estado: 'nao_verificado', motivo: l.caixa === 'sem_procuracao' ? 'Sem procuração' : 'Não verificada' };
  if (l.caixa === 'inativo') return null;
  return { estado: 'em_dia', motivo: 'Nada em aberto' };
}

/** PGDAS-D do ano, como o Portal 360° avalia (em falta só depois do prazo e de uma consulta posterior ao prazo). */
export function seloPgdasCarteira(p: LinhaCarteira['pgdas']): Selo | null {
  switch (p.estado) {
    case 'nao_se_aplica': return null;
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'Ano não consultado' };
    case 'em_falta': return { estado: 'atencao', motivo: `Em falta: ${listaPas(p.emFalta)}` };
    case 'a_confirmar': return { estado: 'pendencia', motivo: 'Consultar de novo' };
    default:
      if (p.aVencer.length) return { estado: 'pendencia', motivo: `A transmitir até ${ddmm(vencimentoDoPeriodo(p.aVencer[p.aVencer.length - 1]))}` };
      return { estado: 'em_dia', motivo: 'Transmitidas' };
  }
}

export function seloDasEstado(estado: EstadoDas, vencimento?: string | null): Selo | null {
  switch (estado) {
    case 'pago': return { estado: 'em_dia', motivo: 'DAS pago' };
    case 'a_vencer': return { estado: 'pendencia', motivo: vencimento ? `DAS vence ${ddmm(vencimento)}` : 'DAS a vencer' };
    case 'vencido': return { estado: 'atencao', motivo: vencimento ? `DAS vencido ${ddmm(vencimento)}` : 'DAS vencido' };
    case 'sem_das': return { estado: 'pendencia', motivo: 'Sem DAS gerado' };
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'DAS não consultado' };
    default: return null;
  }
}

export const seloDas = (d: DasUnificado): Selo | null => seloDasEstado(d.estado, d.vencimento);

export function seloDefis(status: StatusDefis, ano: number, prazo?: Date): Selo | null {
  switch (status) {
    case 'entregue': return { estado: 'em_dia', motivo: `DEFIS ${ano} entregue` };
    case 'retificada': return { estado: 'em_dia', motivo: `DEFIS ${ano} retificada` };
    case 'a_entregar': return { estado: 'pendencia', motivo: prazo ? `DEFIS ${ano} até ${ddmmData(prazo)}` : `DEFIS ${ano} a entregar` };
    case 'em_atraso': return { estado: 'atencao', motivo: `DEFIS ${ano} não entregue` };
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'DEFIS não consultada' };
    default: return null; // filial ou aberta depois do ano
  }
}

/** DCTFWeb e MIT juntas. Sem DCTFWeb não prova atraso (só existe para quem tem movimento): fica como pendência a confirmar. */
export function seloDctfwebMit(dctf: EstadoDctfweb | 'nao_se_aplica', mit: EstadoMit | 'nao_se_aplica'): Selo | null {
  const d = dctf === 'filial' ? 'nao_se_aplica' : dctf;
  const m = mit === 'filial' ? 'nao_se_aplica' : mit;
  if (d === 'nao_se_aplica' && m === 'nao_se_aplica') return null;
  if (d === 'nao_consultado' && (m === 'nao_consultado' || m === 'nao_se_aplica')) return { estado: 'nao_verificado', motivo: 'Não consultada' };
  if (d === 'sem_declaracao') return { estado: 'pendencia', motivo: 'Sem DCTFWeb: confirmar' };
  if (m === 'sem_apuracao') return { estado: 'pendencia', motivo: 'Sem MIT: confirmar' };
  if (m === 'outra_situacao') return { estado: 'pendencia', motivo: 'MIT não encerrada' };
  if (d === 'nao_consultado' || m === 'nao_consultado') return { estado: 'nao_verificado', motivo: d === 'nao_consultado' ? 'DCTFWeb não consultada' : 'MIT não consultada' };
  return { estado: 'em_dia', motivo: 'Transmitida' };
}

/** Só a DCTFWeb, para a coluna de detalhe da tela DCTFWeb e MIT. */
export function seloDctfwebColuna(e: EstadoDctfweb): Selo | null {
  switch (e) {
    case 'transmitida': return { estado: 'em_dia', motivo: 'Com recibo' };
    case 'sem_declaracao': return { estado: 'pendencia', motivo: 'Sem declaração' };
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'Não consultada' };
    default: return null;
  }
}

/** Só a MIT, para a coluna de detalhe da tela DCTFWeb e MIT. */
export function seloMitColuna(e: EstadoMit): Selo | null {
  switch (e) {
    case 'encerrada': return { estado: 'em_dia', motivo: 'Encerrada' };
    case 'outra_situacao': return { estado: 'pendencia', motivo: 'Situação a conferir' };
    case 'sem_apuracao': return { estado: 'pendencia', motivo: 'Sem apuração' };
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'Não consultada' };
    default: return null;
  }
}

/** Parcelamentos do Simples (09/10/2026): atraso = atenção; parcela do mês em aberto = pendência; sem parcelamento ou em dia = em dia. */
export function seloParcelamento(estado: 'filial' | 'nao_consultado' | 'sem_parcelamento' | 'em_dia' | 'atrasado', atrasadas: number, doMes: number): Selo | null {
  switch (estado) {
    case 'filial': return null;
    case 'nao_consultado': return { estado: 'nao_verificado', motivo: 'Não consultado' };
    case 'sem_parcelamento': return { estado: 'em_dia', motivo: 'Sem parcelamento' };
    case 'atrasado': return { estado: 'atencao', motivo: `${atrasadas} ${atrasadas === 1 ? 'parcela' : 'parcelas'} em atraso` };
    default: return doMes > 0 ? { estado: 'pendencia', motivo: 'Parcela do mês em aberto' } : { estado: 'em_dia', motivo: 'Em dia' };
  }
}

export function seloSitfis(estado: EstadoSitfis): Selo | null {
  switch (estado) {
    case 'sem_pendencias': return { estado: 'em_dia', motivo: 'Sem pendências' };
    case 'com_pendencias': return { estado: 'atencao', motivo: 'Com pendências' };
    case 'a_conferir': return { estado: 'pendencia', motivo: 'Conferir o PDF' };
    case 'sem_relatorio': return { estado: 'nao_verificado', motivo: 'Sem relatório' };
    default: return null;
  }
}

export function seloProcuracao(p: LinhaCarteira['procuracao']): Selo | null {
  switch (p.situacao) {
    case 'total':
      return p.vencendo && p.diasParaVencer !== null ? { estado: 'pendencia', motivo: `Vence em ${p.diasParaVencer} dias` } : { estado: 'em_dia', motivo: 'Completa' };
    case 'parcial': return { estado: 'pendencia', motivo: 'Faltam serviços' };
    case 'sem': return { estado: 'atencao', motivo: 'Sem procuração' };
    case 'vencida': return { estado: 'atencao', motivo: 'Procuração vencida' };
    default: return { estado: 'nao_verificado', motivo: 'Não mapeada' };
  }
}

/** Limite e sublimite do Simples, de uma leitura confiável do PGDAS-D. Sem leitura é cobertura do sistema, não obrigação do cliente. */
export function seloLimite(l: Pick<LinhaCarteira['limite'], 'nivel' | 'sublimite' | 'percentual'> | null, simples: boolean): Selo | null {
  if (!simples) return null;
  if (!l || !l.nivel) return { estado: 'nao_verificado', motivo: 'Faturamento não lido' };
  const pct = l.percentual !== null ? ` (${l.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)` : '';
  if (l.nivel === 'acima') return { estado: 'atencao', motivo: 'Acima do limite' };
  if (l.sublimite === 'acima') return { estado: 'atencao', motivo: 'Acima do sublimite' };
  if (l.nivel === 'critico') return { estado: 'atencao', motivo: `Perto do limite${pct}` };
  if (l.nivel === 'atencao') return { estado: 'pendencia', motivo: `Perto do limite${pct}` };
  if (l.sublimite === 'perto') return { estado: 'pendencia', motivo: 'Perto do sublimite' };
  return { estado: 'em_dia', motivo: `Dentro do limite${pct}` };
}

export function seloLeituraLimite(f: FaturamentoRow | null, simples = true): Selo | null {
  return seloLimite(f ? { nivel: nivelLimite(f), sublimite: nivelSublimite(f), percentual: percentualLimite(f) } : null, simples);
}

export function seloCertificado(dias: number | null): Selo | null {
  if (dias === null) return null;
  if (dias < 0) return { estado: 'atencao', motivo: 'Certificado vencido' };
  if (dias <= 30) return { estado: 'pendencia', motivo: `Certificado vence em ${dias} dias` };
  return { estado: 'em_dia', motivo: 'Certificado válido' };
}

// ---------------------------------------------------------------- painel (Dashboard Federal)

export type ProcessoPainel = 'pgdas' | 'das' | 'defis' | 'limite' | 'dctfweb_mit' | 'caixa' | 'intimacoes' | 'sitfis' | 'procuracao' | 'certificado';

/**
 * Selo de cada fonte de UM cliente da carteira. `limite` aparece na barra do painel, mas não entra na situação do cliente:
 * faturamento não lido é falta de leitura nossa, não obrigação do cliente (senão quase todo cliente ficaria cinza).
 */
export function selosDaCarteira(
  l: LinhaCarteira,
  /** Sobrescreve PGDAS-D, DAS e limite com a mesma linha da tela Simples Nacional, para painel e lista contarem igual. */
  opcoes: { pgdas?: Selo | null; das?: Selo | null; limite?: Selo | null; diasCertificado?: number | null } = {},
): Record<ProcessoPainel, Selo | null> {
  const simples = l.regime === 'simples_nacional';
  return {
    pgdas: opcoes.pgdas !== undefined ? opcoes.pgdas : seloPgdasCarteira(l.pgdas),
    das: opcoes.das !== undefined ? opcoes.das : seloDasEstado(l.das),
    defis: seloDefis(l.defis.estado, l.defis.ano),
    limite: opcoes.limite !== undefined ? opcoes.limite : seloLimite(l.limite, simples),
    dctfweb_mit: seloDctfwebMit(l.dctfweb, l.mit),
    caixa: seloCaixaPostal(l.caixa),
    intimacoes: seloIntimacoes(l),
    sitfis: seloSitfis(l.sitfis),
    procuracao: seloProcuracao(l.procuracao),
    certificado: seloCertificado(opcoes.diasCertificado ?? null),
  };
}

export const FORA_DA_SITUACAO_DO_CLIENTE: ProcessoPainel[] = ['limite'];

export function seloDoCliente(selos: Record<ProcessoPainel, Selo | null>): Selo {
  const conta = (Object.keys(selos) as ProcessoPainel[]).filter((k) => !FORA_DA_SITUACAO_DO_CLIENTE.includes(k)).map((k) => selos[k]);
  return piorSelo(conta) ?? { estado: 'nao_verificado', motivo: 'Nenhuma fonte consultada' };
}

// ---------------------------------------------------------------- Simples Nacional (uma competência)

/**
 * Declaração PGDAS-D de UM período, com a regra da tela PGDAS: "não transmitida" só depois do prazo e de uma consulta feita depois do prazo.
 * `abertura` (AAAA-MM-DD) exclui os meses antes da abertura da empresa.
 */
export function seloPgdasMes(l: LinhaPgdasd, pa: string, hoje: string, abertura: string | null = null): Selo | null {
  if (l.filial) return null;
  if (abertura && abertura.slice(0, 7) > pa) return null;
  if (!l.consultadoEm) return { estado: 'nao_verificado', motivo: 'Ano não consultado' };
  const d = declaracaoVigente(l, pa);
  const prazo = vencimentoDoPeriodo(pa);
  if (!d) {
    if (hoje <= prazo) return { estado: 'pendencia', motivo: `A transmitir até ${ddmm(prazo)}` };
    return l.consultadoEm.slice(0, 10) > prazo
      ? { estado: 'atencao', motivo: 'Não transmitida' }
      : { estado: 'pendencia', motivo: 'Consultar de novo' };
  }
  if (d.maed_notificacao_path || d.maed_darf_path) return { estado: 'atencao', motivo: 'MAED notificada' };
  if (d.malha && !/liberad/i.test(d.malha)) return { estado: 'atencao', motivo: 'Em malha' };
  return { estado: 'em_dia', motivo: d.tipo === 'retificadora' ? 'Retificada' : 'Transmitida' };
}

/** Competências do ano ANTERIORES a `pa` ainda em falta (regra do Portal 360°). Aparece junto do selo do mês para o atraso antigo não sumir. */
export function seloPgdasAtrasoAno(l: LinhaPgdasd, pa: string, hoje: string, abertura: string | null = null): Selo | null {
  const ano = avaliarPgdas(l, abertura, Number(pa.slice(0, 4)), pa, hoje);
  const antigas = ano.emFalta.filter((x) => x < pa);
  return antigas.length ? { estado: 'atencao', motivo: `Em falta: ${listaPas(antigas)}` } : null;
}

/** Declaração do cliente na competência `pa`: o pior entre o mês e o atraso antigo do ano. É o que o painel conta e a lista filtra. */
export function seloPgdasLinha(l: LinhaPgdasd, pa: string, hoje: string, abertura: string | null = null): Selo | null {
  return piorSelo([seloPgdasAtrasoAno(l, pa, hoje, abertura), seloPgdasMes(l, pa, hoje, abertura)]);
}
