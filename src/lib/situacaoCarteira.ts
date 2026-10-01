/**
 * Situação da carteira por cliente: uma linha por cliente, calculada só com o que já está salvo (sem chamada ao Serpro).
 * Alimenta o Portal 360° e, depois, CA · Ausências. O macro é a soma das linhas e o filtro por cliente é uma linha só,
 * então os dois números nunca divergem. Reaproveita as funções de estado das telas do Serpro (não reescreve regra).
 *
 * Regras fechadas com Gabriel (01/10/2026):
 *  · "Ausência" = declaração em falta do cliente. Só conta o que a Receita confirma: PGDAS-D e DEFIS. DCTFWeb e MIT
 *    entram como "a confirmar" (sem DCTFWeb não prova atraso: só existe para quem tem movimento).
 *  · Cliente não consultado nunca conta como em dia.
 *  · Competência só conta a partir do mês de abertura da empresa e depois da 1ª declaração do ano (antes dela não dá para
 *    saber se já era obrigada). Antes do prazo é "a vencer", nunca "em falta".
 *  · Risco por nível, com o motivo ao lado: Crítico, Atenção, Sem cobertura, Em dia.
 */
import {
  CATEGORIAS, seloCaixa, STATUS_MONITORADO,
  type ClienteCaixa, type MensagemComCliente, type SeloEstado,
} from '@/hooks/useSerproCaixaPostal';
import { declaracaoVigente, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import { prazoDefis, statusDefis, type LinhaDefis, type StatusDefis } from '@/hooks/useSerproDefis';
import {
  estadoDctfweb, estadoMit, type EstadoDctfweb, type EstadoMit, type LinhaDctfwebMit,
} from '@/hooks/useSerproDctfweb';
import { estadoSitfis, type EstadoSitfis, type LinhaSitfis } from '@/hooks/useSerproSitfis';
import { unificarLinhas, type EstadoDas } from '@/hooks/useSerproDasUnificado';
import {
  faturamentoVigente, nivelLimite, nivelSublimite, percentualLimite,
  type FaturamentoRow, type NivelLimite, type NivelSublimite,
} from '@/hooks/useSerproFaturamento';
import { vencendo as procuracaoVencendo, type LinhaProcuracao, type SituacaoProcuracao } from '@/hooks/useSerproProcuracoes';
import type { LinhaPagamentos } from '@/hooks/useSerproPagamentos';
import { vencimentoDoPeriodo } from '@/lib/prazosFederais';

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
export const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export const REGIME_ROTULO: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real',
  mei: 'MEI', isento: 'Isento', imune: 'Imune', nao_aplica: 'Não se aplica',
};
export const rotuloRegime = (r: string | null) => (r ? REGIME_ROTULO[r] ?? r : 'Sem regime');

// ---------------------------------------------------------------- tipos
export type NivelRisco = 'critico' | 'atencao' | 'sem_cobertura' | 'em_dia';
export type EstadoDeclaracoes = 'nao_se_aplica' | 'nao_consultado' | 'em_dia' | 'a_confirmar' | 'em_falta';
export type EstadoPgdas = 'nao_se_aplica' | 'nao_consultado' | 'em_dia' | 'a_confirmar' | 'em_falta';
export type SituacaoCertidao = 'regular' | 'irregular' | 'vencida' | 'sem_leitura';

export interface Ausencia {
  contact_id: string;
  obrigacao: 'PGDAS-D' | 'DEFIS' | 'DCTFWeb' | 'MIT';
  /** AAAA-MM (PGDAS-D, DCTFWeb, MIT) ou AAAA (DEFIS). */
  competencia: string;
  /** AAAA-MM-DD; DCTFWeb e MIT não têm prazo calculado aqui. */
  prazo: string | null;
  situacao: 'em_falta' | 'a_vencer' | 'a_confirmar' | 'nao_consultado';
}

export interface AvaliacaoPgdas {
  estado: EstadoPgdas;
  emFalta: string[];
  aConfirmar: string[];
  aVencer: string[];
  /** Competências (AAAA-MM) com declaração transmitida no ano consultado. */
  declaradas: string[];
  consultadoEm: string | null;
}

