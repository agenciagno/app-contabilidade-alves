/**
 * CA · Diagnósticos e CA · Indicadores (Gestão 360°, rodada 4): funções puras sobre o que já está salvo. Nada chama o Serpro.
 * Regra de ouro: cada número mora em um lugar. Aqui não se repete o que o Portal 360° mostra como ação; aqui é a visão da carteira (Diagnósticos)
 * e da operação (Indicadores). Item sem dado fica "sem dado": nunca vira zero nem regular.
 */
import type { MensagemComCliente } from '@/hooks/useSerproCaixaPostal';
import { fatorRCalculado, limiteDe, baseLimite, type FaturamentoRow } from '@/hooks/useSerproFaturamento';
import type { LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import { vencimentoDoPeriodo } from '@/lib/prazosFederais';
import { calcularScore, type Score } from '@/lib/relatoriosCliente';
import { ORDEM_NIVEL, type LinhaCarteira } from '@/lib/situacaoCarteira';

export interface ItemContagem { nome: string; valor: number }
export interface FatiaScore { chave: string; nome: string; valor: number }

/** Dados do cadastro que o Perfil usa (só o que serve para a contagem; e-mail e telefone viram sim ou não). */
export interface PerfilContato {
  contact_id: string;
  porte: string | null;
  cidade: string | null;
  uf: string | null;
  inicioContrato: string | null;
  cnae: { codigo: string; descricao: string } | null;
  temEmail: boolean;
  temWhatsapp: boolean;
}

const contar = (nomes: string[]): ItemContagem[] => {
  const m = new Map<string, number>();
  for (const n of nomes) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
};

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "JUATUBA" e "juatuba " viram "Juatuba"; fora de MG leva a sigla ("Belo Horizonte" é MG, "Pouso Alegre/SP"). */
export function normalizarCidade(cidade: string | null, uf: string | null): string {
  const c = (cidade ?? '').trim().replace(/\s+/g, ' ');
  if (!c) return 'Sem cidade';
  const nome = c.toLowerCase().split(' ').map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
  const sigla = (uf ?? '').trim().toUpperCase();
  return sigla && sigla !== 'MG' ? `${nome}/${sigla}` : nome;
}

export function faixaTempoDeCasa(inicio: string | null, hoje: string): string {
  if (!inicio) return 'Sem data de início';
  const anos = (Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)) - Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10))) / (365.25 * 86_400_000);
  if (anos < 0) return 'Sem data de início';
  if (anos < 1) return 'Menos de 1 ano';
  if (anos < 3) return '1 a 3 anos';
  if (anos < 5) return '3 a 5 anos';
  return '5 anos ou mais';
}
const ORDEM_TEMPO = ['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', '5 anos ou mais', 'Sem data de início'];

export interface PerfilCarteira {
  total: number;
  regime: ItemContagem[];
  porte: ItemContagem[];
  cidades: ItemContagem[];
  tempoDeCasa: ItemContagem[];
  atividades: { codigo: string; descricao: string; valor: number }[];
  contato: { ambos: number; soEmail: number; soWhatsapp: number; nenhum: number };
}

