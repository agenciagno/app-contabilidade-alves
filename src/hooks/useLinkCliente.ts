import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';

/**
 * Link do cliente (17/10/2026): um link público por cliente (/c/<token>) com a lista de documentos para ele enviar e, depois,
 * as boas-vindas. A lista é uma cópia do padrão de Tech → Onboarding, filtrada por tipo (com CNPJ × abertura), regime e funcionários.
 */
export interface LinkCliente {
  id: string;
  token: string;
  tem_funcionarios: boolean;
  prazo_envio: string | null;
  boas_vindas_liberada: boolean;
  revogado_em: string | null;
  /** Mensagem de envio só deste cliente (nulo = modelo padrão de Tech → Onboarding). */
  mensagem_assunto: string | null;
  mensagem_texto: string | null;
  created_at: string;
}

export interface ArquivoDocumento { id: string; caminho: string; nome: string; tamanho: number | null; enviado_em: string }

export interface DocumentoCliente {
  id: string;
  titulo: string;
  descricao: string | null;
  ordem: number;
  status: 'pendente' | 'enviado' | 'aprovado' | 'dispensado';
  observacao: string | null;
  enviado_em: string | null;
  arquivos: ArquivoDocumento[];
}

interface ListaPadrao { temFuncionarios: boolean; fluxo: 'cnpj_existente' | 'abertura'; regime: string | null }

export const BUCKET_ONBOARDING = 'onboarding-documentos';
export const urlDoLink = (token: string) => `${window.location.origin}/c/${token}`;

const novoToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');

export function useLinkCliente(contactId: string) {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const chaveLink = ['link-cliente', contactId];
  const chaveDocs = ['link-cliente-docs', contactId];

  const { data: link, isLoading } = useQuery({
    queryKey: chaveLink,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_links')
        .select('id, token, tem_funcionarios, prazo_envio, boas_vindas_liberada, revogado_em, created_at, mensagem_assunto, mensagem_texto')
        .eq('contact_id', contactId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LinkCliente | null;
    },
  });

  const { data: documentos = [] } = useQuery({
    queryKey: chaveDocs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_documentos')
        .select('id, titulo, descricao, ordem, status, observacao, enviado_em, arquivos:onboarding_documento_arquivos(id, caminho, nome, tamanho, enviado_em)')
        .eq('contact_id', contactId)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoCliente[];
    },
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: chaveLink });
    queryClient.invalidateQueries({ queryKey: chaveDocs });
  };

  /** Copia a lista padrão (Tech → Onboarding) filtrada por fluxo, regime e funcionários para o fim da lista do cliente. */
  const copiarListaPadrao = async ({ temFuncionarios, fluxo, regime }: ListaPadrao) => {
    const { data: modelos, error: e1 } = await supabase
      .from('onboarding_documentos_modelo')
      .select('id, titulo, descricao, so_com_funcionarios, regimes, ordem')
      .eq('company_id', activeCompanyId!)
      .eq('fluxo', fluxo)
      .eq('ativo', true)
      .order('ordem');
    if (e1) throw e1;
    const lista = (modelos ?? []).filter(m =>
      (!m.so_com_funcionarios || temFuncionarios) && (!m.regimes?.length || (regime && m.regimes.includes(regime))));
    if (lista.length) {
      const inicio = documentos.at(-1)?.ordem ?? 0;
      const { error: e3 } = await supabase.from('onboarding_documentos').insert(lista.map((m, i) => ({
        company_id: activeCompanyId!, contact_id: contactId, modelo_id: m.id, titulo: m.titulo, descricao: m.descricao, ordem: inicio + i + 1,
      })));
      if (e3) throw e3;
    }
    return lista.length;
  };

  /**
   * Cria o link. Cliente novo: com a lista de documentos (boas-vindas liberadas depois). Cliente que já é da CA (`soBoasVindas`):
   * sem documentos e com as boas-vindas já liberadas (20/10/2026, pedido de Gabriel).
   */
  const gerar = useMutation({
    mutationFn: async ({ soBoasVindas, ...lista }: ListaPadrao & { soBoasVindas?: boolean }) => {
      const { error: e2 } = await supabase.from('onboarding_links').insert({
        company_id: activeCompanyId!, contact_id: contactId, token: novoToken(), tem_funcionarios: lista.temFuncionarios,
        ...(soBoasVindas ? { boas_vindas_liberada: true, prazo_envio: null } : {}),
      });
      if (e2) throw e2;
      return soBoasVindas ? null : await copiarListaPadrao(lista);
    },
    onSuccess: n => {
      recarregar();
      toast.success(n === null ? 'Link de boas-vindas criado' : `Link criado com ${n} documento(s)`);
    },
    onError: (e: Error) => toast.error('Erro ao criar o link', { description: e.message }),
  });

  /** Link já existente sem documentos (só boas-vindas): passa a pedir a lista padrão. */
  const incluirListaPadrao = useMutation({
    mutationFn: async (lista: ListaPadrao) => {
      const n = await copiarListaPadrao(lista);
      const { error } = await supabase.from('onboarding_links')
        .update({ tem_funcionarios: lista.temFuncionarios, prazo_envio: new Date(Date.now() + 60 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), updated_at: new Date().toISOString() })
        .eq('contact_id', contactId);
      if (error) throw error;
      return n;
    },
    onSuccess: n => { recarregar(); toast.success(`${n} documento(s) incluídos no link`); },
    onError: (e: Error) => toast.error('Erro ao incluir a lista', { description: e.message }),
  });

  const atualizarLink = useMutation({
    mutationFn: async (campos: Partial<Pick<LinkCliente, 'prazo_envio' | 'boas_vindas_liberada' | 'tem_funcionarios' | 'mensagem_assunto' | 'mensagem_texto'>> & { revogar?: boolean; trocarToken?: boolean }) => {
      const { revogar, trocarToken, ...resto } = campos;
      const update: Record<string, unknown> = { ...resto, updated_at: new Date().toISOString() };
      if (revogar) update.revogado_em = new Date().toISOString();
      if (trocarToken) { update.token = novoToken(); update.revogado_em = null; }
      const { error } = await supabase.from('onboarding_links').update(update).eq('contact_id', contactId);
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e: Error) => toast.error('Erro ao atualizar o link', { description: e.message }),
  });

  const atualizarDocumento = useMutation({
    mutationFn: async ({ id, ...campos }: { id: string; status?: DocumentoCliente['status']; observacao?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('onboarding_documentos').update({
        ...campos, revisado_por: user?.id ?? null, revisado_em: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chaveDocs }),
    onError: (e: Error) => toast.error('Erro ao atualizar', { description: e.message }),
  });

  const adicionarDocumento = useMutation({
    mutationFn: async ({ titulo, descricao }: { titulo: string; descricao?: string | null }) => {
      const ordem = (documentos.at(-1)?.ordem ?? 0) + 1;
      const { error } = await supabase.from('onboarding_documentos').insert({
        company_id: activeCompanyId!, contact_id: contactId, titulo, descricao: descricao || null, ordem,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: chaveDocs }); toast.success('Documento adicionado'); },
    onError: (e: Error) => toast.error('Erro ao adicionar', { description: e.message }),
  });

  const baixar = async (arquivo: ArquivoDocumento) => {
    const { data, error } = await supabase.storage.from(BUCKET_ONBOARDING).createSignedUrl(arquivo.caminho, 300, { download: arquivo.nome });
    if (error || !data) { toast.error('Não foi possível abrir o arquivo'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return { link, documentos, isLoading, gerar, incluirListaPadrao, atualizarLink, atualizarDocumento, adicionarDocumento, baixar };
}
