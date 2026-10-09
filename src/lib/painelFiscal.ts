/**
 * Números dos boxes do Dashboard Fiscal (09/10/2026): Declarações, Ausências de Declarações, Mensagens e-CAC e Limite do Simples.
 * Funções puras, calculadas só com o que já está salvo (sem chamada ao Serpro). Usam as mesmas linhas das telas
 * (`LinhaCarteira` do Portal 360° e `LinhaSimples` da tela Simples Nacional), então o número do box é o número da lista.
 */
import { contarEstados, seloDefis, seloParcelamento, piorSelo, type ContagemEstados, type EstadoMonitor, type Selo } from '@/lib/monitorEstados';
import {
  competenciaAtual, estadoParcelamento, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes, somaValor, type LinhaParcelamentos,
} from '@/hooks/useSerproParcelamentos';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';
import type { LinhaSimples } from '@/lib/simplesNacionalLinhas';
import { nivelLimite, percentualLimite, limiteDe, type NivelLimite } from '@/hooks/useSerproFaturamento';
import { vencimentoDoPeriodo } from '@/lib/prazosFederais';

// ---------------------------------------------------------------- Declarações (x de y feitas)
export interface BarraDeclaracao {
  chave: 'pgdas' | 'defis' | 'dctfweb' | 'mit';
  titulo: string;
  /** Declaradas entre os clientes já consultados. */
  feitas: number;
  /** Clientes consultados a que a declaração se aplica. */
  total: number;
  naoConsultados: number;
  /** Pior estado entre os consultados: define o ícone da barra (vermelho só quando a Receita confirma a falta). */
  pior: EstadoMonitor;
  nota?: string;
  /** Linha curta embaixo da barra (ex.: "Prazo de 09/2026: 20/10"). */
  prazo?: string;
}

const piorDe = (selos: (Selo | null)[]): EstadoMonitor => piorSelo(selos)?.estado ?? 'nao_verificado';

/**
 * PGDAS-D vem da lista do Simples Nacional (mês da competência); DEFIS, DCTFWeb e MIT vêm da carteira.
 * DCTFWeb e MIT só existem para Presumido e Real; "sem DCTFWeb" nunca passa de pendência (não prova atraso).
 * O ícone do PGDAS-D olha só o mês da competência (09/10/2026): o atraso de meses anteriores já aparece em Ausências e
 * na barra do Por Processo, e aqui deixava a barra vermelha com "0 / 145" mesmo com o mês ainda no prazo.
 */
