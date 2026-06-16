import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';

export interface CoverageRow {
  id: string;
  company_id: string;
  absent_profile_id: string;
  covering_profile_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  notes: string | null;
  is_active: boolean;
  tasks_transferred: number;
  clients_transferred: string[];
  auto_reverted_at: string | null;
  reverted_by: string | null;
  revert_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  absent_profile?: { id: string; full_name: string | null; user_id: string } | null;
  covering_profile?: { id: string; full_name: string | null; user_id: string } | null;
  reverted_by_profile?: { id: string; full_name: string | null } | null;
}

export interface AbsentClient {
  id: string;
  name: string | null;
  tax_regime: string | null;
  obligations_count: number;
}

/** All coverage history for the current company, ordered: active first, then by created_at DESC */
export function useTransferHistory() {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<CoverageRow[]>({
    queryKey: ['temporary-transfers', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('collaborator_coverage')
        .select(`
          *,
          absent_profile:absent_profile_id ( id, full_name, user_id ),
          covering_profile:covering_profile_id ( id, full_name, user_id ),
          reverted_by_profile:reverted_by ( id, full_name )
        `)
        .eq('company_id', companyId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
  });
}

/** Distinct active-clients of an absent profile (via fiscal_tasks not concluded). */
export function useAbsentProfileClients(absentProfileId: string | null) {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<AbsentClient[]>({
    queryKey: ['absent-profile-clients', companyId, absentProfileId],
    enabled: !!companyId && !!absentProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('contact_id, status, contacts:contact_id ( id, name, tax_regime )')
        .eq('company_id', companyId)
        .eq('responsible_id', absentProfileId)
        .neq('status', 'concluido');
      if (error) throw error;
      const map = new Map<string, AbsentClient>();
      (data ?? []).forEach((row: any) => {
        const c = row.contacts;
        if (!c) return;
        const cur = map.get(c.id);
        if (cur) {
          cur.obligations_count += 1;
        } else {
          map.set(c.id, {
            id: c.id,
            name: c.name,
            tax_regime: c.tax_regime,
            obligations_count: 1,
          });
        }
      });
      return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    },
  });
}

/** Map contact_id -> active coverage info (for "Temporário até DD/MM" badge). */
export function useActiveCoverageByContact() {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery<Record<string, { end_date: string; covering_profile_id: string; absent_profile_id: string }>>({
    queryKey: ['active-coverage-by-contact', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('collaborator_coverage')
        .select('end_date, covering_profile_id, absent_profile_id, clients_transferred')
        .eq('company_id', companyId)
        .eq('is_active', true);
      if (error) throw error;
      const map: Record<string, { end_date: string; covering_profile_id: string; absent_profile_id: string }> = {};
      (data ?? []).forEach((row: any) => {
        const ids: string[] = row.clients_transferred ?? [];
        ids.forEach((id) => {
          map[id] = {
            end_date: row.end_date,
            covering_profile_id: row.covering_profile_id,
            absent_profile_id: row.absent_profile_id,
          };
        });
      });
      return map;
    },
  });
}

export interface CreateTransferInput {
  absent_profile_id: string;
  covering_profile_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  notes: string | null;
  client_ids: string[];
  absent_name: string;
  covering_name: string;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function useCreateTemporaryTransfer() {
  const { company } = useCompany();
  const { profile } = useProfile();
  const companyId = company?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      if (!companyId) throw new Error('No company');
      if (!profile?.id) throw new Error('No profile');

      // 1. Insert coverage
      const { data: cov, error: e1 } = await (supabase as any)
        .from('collaborator_coverage')
        .insert({
          company_id: companyId,
          absent_profile_id: input.absent_profile_id,
          covering_profile_id: input.covering_profile_id,
          start_date: input.start_date,
          end_date: input.end_date,
          reason: input.reason,
          notes: input.notes,
          clients_transferred: input.client_ids,
          created_by: profile.id,
          is_active: true,
        })
        .select('id')
        .single();
      if (e1) throw e1;

      // 2. Reassign tasks
      const { data: updatedTasks, error: e2 } = await (supabase as any)
        .from('fiscal_tasks')
        .update({ responsible_id: input.covering_profile_id })
        .eq('company_id', companyId)
        .eq('responsible_id', input.absent_profile_id)
        .in('contact_id', input.client_ids)
        .in('status', ['a_fazer', 'em_progresso', 'aguardando_cliente'])
        .select('id');
      if (e2) throw e2;

      const taskCount = updatedTasks?.length ?? 0;

      await (supabase as any)
        .from('collaborator_coverage')
        .update({ tasks_transferred: taskCount })
        .eq('id', cov.id);

      // 3. Notifications — need user_ids for both profiles
      const { data: profs } = await (supabase as any)
        .from('profiles')
        .select('id, user_id')
        .in('id', [input.absent_profile_id, input.covering_profile_id]);
      const absent = profs?.find((p: any) => p.id === input.absent_profile_id);
      const covering = profs?.find((p: any) => p.id === input.covering_profile_id);
      const periodTxt = `${fmtDate(input.start_date)} até ${fmtDate(input.end_date)}`;

      const notifs: any[] = [];
      if (covering?.user_id) {
        notifs.push({
          user_id: covering.user_id,
          company_id: companyId,
          type: 'transfer_start',
          title: 'Transferência recebida',
          body: `Você recebeu ${input.client_ids.length} cliente(s) de ${input.absent_name} (${periodTxt}).`,
          action_url: '/fiscal/colaboradores',
          reference_type: 'coverage',
          reference_id: cov.id,
        });
      }
      if (absent?.user_id) {
        notifs.push({
          user_id: absent.user_id,
          company_id: companyId,
          type: 'transfer_start',
          title: 'Clientes transferidos',
          body: `Seus ${input.client_ids.length} cliente(s) foram transferidos para ${input.covering_name} (${periodTxt}).`,
          action_url: '/fiscal/colaboradores',
          reference_type: 'coverage',
          reference_id: cov.id,
        });
      }
      if (notifs.length) {
        await (supabase as any).from('notifications').insert(notifs);
      }

      return { coverageId: cov.id, taskCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['active-coverage-by-contact'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['collaborators-with-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-count-by-profile'] });
      queryClient.invalidateQueries({ queryKey: ['absent-profile-clients'] });
    },
  });
}

