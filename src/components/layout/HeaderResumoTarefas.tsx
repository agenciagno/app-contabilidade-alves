import { useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { PushOptIn } from '@/components/notifications/PushOptIn';
import { useResumoTarefasHoje } from '@/hooks/useResumoTarefasHoje';
import { cn } from '@/lib/utils';

/** Tipos de notificação que pertencem ao ícone Tarefas (atribuição, conclusão, prazos). */
const TIPOS_TAREFA = [
  'task_assigned',
  'task_completed',
  'task_due',
  'task_overdue',
  'due_alert',
  'overdue',
  'prazo_5d',
  'prazo_3d',
  'prazo_hoje',
  'prazo_atraso',
  'calendar_generated',
  'transfer_start',
  'transfer_end',
];

function ResumoDoDia({ fechar }: { fechar: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = useResumoTarefasHoje(true);

  const linhas = [
    { rotulo: 'Tarefas vencem hoje', valor: data?.vencemHoje, tom: 'text-warn' },
    { rotulo: 'Tarefas entregues hoje', valor: data?.entreguesHoje, tom: 'text-ok' },
    { rotulo: 'Tarefas vencidas', valor: data?.vencidas, tom: 'text-danger' },
  ];

  return (
    <>
      {/* Opt-in de push mora aqui desde que o sino único deixou de existir. */}
      <PushOptIn />
      <div className="flex flex-col border-b border-border/50 py-1">
        {linhas.map((l) => (
          <button
            key={l.rotulo}
            type="button"
            onClick={() => {
              fechar();
              navigate('/fiscal/tarefas');
            }}
            className="flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
          >
            <span className="text-sm text-foreground">{l.rotulo}</span>
            <span className={cn('text-lg font-semibold tabular-nums', l.tom)}>
              {isLoading || l.valor === undefined ? '—' : l.valor}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Header › Tarefas. Topo: o resumo do dia (vencem hoje / entregues hoje /
 * vencidas, cada linha abre a lista de Tarefas). Abaixo: as notificações de
 * tarefa — atribuída a você, concluída, prazos. O selo vermelho conta as não lidas.
 */
export function HeaderResumoTarefas() {
  return (
    <NotificationBell
      title="Tarefas"
      icon={ListChecks}
      filter={{ types: TIPOS_TAREFA }}
      renderTop={(fechar) => <ResumoDoDia fechar={fechar} />}
    />
  );
}
