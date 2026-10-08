/**
 * Tela Simples Nacional (Rodada 2, 08/10/2026): UMA linha por cliente com declaração, DAS e limite da competência.
 * Junta o que antes ficava em PGDAS, Pagamentos e DAS e Faturamento. Função pura, sem chamada ao Serpro.
 *
 * Situação da linha = pior entre a declaração (mês + atraso antigo no ano) e o DAS. O limite aparece na coluna, mas não entra na
 * situação: sem leitura do faturamento é falta de leitura nossa, não obrigação do cliente.
 * Filiais ficam de fora (PGDAS-D e DAS são da matriz), e também a empresa aberta depois da competência.
 */
import { declaracaoVigente, type DeclaracaoRow, type LinhaPgdasd } from '@/hooks/useSerproPgdasd';
import { dasUnificado, type DasUnificado } from '@/hooks/useSerproDasUnificado';
import type { LinhaPagamentos } from '@/hooks/useSerproPagamentos';
import type { FaturamentoRow } from '@/hooks/useSerproFaturamento';
import { ultimaLeituraAte, type ResponsavelCliente } from '@/lib/situacaoCarteira';
import {
  outrosMotivos, piorSelo, seloDas, seloLeituraLimite, seloPgdasAtrasoAno, seloPgdasLinha, seloPgdasMes,
  type Selo,
} from '@/lib/monitorEstados';

export interface LinhaSimples {
  contact_id: string;
  nome: string;
  documento: string;
  pg: LinhaPgdasd;
  responsavel: ResponsavelCliente | null;
  /** Declaração do mês sozinha (coluna Declaração). */
  declMes: Selo | null;
  /** Mês + competências anteriores em falta no ano (o que o painel conta e o filtro "declaração" usa). */
  declaracao: Selo | null;
  declaracaoRow: DeclaracaoRow | null;
  das: DasUnificado;
  dasSelo: Selo | null;
  /** Leitura confiável mais recente até a competência (o limite é do acumulado, não de um mês). */
  fat: FaturamentoRow | null;
  limite: Selo | null;
  situacao: Selo | null;
  outros: string[];
  /** Consulta mais recente entre o PGDAS-D do ano e os pagamentos do mês. */
  ultimaBusca: string | null;
}

export type FonteSimples = 'situacao' | 'declaracao' | 'das' | 'limite';

export function seloDaFonte(l: LinhaSimples, fonte: FonteSimples): Selo | null {
  switch (fonte) {
    case 'declaracao': return l.declaracao;
    case 'das': return l.dasSelo;
    case 'limite': return l.limite;
    default: return l.situacao;
  }
}

export function montarLinhasSimples(e: {
  pgdas: LinhaPgdasd[];
  pagamentos: LinhaPagamentos[];
  faturamento: FaturamentoRow[];
  responsaveis: Map<string, ResponsavelCliente>;
  aberturas: Map<string, string | null>;
  pa: string;
  hoje: string;
}): LinhaSimples[] {
  const pagPor = new Map(e.pagamentos.map((p) => [p.contact_id, p]));
  // Empresa aberta depois da competência ainda não existia naquele mês: fica fora da lista (e da conta).
  const abertaAte = (id: string) => { const a = e.aberturas.get(id); return !a || a.slice(0, 7) <= e.pa; };
  return e.pgdas.filter((l) => !l.filial && abertaAte(l.contact_id)).map((l): LinhaSimples => {
    const abertura = e.aberturas.get(l.contact_id) ?? null;
    const pag = pagPor.get(l.contact_id);
    const das = dasUnificado(l, pag?.docs ?? [], e.pa, e.hoje);
    const declMes = seloPgdasMes(l, e.pa, e.hoje, abertura);
    const declaracao = seloPgdasLinha(l, e.pa, e.hoje, abertura);
    const declaracaoRow = declaracaoVigente(l, e.pa);
    // O DAS sai da declaração: sem declaração no mês, "sem DAS" é o esperado e não vira outro aviso (a declaração já avisa).
    const dasSelo = !declaracaoRow && das.estado === 'sem_das' ? null : seloDas(das);
    const fat = ultimaLeituraAte(e.faturamento, l.contact_id, e.pa);
    const conta = [seloPgdasAtrasoAno(l, e.pa, e.hoje, abertura), declMes, dasSelo];
    const situacao = piorSelo(conta);
    const consultas = [l.consultadoEm, pag?.consultadoEm].filter((x): x is string => !!x).sort();
    return {
      contact_id: l.contact_id, nome: l.nome, documento: l.documento, pg: l,
      responsavel: e.responsaveis.get(l.contact_id) ?? null,
      declMes, declaracao, declaracaoRow,
      das, dasSelo,
      fat, limite: seloLeituraLimite(fat),
      situacao, outros: outrosMotivos(conta, situacao),
      ultimaBusca: consultas.pop() ?? null,
    };
  });
}
