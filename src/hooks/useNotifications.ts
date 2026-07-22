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

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery<NotificationRow[]>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
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
      const unreadIds = (query.data ?? []).filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length === 0) return;
      const nowIso = new Date().toISOString();
      // Sem .eq('user_id') — a RLS de UPDATE já limita ao que o admin pode gerenciar
      // (próprias + as da empresa). Restringir por user_id deixaria as da empresa sempre não-lidas.
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: nowIso })
        .in('id', unreadIds);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', userId] });
      const previous = queryClient.getQueryData<NotificationRow[]>(['notifications', userId]);
      const nowIso = new Date().toISOString();
      queryClient.setQueryData<NotificationRow[]>(['notifications', userId], (old) =>
        (old ?? []).map((n) => (n.read_at ? n : { ...n, read_at: nowIso }))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['notifications', userId], ctx.previous);
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
      await queryClient.cancelQueries({ queryKey: ['notifications', userId] });
      const previous = queryClient.getQueryData<NotificationRow[]>(['notifications', userId]);
      queryClient.setQueryData<NotificationRow[]>(['notifications', userId], []);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['notifications', userId], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
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
  }, [userId, queryClient]);

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markAsRead: (id: string) => markAsRead.mutate(id),
    markAllAsRead: () => markAllAsRead.mutate(),
    clearAll: () => clearAll.mutate(),
  };
}
