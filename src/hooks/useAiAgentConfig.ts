import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';

export interface AiAgentConfig {
  id: string;
  company_id: string;
  is_active: boolean;
  tom_de_voz: string | null;
  diretrizes: string | null;
  mensagem_saudacao: string | null;
  mensagem_handoff_template: string | null;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: number[];
  mensagem_fora_horario: string | null;
  mensagem_feriado: string | null;
  stop_keyword: string;
  created_at: string;
  updated_at: string;
}

export type AiAgentConfigInput = Partial<
  Omit<AiAgentConfig, 'id' | 'company_id' | 'created_at' | 'updated_at'>
>;

export function useAiAgentConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['ai-agent-config', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AiAgentConfig | null> => {
      const { data, error } = await supabase
        .from('ai_agent_config')
        .select('*')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as AiAgentConfig | null;
    },
  });

  const update = useMutation({
    mutationFn: async (input: AiAgentConfigInput) => {
      if (!query.data?.id) throw new Error('Configuração não encontrada');
      const { error } = await supabase
        .from('ai_agent_config')
        .update(input)
        .eq('id', query.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-config'] });
      toast({ title: 'Configuração salva!' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar configuração', description: e.message, variant: 'destructive' }),
  });

  return { ...query, config: query.data ?? null, update };
}