export function barrasDeclaracoes(carteira: LinhaCarteira[], simples: LinhaSimples[], pa?: string): BarraDeclaracao[] {
  const consultadosPg = simples.filter((l) => !!l.pg.consultadoEm);
  const venc = pa ? vencimentoDoPeriodo(pa) : null;
  const pgdas: BarraDeclaracao = {
    chave: 'pgdas', titulo: 'PGDAS-D',
    feitas: consultadosPg.filter((l) => !!l.declaracaoRow).length, total: consultadosPg.length,
    naoConsultados: simples.length - consultadosPg.length,
    pior: piorDe(consultadosPg.map((l) => l.declMes)),
    prazo: pa && venc ? `Prazo de ${pa.slice(5, 7)}/${pa.slice(0, 4)}: ${venc.slice(8, 10)}/${venc.slice(5, 7)}` : undefined,
  };

  const defisAplica = carteira.filter((l) => l.defis.estado !== 'nao_se_aplica' && l.defis.estado !== 'filial');
  const defisConsultados = defisAplica.filter((l) => l.defis.estado !== 'nao_consultado');
  const defis: BarraDeclaracao = {
    chave: 'defis', titulo: 'DEFIS',
    feitas: defisConsultados.filter((l) => l.defis.estado === 'entregue' || l.defis.estado === 'retificada').length, total: defisConsultados.length,
    naoConsultados: defisAplica.length - defisConsultados.length,
    pior: piorDe(defisConsultados.map((l) => seloDefis(l.defis.estado, l.defis.ano))),
  };

  const dctfAplica = carteira.filter((l) => l.dctfweb !== 'nao_se_aplica' && l.dctfweb !== 'filial');
  const dctfConsultados = dctfAplica.filter((l) => l.dctfweb !== 'nao_consultado');
  const dctfweb: BarraDeclaracao = {
    chave: 'dctfweb', titulo: 'DCTFWeb',
    feitas: dctfConsultados.filter((l) => l.dctfweb === 'transmitida').length, total: dctfConsultados.length,
    naoConsultados: dctfAplica.length - dctfConsultados.length,
    pior: dctfConsultados.some((l) => l.dctfweb === 'sem_declaracao') ? 'pendencia' : dctfConsultados.length ? 'em_dia' : 'nao_verificado',
    nota: 'Presumido e Real. Sem DCTFWeb não prova atraso: só existe para quem tem movimento.',
  };

  const mitAplica = carteira.filter((l) => l.mit !== 'nao_se_aplica' && l.mit !== 'filial');
  const mitConsultados = mitAplica.filter((l) => l.mit !== 'nao_consultado');
  const mit: BarraDeclaracao = {
    chave: 'mit', titulo: 'MIT',
    feitas: mitConsultados.filter((l) => l.mit === 'encerrada').length, total: mitConsultados.length,
    naoConsultados: mitAplica.length - mitConsultados.length,
    pior: mitConsultados.some((l) => l.mit !== 'encerrada') ? 'pendencia' : mitConsultados.length ? 'em_dia' : 'nao_verificado',
    nota: 'Presumido e Real.',
  };
  return [pgdas, defis, dctfweb, mit];
}

// ---------------------------------------------------------------- Ausências de Declarações
export interface CartaoAusencia {
  /** Falta confirmada (Simples) ou a confirmar (DCTFWeb e MIT). */
  faltam: number;
  emDia: number;
  /** Sem consulta ou só "consultar de novo": não conta como em dia nem como falta. */
  aVerificar: number;
}

/** Simples: PGDAS-D e DEFIS (a Receita confirma a falta). */
export function ausenciasSimples(carteira: LinhaCarteira[]): CartaoAusencia {
  const base = carteira.filter((l) => l.declaracoes !== 'nao_se_aplica');
  return {
    faltam: base.filter((l) => l.declaracoes === 'em_falta').length,
    emDia: base.filter((l) => l.declaracoes === 'em_dia').length,
    aVerificar: base.filter((l) => l.declaracoes === 'a_confirmar' || l.declaracoes === 'nao_consultado').length,
  };
}

/** Presumido e Real: DCTFWeb e MIT. "Sem declaração" fica como a confirmar, nunca como falta. */
export function ausenciasDctfwebMit(carteira: LinhaCarteira[]): CartaoAusencia {
  const aplica = (e: string) => e !== 'nao_se_aplica' && e !== 'filial';
  const base = carteira.filter((l) => aplica(l.dctfweb) || aplica(l.mit));
  let faltam = 0, emDia = 0, aVerificar = 0;
  for (const l of base) {
    const pend = l.dctfweb === 'sem_declaracao' || l.mit === 'sem_apuracao' || l.mit === 'outra_situacao';
    const semLeitura = l.dctfweb === 'nao_consultado' || l.mit === 'nao_consultado';
    if (pend) faltam++;
    else if (semLeitura) aVerificar++;
    else emDia++;
  }
  return { faltam, emDia, aVerificar };
}

// ---------------------------------------------------------------- Mensagens e-CAC
export interface ResumoMensagens {
  /** Cada cliente cai em um só (na ordem): exclusão, importante, em dia, a verificar. */
  exclusao: number;
  importante: number;
  emDia: number;
  aVerificar: number;
  total: number;
  /** Clientes com mensagem aberta de cada categoria (um cliente pode ter mais de uma). */
  porCategoria: { chave: string; rotulo: string; clientes: number }[];
}