export function perfilCarteira(linhas: LinhaCarteira[], perfis: Map<string, PerfilContato>, hoje: string): PerfilCarteira {
  const p = (l: LinhaCarteira) => perfis.get(l.contact_id);
  const cidades = contar(linhas.map((l) => normalizarCidade(p(l)?.cidade ?? null, p(l)?.uf ?? null)));
  const top = cidades.slice(0, 8);
  const resto = cidades.slice(8);
  const atividades = new Map<string, { codigo: string; descricao: string; valor: number }>();
  for (const l of linhas) {
    const c = p(l)?.cnae;
    if (!c?.codigo) continue;
    const a = atividades.get(c.codigo) ?? { codigo: c.codigo, descricao: c.descricao, valor: 0 };
    a.valor++;
    atividades.set(c.codigo, a);
  }
  const tempo = contar(linhas.map((l) => faixaTempoDeCasa(p(l)?.inicioContrato ?? null, hoje))).sort((a, b) => ORDEM_TEMPO.indexOf(a.nome) - ORDEM_TEMPO.indexOf(b.nome));
  const contato = { ambos: 0, soEmail: 0, soWhatsapp: 0, nenhum: 0 };
  for (const l of linhas) {
    const x = p(l);
    if (x?.temEmail && x.temWhatsapp) contato.ambos++; else if (x?.temEmail) contato.soEmail++; else if (x?.temWhatsapp) contato.soWhatsapp++; else contato.nenhum++;
  }
  return {
    total: linhas.length,
    regime: contar(linhas.map((l) => l.regimeRotulo)),
    porte: contar(linhas.map((l) => p(l)?.porte?.trim() || 'Sem porte')),
    cidades: resto.length ? [...top, { nome: `Outras (${resto.length} cidades)`, valor: resto.reduce((s, c) => s + c.valor, 0) }] : top,
    tempoDeCasa: tempo,
    atividades: [...atividades.values()].sort((a, b) => b.valor - a.valor || a.codigo.localeCompare(b.codigo)).slice(0, 8),
    contato,
  };
}

// ---------------------------------------------------------------- saúde (score por cliente)
export interface ItemSaude { linha: LinhaCarteira; score: Score }

export function saudeCarteira(linhas: LinhaCarteira[]): { itens: ItemSaude[]; faixas: FatiaScore[] } {
  const itens = linhas.map((linha) => ({ linha, score: calcularScore(linha) }))
    .sort((a, b) => ORDEM_NIVEL[a.linha.nivel] - ORDEM_NIVEL[b.linha.nivel]
      || (a.score.percentual ?? 101) - (b.score.percentual ?? 101) || b.score.pendentes - a.score.pendentes || a.linha.nome.localeCompare(b.linha.nome, 'pt-BR'));
  const n = (f: (s: Score) => boolean) => itens.filter((i) => f(i.score)).length;
  return {
    itens,
    faixas: [
      { chave: 'alta', nome: 'Score 80% ou mais', valor: n((s) => s.percentual !== null && s.percentual >= 80) },
      { chave: 'media', nome: 'Score de 50% a 79%', valor: n((s) => s.percentual !== null && s.percentual >= 50 && s.percentual < 80) },
      { chave: 'baixa', nome: 'Score abaixo de 50%', valor: n((s) => s.percentual !== null && s.percentual < 50) },
      { chave: 'sem', nome: 'Sem item verificado', valor: n((s) => s.percentual === null) },
    ],
  };
}

// ---------------------------------------------------------------- oportunidades (limite, sublimite, Fator R)
/** Leitura de faturamento mais recente e confiável de cada cliente. */
export function ultimasLeituras(rows: FaturamentoRow[]): Map<string, FaturamentoRow> {
  const m = new Map<string, FaturamentoRow>();
  for (const r of rows) {
    if (!r.confiavel || !r.dados) continue;
    const a = m.get(r.contact_id);
    if (!a || r.periodo_apuracao > a.periodo_apuracao || (r.periodo_apuracao === a.periodo_apuracao && r.lido_em > a.lido_em)) m.set(r.contact_id, r);
  }
  return m;
}

export interface OportunidadeLimite {
  linha: LinhaCarteira;
  percentual: number;
  base: string;
  limite: number;
  margem: number;
  /** Folga ÷ média mensal dos últimos 12 meses: quantos meses de faturamento cabem até o limite. Null sem média. */
  mesesDeFolga: number | null;
  nivel: NonNullable<LinhaCarteira['limite']['nivel']> | null;
  sublimite: LinhaCarteira['limite']['sublimite'];
  competencia: string;
}
export interface OportunidadeFatorR { linha: LinhaCarteira; texto: string; calculado: number | null; competencia: string }

