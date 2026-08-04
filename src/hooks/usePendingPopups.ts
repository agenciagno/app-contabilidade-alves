import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PopupNotification {
  id: string;
  title: string;
  body: string | null;
  action_url: string | null;
  button_label: string | null;
  show_on_login_only: boolean;
  created_at: string;
}

export function usePendingPopups() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery<PopupNotification[]>({
    queryKey: ['popup-notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('id, title, body, action_url, button_label, show_on_login_only, created_at')
        .eq('user_id', userId)
        .eq('type', 'popup')
        .is('read_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PopupNotification[];
    },
    enabled: !!userId,
  });

  // Realtime: um pop-up agendado pode chegar enquanto o usuário já está com o app aberto.
  // Exceção: pop-up marcado "só na próxima abertura/login" não deve interromper uma sessão
  // já ativa — fica esperando e só aparece no próximo mount (fetch inicial acima já pega
  // qualquer pop-up não lido, com ou sem essa flag).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`popup-notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (payload?.new?.show_on_login_only) return;
          queryClient.invalidateQueries({ queryKey: ['popup-notifications', userId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['popup-notifications', userId] }),
  });

  return {
    // Mostra um por vez, do mais antigo pro mais novo — evita empilhar dialogs.
    current: query.data?.[0] ?? null,
    dismiss: (id: string) => dismissMutation.mutate(id),
  };
}
