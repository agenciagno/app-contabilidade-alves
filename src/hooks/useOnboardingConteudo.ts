import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';

/**
 * Conteúdo editável do link do cliente (17/10/2026): a lista padrão de documentos (antes) e os textos da página (antes e depois,
 * por regime). Editado em Tech → Onboarding; cada cliente recebe uma cópia da lista quando o link é gerado.
 */
export type FluxoDocumento = 'cnpj_existente' | 'abertura';

export interface DocumentoModelo {
  id: string;
  fluxo: FluxoDocumento;
  titulo: string;
  descricao: string | null;
  so_com_funcionarios: boolean;
  regimes: string[] | null;
  ordem: number;
  ativo: boolean;
}

export interface TextoOnboarding {
  id: string;
  chave: string;
  titulo: string;
  conteudo: string;
  ordem: number;
}

export function useDocumentosModelo() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const chave = ['onboarding-documentos-modelo', activeCompanyId];

  const { data: modelos = [], isLoading } = useQuery({
    queryKey: chave,
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_documentos_modelo')
        .select('id, fluxo, titulo, descricao, so_com_funcionarios, regimes, ordem, ativo')
        .eq('company_id', activeCompanyId!)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as DocumentoModelo[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (m: Partial<DocumentoModelo> & { fluxo: FluxoDocumento; titulo: string }) => {
      const { id, ...campos } = m;
      const { error } = id
        ? await supabase.from('onboarding_documentos_modelo').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id)
        : await supabase.from('onboarding_documentos_modelo').insert({ ...campos, company_id: activeCompanyId! });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: chave }); toast.success('Lista atualizada'); },
    onError: (e: Error) => toast.error('Erro ao salvar', { description: e.message }),
  });

  /** Troca a ordem de dois itens (setas subir/descer). */
  const trocarOrdem = useMutation({
    mutationFn: async ([a, b]: [DocumentoModelo, DocumentoModelo]) => {
      const r1 = await supabase.from('onboarding_documentos_modelo').update({ ordem: b.ordem }).eq('id', a.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('onboarding_documentos_modelo').update({ ordem: a.ordem }).eq('id', b.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: (e: Error) => toast.error('Erro ao reordenar', { description: e.message }),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('onboarding_documentos_modelo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: chave }); toast.success('Item removido da lista'); },
    onError: (e: Error) => toast.error('Erro ao remover', { description: e.message }),
  });

  return { modelos, isLoading, salvar, trocarOrdem, apagar };
}

export function useTextosOnboarding() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const chave = ['onboarding-textos', activeCompanyId];

  const { data: textos = [], isLoading } = useQuery({
    queryKey: chave,
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_textos')
        .select('id, chave, titulo, conteudo, ordem')
        .eq('company_id', activeCompanyId!)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as TextoOnboarding[];
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ id, conteudo }: { id: string; conteudo: string }) => {
      const { error } = await supabase.from('onboarding_textos').update({ conteudo, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: chave }); toast.success('Texto salvo'); },
    onError: (e: Error) => toast.error('Erro ao salvar', { description: e.message }),
  });

  return { textos, isLoading, salvar };
}
