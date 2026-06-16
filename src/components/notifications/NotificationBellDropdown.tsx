import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, AlertTriangle, ClipboardList, CheckCircle2, RefreshCw, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, NotificationRow } from '@/hooks/useNotifications';

function iconFor(type: string) {
  switch (type) {
    case 'due_alert':
      return <BellRing className="w-4 h-4 text-yellow-600" />;
    case 'overdue':
      return <AlertTriangle className="w-4 h-4 text-destructive" />;
    case 'task_assigned':
      return <ClipboardList className="w-4 h-4 text-blue-600" />;
    case 'task_completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    case 'coverage_started':
    case 'coverage_ended':
      return <RefreshCw className="w-4 h-4 text-primary" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
}

interface ItemProps {
  n: NotificationRow;
  onClick: (id: string) => void;
}
function Item({ n, onClick }: ItemProps) {
  const unread = !n.read_at;
  return (
    <button
      type="button"
      onClick={() => onClick(n.id)}
      className={cn(
        'w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors',
        unread && 'bg-muted/50'
      )}
    >
      <div className="mt-0.5 shrink-0">{iconFor(n.type)}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {n.message}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(parseISO(n.created_at), { locale: ptBR, addSuffix: true })}
        </p>
      </div>
      {unread && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
    </button>
  );
}

export function NotificationBellDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();

  return (
    <div className="w-[380px]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <h3 className="text-sm font-semibold">Notificações</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={unreadCount === 0}
          onClick={() => markAllAsRead()}
        >
          Marcar todas como lidas
        </Button>
      </div>
      <ScrollArea className="max-h-[400px]">
        {isLoading ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : notifications.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((n) => (
              <Item key={n.id} n={n} onClick={markAsRead} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