export interface ResponsavelCliente { id: string; nome: string }

export interface LinhaCarteira {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  regimeRotulo: string;
  /** Responsável do cadastro (contacts.responsible_id); null = cliente sem responsável. */
  responsavel: ResponsavelCliente | null;
  declaracoes: EstadoDeclaracoes;
  pgdas: AvaliacaoPgdas;
  defis: { estado: StatusDefis; ano: number };
  dctfweb: EstadoDctfweb | 'nao_se_aplica';
  mit: EstadoMit | 'nao_se_aplica';
  das: EstadoDas;
  dasCompetencia: string;
  sitfis: EstadoSitfis;
  sitfisEm: string | null;
  certidao: { tipo: string | null; validade: string | null; situacao: SituacaoCertidao };
  caixa: SeloEstado;
  mensagens: { total: number; intimacoes: number; exclusaoSimples: number; danger: Record<string, number>; atencao: Record<string, number> };
  procuracao: { situacao: SituacaoProcuracao | 'desconhecida'; diasParaVencer: number | null; vencendo: boolean };
  limite: { nivel: NivelLimite | null; sublimite: NivelSublimite | null; percentual: number | null };
  riscoExclusaoSimples: boolean;
  /** Multa por atraso (MAED) que a Receita notificou: mensagem aberta ou documento da MAED na declaração. Sem estimativa. */
  multa: { maed: number };
  ausencias: Ausencia[];
  nivel: NivelRisco;
  motivos: string[];
}

export interface EntradaCarteira {
  /** AAAA-MM-DD, horário de Brasília. */
  hoje: string;
  /** AAAA-MM da competência em aberto (mês anterior ao de hoje). */
  competencia: string;
  clientes: ClienteCaixa[];
  /** contact_id → data de abertura (AAAA-MM-DD). */
  aberturas: Map<string, string | null>;
  /** contact_id → responsável do cadastro. Cliente fora do mapa fica sem responsável. */
  responsaveis?: Map<string, ResponsavelCliente>;
  mensagens: MensagemComCliente[];
  procuracoes: LinhaProcuracao[];
  pagamentos: LinhaPagamentos[];
  pgdas: LinhaPgdasd[];
  defis: LinhaDefis[];
  sitfis: LinhaSitfis[];
  dctfwebMit: LinhaDctfwebMit[];
  faturamento: FaturamentoRow[];
}

// ---------------------------------------------------------------- PGDAS-D
const mesesAte = (ano: number, ate: string): string[] => {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const pa = `${ano}-${String(m).padStart(2, '0')}`;
    if (pa > ate) break;
    out.push(pa);
  }
  return out;
};

/** Competências em falta de um cliente do Simples, no ano consultado. Função pura. */
export function avaliarPgdas(l: LinhaPgdasd | undefined, abertura: string | null, ano: number, competencia: string, hoje: string): AvaliacaoPgdas {
  const base: AvaliacaoPgdas = { estado: 'nao_se_aplica', emFalta: [], aConfirmar: [], aVencer: [], declaradas: [], consultadoEm: null };
  if (!l || l.filial) return base;
  if (abertura && Number(abertura.slice(0, 4)) > ano) return base;
  if (!l.consultadoEm) return { ...base, estado: 'nao_consultado' };

  const consulta = l.consultadoEm.slice(0, 10);
  const feitas = new Set(l.declaracoes.map((d) => d.periodo_apuracao.slice(0, 7)));
  const primeira = [...feitas].sort()[0] ?? null;
  const inicio = abertura && abertura.slice(0, 4) === String(ano) ? abertura.slice(0, 7) : `${ano}-01`;
  const emFalta: string[] = [], aConfirmar: string[] = [], aVencer: string[] = [];
  for (const pa of mesesAte(ano, competencia)) {
    if (pa < inicio || feitas.has(pa)) continue;
    if (primeira && pa < primeira) continue; // antes da 1ª declaração do ano: não dá para saber se já era obrigada
    const prazo = vencimentoDoPeriodo(pa);
    if (hoje <= prazo) aVencer.push(pa);
    else if (consulta > prazo) emFalta.push(pa); // só uma consulta depois do prazo prova que não foi transmitida
    else aConfirmar.push(pa);
  }
  const estado: EstadoPgdas = emFalta.length ? 'em_falta' : aConfirmar.length ? 'a_confirmar' : 'em_dia';
  return { estado, emFalta, aConfirmar, aVencer, declaradas: [...feitas].sort(), consultadoEm: l.consultadoEm };
}

