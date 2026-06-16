import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactMessage {
  id: string;
  company_id: string;
  contact_id: string;
  channel: 'whatsapp' | 'email';
  message: string;
  status: 'enviado' | 'falhou' | 'pendente';
  sent_at: string;
  created_at: string;
}

export interface ContactMessageInsert {
  contact_id: string;
  channel: 'whatsapp' | 'email';
  message: string;
  status?: 'enviado' | 'falhou' | 'pendente';
}

export function useContactMessages(contactId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['contact-messages', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      
      const { data, error } = await supabase
        .from('contact_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data as ContactMessage[];
    },
    enabled: !!contactId,
  });

  const createMessage = useMutation({
    mutationFn: async (message: ContactMessageInsert) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .single();

      if (!profile?.company_id) throw new Error('Company not found');

      const { data, error } = await supabase
        .from('contact_messages')
        .insert({
          ...message,
          company_id: profile.company_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-messages', contactId] });
      toast({
        title: 'Mensagem registrada',
        description: 'O registro de comunicação foi salvo com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao registrar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('contact_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-messages', contactId] });
      toast({
        title: 'Mensagem excluída',
        description: 'O registro foi removido com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    messages,
    isLoading,
    createMessage,
    deleteMessage,
  };
}
