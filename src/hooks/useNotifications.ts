import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationRow {
  id: string;
  user_id: string;
  company_id: string | null;
  task_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  // legacy fallback
  message?: string | null;
}

/** Recorte por categoria — cada sino do header enxerga só os seus tipos. */
export interface NotificationFilter {
  /** Tipos exatos (ex.: 'boleto_pago'). */
  types?: string[];
  /** Prefixo de tipo (ex.: 'serpro_' pega serpro_mensagem, serpro_defis...). */
  typePrefix?: string;
}

export function useNotifications(filter: NotificationFilter = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  // Chave por categoria; o prefixo ['notifications', userId] continua invalidando todas.
  const scope = filter.typePrefix ? `prefix:${filter.typePrefix}` : filter.types ? `types:${filter.types.join(',')}` : 'all';
  const queryKey = ['notifications', userId, scope];

  const query = useQuery<NotificationRow[]>({
    queryKey,
    queryFn: async () => {
      if (!userId) return [];
      let q = (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (filter.typePrefix) q = q.like('type', `${filter.typePrefix}%`);
      else if (filter.types) q = q.in('type', filter.types);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!userId,
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      // Marca TODAS as não lidas da categoria, não só as 20 que o popover carrega —
      // senão quem acumulou milhares (ex.: task_completed) nunca zera o selo.
      let q = (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (filter.typePrefix) q = q.like('type', `${filter.typePrefix}%`);
      else if (filter.types) q = q.in('type', filter.types);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationRow[]>(queryKey);
      const nowIso = new Date().toISOString();
      queryClient.setQueryData<NotificationRow[]>(queryKey, (old) =>
        (old ?? []).map((n) => (n.read_at ? n : { ...n, read_at: nowIso }))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const ids = (query.data ?? []).map((n) => n.id);
      if (ids.length === 0) return;
      // Remove as notificações visíveis (RLS de DELETE limita ao que o admin pode gerenciar).
      const { error } = await (supabase as any)
        .from('notifications')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationRow[]>(queryKey);
      queryClient.setQueryData<NotificationRow[]>(queryKey, []);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${scope}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, scope]);

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markAsRead: (id: string) => markAsRead.mutate(id),
    markAllAsRead: () => markAllAsRead.mutate(),
    clearAll: () => clearAll.mutate(),
  };
}