// ---------------------------------------------------------------- certidão (Situação fiscal)
export function situacaoCertidao(tipo: string | null, validade: string | null, confiavel: boolean, hoje: string): SituacaoCertidao {
  if (!tipo || !confiavel) return 'sem_leitura';
  if (validade && validade < hoje) return 'vencida';
  return /negativa/i.test(tipo) ? 'regular' : 'irregular'; // "Positiva com Efeitos de Negativa" vale como negativa
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
export const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const lista = (pas: string[]) => (pas.length <= 3 ? pas.map(sigla).join(', ') : `${pas.slice(0, 3).map(sigla).join(', ')} e mais ${pas.length - 3}`);

// ---------------------------------------------------------------- montagem
export function montarCarteira(e: EntradaCarteira): LinhaCarteira[] {
  const ano = Number(e.competencia.slice(0, 4));
  const anoDefis = Number(e.hoje.slice(0, 4)) - 1;
  const agoraMeioDia = new Date(`${e.hoje}T12:00:00`);

  const universo = e.clientes.filter((c) => {
    const d = digitos(c.documento);
    return c.status_cliente === STATUS_MONITORADO && d.length === 14 && d.slice(8, 12) === '0001' && !CNPJS_DA_CA.has(d);
  });

  const porId = <T extends { contact_id: string }>(xs: T[]) => new Map(xs.map((x) => [x.contact_id, x]));
  const pgdasPor = porId(e.pgdas), defisPor = porId(e.defis), sitfisPor = porId(e.sitfis), dctfPor = porId(e.dctfwebMit), procPor = porId(e.procuracoes);
  const dasPor = new Map(unificarLinhas(e.pagamentos, e.pgdas, e.competencia, e.hoje).map((l) => [l.contact_id, l.das.estado]));

  const msgsPor = new Map<string, MensagemComCliente[]>();
  for (const m of e.mensagens) {
    if (m.situacao !== 'nova' && m.situacao !== 'em_tratamento') continue;
    if (!CATEGORIAS[m.categoria]?.critica) continue;
    const a = msgsPor.get(m.contact_id) ?? [];
    a.push(m);
    msgsPor.set(m.contact_id, a);
  }

  return universo.map((c): LinhaCarteira => {
    const id = c.contact_id;
    const regime = c.regime;
    const simples = regime === 'simples_nacional';
    const abertura = e.aberturas.get(id) ?? null;

    const lp = pgdasPor.get(id);
    const pgdas = simples ? avaliarPgdas(lp, abertura, ano, e.competencia, e.hoje) : avaliarPgdas(undefined, abertura, ano, e.competencia, e.hoje);
    const ld = defisPor.get(id);
    const defisEstado: StatusDefis = simples && ld ? statusDefis(ld, anoDefis, agoraMeioDia) : 'nao_se_aplica';

    let declaracoes: EstadoDeclaracoes = 'nao_se_aplica';
    if (simples && pgdas.estado !== 'nao_se_aplica') {
      if (pgdas.estado === 'em_falta' || defisEstado === 'em_atraso') declaracoes = 'em_falta';
      else if (pgdas.estado === 'nao_consultado') declaracoes = 'nao_consultado';
      else if (pgdas.estado === 'a_confirmar') declaracoes = 'a_confirmar';
      else declaracoes = 'em_dia';
    }

    const lm = dctfPor.get(id);
    const dctfweb = lm ? estadoDctfweb(lm) : 'nao_se_aplica';
    const mit = lm ? estadoMit(lm) : 'nao_se_aplica';

    const ls = sitfisPor.get(id);
    const sitfis: EstadoSitfis = ls ? estadoSitfis(ls) : 'sem_relatorio';
    const ultimo = ls?.ultimo ?? null;
    const certidao = {
      tipo: ultimo?.certidao_tipo ?? null,
      validade: ultimo?.certidao_validade ?? null,
      situacao: situacaoCertidao(ultimo?.certidao_tipo ?? null, ultimo?.certidao_validade ?? null, !!ultimo?.confiavel, e.hoje),
    };

    const selo = seloCaixa(c).estado;
    const abertas = msgsPor.get(id) ?? [];
    const danger: Record<string, number> = {}, atencao: Record<string, number> = {};
    for (const m of abertas) {
      const alvo = CATEGORIAS[m.categoria].tone === 'danger' ? danger : atencao;
      alvo[m.categoria] = (alvo[m.categoria] ?? 0) + 1;
    }
    const mensagens = {
      total: abertas.length,
      intimacoes: abertas.filter((m) => m.categoria === 'intimacao').length,
      exclusaoSimples: abertas.filter((m) => m.categoria === 'exclusao_simples').length,
      danger, atencao,
    };

    const lc = procPor.get(id);
    const procuracao = lc
      ? { situacao: lc.situacao, diasParaVencer: lc.diasParaVencer, vencendo: lc.situacao !== 'vencida' && procuracaoVencendo(lc) }
      : { situacao: 'desconhecida' as const, diasParaVencer: null, vencendo: false };

    const fat = simples && lp ? faturamentoVigente(lp, e.faturamento, e.competencia) : null;
    const limite = { nivel: fat ? nivelLimite(fat) : null, sublimite: fat ? nivelSublimite(fat) : null, percentual: fat ? percentualLimite(fat) : null };

    const dasEstado = dasPor.get(id) ?? 'nao_simples';

    // ausências (lista que a aba CA · Ausências vai mostrar)
    const ausencias: Ausencia[] = [];
    for (const pa of pgdas.emFalta) ausencias.push({ contact_id: id, obrigacao: 'PGDAS-D', competencia: pa, prazo: vencimentoDoPeriodo(pa), situacao: 'em_falta' });
    for (const pa of pgdas.aConfirmar) ausencias.push({ contact_id: id, obrigacao: 'PGDAS-D', competencia: pa, prazo: vencimentoDoPeriodo(pa), situacao: 'a_confirmar' });
    for (const pa of pgdas.aVencer) ausencias.push({ contact_id: id, obrigacao: 'PGDAS-D', competencia: pa, prazo: vencimentoDoPeriodo(pa), situacao: 'a_vencer' });
    if (defisEstado === 'em_atraso' || defisEstado === 'a_entregar') {
      ausencias.push({ contact_id: id, obrigacao: 'DEFIS', competencia: String(anoDefis), prazo: isoLocal(prazoDefis(anoDefis)), situacao: defisEstado === 'em_atraso' ? 'em_falta' : 'a_vencer' });
    }
    if (simples && pgdas.estado === 'nao_consultado') ausencias.push({ contact_id: id, obrigacao: 'PGDAS-D', competencia: e.competencia, prazo: vencimentoDoPeriodo(e.competencia), situacao: 'nao_consultado' });
    if (simples && defisEstado === 'nao_consultado') ausencias.push({ contact_id: id, obrigacao: 'DEFIS', competencia: String(anoDefis), prazo: isoLocal(prazoDefis(anoDefis)), situacao: 'nao_consultado' });
    if (dctfweb === 'sem_declaracao') ausencias.push({ contact_id: id, obrigacao: 'DCTFWeb', competencia: e.competencia, prazo: null, situacao: 'a_confirmar' });
    if (mit === 'sem_apuracao') ausencias.push({ contact_id: id, obrigacao: 'MIT', competencia: e.competencia, prazo: null, situacao: 'a_confirmar' });

    const riscoExclusaoSimples = mensagens.exclusaoSimples > 0 || pgdas.emFalta.length >= 3;
    const maed = (mensagens.atencao.maed ?? 0) + (lp?.declaracoes.filter((d) => d.maed_notificacao_path || d.maed_darf_path).length ?? 0);

    const linha: LinhaCarteira = {
      contact_id: id, nome: c.nome, documento: c.documento, regime, regimeRotulo: rotuloRegime(regime),
      responsavel: e.responsaveis?.get(id) ?? null,
      declaracoes, pgdas, defis: { estado: defisEstado, ano: anoDefis }, dctfweb, mit,
      das: dasEstado, dasCompetencia: e.competencia,
      sitfis, sitfisEm: ultimo?.gerado_em ?? null, certidao,
      caixa: selo, mensagens, procuracao, limite, riscoExclusaoSimples, multa: { maed }, ausencias,
      nivel: 'em_dia', motivos: [],
    };
    const { nivel, motivos } = calcularNivel(linha);
    return { ...linha, nivel, motivos };
  });
}

// ---------------------------------------------------------------- nível de risco
export const ROTULO_NIVEL: Record<NivelRisco, string> = { critico: 'Crítico', atencao: 'Atenção', sem_cobertura: 'Sem cobertura', em_dia: 'Em dia' };
export const ORDEM_NIVEL: Record<NivelRisco, number> = { critico: 0, atencao: 1, sem_cobertura: 2, em_dia: 3 };

export function calcularNivel(l: LinhaCarteira): { nivel: NivelRisco; motivos: string[] } {
  const critico: string[] = [], atencao: string[] = [], cobertura: string[] = [];

  for (const [cat, n] of Object.entries(l.mensagens.danger)) {
    const rotulo = CATEGORIAS[cat as keyof typeof CATEGORIAS].label;
    critico.push(`${rotulo} em aberto${n > 1 ? ` (${n})` : ''}`);
  }
  if (l.das === 'vencido') critico.push(`DAS de ${sigla(l.dasCompetencia)} vencido`);
  if (l.pgdas.emFalta.length) critico.push(`PGDAS-D em falta: ${lista(l.pgdas.emFalta)}`);
  if (l.defis.estado === 'em_atraso') critico.push(`DEFIS ${l.defis.ano} não entregue`);

  if (l.caixa === 'nao_lida' || l.caixa === 'nova') atencao.push('Mensagem nova na Caixa Postal');
  for (const [cat, n] of Object.entries(l.mensagens.atencao)) {
    atencao.push(`${CATEGORIAS[cat as keyof typeof CATEGORIAS].label} em aberto${n > 1 ? ` (${n})` : ''}`);
  }
  if (l.sitfis === 'com_pendencias') atencao.push('Pendência na Situação fiscal');
  if (l.procuracao.vencendo && l.procuracao.diasParaVencer !== null) {
    atencao.push(l.procuracao.diasParaVencer < 0 ? 'Procuração vencida' : `Procuração vence em ${l.procuracao.diasParaVencer} dias`);
  }
  if (l.limite.nivel && l.limite.nivel !== 'regular') atencao.push(l.limite.nivel === 'acima' ? 'Acima do limite do Simples' : 'Perto do limite do Simples');
  else if (l.limite.sublimite && l.limite.sublimite !== 'regular') atencao.push(l.limite.sublimite === 'acima' ? 'Acima do sublimite' : 'Perto do sublimite');
  if (l.pgdas.estado === 'a_confirmar') atencao.push('PGDAS-D sem declaração: consultar de novo');

  if (l.caixa === 'sem_procuracao') cobertura.push('Sem procuração');
  if (l.procuracao.situacao === 'vencida') cobertura.push('Procuração vencida');
  if (l.regime === 'simples_nacional' && l.pgdas.estado === 'nao_consultado') cobertura.push('Ainda não consultado no ano');

  if (critico.length) return { nivel: 'critico', motivos: critico };
  if (atencao.length) return { nivel: 'atencao', motivos: atencao };
  if (cobertura.length) return { nivel: 'sem_cobertura', motivos: cobertura };
  return { nivel: 'em_dia', motivos: [] };
}

// ---------------------------------------------------------------- filtros dos cartões (a mesma regra conta e lista)
export type Filtro = (l: LinhaCarteira) => boolean;

export const FILTROS = {
  monitorados: (() => true) as Filtro,
  declaracoesConsultadas: ((l) => l.declaracoes === 'em_dia' || l.declaracoes === 'em_falta' || l.declaracoes === 'a_confirmar') as Filtro,
  declaracoesEmFalta: ((l) => l.declaracoes === 'em_falta') as Filtro,
  declaracoesEmDia: ((l) => l.declaracoes === 'em_dia') as Filtro,
  podeImpedirCertidao: ((l) => l.sitfis === 'com_pendencias' || l.das === 'vencido' || l.declaracoes === 'em_falta') as Filtro,
  exclusaoSimples: ((l) => l.riscoExclusaoSimples) as Filtro,
  sitfisComRelatorio: ((l) => l.sitfis === 'com_pendencias' || l.sitfis === 'sem_pendencias') as Filtro,
  sitfisComPendencia: ((l) => l.sitfis === 'com_pendencias') as Filtro,
  sitfisSemPendencia: ((l) => l.sitfis === 'sem_pendencias') as Filtro,
  certidaoComLeitura: ((l) => l.certidao.situacao !== 'sem_leitura') as Filtro,
  certidaoIrregular: ((l) => l.certidao.situacao === 'irregular' || l.certidao.situacao === 'vencida') as Filtro,
  mensagemNaoLida: ((l) => l.caixa === 'nao_lida' || l.caixa === 'nova') as Filtro,
  dasVencido: ((l) => l.das === 'vencido') as Filtro,
  intimacaoAberta: ((l) => l.mensagens.total > 0) as Filtro,
  procuracaoSemOuVencendo: ((l) => l.procuracao.situacao === 'sem' || l.procuracao.situacao === 'vencida' || l.procuracao.vencendo) as Filtro,
  semProcuracaoCaixa: ((l) => l.caixa !== 'sem_procuracao') as Filtro,
  multaMaed: ((l) => l.multa.maed > 0) as Filtro,
};

export const contar = (linhas: LinhaCarteira[], f: Filtro) => linhas.filter(f).length;

// ---------------------------------------------------------------- responsável
/** Valor do filtro "sem responsável" na URL (`?resp=sem`); qualquer outro valor é o id do responsável. */
export const SEM_RESPONSAVEL = 'sem';

export function filtrarPorResponsavel(linhas: LinhaCarteira[], resp: string | null): LinhaCarteira[] {
  if (!resp) return linhas;
  return linhas.filter((l) => (resp === SEM_RESPONSAVEL ? !l.responsavel : l.responsavel?.id === resp));
}

/** Responsáveis que aparecem na carteira, com quantos clientes cada um tem; os sem responsável vêm à parte. */
export function resumirResponsaveis(linhas: LinhaCarteira[]): { responsaveis: (ResponsavelCliente & { clientes: number })[]; semResponsavel: number } {
  const m = new Map<string, ResponsavelCliente & { clientes: number }>();
  let sem = 0;
  for (const l of linhas) {
    if (!l.responsavel) { sem++; continue; }
    const atual = m.get(l.responsavel.id);
    if (atual) atual.clientes++;
    else m.set(l.responsavel.id, { ...l.responsavel, clientes: 1 });
  }
  return { responsaveis: [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), semResponsavel: sem };
}

// ---------------------------------------------------------------- dados dos gráficos
export interface FatiaGrafico { chave: string; nome: string; valor: number }

export interface GraficosCarteira {
  entregas: FatiaGrafico[];
  porObrigacao: { nome: string; emFalta: number; aConfirmar: number }[];
  porRegime: { nome: string; valor: number }[];
  situacaoFiscal: FatiaGrafico[];
  pendenciasPorRegime: { nome: string; valor: number }[];
  certidoes: FatiaGrafico[];
  evolucao: { competencia: string; emFalta: number }[];
}

const porRegimeContagem = (linhas: LinhaCarteira[], f: Filtro) => {
  const m = new Map<string, number>();
  for (const l of linhas) if (f(l)) m.set(l.regimeRotulo, (m.get(l.regimeRotulo) ?? 0) + 1);
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
};

export function montarGraficos(linhas: LinhaCarteira[], competencia: string, hoje: string): GraficosCarteira {
  const ano = Number(competencia.slice(0, 4));
  const cnt = (f: Filtro) => contar(linhas, f);

  const entregas: FatiaGrafico[] = [
    { chave: 'em_dia', nome: 'Em dia', valor: cnt((l) => l.declaracoes === 'em_dia') },
    { chave: 'em_falta', nome: 'Em falta', valor: cnt((l) => l.declaracoes === 'em_falta') },
    { chave: 'a_confirmar', nome: 'A confirmar', valor: cnt((l) => l.declaracoes === 'a_confirmar') },
    { chave: 'nao_consultado', nome: 'Não consultado', valor: cnt((l) => l.declaracoes === 'nao_consultado') },
  ];

  const clientesCom = (obr: Ausencia['obrigacao'], sit: Ausencia['situacao']) =>
    linhas.filter((l) => l.ausencias.some((a) => a.obrigacao === obr && a.situacao === sit)).length;
  const porObrigacao = (['PGDAS-D', 'DEFIS', 'DCTFWeb', 'MIT'] as const).map((o) => ({
    nome: o, emFalta: clientesCom(o, 'em_falta'), aConfirmar: clientesCom(o, 'a_confirmar'),
  }));

  const situacaoFiscal: FatiaGrafico[] = [
    { chave: 'sem_pendencias', nome: 'Sem pendências', valor: cnt((l) => l.sitfis === 'sem_pendencias') },
    { chave: 'com_pendencias', nome: 'Com pendências', valor: cnt((l) => l.sitfis === 'com_pendencias') },
    { chave: 'a_conferir', nome: 'A conferir', valor: cnt((l) => l.sitfis === 'a_conferir') },
    { chave: 'sem_relatorio', nome: 'Sem relatório', valor: cnt((l) => l.sitfis === 'sem_relatorio') },
  ];

  const certidoes: FatiaGrafico[] = [
    { chave: 'regular', nome: 'Regular', valor: cnt((l) => l.certidao.situacao === 'regular') },
    { chave: 'irregular', nome: 'Irregular', valor: cnt((l) => l.certidao.situacao === 'irregular') },
    { chave: 'vencida', nome: 'Vencida', valor: cnt((l) => l.certidao.situacao === 'vencida') },
    { chave: 'sem_leitura', nome: 'Sem leitura', valor: cnt((l) => l.certidao.situacao === 'sem_leitura') },
  ];

  // Evolução: situação de hoje de cada competência do ano (não é o retrato da época).
  const evolucao: { competencia: string; emFalta: number }[] = [];
  for (const pa of mesesAte(ano, competencia)) {
    if (hoje <= vencimentoDoPeriodo(pa)) continue; // ainda no prazo
    evolucao.push({
      competencia: pa,
      emFalta: linhas.filter((l) => l.ausencias.some((a) => a.obrigacao === 'PGDAS-D' && a.situacao === 'em_falta' && a.competencia === pa)).length,
    });
  }

  return {
    entregas, porObrigacao,
    porRegime: porRegimeContagem(linhas, FILTROS.declaracoesEmFalta),
    situacaoFiscal,
    pendenciasPorRegime: porRegimeContagem(linhas, FILTROS.sitfisComPendencia),
    certidoes, evolucao,
  };
}

/** Quantas pendências abertas o cliente tem (competência em falta, mensagem aberta, DAS vencido, pendência na Situação fiscal). Só serve para desempatar. */
export const itensEmAberto = (l: LinhaCarteira) =>
  l.ausencias.filter((a) => a.situacao === 'em_falta').length + l.mensagens.total + (l.das === 'vencido' ? 1 : 0) + (l.sitfis === 'com_pendencias' ? 1 : 0);

/** Top de clientes em risco: Crítico antes de Atenção; empata por mais pendências abertas e depois pelo nome. Sem nota. */
export function topEmRisco(linhas: LinhaCarteira[], n = 5): LinhaCarteira[] {
  return linhas
    .filter((l) => l.nivel === 'critico' || l.nivel === 'atencao')
    .sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || itensEmAberto(b) - itensEmAberto(a) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, n);
}

