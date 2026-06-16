import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createAuditLog } from './useAuditLog';

export interface ContactPartner {
  id: string;
  company_id: string;
  contact_id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  participation_percentage: number;
  created_at: string;
  updated_at: string;
}

export type ContactPartnerInsert = Omit<ContactPartner, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type ContactPartnerUpdate = Partial<Omit<ContactPartnerInsert, 'contact_id'>>;

export function useContactPartners(contactId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners = [], isLoading, error } = useQuery({
    queryKey: ['contact-partners', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_partners')
        .select('*')
        .eq('contact_id', contactId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as ContactPartner[];
    },
    enabled: !!contactId,
  });

  const createPartner = useMutation({
    mutationFn: async (partner: ContactPartnerInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_partners')
        .insert({ ...partner, company_id: profile.company_id })
        .select()
        .single();

      if (error) throw error;

      // Create audit log
      await createAuditLog({
        contactId: partner.contact_id,
        action: 'SOCIO_ADICIONADO',
        description: `Sócio "${partner.name}" adicionado (${partner.participation_percentage || 0}%)`,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-partners', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
      toast({ title: 'Sócio adicionado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao adicionar sócio', description: error.message, variant: 'destructive' });
    },
  });

  const updatePartner = useMutation({
    mutationFn: async ({ id, ...updates }: ContactPartnerUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('contact_partners')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create audit log
      await createAuditLog({
        contactId,
        action: 'SOCIO_EDITADO',
        description: `Sócio "${updates.name || data.name}" atualizado`,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-partners', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
      toast({ title: 'Sócio atualizado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar sócio', description: error.message, variant: 'destructive' });
    },
  });

  const deletePartner = useMutation({
    mutationFn: async (id: string) => {
      // Get partner name before deleting
      const partnerToDelete = partners.find(p => p.id === id);
      
      const { error } = await supabase
        .from('contact_partners')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Create audit log
      await createAuditLog({
        contactId,
        action: 'SOCIO_REMOVIDO',
        description: `Sócio "${partnerToDelete?.name || 'Desconhecido'}" removido`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-partners', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
      toast({ title: 'Sócio removido!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover sócio', description: error.message, variant: 'destructive' });
    },
  });

  const totalParticipation = partners.reduce((sum, p) => sum + Number(p.participation_percentage || 0), 0);

  return {
    partners,
    isLoading,
    error,
    totalParticipation,
    createPartner,
    updatePartner,
    deletePartner,
  };
}
