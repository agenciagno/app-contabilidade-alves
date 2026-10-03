import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Card de tarefas de UM cliente: ver o que falta e atualizar (cliente novo, cliente esquecido, obrigação ou data que mudou).
// Considera os meses já aprovados no Calendário Fiscal, do mês corrente em diante. Nunca mexe em tarefa em andamento ou concluída.

export interface PlanoCardCliente {
  mes_aprovado: boolean;
  ativo: boolean;
  criar: { obrigacao: string; ano: number; mes: number; vencimento: string; sem_responsavel: boolean; setor: string | null }[];
  remover: { obrigacao: string; status: string; intocada: boolean }[];
  datas: { obrigacao: string; de: string | null; para: string }[];
  preservadas: number;
  aplicado?: boolean;
  criadas: number;
  removidas: number;
  atualizadas: number;
}

export function useCardCliente(contactId: string) {
  return useQuery<PlanoCardCliente>({
    queryKey: ['fiscal-cliente-tarefas', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_cliente_tarefas', { p_contact_id: contactId, p_aplicar: false });
      if (error) throw error;
      return data as PlanoCardCliente;
    },
  });
}

export function useAtualizarCardCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { data, error } = await (supabase as any).rpc('fiscal_cliente_tarefas', { p_contact_id: contactId, p_aplicar: true });
      if (error) throw error;
      return data as PlanoCardCliente;
    },
    onSuccess: (r) => {
      const partes = [
        r.criadas ? `${r.criadas} criada${r.criadas === 1 ? '' : 's'}` : null,
        r.removidas ? `${r.removidas} removida${r.removidas === 1 ? '' : 's'}` : null,
        r.atualizadas ? `${r.atualizadas} data${r.atualizadas === 1 ? '' : 's'} acertada${r.atualizadas === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      toast.success(partes.length ? `Card atualizado: ${partes.join(', ')}.` : 'Card já estava em dia.');
      for (const k of ['fiscal-cliente-tarefas', 'fiscal-clientes-sem-tarefas', 'calendario-resumo', 'fiscal-tasks']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar o card do cliente'),
  });
}

export interface ClienteSemTarefas {
  contact_id: string;
  nome: string;
  regime: string | null;
  faltando: string[];
  sem_responsavel: string[];
}

/** Clientes ativos com obrigação marcada e sem tarefa no mês (cliente novo ou esquecido). */
export function useClientesSemTarefas(year: number, month: number, enabled: boolean) {
  return useQuery<ClienteSemTarefas[]>({
    queryKey: ['fiscal-clientes-sem-tarefas', year, month],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fiscal_clientes_sem_tarefas', { p_ano: year, p_mes: month });
      if (error) throw error;
      return (data ?? []) as ClienteSemTarefas[];
    },
  });
}