// ---------------------------------------------------------------- "Atualizado em" por fonte
export interface FonteAtualizada { rotulo: string; em: string | null }

export function atualizacoes(e: EntradaCarteira): FonteAtualizada[] {
  const maior = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().pop() ?? null;
  return [
    { rotulo: 'PGDAS-D', em: maior(e.pgdas.map((l) => l.consultadoEm)) },
    { rotulo: 'DEFIS', em: maior(e.defis.map((l) => l.consultadoEm)) },
    { rotulo: 'Situação fiscal', em: maior(e.sitfis.map((l) => l.ultimo?.gerado_em)) },
    { rotulo: 'Caixa Postal', em: maior(e.clientes.map((c) => c.indicador_verificado_em)) },
    { rotulo: 'Procurações', em: maior(e.procuracoes.map((l) => l.mapeadoEm)) },
  ];
}

// ---------------------------------------------------------------- CA · Ausências
export const ROTULO_SITUACAO_AUSENCIA: Record<Ausencia['situacao'], string> = {
  em_falta: 'Em falta', a_confirmar: 'A confirmar', a_vencer: 'A vencer', nao_consultado: 'Não consultado',
};
export const ORDEM_SITUACAO_AUSENCIA: Record<Ausencia['situacao'], number> = { em_falta: 0, a_confirmar: 1, nao_consultado: 2, a_vencer: 3 };

