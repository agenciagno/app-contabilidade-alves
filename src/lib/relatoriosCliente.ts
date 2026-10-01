/**
 * Relatórios para o cliente (Gestão 360°, rodada 3). Funções puras sobre o que já está salvo: não chamam o Serpro e não custam nada.
 *
 * SCORE FISCAL = itens regulares ÷ itens verificados. Item sem dado (não consultado, a confirmar, a conferir) é "não verificado":
 * nunca conta como regular e fica à parte, com a quantidade ao lado do score. É a razão de conformidade que faz sentido num documento;
 * o NÍVEL de risco (Crítico, Atenção...) continua sendo a medida interna e não vai para o cliente.
 *
 * PLANO DE AÇÃO por regras (sem IA externa: o contrato do Serpro não permite mandar dado a IA fora do Brasil): cada item pendente vira uma
 * ação, em ordem de prioridade, com quem faz (cliente ou Contabilidade Alves).
 */
import { limiteDe, percentualLimite, type FaturamentoRow } from '@/hooks/useSerproFaturamento';
import { dataBR, sigla, type LinhaCarteira } from '@/lib/situacaoCarteira';

export type EstadoItem = 'regular' | 'pendente' | 'nao_verificado';

export interface ItemScore {
  chave: string;
  rotulo: string;
  estado: EstadoItem;
  detalhe: string;
  /** AAAA-MM-DD da leitura que sustenta o item, quando o sistema sabe. */
  lidoEm: string | null;
}

