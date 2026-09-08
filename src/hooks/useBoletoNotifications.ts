import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BoletoNotificationRow {
  id: string;
  boleto_id: string;
  canal: 'email' | 'whatsapp' | 'copiar';
  destino: string | null;
  mensagem: string | null;
  enviado_em: string;
  enviado_por: string | null;
}

/** Histórico de cobrança enviada pro cliente de um boleto — mesmo padrão de useCertificateNotifications. */
export function useBoletoNotifications(boletoId: string | undefined) {
  return useQuery({
    queryKey: ['boleto-notifications', boletoId],
    queryFn: async (): Promise<BoletoNotificationRow[]> => {
      if (!boletoId) return [];
      const { data, error } = await (supabase as any)
        .from('boleto_client_notifications')
        .select('*')
        .eq('boleto_id', boletoId)
        .order('enviado_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BoletoNotificationRow[];
    },
    enabled: !!boletoId,
  });
}

async function extrairErro(error: any): Promise<string> {
  const ctx = error?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch {
      // corpo não é JSON, cai no fallback
    }
  }
  return error?.message ?? 'Erro inesperado.';
}

export function useNotificarClientePorEmailBoleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { boleto_id: string; assunto: string; mensagem: string }) => {
      const { data, error } = await supabase.functions.invoke('boleto-notificar-cliente', { body: vars });
      if (error) throw new Error(await extrairErro(error));
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao enviar e-mail.');
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['boleto-notifications', vars.boleto_id] }),
  });
}

/** Registra a intenção de cobrar via WhatsApp/copiar — o envio em si acontece no navegador do usuário (wa.me / clipboard), aqui só fica o histórico. */
export function useRegistrarNotificacaoLocalBoleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { boleto_id: string; company_id: string; canal: 'whatsapp' | 'copiar'; destino?: string | null; mensagem: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single();
      const { error } = await (supabase as any).from('boleto_client_notifications').insert({
        boleto_id: vars.boleto_id,
        company_id: vars.company_id,
        canal: vars.canal,
        destino: vars.destino ?? null,
        mensagem: vars.mensagem,
        enviado_por: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['boleto-notifications', vars.boleto_id] }),
  });
}