/** Competências e obrigações em falta (um cliente com 3 competências sem PGDAS-D soma 3). */
export const totalPendencias = (linhas: LinhaCarteira[]) => linhas.reduce((s, l) => s + l.ausencias.filter((a) => a.situacao === 'em_falta').length, 0);

/** Texto curto de uma ausência: "PGDAS-D 08/2026" ou "DEFIS 2025". */
export const rotuloAusencia = (a: Ausencia) => (a.obrigacao === 'DEFIS' ? `DEFIS ${a.competencia}` : `${a.obrigacao} ${sigla(a.competencia)}`);

/** Linhas da lista de ausências, mais antigas primeiro dentro de cada situação. */
export function listarAusencias(linhas: LinhaCarteira[]): { linha: LinhaCarteira; ausencia: Ausencia }[] {
  return linhas
    .flatMap((linha) => linha.ausencias.map((ausencia) => ({ linha, ausencia })))
    .sort((a, b) =>
      ORDEM_SITUACAO_AUSENCIA[a.ausencia.situacao] - ORDEM_SITUACAO_AUSENCIA[b.ausencia.situacao]
      || (a.ausencia.prazo ?? '9999').localeCompare(b.ausencia.prazo ?? '9999')
      || a.linha.nome.localeCompare(b.linha.nome, 'pt-BR')
      || a.ausencia.obrigacao.localeCompare(b.ausencia.obrigacao));
}

