/**
 * Fila "Para agir hoje" do Portal 360°: uma lista só, do mais urgente ao menos urgente, com o que a equipe pode fazer agora.
 * Função pura sobre as linhas da carteira e o acompanhamento de cada ausência (nada de chamada ao Serpro).
 *
 * Ordem (menor número = mais urgente):
 *   0    mensagem da Receita em aberto (intimação, malha, exclusão do Simples, MAED, cobrança, processo)
 *   0,5  declaração em falta com risco de exclusão do Simples (3 competências ou mais)
 *   0,8  declaração em falta e cliente avisado há 3 dias ou mais sem resposta
 *   1    declaração em falta
 *   2    DAS vencido
 *   4    PGDAS-D ou DEFIS no prazo, perto de vencer (cobrança antes do prazo)
 *   5    procuração vencida ou vencendo
 * Cliente já avisado há menos de 3 dias (ou aguardando cliente) esfria 3 pontos; "em andamento" esfria 2; "transmitida" sai da fila
 * (a pendência some da lista quando a declaração aparecer na próxima leitura da Receita).
 */
import type { Acompanhamento } from '@/hooks/useAcompanhamentoAusencia';
import { podeAvisarAusencia } from '@/lib/mensagensCliente';
import { dataBR, digitos, rotuloAusencia, sigla, type Ausencia, type LinhaCarteira } from '@/lib/situacaoCarteira';

export type TipoFila = 'mensagem_receita' | 'declaracao_em_falta' | 'das_vencido' | 'declaracao_a_vencer' | 'procuracao';

/** Quantos dias antes do prazo a declaração entra na fila (cobrança antes do prazo). */
export const DIAS_ANTES_DO_PRAZO: Record<'PGDAS-D' | 'DEFIS', number> = { 'PGDAS-D': 3, DEFIS: 15 };
/** Dias sem resposta depois de avisar o cliente para o item voltar ao topo. */
export const DIAS_SEM_RESPOSTA = 3;

export interface ItemFila {
  chave: string;
  linha: LinhaCarteira;
  tipo: TipoFila;
  titulo: string;
  detalhe: string;
  /** AAAA-MM-DD, quando o item tem prazo. */
  prazo: string | null;
  urgencia: number;
  /** Ausência por trás do item (permite avisar o cliente e anotar o acompanhamento). */
  ausencia?: Ausencia;
  acompanhamento?: Acompanhamento;
  /** Dias desde o aviso ao cliente, quando passou do limite sem resposta. */
  diasSemResposta?: number;
  /** Tela do assunto (já filtrada no CNPJ). */
  ver: string;
}

const diaBR = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
export const diasEntre = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const TELA: Record<Ausencia['obrigacao'], string> = { 'PGDAS-D': 'pgdas', DEFIS: 'defis', DCTFWeb: 'dctfweb-mit', MIT: 'dctfweb-mit' };
const chaveAcomp = (a: Ausencia) => `${a.contact_id}|${a.obrigacao}|${a.competencia}`;

export function montarFila(linhas: LinhaCarteira[], acompanhamentos: Map<string, Acompanhamento>, hoje: string): ItemFila[] {
  const itens: ItemFila[] = [];

  for (const l of linhas) {
    const q = `?q=${digitos(l.documento)}`;

    if (l.mensagens.total > 0) {
      itens.push({
        chave: `${l.contact_id}|mensagem`, linha: l, tipo: 'mensagem_receita', urgencia: 0, prazo: null, ver: `/dashboard-federal/intimacoes${q}`,
        titulo: 'Mensagem da Receita em aberto',
        detalhe: [plural(l.mensagens.total, 'mensagem', 'mensagens'), l.mensagens.exclusaoSimples ? 'inclui termo de exclusão do Simples' : l.mensagens.intimacoes ? plural(l.mensagens.intimacoes, 'intimação', 'intimações') : ''].filter(Boolean).join(' · '),
      });
    }

    for (const a of l.ausencias) {
      const avisavel = podeAvisarAusencia(a);
      if (!avisavel) continue; // a confirmar e não consultado não viram ação para o cliente
      const dias = a.prazo ? diasEntre(hoje, a.prazo) : null;
      const noPrazoPerto = a.situacao === 'a_vencer' && dias !== null && dias >= 0 && dias <= DIAS_ANTES_DO_PRAZO[a.obrigacao as 'PGDAS-D' | 'DEFIS'];
      if (a.situacao !== 'em_falta' && !noPrazoPerto) continue;

      const acomp = acompanhamentos.get(chaveAcomp(a));
      if (acomp?.situacao === 'transmitida') continue;

      const emFalta = a.situacao === 'em_falta';
      let urgencia = emFalta ? (l.pgdas.emFalta.length >= 3 && a.obrigacao === 'PGDAS-D' ? 0.5 : 1) : 4;
      let diasSemResposta: number | undefined;
      if (acomp && (acomp.situacao === 'cliente_avisado' || acomp.situacao === 'aguardando_cliente')) {
        const desde = diasEntre(diaBR(acomp.atualizado_em), hoje);
        if (desde >= DIAS_SEM_RESPOSTA) { diasSemResposta = desde; urgencia = Math.min(urgencia, 0.8); } else urgencia += 3;
      } else if (acomp?.situacao === 'em_andamento') urgencia += 2;

      const atraso = emFalta && a.prazo ? Math.max(0, diasEntre(a.prazo, hoje)) : 0;
      itens.push({
        chave: `${l.contact_id}|${a.obrigacao}|${a.competencia}`, linha: l, ausencia: a, acompanhamento: acomp, diasSemResposta, ver: `/dashboard-federal/${TELA[a.obrigacao]}${q}`,
        tipo: emFalta ? 'declaracao_em_falta' : 'declaracao_a_vencer', urgencia, prazo: a.prazo,
        titulo: emFalta ? `${rotuloAusencia(a)} em falta` : `${rotuloAusencia(a)}: ${dias === 0 ? 'prazo é hoje' : `prazo em ${plural(dias ?? 0, 'dia', 'dias')}`}`,
        detalhe: emFalta ? `Prazo era ${dataBR(a.prazo)}${atraso ? ` · ${plural(atraso, 'dia', 'dias')} de atraso` : ''}` : `Prazo em ${dataBR(a.prazo)} · ainda sem declaração na última leitura`,
      });
    }

    if (l.das === 'vencido') {
      itens.push({
        chave: `${l.contact_id}|das`, linha: l, tipo: 'das_vencido', urgencia: 2, prazo: null, ver: `/dashboard-federal/pagamentos${q}`,
        titulo: `DAS ${sigla(l.dasCompetencia)} vencido`, detalhe: 'Sem pagamento registrado na Receita',
      });
    }

    const p = l.procuracao;
    if (p.situacao === 'vencida' || (p.vencendo && p.diasParaVencer !== null)) {
      itens.push({
        chave: `${l.contact_id}|procuracao`, linha: l, tipo: 'procuracao', urgencia: 5, prazo: null, ver: `/dashboard-federal/procuracoes${q}`,
        titulo: p.situacao === 'vencida' ? 'Procuração vencida' : `Procuração vence em ${plural(p.diasParaVencer ?? 0, 'dia', 'dias')}`,
        detalhe: 'Sem procuração a Receita não deixa consultar nem emitir pelo sistema',
      });
    }
  }

  return itens.sort((a, b) =>
    a.urgencia - b.urgencia || (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || a.linha.nome.localeCompare(b.linha.nome, 'pt-BR') || a.chave.localeCompare(b.chave));
}
