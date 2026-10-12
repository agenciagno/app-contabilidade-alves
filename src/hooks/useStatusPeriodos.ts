import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StatusPeriodo {
  id: string;
  status: string;
  inicio: string | null;
  fim: string | null;
  origem: 'manual' | 'receita' | 'sistema' | 'historico';
  motivo: string | null;
  registrado_por_nome: string | null;
  created_at: string;
}

export const ORIGEM_PERIODO_LABEL: Record<StatusPeriodo['origem'], string> = {
  manual: 'Manual',
  receita: 'Receita Federal',
  sistema: 'Sistema',
  historico: 'Sem registro',
};

/**
 * Períodos de status do cliente (tabela `cliente_status_periodos`, 12/10/2026). Só leitura: o trigger do banco abre e fecha os
 * períodos quando `contacts.status_cliente` muda. Vigente primeiro, depois do mais novo para o mais antigo.
 */
export function useStatusPeriodos(contactId: string | undefined) {
  return useQuery({
    queryKey: ['cliente-status-periodos', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<StatusPeriodo[]> => {
      const { data, error } = await (supabase as any)
        .from('cliente_status_periodos')
        .select('id, status, inicio, fim, origem, motivo, registrado_por_nome, created_at')
        .eq('contact_id', contactId)
        .order('fim', { ascending: false, nullsFirst: true })
        .order('inicio', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StatusPeriodo[];
    },
  });
}

export interface TarefaDispensada {
  id: string;
  periodo_id: string | null;
  competence_year: number;
  competence_month: number;
  due_date: string | null;
  motivo: 'saiu_do_ativo' | 'mes_ja_gerado_sem_o_cliente' | 'limpeza';
  status_cliente: string | null;
  created_at: string;
  fiscal_obligations_catalog: { name: string } | null;
}

/**
 * Tarefas apagadas (ou nunca geradas) por o cliente estar fora do Ativo (tabela `fiscal_tarefas_dispensadas`, 12/10/2026).
 * É o registro do "não entregue porque estava suspenso". Só leitura.
 */
export function useTarefasDispensadas(contactId: string | undefined) {
  return useQuery({
    queryKey: ['cliente-tarefas-dispensadas', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<TarefaDispensada[]> => {
      const { data, error } = await (supabase as any)
        .from('fiscal_tarefas_dispensadas')
        .select('id, periodo_id, competence_year, competence_month, due_date, motivo, status_cliente, created_at, fiscal_obligations_catalog:obligation_id(name)')
        .eq('contact_id', contactId)
        .order('competence_year', { ascending: false })
        .order('competence_month', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as TarefaDispensada[];
    },
  });
}

export interface ClienteForaDeAtendimento {
  id: string;
  contact_id: string;
  status: string;
  inicio: string | null;
  motivo: string | null;
  origem: StatusPeriodo['origem'];
  contacts: { name: string; display_name: string | null; razao_social: string | null; document: string | null } | null;
}

/** Clientes cujo período vigente não é "Ativo" (qualquer status: Suspensa, Inapta, Cancelada, Baixada, Ex-cliente, Ex-Colaborador). */
export function useClientesForaDeAtendimento() {
  return useQuery({
    queryKey: ['clientes-fora-de-atendimento'],
    queryFn: async (): Promise<ClienteForaDeAtendimento[]> => {
      const { data, error } = await (supabase as any)
        .from('cliente_status_periodos')
        .select('id, contact_id, status, inicio, motivo, origem, contacts:contact_id(name, display_name, razao_social, document)')
        .is('fim', null)
        .neq('status', 'Ativo')
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ClienteForaDeAtendimento[];
    },
  });
}