export function oportunidades(linhas: LinhaCarteira[], rows: FaturamentoRow[]) {
  const ultimas = ultimasLeituras(rows);
  const simples = linhas.filter((l) => l.regime === 'simples_nacional');
  const limite: OportunidadeLimite[] = [];
  const fatorR: OportunidadeFatorR[] = [];
  for (const l of simples) {
    const f = ultimas.get(l.contact_id);
    if (!f) continue;
    const perto = l.limite.nivel === 'atencao' || l.limite.nivel === 'critico' || l.limite.nivel === 'acima' || l.limite.sublimite === 'perto' || l.limite.sublimite === 'acima';
    const base = baseLimite(f);
    if (perto && base && l.limite.percentual !== null) {
      const lim = limiteDe(f);
      const media = f.rbt12_total && f.rbt12_total > 0 ? f.rbt12_total / 12 : null;
      limite.push({
        linha: l, percentual: l.limite.percentual, base: base.rotulo, limite: lim, margem: lim - base.valor, nivel: l.limite.nivel, sublimite: l.limite.sublimite,
        mesesDeFolga: media ? Math.round(((lim - base.valor) / media) * 10) / 10 : null, competencia: f.periodo_apuracao.slice(0, 7),
      });
    }
    if (f.fator_r_aplica) fatorR.push({ linha: l, texto: f.fator_r_texto ?? 'Aplica', calculado: f.dados && f.dados.folha.length > 0 ? fatorRCalculado(f) : null, competencia: f.periodo_apuracao.slice(0, 7) });
  }
  limite.sort((a, b) => b.percentual - a.percentual || a.linha.nome.localeCompare(b.linha.nome, 'pt-BR'));
  fatorR.sort((a, b) => a.linha.nome.localeCompare(b.linha.nome, 'pt-BR'));
  return { limite, fatorR, cobertura: { simples: simples.length, lidos: simples.filter((l) => ultimas.has(l.contact_id)).length } };
}

// ---------------------------------------------------------------- indicadores
export interface EntregaMes { competencia: string; total: number; noPrazo: number; atrasadas: number; percentual: number | null }

const diaBR = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * PGDAS-D transmitido no prazo, por competência: entre as declarações originais já transmitidas, quantas saíram até o vencimento.
 * Só entram competências com prazo já vencido. Quem ainda não transmitiu não entra aqui (isso é "em falta", em CA · Ausências).
 */
export function entregasNoPrazo(matriz: LinhaPgdasd[], ano: number, hoje: string): EntregaMes[] {
  const out: EntregaMes[] = [];
  for (let m = 1; m <= 12; m++) {
    const pa = `${ano}-${String(m).padStart(2, '0')}`;
    const prazo = vencimentoDoPeriodo(pa);
    if (hoje <= prazo) break;
    let total = 0, noPrazo = 0;
    for (const l of matriz) {
      for (const d of l.declaracoes) {
        if (d.tipo !== 'original' || !d.transmitida_em || d.periodo_apuracao.slice(0, 7) !== pa) continue;
        total++;
        if (diaBR(d.transmitida_em) <= prazo) noPrazo++;
      }
    }
    out.push({ competencia: pa, total, noPrazo, atrasadas: total - noPrazo, percentual: total > 0 ? Math.round((noPrazo / total) * 100) : null });
  }
  return out;
}

export interface CargaResponsavel { nome: string; clientes: number; declaracoesEmFalta: number; comMensagemAberta: number; dasVencidos: number }

