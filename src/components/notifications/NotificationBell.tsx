import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bell, AlertTriangle, Clock, CheckCircle, UserPlus,
  ArrowRightLeft, Calendar, Info, CalendarClock, CalendarX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, NotificationRow } from '@/hooks/useNotifications';
import { PushOptIn } from '@/components/notifications/PushOptIn';

const TYPE_META: Record<string, { icon: any; color: string }> = {
  task_due: { icon: Clock, color: 'text-amber-500' },
  task_overdue: { icon: AlertTriangle, color: 'text-red-500' },
  task_completed: { icon: CheckCircle, color: 'text-green-500' },
  task_assigned: { icon: UserPlus, color: 'text-blue-500' },
  transfer_start: { icon: ArrowRightLeft, color: 'text-purple-500' },
  transfer_end: { icon: ArrowRightLeft, color: 'text-purple-500' },
  calendar_generated: { icon: Calendar, color: 'text-blue-500' },
  system: { icon: Info, color: 'text-gray-500' },
  // Deadline alerts
  prazo_5d: { icon: CalendarClock, color: 'text-blue-500' },
  prazo_3d: { icon: CalendarClock, color: 'text-amber-500' },
  prazo_hoje: { icon: Clock, color: 'text-orange-500' },
  prazo_atraso: { icon: CalendarX, color: 'text-red-600' },
  // legacy
  due_alert: { icon: Clock, color: 'text-amber-500' },
  overdue: { icon: AlertTriangle, color: 'text-red-500' },
};

const DEADLINE_BADGES: Record<string, { label: string; className: string }> = {
  prazo_5d: { label: '5 dias', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  prazo_3d: { label: '3 dias', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  prazo_hoje: { label: 'Hoje', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  prazo_atraso: { label: 'Atraso', className: 'bg-red-100 text-red-700 border-red-200' },
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
        'w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-[background,opacity]',
        unread ? 'bg-muted/50' : 'opacity-50'
      )}
    >
      <div className="mt-0.5 shrink-0">{iconForType(n.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('text-sm leading-snug truncate', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
            {n.title || n.message || 'Notificação'}
          </p>
          {DEADLINE_BADGES[n.type] && (
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0',
              DEADLINE_BADGES[n.type].className,
            )}>
              {DEADLINE_BADGES[n.type].label}
            </span>
          )}
        </div>
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
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, isLoading } = useNotifications();

  const handleClear = () => {
    if (notifications.length === 0) return;
    if (window.confirm('Limpar todas as notificações? Esta ação não pode ser desfeita.')) {
      clearAll();
    }
  };

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
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 gap-1">
          <h3 className="text-sm font-semibold shrink-0">Notificações</h3>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={unreadCount === 0}
              onClick={() => markAllAsRead()}
            >
              Marcar lidas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
              disabled={notifications.length === 0}
              onClick={handleClear}
            >
              Limpar
            </Button>
          </div>
        </div>
        <PushOptIn />
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
