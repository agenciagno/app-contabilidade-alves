import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

export type TicketCategory = 'tecnico' | 'financeiro' | 'email';
export type TicketStatus = 'aberto' | 'em_atendimento' | 'resolvido';

export interface SupportTicketRow {
  id: string;
  company_id: string;
  user_id: string;
  category: TicketCategory;
  assunto: string;
  descricao: string;
  status: TicketStatus;
  created_at: string;
}

export interface WhatsappChannelRow {
  id: string;
  label: string;
  phone: string;
  visibility: 'geral' | 'carteira';
  sort_order: number;
}

const TICKETS_KEY = ['support-tickets'] as const;
export const WHATSAPP_CHANNELS_KEY = ['support-whatsapp-channels'] as const;

/** Chamados ainda não resolvidos da própria empresa — alimenta a barra "em atendimento". */
export function useMyOpenTickets() {
  const { company } = useCompany();
  const companyId = (company as any)?.id as string | undefined;

  return useQuery({
    queryKey: [...TICKETS_KEY, companyId],
    queryFn: async (): Promise<SupportTicketRow[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, company_id, user_id, category, assunto, descricao, status, created_at')
        .eq('company_id', companyId!)
        .neq('status', 'resolvido')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportTicketRow[];
    },
    enabled: !!companyId,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async ({
      category, assunto, descricao, files,
    }: {
      category: TicketCategory;
      assunto: string;
      descricao: string;
      files: File[];
    }) => {
      const companyId = (company as any)?.id as string | undefined;
      if (!companyId || !user?.id) throw new Error('Sessão inválida — recarregue a página.');

      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({ company_id: companyId, user_id: user.id, category, assunto, descricao })
        .select('id, company_id, user_id, category, assunto, descricao, status, created_at')
        .single();
      if (error) throw error;

      for (const file of files) {
        const path = `${companyId}/${ticket.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('ticket-attachments').upload(path, file);
        if (upErr) throw new Error(`Falha ao anexar "${file.name}": ${upErr.message}`);
        const { error: metaErr } = await supabase.from('ticket_attachments').insert({
          ticket_id: ticket.id,
          company_id: companyId,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || null,
          file_url: path,
        });
        if (metaErr) throw metaErr;
      }

      // Avisa suporte@ por e-mail. Não bloqueia a criação do chamado — ele já está salvo
      // no banco e visível em "chamados em atendimento" mesmo se o envio falhar.
      const { error: emailErr } = await supabase.functions.invoke('send-support-ticket-email', {
        body: { ticketId: ticket.id },
      });
      if (emailErr) {
        console.error('Falha ao avisar suporte por e-mail:', emailErr);
      }

      return ticket as SupportTicketRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
    },
  });
}

/**
 * Canais de WhatsApp do Suporte. RLS já resolve a visibilidade: 'geral' vem pra
 * todo mundo, 'carteira' só pra quem tem `companies.contact_id` preenchido (cliente
 * real da base contábil da CA) ou é super admin — o front não precisa filtrar de novo.
 */
export function useWhatsappChannels() {
  return useQuery({
    queryKey: WHATSAPP_CHANNELS_KEY,
    queryFn: async (): Promise<WhatsappChannelRow[]> => {
      const { data, error } = await supabase
        .from('support_whatsapp_channels')
        .select('id, label, phone, visibility, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WhatsappChannelRow[];
    },
  });
}

export function useInvalidateWhatsappChannels() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: WHATSAPP_CHANNELS_KEY });
  };
}
