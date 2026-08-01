import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';
import type { Diagnostico } from '@/lib/rt/types';

export interface RtSimulation {
  id: string;
  company_id: string;
  contact_id: string | null;
  nome_referencia: string | null;
  setor: string;
  regime_atual: string;
  anexo_simples: string | null;
  faturamento_12m: number;
  aliquota_cbs: number;
  aliquota_ibs: number;
  aliquota_fonte: string;
  resultado: Diagnostico;
  created_at: string;
  contacts?: { name: string } | null;
}

export interface SalvarSimulacaoInput {
  contactId: string | null;
  nomeReferencia: string | null;
  diagnostico: Diagnostico;
  cnae?: { codigo?: string; descricao?: string } | null;
  uf?: string | null;
  municipio?: string | null;
  aliquotaFonte: string;
}

export function useRtSimulations(contactId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['rt-simulations', companyId, contactId ?? 'todas'],
    enabled: !!companyId,
    queryFn: async (): Promise<RtSimulation[]> => {
      let q = supabase
        .from('rt_simulations')
        .select('*, contacts(name)')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (contactId) q = q.eq('contact_id', contactId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RtSimulation[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (input: SalvarSimulacaoInput) => {
      if (!companyId) throw new Error('Empresa não identificada');
      const { data: userData } = await supabase.auth.getUser();
      const d = input.diagnostico;

      const { data, error } = await supabase
        .from('rt_simulations')
        .insert({
          company_id: companyId,
          contact_id: input.contactId,
          nome_referencia: input.nomeReferencia,
          setor: d.input.setor,
          cnae_codigo: input.cnae?.codigo ?? null,
          cnae_descricao: input.cnae?.descricao ?? null,
          regime_atual: d.input.regimeAtual,
          anexo_simples: d.atual.anexo ?? null,
          uf: input.uf ?? null,
          municipio: input.municipio ?? null,
          faturamento_12m: d.input.faturamento12m,
          folha_12m: d.input.folha12m ?? null,
          pct_b2b: d.input.pctB2B ?? null,
          aliquota_icms: d.input.aliquotaIcms ?? null,
          aliquota_iss: d.input.aliquotaIss ?? null,
          aliquota_cbs: d.input.aliquotaCbs * 100,
          aliquota_ibs: d.input.aliquotaIbs * 100,
          aliquota_fonte: input.aliquotaFonte,
          resultado: d as unknown as never,
          created_by: userData?.user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // O checklist de prontidão RT já tem o campo `simulacao` esperando por isto.
      // A linha pode não existir ainda — a tabela nasceu vazia.
      if (input.contactId) {
        const { data: existente } = await supabase
          .from('client_rt_checklist')
          .select('id')
          .eq('contact_id', input.contactId)
          .maybeSingle();

        if (existente?.id) {
          await supabase
            .from('client_rt_checklist')
            .update({ simulacao: true, updated_by: userData?.user?.id ?? null })
            .eq('id', existente.id);
        } else {
          await supabase.from('client_rt_checklist').insert({
            company_id: companyId,
            contact_id: input.contactId,
            simulacao: true,
            updated_by: userData?.user?.id ?? null,
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rt-simulations'] });
      toast({ title: 'Diagnóstico salvo!' });
    },
    onError: (e: Error) =>
      toast({ title: 'Erro ao salvar diagnóstico', description: e.message, variant: 'destructive' }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rt_simulations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rt-simulations'] });
      toast({ title: 'Diagnóstico excluído' });
    },
    onError: (e: Error) =>
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' }),
  });

  return { simulacoes: query.data ?? [], ...query, salvar, excluir };
}
