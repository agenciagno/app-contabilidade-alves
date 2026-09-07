import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetch-all';
import { useCompany } from '@/hooks/useCompany';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';
import { TAX_REGIMES } from '@/constants/taxRegimes';

interface EligibleContact {
  id: string;
  name: string;
  responsible_id: string | null;
  tax_regime: string | null;
}

export const regimeLabel = (value: string | null) => {
  if (!value) return 'Sem regime';
  return TAX_REGIMES.find((r) => r.value === value)?.label ?? value;
};

/**
 * Breakdown do que o RPC generate_monthly_fiscal_tasks vai criar: mesmo critério de
 * elegibilidade (is_active, responsible_id no setor da obrigação, categoria 'cliente')
 * e mesmo vínculo real via client_obligations — não usar fiscal_obligations_catalog.applies_to
 * pra contar clientes, porque isso é metadado da obrigação, não o vínculo efetivo.
 * Compartilhado entre o preview de Pré-lançamento e o modal de seleção de regime.
 */
export function useCalendarLaunchBreakdown(rows: FiscalCalendarEffectiveRow[]) {
  const { company } = useCompany();
  const companyId = company?.id;

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<EligibleContact[]>({
    queryKey: ['fiscal-eligible-contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, responsible_id, tax_regime')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('responsible_id', 'is', null)
        .contains('categorias', ['cliente']);
      if (error) throw error;
      return (data ?? []) as EligibleContact[];
    },
    enabled: !!companyId,
  });

  const { data: clientObligations = [], isLoading: clientObligationsLoading } = useQuery<
    { obligation_id: string; contact_id: string }[]
  >({
    queryKey: ['client-obligations-all', companyId],
    queryFn: async () =>
      // fetchAllPages: a tabela já passa de 1000 linhas — sem isso o PostgREST
      // corta e o preview subconta clientes por obrigação.
      fetchAllPages<{ obligation_id: string; contact_id: string }>(() =>
        supabase
          .from('client_obligations')
          .select('obligation_id, contact_id')
          .eq('company_id', companyId!)
          .order('id', { ascending: true })
      ),
    enabled: !!companyId,
  });

  const { data: profiles = [] } = useQuery<{ id: string; full_name: string | null; email: string | null }[]>({
    queryKey: ['profiles-min', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const profileName = (id: string | null) => {
    if (!id) return 'Sem responsável';
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email?.split('@')[0] || 'Desconhecido';
  };

  const breakdown = useMemo(() => {
    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const perObligation = rows.map((r) => {
      const linkedContactIds = clientObligations
        .filter((co) => co.obligation_id === r.obligation_id)
        .map((co) => co.contact_id);
      const clients = linkedContactIds
        .map((id) => contactsById.get(id))
        .filter((c): c is EligibleContact => !!c);
      return {
        id: r.id,
        name: r.fiscal_obligations_catalog?.name ?? '—',
        clientCount: clients.length,
        clients,
        adjustedDueDate: r.adjusted_due_date,
        internalDeliveryDate: r.internal_delivery_date,
      };
    });

    const byProfile = new Map<string, number>();
    const byRegime = new Map<string, { tasks: number; clients: Set<string> }>();
    let totalTasks = 0;
    const clientsTouched = new Set<string>();
    perObligation.forEach((o) => {
      o.clients.forEach((c) => {
        totalTasks += 1;
        clientsTouched.add(c.id);

        const profileKey = c.responsible_id ?? '__none__';
        byProfile.set(profileKey, (byProfile.get(profileKey) ?? 0) + 1);

        const regimeKey = c.tax_regime ?? '__none__';
        const entry = byRegime.get(regimeKey) ?? { tasks: 0, clients: new Set<string>() };
        entry.tasks += 1;
        entry.clients.add(c.id);
        byRegime.set(regimeKey, entry);
      });
    });

    const perCollaborator = Array.from(byProfile.entries())
      .map(([id, count]) => ({
        id: id === '__none__' ? null : id,
        name: id === '__none__' ? 'Sem responsável' : profileName(id),
        count,
        pct: totalTasks > 0 ? (count / totalTasks) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const perRegime = Array.from(byRegime.entries())
      .map(([regime, entry]) => ({
        regime: regime === '__none__' ? null : regime,
        label: regime === '__none__' ? 'Sem regime' : regimeLabel(regime),
        taskCount: entry.tasks,
        clientCount: entry.clients.size,
        pct: totalTasks > 0 ? (entry.tasks / totalTasks) * 100 : 0,
      }))
      .sort((a, b) => b.taskCount - a.taskCount);

    return {
      perObligation,
      perCollaborator,
      perRegime,
      totalTasks,
      clientCount: clientsTouched.size,
    };
  }, [rows, contacts, clientObligations, profiles]);

  return {
    ...breakdown,
    loading: contactsLoading || clientObligationsLoading,
  };
}
