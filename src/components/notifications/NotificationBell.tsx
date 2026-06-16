import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bell, AlertTriangle, Clock, CheckCircle, UserPlus,
  ArrowRightLeft, Calendar, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, NotificationRow } from '@/hooks/useNotifications';

const TYPE_META: Record<string, { icon: any; color: string }> = {
  task_due: { icon: Clock, color: 'text-amber-500' },
  task_overdue: { icon: AlertTriangle, color: 'text-red-500' },
  task_completed: { icon: CheckCircle, color: 'text-green-500' },
  task_assigned: { icon: UserPlus, color: 'text-blue-500' },
  transfer_start: { icon: ArrowRightLeft, color: 'text-purple-500' },
  transfer_end: { icon: ArrowRightLeft, color: 'text-purple-500' },
  calendar_generated: { icon: Calendar, color: 'text-blue-500' },
  system: { icon: Info, color: 'text-gray-500' },
  // legacy
  due_alert: { icon: Clock, color: 'text-amber-500' },
  overdue: { icon: AlertTriangle, color: 'text-red-500' },
};

export function iconForType(type: string) {
  const meta = TYPE_META[type] ?? TYPE_META.system;
  const Icon = meta.icon;
  return <Icon className={cn('w-4 h-4', meta.color)} />;
}

function Item({ n, onClick }: { n: NotificationRow; onClick: (n: NotificationRow) => void }) {
  const unread = !n.read_at;
  return (
    <button
      type="button"
      onClick={() => onClick(n)}
      className={cn(
        'w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors',
        unread && 'bg-muted/50'
      )}
    >
      <div className="mt-0.5 shrink-0">{iconForType(n.type)}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug truncate', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {n.title || n.message || 'Notificação'}
        </p>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(parseISO(n.created_at), { locale: ptBR, addSuffix: true })}
        </p>
      </div>
      {unread && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();

  const handleClick = (n: NotificationRow) => {
    if (!n.read_at) markAsRead(n.id);
    if (n.action_url) {
      setOpen(false);
      navigate(n.action_url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
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
        <ScrollArea className="max-h-[420px]">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <Item key={n.id} n={n} onClick={handleClick} />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
