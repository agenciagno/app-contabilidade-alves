import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';

// supabase-js não expõe o corpo da resposta em `data` quando a function
// devolve um status não-2xx (só o `error` genérico "non-2xx status code") —
// o detalhe real que a function mandou em { error: "..." } só existe dentro
// de `error.context` (a Response bruta). Sem isso, todo erro de edge function
// aparece igual pro usuário, sem pista do que houve.
async function invocarFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let mensagem: string | null = null;
    if (error instanceof FunctionsHttpError) {
      try {
        const detalhe = await error.context.json();
        mensagem = detalhe?.error ?? null;
      } catch {
        // corpo não era JSON — segue com a mensagem genérica do error abaixo.
      }
    }
    throw new Error(mensagem ?? error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export interface ClassificarInput {
  ncm?: string;
  descricao?: string;
  contactId?: string | null;
}

export interface NcmCandidato {
  codigo: string;
  descricao: string;
  score: number;
}

export interface CestCandidato {
  codigo: string;
  item: string;
  segmento: string;
  descricao: string;
  score: number;
}

export interface CclasstribInfo {
  codigo: string;
  nome: string | null;
  descricao: string;
  cst_vinculado: string | null;
  p_red_ibs: number | null;
  p_red_cbs: number | null;
  lc_214_25: string | null;
  confianca: 'alta' | 'padrão';
  fonte: string;
}

export interface CclasstribCandidatoLei {
  cclasstrib_codigo: string;
  cclasstrib_nome: string;
  anexo: string;
  item_lei: string;
  descricao_lei: string;
}

export interface CsosnOpcao {
  codigo: string;
  descricao: string;
}

export interface ClassificarResultado {
  classification_id: string | null;
  fonte?: 'acervo';
  resultado?: Record<string, unknown>;
  ncm: { codigo: string; descricao: string } | null;
  ncm_candidatos?: NcmCandidato[];
  cest_candidatos: CestCandidato[];
  cclasstrib_sugerido: CclasstribInfo | null;
  cclasstrib_candidatos: CclasstribCandidatoLei[];
  cst_ibs_cbs: string | null;
  csosn_sugerido: CsosnOpcao[];
  cfop_referencia: { codigo: string; descricao: string; aviso: string };
  contexto: { tax_regime?: string; setor_atuacao?: string; segmento_atuacao?: string; state?: string };
  avisos: string[];
}

export function useClassifyProduct() {
  return useMutation({
    mutationFn: (input: ClassificarInput) =>
      invocarFunction<ClassificarResultado>('classify-product', {
        ncm: input.ncm, descricao: input.descricao, contact_id: input.contactId,
      }),
  });
}

export interface ConfirmarInput {
  id: string;
  cest: string | null;
  cclasstrib: string | null;
  cstIbsCbs: string | null;
  csosn: string | null;
}

export function useConfirmarClassificacao() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConfirmarInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('fiscal_product_classifications')
        .update({
          cest: input.cest,
          cclasstrib: input.cclasstrib,
          cst_ibs_cbs: input.cstIbsCbs,
          csosn: input.csosn,
          status: 'confirmado',
          confirmado_por: userData?.user?.id ?? null,
          confirmado_em: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-classifications-history'] });
      toast({ title: 'Classificação confirmada — entra no acervo da equipe' });
    },
    onError: (e: Error) =>
      toast({ title: 'Erro ao confirmar', description: e.message, variant: 'destructive' }),
  });
}

export interface ContactNameFields {
  name: string;
  display_name: string | null;
  nome_fantasia: string | null;
  razao_social: string | null;
}

const CONTACT_NAME_SELECT = 'name, display_name, nome_fantasia, razao_social';

export interface FiscalClassificationRow {
  id: string;
  descricao_produto: string;
  ncm: string | null;
  cest: string | null;
  cclasstrib: string | null;
  cst_ibs_cbs: string | null;
  csosn: string | null;
  status: 'sugestao_ia' | 'confirmado';
  created_at: string;
  source_contact_id: string | null;
  contacts?: ContactNameFields | null;
}

export function useFiscalClassificationHistory() {
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['fiscal-classifications-history', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<FiscalClassificationRow[]> => {
      const { data, error } = await supabase
        .from('fiscal_product_classifications')
        .select(`*, contacts:source_contact_id(${CONTACT_NAME_SELECT})`)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as FiscalClassificationRow[];
    },
  });

  return { historico: query.data ?? [], ...query };
}

export interface ClassificarLoteInput {
  contactId: string;
  itens: Array<{ descricao?: string; ncm?: string; linha_original: Record<string, unknown> }>;
}

export interface ClassificarLoteResultado {
  batch_id: string;
  total_itens: number;
  resolvidos_automaticamente: number;
  precisam_revisao: number;
  arquivo_resultado_path: string;
}

export function useClassifyBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClassificarLoteInput) =>
      invocarFunction<ClassificarLoteResultado>('classify-batch', {
        contact_id: input.contactId, itens: input.itens,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-classification-batches'] });
    },
  });
}

export interface FiscalBatchRow {
  id: string;
  contact_id: string | null;
  status: 'processando' | 'concluido' | 'erro';
  total_itens: number;
  itens_confirmados: number;
  arquivo_resultado_path: string | null;
  created_at: string;
  contacts?: ContactNameFields | null;
}

export function useFiscalClassificationBatches() {
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['fiscal-classification-batches', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<FiscalBatchRow[]> => {
      const { data, error } = await supabase
        .from('fiscal_classification_batches')
        .select(`*, contacts:contact_id(${CONTACT_NAME_SELECT})`)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as FiscalBatchRow[];
    },
  });

  return { lotes: query.data ?? [], ...query };
}

export async function baixarPlanilhaLote(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('fiscal-classifications')
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