export interface Score {
  itens: ItemScore[];
  regulares: number;
  pendentes: number;
  naoVerificados: number;
  /** Itens com dado (regulares + pendentes). */
  verificados: number;
  /** regulares ÷ verificados, em %. Null quando nada foi verificado (nunca vira 100%). */
  percentual: number | null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const lista = (pas: string[]) => (pas.length <= 3 ? pas.map(sigla).join(', ') : `${pas.slice(0, 3).map(sigla).join(', ')} e mais ${pas.length - 3}`);

export function calcularScore(l: LinhaCarteira): Score {
  const itens: ItemScore[] = [];
  const add = (chave: string, rotulo: string, estado: EstadoItem, detalhe: string, lidoEm: string | null = null) => itens.push({ chave, rotulo, estado, detalhe, lidoEm });
  const simples = l.regime === 'simples_nacional';
  const presumidoOuReal = l.regime === 'lucro_presumido' || l.regime === 'lucro_real';

  // Situação fiscal (Receita e PGFN)
  if (l.sitfis === 'sem_pendencias') add('sitfis', 'Situação fiscal (Receita e PGFN)', 'regular', 'Sem pendências no relatório', l.sitfisEm);
  else if (l.sitfis === 'com_pendencias') add('sitfis', 'Situação fiscal (Receita e PGFN)', 'pendente', 'O relatório aponta pendências', l.sitfisEm);
  else if (l.sitfis === 'a_conferir') add('sitfis', 'Situação fiscal (Receita e PGFN)', 'nao_verificado', 'Relatório gerado, ainda em conferência pela nossa equipe', l.sitfisEm);
  else add('sitfis', 'Situação fiscal (Receita e PGFN)', 'nao_verificado', 'Ainda sem relatório');

  // Certidão federal (lida do relatório de situação fiscal)
  const c = l.certidao;
  const validade = c.validade ? ` · válida até ${dataBR(c.validade)}` : '';
  if (c.situacao === 'regular') add('certidao', 'Certidão federal', 'regular', `${c.tipo ?? 'Negativa'}${validade}`, l.sitfisEm);
  else if (c.situacao === 'irregular') add('certidao', 'Certidão federal', 'pendente', `${c.tipo ?? 'Positiva'}${validade}`, l.sitfisEm);
  else if (c.situacao === 'vencida') add('certidao', 'Certidão federal', 'nao_verificado', `A última certidão lida venceu em ${dataBR(c.validade)}; vamos ler de novo`, l.sitfisEm);
  else add('certidao', 'Certidão federal', 'nao_verificado', 'Ainda sem leitura da certidão');

  // Comunicações da Receita (Caixa Postal e-CAC)
  if (l.mensagens.total > 0) add('caixa', 'Comunicações da Receita (Caixa Postal)', 'pendente', `${plural(l.mensagens.total, 'comunicação em aberto', 'comunicações em aberto')} na Caixa Postal`);
  else if (l.caixa === 'todas_lidas') add('caixa', 'Comunicações da Receita (Caixa Postal)', 'regular', 'Nenhuma comunicação nova ou não lida');
  else add('caixa', 'Comunicações da Receita (Caixa Postal)', 'nao_verificado', 'Caixa Postal ainda não verificada');

  // Procuração eletrônica
  const p = l.procuracao;
  if (p.situacao === 'total') add('procuracao', 'Procuração eletrônica (e-CAC)', 'regular', p.vencendo && p.diasParaVencer !== null ? `Vence em ${plural(p.diasParaVencer, 'dia', 'dias')}` : 'Ativa');
  else if (p.situacao === 'parcial') add('procuracao', 'Procuração eletrônica (e-CAC)', 'pendente', 'Cobre só parte dos serviços');
  else if (p.situacao === 'sem') add('procuracao', 'Procuração eletrônica (e-CAC)', 'pendente', 'Não encontrada');
  else if (p.situacao === 'vencida') add('procuracao', 'Procuração eletrônica (e-CAC)', 'pendente', 'Vencida');
  else add('procuracao', 'Procuração eletrônica (e-CAC)', 'nao_verificado', 'Ainda não verificada');

  if (simples) {
    // PGDAS-D do ano
    const g = l.pgdas;
    if (g.estado === 'em_dia') add('pgdas', 'PGDAS-D (declaração mensal)', 'regular', g.aVencer.length ? `Em dia · ${sigla(g.aVencer[0])} ainda no prazo` : 'Em dia', g.consultadoEm?.slice(0, 10) ?? null);
    else if (g.estado === 'em_falta') add('pgdas', 'PGDAS-D (declaração mensal)', 'pendente', `Sem declaração: ${lista(g.emFalta)}`, g.consultadoEm?.slice(0, 10) ?? null);
    else if (g.estado === 'a_confirmar') add('pgdas', 'PGDAS-D (declaração mensal)', 'nao_verificado', `${lista(g.aConfirmar)}: a leitura foi antes do prazo, vamos conferir`, g.consultadoEm?.slice(0, 10) ?? null);
    else if (g.estado === 'nao_consultado') add('pgdas', 'PGDAS-D (declaração mensal)', 'nao_verificado', 'Ainda não consultado neste ano');

    // DEFIS
    const d = l.defis;
    if (d.estado === 'entregue' || d.estado === 'retificada') add('defis', `DEFIS ${d.ano} (declaração anual)`, 'regular', 'Entregue');
    else if (d.estado === 'em_atraso') add('defis', `DEFIS ${d.ano} (declaração anual)`, 'pendente', 'Não entregue, prazo vencido');
    else if (d.estado === 'a_entregar') add('defis', `DEFIS ${d.ano} (declaração anual)`, 'regular', 'Ainda no prazo');
    else if (d.estado === 'nao_consultado') add('defis', `DEFIS ${d.ano} (declaração anual)`, 'nao_verificado', 'Ainda não consultada');

    // DAS da competência
    const comp = sigla(l.dasCompetencia);
    if (l.das === 'pago') add('das', `DAS de ${comp}`, 'regular', 'Pago');
    else if (l.das === 'a_vencer') add('das', `DAS de ${comp}`, 'regular', 'Ainda no prazo');
    else if (l.das === 'vencido') add('das', `DAS de ${comp}`, 'pendente', 'Vencido, sem pagamento registrado na Receita');
    else if (l.das === 'sem_das') add('das', `DAS de ${comp}`, 'nao_verificado', 'Guia ainda não gerada ou lida');
    else if (l.das === 'nao_consultado') add('das', `DAS de ${comp}`, 'nao_verificado', 'Ainda não consultado');

    // Limite do Simples
    const lm = l.limite;
    if (lm.nivel === 'acima') add('limite', 'Limite do Simples Nacional', 'pendente', `Acima do limite (${lm.percentual?.toFixed(0)}%)`);
    else if (lm.nivel) add('limite', 'Limite do Simples Nacional', 'regular', `${lm.percentual?.toFixed(0)}% do limite${lm.nivel === 'atencao' || lm.nivel === 'critico' ? ' · atenção' : ''}`);
    else add('limite', 'Limite do Simples Nacional', 'nao_verificado', 'Faturamento ainda não lido');
  }

  if (presumidoOuReal) {
    if (l.dctfweb === 'transmitida') add('dctfweb', 'DCTFWeb do mês', 'regular', 'Transmitida, com recibo');
    else if (l.dctfweb === 'sem_declaracao') add('dctfweb', 'DCTFWeb do mês', 'nao_verificado', 'Sem declaração (só existe com movimento): vamos conferir');
    else if (l.dctfweb === 'nao_consultado') add('dctfweb', 'DCTFWeb do mês', 'nao_verificado', 'Ainda não consultada');
    if (l.mit === 'encerrada') add('mit', 'MIT do mês', 'regular', 'Encerrada');
    else if (l.mit === 'sem_apuracao') add('mit', 'MIT do mês', 'nao_verificado', 'Sem apuração (só existe com movimento): vamos conferir');
    else if (l.mit === 'outra_situacao') add('mit', 'MIT do mês', 'nao_verificado', 'Em outra situação: vamos conferir');
    else if (l.mit === 'nao_consultado') add('mit', 'MIT do mês', 'nao_verificado', 'Ainda não consultada');
  }

  const regulares = itens.filter((i) => i.estado === 'regular').length;
  const pendentes = itens.filter((i) => i.estado === 'pendente').length;
  const naoVerificados = itens.filter((i) => i.estado === 'nao_verificado').length;
  const verificados = regulares + pendentes;
  return { itens, regulares, pendentes, naoVerificados, verificados, percentual: verificados > 0 ? Math.round((regulares / verificados) * 100) : null };
}

// ---------------------------------------------------------------- plano de ação
export interface AcaoPlano {
  prioridade: 1 | 2 | 3 | 4;
  titulo: string;
  oQueFazer: string;
  quem: string;
  /** Itens do score que originaram a ação. */
  itens: string[];
}

export const ROTULO_PRIORIDADE: Record<AcaoPlano['prioridade'], string> = { 1: 'Urgente', 2: 'Importante', 3: 'Acompanhar', 4: 'Verificar' };

export function montarPlanoAcao(l: LinhaCarteira, s: Score = calcularScore(l)): AcaoPlano[] {
  const acoes: AcaoPlano[] = [];
  const estado = (chave: string) => s.itens.find((i) => i.chave === chave)?.estado;

  if (l.mensagens.total > 0) {
    acoes.push({
      prioridade: 1, titulo: `${plural(l.mensagens.total, 'comunicação da Receita', 'comunicações da Receita')} em aberto`, itens: ['caixa'], quem: 'Contabilidade Alves',
      oQueFazer: 'Nossa equipe vai analisar e orientar os próximos passos. Se você recebeu algo parecido da Receita Federal, nos avise.',
    });
  }
  if (l.pgdas.emFalta.length) {
    const risco = l.pgdas.emFalta.length >= 3;
    acoes.push({
      prioridade: 1, titulo: `PGDAS-D sem declaração: ${lista(l.pgdas.emFalta)}`, itens: ['pgdas'], quem: 'Você envia, nós transmitimos',
      oQueFazer: `Envie à Contabilidade Alves o movimento (notas de venda e de serviços e, se houver, as compras) de ${lista(l.pgdas.emFalta)}. Com ele transmitimos a declaração. Quanto antes, menor o risco de multa e de problema com a certidão.${risco ? ' Com 3 competências ou mais sem declaração há risco de exclusão do Simples Nacional: é a prioridade.' : ''}`,
    });
  }
  if (l.defis.estado === 'em_atraso') {
    acoes.push({
      prioridade: 1, titulo: `DEFIS ${l.defis.ano} não entregue`, itens: ['defis'], quem: 'Você e Contabilidade Alves',
      oQueFazer: `Fale com nossa equipe para confirmarmos as informações de ${l.defis.ano} e entregarmos a DEFIS o quanto antes.`,
    });
  }
  if (l.das === 'vencido') {
    acoes.push({
      prioridade: 1, titulo: `DAS de ${sigla(l.dasCompetencia)} vencido`, itens: ['das'], quem: 'Você paga, nós emitimos a guia',
      oQueFazer: `Peça à nossa equipe a guia atualizada do DAS de ${sigla(l.dasCompetencia)} e faça o pagamento.`,
    });
  }
  if (estado('sitfis') === 'pendente') {
    acoes.push({
      prioridade: 2, titulo: 'Pendência na situação fiscal', itens: ['sitfis'], quem: 'Contabilidade Alves',
      oQueFazer: 'O relatório da Receita e da PGFN aponta pendências. Nossa equipe detalha o que é e orienta a regularização.',
    });
  }
  if (estado('certidao') === 'pendente') {
    acoes.push({
      prioridade: 2, titulo: 'Certidão federal positiva', itens: ['certidao'], quem: 'Contabilidade Alves',
      oQueFazer: 'Regularizadas as pendências, emitimos uma nova certidão. Até lá, ela pode não servir para licitação, financiamento ou renovação de alvará.',
    });
  }
  if (estado('procuracao') === 'pendente') {
    acoes.push({
      prioridade: 2, titulo: l.procuracao.situacao === 'vencida' ? 'Procuração eletrônica vencida' : l.procuracao.situacao === 'parcial' ? 'Procuração eletrônica incompleta' : 'Procuração eletrônica não encontrada', itens: ['procuracao'], quem: 'Você, com nosso passo a passo',
      oQueFazer: 'Sem a procuração no e-CAC a Receita não nos deixa acompanhar a empresa. Nossa equipe passa o passo a passo para conceder ou renovar.',
    });
  } else if (l.procuracao.vencendo && l.procuracao.diasParaVencer !== null && l.procuracao.situacao !== 'vencida') {
    acoes.push({
      prioridade: 3, titulo: `Procuração vence em ${plural(l.procuracao.diasParaVencer, 'dia', 'dias')}`, itens: ['procuracao'], quem: 'Você, com nosso passo a passo',
      oQueFazer: 'Renove a procuração eletrônica no e-CAC antes do vencimento para não perdermos o acompanhamento. Nossa equipe passa o passo a passo.',
    });
  }
  if (estado('limite') === 'pendente') {
    acoes.push({
      prioridade: 2, titulo: 'Faturamento acima do limite do Simples Nacional', itens: ['limite'], quem: 'Você e Contabilidade Alves',
      oQueFazer: 'Converse com nossa equipe para avaliar o enquadramento da empresa o quanto antes.',
    });
  } else if (l.limite.nivel === 'atencao' || l.limite.nivel === 'critico') {
    acoes.push({
      prioridade: 3, titulo: `Faturamento em ${l.limite.percentual?.toFixed(0)}% do limite do Simples`, itens: ['limite'], quem: 'Você e Contabilidade Alves',
      oQueFazer: 'Vamos planejar juntos o resto do ano para a empresa não passar do teto sem perceber.',
    });
  }
  if (l.pgdas.aVencer.length && !l.pgdas.emFalta.length) {
    acoes.push({
      prioridade: 3, titulo: `PGDAS-D de ${sigla(l.pgdas.aVencer[0])} no prazo`, itens: ['pgdas'], quem: 'Você envia, nós transmitimos',
      oQueFazer: 'Se ainda não enviou o movimento do mês, envie à Contabilidade Alves para transmitirmos a declaração dentro do prazo.',
    });
  }

  const nv = s.itens.filter((i) => i.estado === 'nao_verificado');
  if (nv.length) {
    acoes.push({
      prioridade: 4, titulo: `${plural(nv.length, 'item ainda não verificado', 'itens ainda não verificados')}`, itens: nv.map((i) => i.chave), quem: 'Contabilidade Alves',
      oQueFazer: `Nossa equipe confirma na próxima leitura: ${nv.map((i) => i.rotulo).join('; ')}. "Não verificado" não quer dizer regular: significa que ainda não temos o dado confirmado.`,
    });
  }
  return acoes.sort((a, b) => a.prioridade - b.prioridade);
}

// ---------------------------------------------------------------- faturamento dos últimos 12 meses
export interface MesFaturamento { mes: string; interno: number | null; externo: number | null; total: number | null }

export interface RelatorioFaturamento {
  /** Competência (AAAA-MM) da declaração lida. */
  periodo: string;
  /** Os 12 meses que formam o RBT12: de 12 meses antes até o mês anterior à competência. */
  meses: MesFaturamento[];
  /** RBT12 informado pela Receita. */
  rbt12: number | null;
  /** Soma dos meses que o PDF trouxe (pode diferir do RBT12 em empresa aberta há menos de 12 meses). */
  somaMeses: number;
  mesesSemDado: number;
  rpa: number | null;
  rba: number | null;
  limite: number;
  sublimite: number | null;
  percentualLimite: number | null;
  fatorR: string | null;
  municipio: string | null;
  uf: string | null;
  numeroDeclaracao: string;
  numeroRecibo: string | null;
  transmitidaEm: string | null;
  lidoEm: string;
  avisos: string[];
}

const mesAnterior = (pa: string, n: number) => {
  const d = new Date(Date.UTC(Number(pa.slice(0, 4)), Number(pa.slice(5, 7)) - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Relatório de faturamento a partir da leitura do PDF do PGDAS-D. Null quando não há leitura confiável com histórico (nunca inventa mês). */
export function montarRelatorioFaturamento(l: LinhaCarteira, f: FaturamentoRow | null | undefined): RelatorioFaturamento | null {
  if (!f || l.regime !== 'simples_nacional' || !f.confiavel || !f.dados) return null;
  const interno = new Map((f.dados.historico_interno ?? []).map((m) => [m.mes, m.valor]));
  const externo = new Map((f.dados.historico_externo ?? []).map((m) => [m.mes, m.valor]));
  const pa = f.periodo_apuracao.slice(0, 7);
  const meses: MesFaturamento[] = [];
  for (let n = 12; n >= 1; n--) {
    const mes = mesAnterior(pa, n);
    const i = interno.has(mes) ? interno.get(mes)! : null;
    const e = externo.has(mes) ? externo.get(mes)! : null;
    meses.push({ mes, interno: i, externo: e, total: i === null && e === null ? null : (i ?? 0) + (e ?? 0) });
  }
  if (meses.every((m) => m.total === null)) return null;
  const sub = f.sublimite && f.sublimite > 0 ? f.sublimite : null;
  return {
    periodo: pa, meses, rbt12: f.rbt12_total, somaMeses: Math.round(meses.reduce((s, m) => s + (m.total ?? 0), 0) * 100) / 100,
    mesesSemDado: meses.filter((m) => m.total === null).length, rpa: f.rpa_total, rba: f.rba_total,
    limite: limiteDe(f), sublimite: sub, percentualLimite: percentualLimite(f), fatorR: f.fator_r_aplica ? f.fator_r_texto : null,
    municipio: f.dados.municipio, uf: f.dados.uf, numeroDeclaracao: f.numero_declaracao, numeroRecibo: f.dados.numero_recibo,
    transmitidaEm: f.transmitida_em, lidoEm: f.lido_em, avisos: f.avisos ?? [],
  };
}

/** Leitura de faturamento mais recente e confiável de um cliente (a maior competência). */
export function ultimaLeituraFaturamento(rows: FaturamentoRow[], contactId: string): FaturamentoRow | null {
  return rows.filter((r) => r.contact_id === contactId && r.confiavel && r.dados)
    .sort((a, b) => b.periodo_apuracao.localeCompare(a.periodo_apuracao) || b.lido_em.localeCompare(a.lido_em))[0] ?? null;
}
