import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  XCircle, 
  Clock, 
  Trash2,
  CheckCheck,
  Users,
  Calendar,
  TrendingDown,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications, NotificationType } from '@/contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const typeConfig: Record<NotificationType, { icon: typeof AlertTriangle; color: string; bgColor: string }> = {
  error: { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/20' },
  warning: { icon: AlertTriangle, color: 'text-warning', bgColor: 'bg-warning/20' },
  success: { icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/20' },
  info: { icon: Info, color: 'text-primary', bgColor: 'bg-primary/20' },
};

const categoryIcons = {
  inadimplencia: Users,
  vencimento: Calendar,
  saldo: TrendingDown,
  sucesso: Sparkles,
  sistema: Info,
};

export function NotificationPanel() {
  const navigate = useNavigate();
  const { notifications, markAsRead, markAllAsRead, clearAll } = useNotifications();

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const groupedNotifications = {
    unread: notifications.filter((n) => !n.read),
    read: notifications.filter((n) => n.read),
  };

  return (
    <div className="w-[400px]">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">Notificações</h3>
          {notifications.length > 0 && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-8 px-2"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Marcar lidas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Limpar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-[480px]">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-success/50 mb-3" />
            <p className="text-sm font-medium text-foreground">Tudo em dia!</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nenhuma notificação pendente
            </p>
          </div>
        ) : (
          <>
            {/* Unread notifications */}
            {groupedNotifications.unread.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-muted/50">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Não lidas ({groupedNotifications.unread.length})
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {groupedNotifications.unread.map((notification) => {
                    const config = typeConfig[notification.type];
                    const CategoryIcon = categoryIcons[notification.category];
                    const TypeIcon = config.icon;

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className="w-full p-4 text-left hover:bg-muted/50 transition-colors relative"
                      >
                        {/* Unread indicator */}
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                        
                        <div className="flex items-start gap-3 pl-2">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                            <TypeIcon className={`w-4.5 h-4.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {notification.title}
                              </p>
                              <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {notification.description}
                            </p>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(notification.timestamp, {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Read notifications */}
            {groupedNotifications.read.length > 0 && (
              <div>
                {groupedNotifications.unread.length > 0 && <Separator />}
                <div className="px-4 py-2 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Lidas ({groupedNotifications.read.length})
                  </span>
                </div>
                <div className="divide-y divide-border opacity-60">
                  {groupedNotifications.read.slice(0, 5).map((notification) => {
                    const config = typeConfig[notification.type];
                    const TypeIcon = config.icon;

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className="w-full p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                            <TypeIcon className={`w-3.5 h-3.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs text-foreground truncate">
                              {notification.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {notification.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
