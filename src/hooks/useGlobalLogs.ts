import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type GlobalLogAction = 
  | 'ADICAO'
  | 'EXCLUSAO'
  | 'ALTERACAO'
  | 'DOWNLOAD'
  | 'UPLOAD'
  | 'LOGIN';

export type GlobalLogModule = 
  | 'FINANCEIRO'
  | 'CRM'
  | 'BANCOS'
  | 'EVENTOS_CONTABEIS'
  | 'RECORRENTES'
  | 'DOCUMENTOS'
  | 'USUARIOS'
  | 'EMPRESA'
  | 'AUTH';

export interface GlobalLog {
  id: string;
  company_id: string;
  user_id: string;
  user_name: string | null;
  action: GlobalLogAction;
  module: GlobalLogModule;
  entity_id: string | null;
  entity_name: string | null;
  details: string;
  created_at: string;
}

interface CreateGlobalLogParams {
  action: GlobalLogAction;
  module: GlobalLogModule;
  entityId?: string;
  entityName?: string;
  details: string;
}

export async function createGlobalLog(params: CreateGlobalLogParams) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      console.error('User not authenticated for global log');
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, full_name, username')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      console.error('Profile not found for global log');
      return null;
    }

    const userName = profile.full_name || profile.username || 'Usuário';

    const { data, error } = await supabase
      .from('global_logs')
      .insert({
        company_id: profile.company_id,
        user_id: userData.user.id,
        user_name: userName,
        action: params.action,
        module: params.module,
        entity_id: params.entityId || null,
        entity_name: params.entityName || null,
        details: params.details,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating global log:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createGlobalLog:', error);
    return null;
  }
}

export function useGlobalLogs(filters?: { userId?: string; module?: string }) {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['global-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('global_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.module) {
        query = query.eq('module', filters.module);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as GlobalLog[];
    },
  });

  const invalidateLogs = () => {
    queryClient.invalidateQueries({ queryKey: ['global-logs'] });
  };

  return {
    logs,
    isLoading,
    error,
    invalidateLogs,
  };
}

export function useCompanyUsers() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, username, email')
        .order('full_name');

      if (error) throw error;
      return data;
    },
  });

  return { users, isLoading };
}