export function cargaResponsavel(linhas: LinhaCarteira[]): CargaResponsavel[] {
  const m = new Map<string, CargaResponsavel>();
  for (const l of linhas) {
    const nome = l.responsavel?.nome ?? 'Sem responsável';
    const c = m.get(nome) ?? { nome, clientes: 0, declaracoesEmFalta: 0, comMensagemAberta: 0, dasVencidos: 0 };
    c.clientes++;
    if (l.declaracoes === 'em_falta') c.declaracoesEmFalta++;
    if (l.mensagens.total > 0) c.comMensagemAberta++;
    if (l.das === 'vencido') c.dasVencidos++;
    m.set(nome, c);
  }
  return [...m.values()].sort((a, b) => b.clientes - a.clientes || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface IdadeMensagens { faixas: ItemContagem[]; total: number; novas: number; emTratamento: number }

/** Mensagens críticas da Receita em aberto, por tempo desde o envio. Só clientes ativos. */
export function mensagensParadas(msgs: MensagemComCliente[], hoje: string): IdadeMensagens {
  const abertas = msgs.filter((m) => (m.situacao === 'nova' || m.situacao === 'em_tratamento') && m.contacts?.status_cliente === 'Ativo' && m.data_envio);
  const dias = (m: MensagemComCliente) => Math.round((Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)) - Date.UTC(+diaBR(m.data_envio!).slice(0, 4), +diaBR(m.data_envio!).slice(5, 7) - 1, +diaBR(m.data_envio!).slice(8, 10))) / 86_400_000);
  const faixa = (d: number) => (d <= 3 ? 'Até 3 dias' : d <= 7 ? '4 a 7 dias' : d <= 30 ? '8 a 30 dias' : 'Mais de 30 dias');
  const ordem = ['Até 3 dias', '4 a 7 dias', '8 a 30 dias', 'Mais de 30 dias'];
  const faixas = ordem.map((nome) => ({ nome, valor: abertas.filter((m) => faixa(dias(m)) === nome).length }));
  return { faixas, total: abertas.length, novas: abertas.filter((m) => m.situacao === 'nova').length, emTratamento: abertas.filter((m) => m.situacao === 'em_tratamento').length };
}

export interface ItemCobertura { rotulo: string; n: number; total: number; percentual: number | null; dica: string }

/** Quanto da carteira tem dado para o monitoramento funcionar. Baixa cobertura = número parcial nas outras telas. */
export function coberturaDados(linhas: LinhaCarteira[], perfis: Map<string, PerfilContato>, rows: FaturamentoRow[]): ItemCobertura[] {
  const simples = linhas.filter((l) => l.regime === 'simples_nacional');
  const ultimas = ultimasLeituras(rows);
  const item = (rotulo: string, n: number, total: number, dica: string): ItemCobertura => ({ rotulo, n, total, percentual: total > 0 ? Math.round((n / total) * 100) : null, dica });
  return [
    item('Procuração eletrônica ativa', linhas.filter((l) => l.procuracao.situacao === 'total' || l.procuracao.situacao === 'parcial').length, linhas.length, 'Sem procuração a Receita não deixa consultar'),
    item('PGDAS-D consultado no ano', simples.filter((l) => l.pgdas.estado !== 'nao_consultado' && l.pgdas.estado !== 'nao_se_aplica').length, simples.length, 'Clientes do Simples'),
    item('Relatório de situação fiscal', linhas.filter((l) => l.sitfis !== 'sem_relatorio').length, linhas.length, 'Rodada mensal no dia 30'),
    item('Faturamento lido', simples.filter((l) => ultimas.has(l.contact_id)).length, simples.length, 'Clientes do Simples; leitura mensal no dia 30'),
    item('Certidão federal lida', linhas.filter((l) => l.certidao.situacao !== 'sem_leitura').length, linhas.length, 'Vem do relatório de situação fiscal'),
    item('E-mail ou WhatsApp cadastrado', linhas.filter((l) => perfis.get(l.contact_id)?.temEmail || perfis.get(l.contact_id)?.temWhatsapp).length, linhas.length, 'Sem contato não dá para avisar o cliente'),
    item('Responsável definido', linhas.filter((l) => l.responsavel).length, linhas.length, 'Alertas e filtros dependem disso'),
  ];
}
