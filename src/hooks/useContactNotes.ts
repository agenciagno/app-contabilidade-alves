import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactNote {
  id: string;
  contact_id: string;
  company_id: string;
  content: string;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  updater_name?: string;
}

export interface ContactNoteInsert {
  contact_id: string;
  content: string;
}

export interface ContactNoteUpdate {
  id: string;
  content: string;
}

export function useContactNotes(contactId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: notes = [] as ContactNote[], isLoading } = useQuery<ContactNote[]>({
    queryKey: ['contact-notes', contactId],
    queryFn: async (): Promise<ContactNote[]> => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user names for creators and updaters
      const userIds = [...new Set([
        ...data.map(n => n.created_by),
        ...data.filter(n => n.updated_by).map(n => n.updated_by)
      ])].filter(Boolean) as string[];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, username')
          .in('user_id', userIds);

        const userMap = new Map(
          profiles?.map(p => [p.user_id, p.full_name || p.username || 'Usuário']) || []
        );

        return data.map(note => ({
          ...note,
          creator_name: userMap.get(note.created_by) || 'Usuário',
          updater_name: note.updated_by ? userMap.get(note.updated_by) || 'Usuário' : undefined,
        }));
      }

      return data.map(note => ({
        ...note,
        creator_name: 'Usuário',
        updater_name: undefined,
      }));
    },
    enabled: !!contactId,
  });

  const createNote = useMutation({
    mutationFn: async (noteData: ContactNoteInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          ...noteData,
          company_id: profile.company_id,
          created_by: userData.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
      toast({
        title: 'Nota criada',
        description: 'A nota foi adicionada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content }: ContactNoteUpdate) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('contact_notes')
        .update({
          content,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
      toast({
        title: 'Nota atualizada',
        description: 'A nota foi atualizada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
      toast({
        title: 'Nota excluída',
        description: 'A nota foi removida com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    notes,
    isLoading,
    createNote,
    updateNote,
    deleteNote,
  };
}
