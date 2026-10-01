import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invocarSerpro } from '@/lib/invocarSerpro';

/** Envio ao cliente (Gestão 360°): e-mail sai pelo servidor; WhatsApp e "copiar" devolvem o texto final para a tela usar. Tudo vai para client_envios. */
export type CanalEnvio = 'email' | 'whatsapp' | 'copiar';

export const ROTULO_CANAL: Record<CanalEnvio, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Texto copiado' };

export interface DocumentoCliente { tipo: string; id: string; rotulo: string; data: string }

/** Documentos que o sistema já guardou do cliente (só os que existem de fato). Não consulta o Serpro e não custa nada. */
export function useDocumentosCliente(contactId: string | null) {
  return useQuery({
    queryKey: ['envio-documentos', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => (await invocarSerpro<{ documentos: DocumentoCliente[] }>('client-enviar', { action: 'listar', contact_id: contactId })).documentos,
  });
}

export interface ContatoEnvio { email: string | null; whatsapp: string | null; phone: string | null }

export function useContatoEnvio(contactId: string | null) {
  return useQuery({
    queryKey: ['envio-contato', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ContatoEnvio> => {
      const { data, error } = await supabase.from('contacts').select('email, whatsapp, phone').eq('id', contactId!).maybeSingle();
      if (error) throw error;
      return { email: data?.email ?? null, whatsapp: data?.whatsapp ?? null, phone: data?.phone ?? null };
    },
  });
}

export interface EnvioRegistrado {
  id: string;
  canal: CanalEnvio;
  origem: string;
  enviado_em: string;
  enviado_por: string | null;
  documentos: { nome: string }[];
}

/** Últimos envios ao cliente (mais recente primeiro). */
export function useEnviosCliente(contactId: string | null) {
  return useQuery({
    queryKey: ['envios-cliente', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<EnvioRegistrado[]> => {
      const { data, error } = await supabase.from('client_envios').select('id, canal, origem, enviado_em, enviado_por, documentos')
        .eq('contact_id', contactId!).order('enviado_em', { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as EnvioRegistrado[];
    },
  });
}

export interface PedidoEnvio {
  contactId: string;
  canal: CanalEnvio;
  mensagem: string;
  assunto?: string;
  documentos: { tipo: string; id: string }[];
  /** De onde o envio saiu: 'ausencia', 'ficha'. */
  origem: string;
  /** Ex.: { obrigacao, competencia }: a função anota "cliente avisado" na ausência. */
  referencia?: { obrigacao: string; competencia: string };
}

export interface ResultadoEnvio { ok: boolean; texto: string; whatsapp: string | null; destino: string | null; aviso?: string }

export function useEnviarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PedidoEnvio) => invocarSerpro<ResultadoEnvio>('client-enviar', {
      action: 'enviar', contact_id: p.contactId, canal: p.canal, mensagem: p.mensagem, assunto: p.assunto,
      documentos: p.documentos, origem: p.origem, referencia: p.referencia,
    }),
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['envios-cliente', p.contactId] });
      qc.invalidateQueries({ queryKey: ['ausencia-acompanhamentos'] });
    },
  });
}
