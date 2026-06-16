import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactLog {
  id: string;
  contact_id: string;
  company_id: string;
  action: string;
  description: string;
  user_id: string;
  user_name: string | null;
  created_at: string;
}

export interface ContactLogInsert {
  contact_id: string;
  action: string;
  description: string;
}

export function useContactLogs(contactId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['contact-logs', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('contact_logs')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ContactLog[];
    },
    enabled: !!contactId,
  });

  const createLog = useMutation({
    mutationFn: async (logData: ContactLogInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, full_name, username')
        .eq('user_id', userData.user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const userName = profile.full_name || profile.username || 'Usuário';

      const { data, error } = await supabase
        .from('contact_logs')
        .insert({
          ...logData,
          company_id: profile.company_id,
          user_id: userData.user.id,
          user_name: userName,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
    },
  });

  return {
    logs,
    isLoading,
    createLog,
  };
}
