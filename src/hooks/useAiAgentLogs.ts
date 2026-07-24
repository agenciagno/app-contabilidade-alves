import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface AiAgentLog {
  id: string;
  company_id: string;
  chatwoot_conversation_id: number | null;
  contact_id: string | null;
  telefone: string | null;
  mensagem_recebida: string | null;
  resposta_ia: string | null;
  setor_identificado: string | null;
  responsavel_atribuido_id: string | null;
  coverage_aplicada: boolean;
  status: string;
  created_at: string;
}

export interface AiAgentLogsFilters {
  dataInicio?: string;
  dataFim?: string;
  setor?: string;
  status?: string;
}

const PAGE_SIZE = 20;

export function useAiAgentLogs(page: number, filters: AiAgentLogsFilters) {
  const { company } = useCompany();
  const companyId = company?.id as string | undefined;

  const query = useQuery({
    queryKey: ['ai-agent-logs', companyId, page, filters],
    enabled: !!companyId,
    queryFn: async (): Promise<{ rows: AiAgentLog[]; total: number }> => {
      let q = supabase
        .from('ai_agent_logs')
        .select('*', { count: 'exact' })
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });

      if (filters.dataInicio) q = q.gte('created_at', `${filters.dataInicio}T00:00:00`);
      if (filters.dataFim) q = q.lte('created_at', `${filters.dataFim}T23:59:59`);
      if (filters.setor) q = q.eq('setor_identificado', filters.setor);
      if (filters.status) q = q.eq('status', filters.status);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as AiAgentLog[], total: count ?? 0 };
    },
  });

  return {
    ...query,
    logs: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    pageSize: PAGE_SIZE,
  };
}
