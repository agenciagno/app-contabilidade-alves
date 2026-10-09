import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck } from 'lucide-react';

import { SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { iconForType } from '@/components/notifications/NotificationBell';
import { useNotifications, type NotificationFilter, type NotificationRow } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

/** Tudo o que vem da Receita e do Serpro: a Caixa Postal (serpro_mensagem), pagamentos, DCTFWeb, situação fiscal e os alertas da equipe. */
const FILTRO_FISCAL: NotificationFilter = { typePrefixes: ['serpro_', 'gestao360_'] };

/**
 * Box "Notificações" do Dashboard Fiscal. Substitui os sinos "Mensagens e-CAC" e "Notificações Federais" do cabeçalho
 * (pedido de Gabriel, 09/10/2026): mesma fonte, mesmas notificações, mesmo "marcar como lida".
 */
export function NotificacoesFiscais() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications(FILTRO_FISCAL);
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) => `${n.title ?? ''} ${n.body ?? ''}`.toLowerCase().includes(q));
  }, [notifications, busca]);

  const abrir = (n: NotificationRow) => {
    if (!n.read_at) markAsRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-h4-card text-ink">
            Notificações
            {unreadCount > 0 && <span className="rounded-pill bg-danger px-1.5 text-badge font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </h2>
          <p className="text-meta text-muted-ink">Mensagens da Receita, pagamentos novos, movimento na DCTFWeb e alertas da equipe.</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-meta" disabled={unreadCount === 0} onClick={markAllAsRead}>
          <CheckCheck className="mr-1.5 h-4 w-4" />Marcar lidas
        </Button>
      </div>

      <SearchField placeholder="Buscar por título ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="w-full" />

      <div className="max-h-[420px] overflow-y-auto rounded-md border border-line-2">
        {isLoading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : visiveis.length === 0 ? (
          <p className="p-6 text-center text-ui text-muted-ink-2">{busca ? 'Nenhuma notificação com esse texto.' : 'Nenhuma notificação por enquanto.'}</p>
        ) : (
          <ul className="divide-y divide-line-2">
            {visiveis.map((n) => {
              const naoLida = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-2', naoLida ? 'bg-bg-2/60' : 'opacity-60')}
                  >
                    <span className="mt-0.5 shrink-0">{iconForType(n.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-ui leading-snug', naoLida ? 'text-ink' : 'text-muted-ink')}>{n.title || n.message || 'Notificação'}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-meta text-muted-ink">{n.body}</span>}
                      <span className="mt-0.5 block text-meta text-muted-ink-2">{formatDistanceToNow(parseISO(n.created_at), { locale: ptBR, addSuffix: true })}</span>
                    </span>
                    {naoLida && <span className="mt-2 h-2 w-2 shrink-0 rounded-pill bg-action" aria-label="Não lida" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
