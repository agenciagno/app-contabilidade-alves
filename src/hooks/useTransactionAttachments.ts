import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TransactionAttachment {
  id: string;
  transaction_id: string;
  company_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export function useTransactionAttachments(transactionId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['transaction-attachments', transactionId],
    queryFn: async () => {
      if (!transactionId) return [];
      
      const { data, error } = await supabase
        .from('transaction_attachments')
        .select('*')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TransactionAttachment[];
    },
    enabled: !!transactionId,
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ file, transactionId }: { file: File; transactionId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${transactionId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('transaction-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('transaction-attachments')
        .getPublicUrl(fileName);

      // Create attachment record
      const { data, error } = await supabase
        .from('transaction_attachments')
        .insert({
          transaction_id: transactionId,
          company_id: profile.company_id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments'] });
      toast({ title: 'Arquivo anexado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao anexar arquivo', description: error.message, variant: 'destructive' });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: TransactionAttachment) => {
      // Extract file path from URL
      const urlParts = attachment.file_url.split('/');
      const filePath = urlParts.slice(-2).join('/');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('transaction-attachments')
        .remove([filePath]);

      if (storageError) console.warn('Storage delete error:', storageError);

      // Delete record
      const { error } = await supabase
        .from('transaction_attachments')
        .delete()
        .eq('id', attachment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments'] });
      toast({ title: 'Anexo removido!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover anexo', description: error.message, variant: 'destructive' });
    },
  });

  return {
    attachments,
    isLoading,
    uploadAttachment,
    deleteAttachment,
  };
}
