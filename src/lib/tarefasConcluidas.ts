import type { QueryClient } from '@tanstack/react-query';

/** Complemento do aviso ("... · 1 tarefa fiscal concluída automaticamente"), vazio quando nenhuma tarefa foi concluída. */
export function sufixoTarefas(n?: number): string {
  if (!n) return '';
  return n === 1 ? ' · 1 tarefa fiscal concluída automaticamente' : ` · ${n} tarefas fiscais concluídas automaticamente`;
}

/** A conclusão automática muda tarefas e painéis do Fiscal: recarrega o que estiver em cache. */
export function recarregarTarefasFiscais(qc: QueryClient, n?: number) {
  if (!n) return;
  qc.invalidateQueries({ queryKey: ['fiscal-tasks'] });
  qc.invalidateQueries({ queryKey: ['fiscal-dashboard'] });
}