const CATEGORIAS_DO_BOX: { chave: string; rotulo: string }[] = [
  { chave: 'intimacao', rotulo: 'Intimação / Termo' },
  { chave: 'malha', rotulo: 'Malha / Inconsistência' },
  { chave: 'maed', rotulo: 'Multa por atraso (MAED)' },
  { chave: 'cobranca', rotulo: 'Cobrança / Débito' },
  { chave: 'processo', rotulo: 'Processo' },
];

export function resumoMensagens(carteira: LinhaCarteira[]): ResumoMensagens {
  const r: ResumoMensagens = { exclusao: 0, importante: 0, emDia: 0, aVerificar: 0, total: carteira.length, porCategoria: [] };
  for (const l of carteira) {
    const naoLida = l.caixa === 'nao_lida' || l.caixa === 'nova';
    if (l.mensagens.exclusaoSimples > 0) r.exclusao++;
    else if (l.mensagens.total > 0 || naoLida) r.importante++;
    else if (l.caixa === 'todas_lidas') r.emDia++;
    else r.aVerificar++;
  }
  r.porCategoria = CATEGORIAS_DO_BOX.map((c) => ({
    ...c, clientes: carteira.filter((l) => (l.mensagens.danger[c.chave] ?? 0) + (l.mensagens.atencao[c.chave] ?? 0) > 0).length,
  }));
  return r;
}

// ---------------------------------------------------------------- Limite do Simples
export type TipoLimite = 'rbt12' | 'rba';

export interface ItemLimite {
  contact_id: string;
  nome: string;
  valor: number;
  /** Percentual do limite do Simples (o maior entre RBA e RBT12, como o resto do sistema). */
  percentual: number | null;
  nivel: NivelLimite | null;
  limite: number;
  estado: EstadoMonitor;
  motivo: string;
}

/** Os 10 maiores por RBT12 (12 meses) ou RBA (no ano), só com leitura confiável. `cobertura` diz quantos do Simples têm leitura. */
export function maioresLimites(simples: LinhaSimples[], tipo: TipoLimite, quantos = 10): { itens: ItemLimite[]; lidos: number; total: number } {
  const lidos = simples.filter((l) => l.fat?.confiavel);
  const itens = lidos
    .map((l): ItemLimite | null => {
      const f = l.fat!;
      const valor = tipo === 'rbt12' ? f.rbt12_total : f.rba_total;
      if (valor === null || valor === undefined) return null;
      return {
        contact_id: l.contact_id, nome: l.nome, valor, percentual: percentualLimite(f), nivel: nivelLimite(f), limite: limiteDe(f),
        estado: l.limite?.estado ?? 'nao_verificado', motivo: l.limite?.motivo ?? '',
      };
    })
    .filter((x): x is ItemLimite => !!x)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, quantos);
  return { itens, lidos: lidos.length, total: simples.length };
}

// ---------------------------------------------------------------- Parcelamentos (09/10/2026)
export interface ResumoParcelamentos {
  /** Clientes por selo (o mesmo da tela Parcelamentos, então o número do box é o número da lista). */
  contagem: ContagemEstados;
  comAtivo: number;
  valorAtrasado: number;
  valorDoMes: number;
  naoConsultados: number;
}

export function resumoParcelamentos(linhas: LinhaParcelamentos[], atual = competenciaAtual()): ResumoParcelamentos {
  const matrizes = linhas.filter((l) => !l.filial);
  const selos = matrizes.map((l) => seloParcelamento(estadoParcelamento(l, atual), parcelasAtrasadas(l, atual).length, parcelasDoMes(l, atual).length));
  return {
    contagem: contarEstados(selos),
    comAtivo: matrizes.filter((l) => modalidadesAtivas(l).length > 0).length,
    valorAtrasado: matrizes.reduce((s, l) => s + somaValor(parcelasAtrasadas(l, atual)), 0),
    valorDoMes: matrizes.reduce((s, l) => s + somaValor(parcelasDoMes(l, atual)), 0),
    naoConsultados: matrizes.filter((l) => !l.consultas.length).length,
  };
}
