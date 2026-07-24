import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';

export interface AiAgentRoutingRule {
  id: string;
  company_id: string;
  setor: string;
  palavras_chave: string[];
  usa_responsavel_cliente: boolean;
  coluna_responsavel: string | null;
  chatwoot_team_id: number | null;
  chatwoot_agent_id: number | null;
  prioridade: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type AiAgentRoutingRuleInput = Omit<
  AiAgentRoutingRule,
  'id' | 'company_id' | 'created_at' | 'updated_at'
>;

export const SETORES: { value: string; label: string }[] = [
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'dp', label: 'DP' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'contabil', label: 'Contábil' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'design', label: 'Design' },
  { value: 'outro', label: 'Outro' },
];

export const COLUNAS_RESPONSAVEL: { value: string; label: string }[] = [
  { value: 'responsible_id', label: 'Fiscal (responsible_id)' },
  { value: 'dp_responsible_id', label: 'DP' },
  { value: 'financeiro_responsible_id', label: 'Financeiro' },
  { value: 'contabil_responsible_id', label: 'Contábil' },
  { value: 'comercial_responsible_id', label: 'Comercial' },
];

export function useAiAgentRoutingRules() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['ai-agent-routing-rules', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AiAgentRoutingRule[]> => {
      const { data, error } = await supabase
        .from('ai_agent_routing_rules')
        .select('*')
        .eq('company_id', companyId!)
        .order('prioridade', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiAgentRoutingRule[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-agent-routing-rules'] });

  const create = useMutation({
    mutationFn: async (input: AiAgentRoutingRuleInput) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { error } = await supabase
        .from('ai_agent_routing_rules')
        .insert({ ...input, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Regra criada!' }); },
    onError: (e: Error) => toast({ title: 'Erro ao criar regra', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AiAgentRoutingRuleInput> & { id: string }) => {
      const { error } = await supabase.from('ai_agent_routing_rules').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Regra atualizada!' }); },
    onError: (e: Error) => toast({ title: 'Erro ao atualizar regra', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_agent_routing_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Regra removida.' }); },
    onError: (e: Error) => toast({ title: 'Erro ao remover regra', description: e.message, variant: 'destructive' }),
  });

  return { ...query, rules: query.data ?? [], create, update, remove };
}
