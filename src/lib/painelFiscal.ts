/**
 * Números dos boxes do Dashboard Fiscal (09/10/2026): Mensagens e-CAC, Parcelamentos e Limite do Simples.
 * Funções puras, calculadas só com o que já está salvo (sem chamada ao Serpro). Usam as mesmas linhas das telas
 * (`LinhaCarteira` do Portal 360° e `LinhaSimples` da tela Simples Nacional), então o número do box é o número da lista.
 */
import { contarEstados, seloParcelamento, type ContagemEstados, type EstadoMonitor } from '@/lib/monitorEstados';
import {
  competenciaAtual, estadoParcelamento, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes, somaValor, type LinhaParcelamentos,
} from '@/hooks/useSerproParcelamentos';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';
import type { LinhaSimples } from '@/lib/simplesNacionalLinhas';
import { nivelLimite, percentualLimite, limiteDe, type NivelLimite } from '@/hooks/useSerproFaturamento';

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