/** Top de urgência: quem tem mais competências em falta primeiro; empata pelo prazo mais antigo e pelo nome. */
export function topEmFalta(linhas: LinhaCarteira[], n = 5): LinhaCarteira[] {
  const faltas = (l: LinhaCarteira) => l.ausencias.filter((a) => a.situacao === 'em_falta');
  const maisAntigo = (l: LinhaCarteira) => faltas(l).map((a) => a.prazo ?? '9999').sort()[0] ?? '9999';
  return linhas
    .filter((l) => faltas(l).length > 0)
    .sort((a, b) => faltas(b).length - faltas(a).length || maisAntigo(a).localeCompare(maisAntigo(b)) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, n);
}

/** Radar CND: o que pode impedir a certidão federal do cliente. Só o que já está salvo; não é a situação oficial da certidão. */
export const IMPACTO_CERTIDAO = 'Pode impedir a certidão federal';
export function pendenciasCertidao(l: LinhaCarteira): string[] {
  const out: string[] = [];
  if (l.sitfis === 'com_pendencias') out.push('Pendência na Situação fiscal');
  if (l.das === 'vencido') out.push(`DAS de ${sigla(l.dasCompetencia)} vencido`);
  if (l.pgdas.emFalta.length) out.push(`PGDAS-D em falta: ${lista(l.pgdas.emFalta)}`);
  if (l.defis.estado === 'em_atraso') out.push(`DEFIS ${l.defis.ano} não entregue`);
  return out;
}
