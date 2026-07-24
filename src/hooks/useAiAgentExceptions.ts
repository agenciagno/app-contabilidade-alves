import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/hooks/useCompany';

export interface AiAgentException {
  id: string;
  company_id: string;
  data: string;
  motivo: string | null;
  mensagem_custom: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type AiAgentExceptionInput = Omit<
  AiAgentException,
  'id' | 'company_id' | 'created_at' | 'updated_at'
>;

export function useAiAgentExceptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['ai-agent-exceptions', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AiAgentException[]> => {
      const { data, error } = await supabase
        .from('ai_agent_exceptions')
        .select('*')
        .eq('company_id', companyId!)
        .order('data', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiAgentException[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-agent-exceptions'] });

  const create = useMutation({
    mutationFn: async (input: AiAgentExceptionInput) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const { error } = await supabase
        .from('ai_agent_exceptions')
        .insert({ ...input, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Exceção criada!' }); },
    onError: (e: Error) => toast({ title: 'Erro ao criar exceção', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AiAgentExceptionInput> & { id: string }) => {
      const { error } = await supabase.from('ai_agent_exceptions').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Exceção atualizada!' }); },
    onError: (e: Error) => toast({ title: 'Erro ao atualizar exceção', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_agent_exceptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Exceção removida.' }); },
    onError: (e: Error) => toast({ title: 'Erro ao remover exceção', description: e.message, variant: 'destructive' }),
  });

  return { ...query, exceptions: query.data ?? [], create, update, remove };
}
