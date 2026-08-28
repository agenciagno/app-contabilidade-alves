import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export type TipoPessoa = 'PF' | 'PJ';
export type Modelo = 'A1' | 'A3';
export type CertificateDbStatus = 'ativo' | 'vencido' | 'renovado' | 'cancelado';

export interface CertificateRow {
  id: string;
  company_id: string;
  contact_id: string;
  partner_id: string | null;
  tipo_pessoa: TipoPessoa;
  modelo: Modelo;
  autoridade_certificadora: string | null;
  data_emissao: string | null;
  data_validade: string;
  status: CertificateDbStatus;
  observacao: string | null;
  anexo_url: string | null;
  anexo_file_name: string | null;
  anexo_size: number | null;
  renewed_from_id: string | null;
  created_at: string;
  updated_at: string;
  contacts: { name: string; display_name: string | null; document: string | null; email: string | null; whatsapp: string | null; phone: string | null } | null;
  contact_partners: { id: string; name: string; cpf: string | null } | null;
}

export interface CertificateNotificationRow {
  id: string;
  certificate_id: string;
  canal: 'email' | 'whatsapp' | 'copiar';
  destino: string | null;
  mensagem: string | null;
  enviado_em: string;
  enviado_por: string | null;
}

/** Dias até o vencimento — negativo quando já venceu. */
export function diasParaVencer(dataValidade: string): number {
  return differenceInCalendarDays(new Date(`${dataValidade}T00:00:00`), new Date());
}

export type StatusVisual = 'ativo' | 'a_vencer' | 'vencido' | 'renovado';

/** Status exibido na tela — computado da data, não do campo status salvo (que só marca o ciclo de vida ativo/renovado/cancelado). */
export function statusVisual(cert: Pick<CertificateRow, 'status' | 'data_validade'>): { estado: StatusVisual; label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; dias: number } {
  const dias = diasParaVencer(cert.data_validade);
  if (cert.status === 'renovado') return { estado: 'renovado', label: 'renovado', tone: 'neutral', dias };
  if (cert.status === 'cancelado') return { estado: 'renovado', label: 'cancelado', tone: 'neutral', dias };
  if (dias < 0) return { estado: 'vencido', label: 'vencido', tone: 'danger', dias };
  if (dias <= 30) return { estado: 'a_vencer', label: 'a vencer', tone: 'warn', dias };
  return { estado: 'ativo', label: 'ativo', tone: 'ok', dias };
}

export function titularLabel(cert: CertificateRow): string {
  const empresa = cert.contacts?.display_name || cert.contacts?.name || 'Cliente';
  if (cert.tipo_pessoa === 'PF' && cert.contact_partners?.name) {
    return `${empresa} — ${cert.contact_partners.name}`;
  }
  return empresa;
}

export function titularDocumento(cert: CertificateRow): string | null {
  if (cert.tipo_pessoa === 'PF') return cert.contact_partners?.cpf ?? null;
  return cert.contacts?.document ?? null;
}

export function useCertificates() {
  return useQuery({
    queryKey: ['certificates'],
    queryFn: async (): Promise<CertificateRow[]> => {
      const { data, error } = await supabase
        .from('certificates')
        .select('*, contacts:contact_id (name, display_name, document, email, whatsapp, phone), contact_partners:partner_id (id, name, cpf)')
        .eq('status', 'ativo')
        .order('data_validade', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CertificateRow[];
    },
  });
}

export function useCertificateNotifications(certificateId: string | undefined) {
  return useQuery({
    queryKey: ['certificate-notifications', certificateId],
    queryFn: async (): Promise<CertificateNotificationRow[]> => {
      if (!certificateId) return [];
      const { data, error } = await supabase
        .from('certificate_client_notifications')
        .select('*')
        .eq('certificate_id', certificateId)
        .order('enviado_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CertificateNotificationRow[];
    },
    enabled: !!certificateId,
  });
}

/** Empresas (PJ) pra dropdown de titular. */
export function useContactsForCertificado() {
  return useQuery({
    queryKey: ['contacts-for-certificado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, display_name, document')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Todos os sócios (com a empresa de cada um) — busca por nome é feita em memória, mesmo padrão do combobox já usado no app. */
export function usePartnersForCertificado() {
  return useQuery({
    queryKey: ['partners-for-certificado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_partners')
        .select('id, name, cpf, contact_id, contacts:contact_id (name, display_name)')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; cpf: string | null; contact_id: string; contacts: { name: string; display_name: string | null } | null }>;
    },
  });
}

interface SalvarCertificadoInput {
  certificate_id?: string;
  renovar_de_id?: string;
  contact_id: string;
  partner_id?: string | null;
  tipo_pessoa: TipoPessoa;
  modelo: Modelo;
  autoridade_certificadora?: string | null;
  data_emissao?: string | null;
  data_validade: string;
  observacao?: string | null;
  senha?: string;
  anexo_url?: string | null;
  anexo_file_name?: string | null;
  anexo_size?: number | null;
}

export function useSalvarCertificado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarCertificadoInput) => {
      const { data, error } = await supabase.functions.invoke('certificado-salvar', { body: input });
      if (error) throw new Error(await extrairErro(error));
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao salvar certificado.');
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  });
}

export function useRevelarSenhaCertificado() {
  return useMutation({
    mutationFn: async (vars: { certificate_id: string; acao: 'REVELAR' | 'COPIAR' }) => {
      const { data, error } = await supabase.functions.invoke('certificado-revelar', { body: vars });
      if (error) throw new Error(await extrairErro(error));
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao revelar senha.');
      return data.senha as string | null;
    },
  });
}

export function useExcluirCertificado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cert: CertificateRow) => {
      if (cert.anexo_url) {
        await supabase.storage.from('contact-documents').remove([cert.anexo_url]);
      }
      const { error } = await supabase.from('certificates').delete().eq('id', cert.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  });
}

export function useNotificarClientePorEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { certificate_id: string; assunto: string; mensagem: string }) => {
      const { data, error } = await supabase.functions.invoke('certificado-notificar-cliente', { body: vars });
      if (error) throw new Error(await extrairErro(error));
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao enviar e-mail.');
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['certificate-notifications', vars.certificate_id] }),
  });
}

/** Registra a intenção de notificar via WhatsApp/copiar — o envio em si acontece no navegador do usuário (wa.me / clipboard), aqui só fica o histórico. */
export function useRegistrarNotificacaoLocal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { certificate_id: string; company_id: string; canal: 'whatsapp' | 'copiar'; destino?: string | null; mensagem: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single();
      const { error } = await supabase.from('certificate_client_notifications').insert({
        certificate_id: vars.certificate_id,
        company_id: vars.company_id,
        canal: vars.canal,
        destino: vars.destino ?? null,
        mensagem: vars.mensagem,
        enviado_por: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['certificate-notifications', vars.certificate_id] }),
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
