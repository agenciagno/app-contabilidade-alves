/**
 * Cross-check Receita × tarefas do Gestor Fiscal. Compara o que o Serpro mostra com o que a equipe baixou no sistema.
 * Função pura sobre o que já está salvo: não chama o Serpro e não altera nenhuma tarefa (só aponta a divergência).
 *
 * Obrigação da tarefa → fonte na Receita:  "DAS - Simples Nacional" → PGDAS-D · "MIT" → MIT · "DCTF" → DCTFWeb.
 * DCTFWeb e MIT só são comparadas na competência que a matriz carrega; sem DCTFWeb ou sem MIT a divergência fica "a confirmar".
 */
import { rotuloRegime, digitos, type LinhaCarteira } from '@/lib/situacaoCarteira';

export const OBRIGACOES_CRUZADAS = ['DAS - Simples Nacional', 'MIT', 'DCTF'] as const;
export type ObrigacaoCruzada = (typeof OBRIGACOES_CRUZADAS)[number];
const FONTE: Record<ObrigacaoCruzada, string> = { 'DAS - Simples Nacional': 'PGDAS-D', MIT: 'MIT', DCTF: 'DCTFWeb' };

export interface TarefaCruzamento {
  id: string;
  contact_id: string | null;
  obrigacao: string;
  competence_year: number;
  competence_month: number;
  status: string;
  due_date: string | null;
}

export interface ContatoCruzamento {
  id: string;
  nome: string;
  documento: string | null;
  regime: string | null;
  status_cliente: string | null;
}

export type TipoCruzamento = 'baixa_sem_declaracao' | 'pode_baixar' | 'a_confirmar' | 'fora_do_monitoramento';

export const TIPOS_CRUZAMENTO: Record<TipoCruzamento, { titulo: string; tom: 'danger' | 'info' | 'warn' | 'neutral'; ajuda: string }> = {
  baixa_sem_declaracao: { titulo: 'Baixada sem declaração', tom: 'danger', ajuda: 'A tarefa está concluída, mas a Receita não mostra a declaração.' },
  pode_baixar: { titulo: 'Pode concluir a tarefa', tom: 'info', ajuda: 'A Receita já mostra a declaração e a tarefa segue aberta.' },
  a_confirmar: { titulo: 'A confirmar', tom: 'warn', ajuda: 'A tarefa está concluída, mas a Receita não mostra a DCTFWeb ou a MIT (sem movimento também aparece assim).' },
  fora_do_monitoramento: { titulo: 'Fora do monitoramento', tom: 'neutral', ajuda: 'Tarefa aberta e vencida de cliente que o Serpro não acompanha: cadastro incompleto, saiu da carteira, filial ou outro regime.' },
};
export const ORDEM_CRUZAMENTO: Record<TipoCruzamento, number> = { baixa_sem_declaracao: 0, pode_baixar: 1, a_confirmar: 2, fora_do_monitoramento: 3 };

export interface LinhaCruzamento {
  tarefaId: string;
  contact_id: string;
  nome: string;
  documento: string;
  obrigacao: ObrigacaoCruzada;
  competencia: string;
  statusTarefa: string;
  vencimento: string | null;
  tipo: TipoCruzamento;
  /** O que a Receita diz (ou, nas tarefas fora do monitoramento, por que o cliente não é acompanhado). */
  receita: string;
}

const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
export const ROTULO_STATUS_TAREFA: Record<string, string> = {
  a_fazer: 'A fazer', em_progresso: 'Em progresso', aguardando_cliente: 'Aguardando cliente', concluido: 'Concluída',
};

