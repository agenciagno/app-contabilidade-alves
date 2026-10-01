import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { periodKey, useClosedPeriodsMap } from '@/hooks/useFiscalPeriodStatus';
import type { LinhaCruzamento } from '@/lib/cruzamentoReceita';
import { hojeBR } from '@/lib/prazosFederais';

const ABERTAS = ['a_fazer', 'em_progresso', 'aguardando_cliente'];
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Ações do Cross-check sobre a tarefa do Gestor Fiscal: reabrir (baixada sem declaração na Receita) e concluir (a Receita já mostra a declaração).
 * Mesmos campos que a tela de Tarefas usa ao concluir e desmarcar, e a mesma trava de competência encerrada.
 * O motivo fica gravado na própria tarefa (nota ou nota de conclusão).
 */
export function useAcoesTarefaCruzamento() {
  const qc = useQueryClient();
  const { data: encerradas } = useClosedPeriodsMap();

  /** Competência da tarefa encerrada no Fiscal: a tarefa fica bloqueada para edição. */
  const bloqueada = (l: LinhaCruzamento) => !!encerradas?.has(periodKey(Number(l.competencia.slice(0, 4)), Number(l.competencia.slice(5, 7))));
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['cruzamento-tarefas'] });
    qc.invalidateQueries({ queryKey: ['fiscal-tasks'] });
  };

  const reabrir = useMutation({
    mutationFn: async (l: LinhaCruzamento) => {
      if (bloqueada(l)) throw new Error('Competência encerrada: a tarefa está bloqueada para edição.');
      const { data: atual, error: e1 } = await supabase.from('fiscal_tasks').select('status, notes').eq('id', l.tarefaId).single();
      if (e1) throw e1;
      if (atual.status !== 'concluido') throw new Error('A tarefa não está mais concluída.');
      const nota = `Reaberta pelo Cross-check em ${dataBR(hojeBR())}: ${l.receita}.`;
      const { error } = await supabase.from('fiscal_tasks').update({
        status: 'a_fazer', attachment_url: null, completion_type: null, protocol_number: null, completion_notes: null, completed_at: null,
        notes: [atual.notes, nota].filter(Boolean).join('\n'),
      }).eq('id', l.tarefaId).eq('status', 'concluido');
      if (error) throw error;
    },
    onSuccess: atualizar,
  });

  const concluir = useMutation({
    mutationFn: async (l: LinhaCruzamento) => {
      if (bloqueada(l)) throw new Error('Competência encerrada: a tarefa está bloqueada para edição.');
      const { error } = await supabase.from('fiscal_tasks').update({
        status: 'concluido', completion_type: 'transmitted', completed_at: new Date().toISOString(),
        completion_notes: `Concluída pelo Cross-check em ${dataBR(hojeBR())}: ${l.receita}.`,
      }).eq('id', l.tarefaId).in('status', ABERTAS);
      if (error) throw error;
    },
    onSuccess: atualizar,
  });

  return { reabrir, concluir, bloqueada };
}