export function useRevertTransfer() {
  const { profile } = useProfile();
  const { company } = useCompany();
  const companyId = company?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ coverage, reason }: { coverage: CoverageRow; reason: string }) => {
      if (!profile?.id) throw new Error('No profile');

      // 1. Revert tasks
      const clientIds = coverage.clients_transferred ?? [];
      let taskCount = 0;
      if (clientIds.length) {
        const { data: tasks, error: e1 } = await (supabase as any)
          .from('fiscal_tasks')
          .update({ responsible_id: coverage.absent_profile_id })
          .eq('responsible_id', coverage.covering_profile_id)
          .in('contact_id', clientIds)
          .in('status', ['a_fazer', 'em_progresso', 'aguardando_cliente'])
          .select('id');
        if (e1) throw e1;
        taskCount = tasks?.length ?? 0;
      }

      // 2. Update coverage row
      const { error: e2 } = await (supabase as any)
        .from('collaborator_coverage')
        .update({
          is_active: false,
          reverted_by: profile.id,
          revert_reason: reason,
          auto_reverted_at: new Date().toISOString(),
        })
        .eq('id', coverage.id);
      if (e2) throw e2;

      // 3. Notifications
      const notifs: any[] = [];
      const absentUserId = coverage.absent_profile?.user_id;
      const coveringUserId = coverage.covering_profile?.user_id;
      const count = clientIds.length;
      const absentName = coverage.absent_profile?.full_name ?? 'colaborador';
      const coveringName = coverage.covering_profile?.full_name ?? 'colaborador';

      if (absentUserId) {
        notifs.push({
          user_id: absentUserId,
          company_id: companyId,
          type: 'transfer_end',
          title: 'Cobertura revertida',
          body: `Seus ${count} cliente(s) voltaram de ${coveringName}. Motivo: ${reason}`,
          action_url: '/fiscal/colaboradores',
          reference_type: 'coverage',
          reference_id: coverage.id,
        });
      }
      if (coveringUserId) {
        notifs.push({
          user_id: coveringUserId,
          company_id: companyId,
          type: 'transfer_end',
          title: 'Cobertura encerrada',
          body: `${count} cliente(s) de ${absentName} foram devolvidos antes da data. Motivo: ${reason}`,
          action_url: '/fiscal/colaboradores',
          reference_type: 'coverage',
          reference_id: coverage.id,
        });
      }
      if (notifs.length) {
        await (supabase as any).from('notifications').insert(notifs);
      }

      return { taskCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['active-coverage-by-contact'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['collaborators-with-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-count-by-profile'] });
    },
  });
}

export const REASON_LABELS: Record<string, string> = {
  ferias: 'Férias',
  licenca_medica: 'Licença médica',
  afastamento: 'Afastamento',
  redistribuicao: 'Redistribuição temporária',
  outro: 'Outro',
};
