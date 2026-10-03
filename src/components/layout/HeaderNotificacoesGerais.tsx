import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { PushOptIn } from '@/components/notifications/PushOptIn';
import { useResumoTarefasHoje } from '@/hooks/useResumoTarefasHoje';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { cn } from '@/lib/utils';

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
 * Header › Notificações Gerais (03/10/2026, substitui o sino "Tarefas").
 * Leva tudo que não tem sino próprio: cliente novo, cadastro alterado,
 * certificado vencendo, tarefas (atribuída, concluída, prazos), agenda fiscal.
 * Ficam de fora o que pertence a Mensagens e-CAC / Federais (serpro_*,
 * gestao360_*), às Financeiras (boleto_pago) e os pop-ups (aparecem na tela,
 * não no sino). Quem tem o módulo Fiscal ainda vê o resumo do dia no topo.
 */
export function HeaderNotificacoesGerais() {
  const { isModuleVisible } = useModuleAccess();
  return (
    <NotificationBell
      title="Notificações Gerais"
      icon={Bell}
      filter={{ excludePrefixes: ['serpro_', 'gestao360_'], excludeTypes: ['boleto_pago', 'popup'] }}
      renderTop={(fechar) =>
        isModuleVisible('fiscal') ? <ResumoDoDia fechar={fechar} /> : <PushOptIn />
      }
    />
  );
}