/** Por que o cliente fica fora da carteira monitorada. */
export function motivoForaDoMonitoramento(c: ContatoCruzamento | undefined, linha: LinhaCarteira | undefined, obrigacao: ObrigacaoCruzada): string {
  if (!c) return 'Cliente não encontrado no cadastro';
  if (c.status_cliente !== 'Ativo') return `Cliente ${c.status_cliente ?? 'sem status'}: encerrar a tarefa`;
  const doc = digitos(c.documento);
  if (doc.length !== 14) return c.regime ? 'Cadastro sem CNPJ' : 'Cadastro sem CNPJ e sem regime';
  if (doc.slice(8, 12) !== '0001') return 'Filial: a obrigação é da matriz';
  if (linha && linha.regime === null) return 'PJ sem regime no cadastro';
  if (obrigacao === 'DAS - Simples Nacional' && c.regime !== 'simples_nacional') return `Cliente é ${rotuloRegime(c.regime)}, não Simples`;
  return 'Fora do monitoramento do Serpro';
}

export function montarCruzamento(
  tarefas: TarefaCruzamento[], contatos: ContatoCruzamento[], carteira: LinhaCarteira[], hoje: string, competencia: string,
): LinhaCruzamento[] {
  const linhaPor = new Map(carteira.map((l) => [l.contact_id, l]));
  const contatoPor = new Map(contatos.map((c) => [c.id, c]));
  const out: LinhaCruzamento[] = [];

  for (const t of tarefas) {
    if (!t.contact_id || !(OBRIGACOES_CRUZADAS as readonly string[]).includes(t.obrigacao)) continue;
    const obrigacao = t.obrigacao as ObrigacaoCruzada;
    const pa = `${t.competence_year}-${String(t.competence_month).padStart(2, '0')}`;
    const concluida = t.status === 'concluido';
    const vencida = !!t.due_date && t.due_date < hoje;
    const linha = linhaPor.get(t.contact_id);
    const contato = contatoPor.get(t.contact_id);
    const base = {
      tarefaId: t.id, contact_id: t.contact_id, nome: linha?.nome ?? contato?.nome ?? 'Cliente', documento: linha?.documento ?? contato?.documento ?? '',
      obrigacao, competencia: pa, statusTarefa: t.status, vencimento: t.due_date,
    };
    const fora = () => { if (!concluida && vencida) out.push({ ...base, tipo: 'fora_do_monitoramento', receita: motivoForaDoMonitoramento(contato, linha, obrigacao) }); };

    if (!linha) { fora(); continue; }

    if (obrigacao === 'DAS - Simples Nacional') {
      if (linha.regime !== 'simples_nacional') { fora(); continue; }
      const declarada = linha.pgdas.declaradas.includes(pa);
      if (concluida && linha.pgdas.emFalta.includes(pa)) out.push({ ...base, tipo: 'baixa_sem_declaracao', receita: `Sem PGDAS-D de ${sigla(pa)} (consulta depois do prazo)` });
      else if (!concluida && declarada) out.push({ ...base, tipo: 'pode_baixar', receita: `PGDAS-D de ${sigla(pa)} transmitida` });
    } else if (pa === competencia) {
      if (obrigacao === 'MIT') {
        if (!concluida && linha.mit === 'encerrada') out.push({ ...base, tipo: 'pode_baixar', receita: `MIT de ${sigla(pa)} encerrada` });
        else if (concluida && linha.mit === 'sem_apuracao') out.push({ ...base, tipo: 'a_confirmar', receita: `Sem MIT encerrada em ${sigla(pa)}` });
      } else {
        if (!concluida && linha.dctfweb === 'transmitida') out.push({ ...base, tipo: 'pode_baixar', receita: `DCTFWeb de ${sigla(pa)} com recibo` });
        else if (concluida && linha.dctfweb === 'sem_declaracao') out.push({ ...base, tipo: 'a_confirmar', receita: `Sem DCTFWeb de ${sigla(pa)} (só existe com movimento)` });
      }
    }
  }

  return out.sort((a, b) =>
    ORDEM_CRUZAMENTO[a.tipo] - ORDEM_CRUZAMENTO[b.tipo] || (a.vencimento ?? '').localeCompare(b.vencimento ?? '') || a.nome.localeCompare(b.nome, 'pt-BR'));
}
