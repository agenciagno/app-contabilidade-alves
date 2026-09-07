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
  tax_regime: string | null;
  responsible_id: string | null;
  dp_responsible_id: string | null;
  financeiro_responsible_id: string | null;
  contabil_responsible_id: string | null;
  comercial_responsible_id: string | null;
}

export const regimeLabel = (value: string | null) => {
  if (!value) return 'Sem regime';
  return TAX_REGIMES.find((r) => r.value === value)?.label ?? value;
};

/**
 * Mesma regra do RPC generate_monthly_fiscal_tasks: o responsável de uma obrigação
 * é o do SETOR dela (pessoal/financeiro/contábil/comercial), não sempre o Fiscal —
 * senão o preview e o filtro por colaborador contam errado obrigação de outro setor.
 */
function deptResponsibleId(contact: EligibleContact, department: string | null | undefined): string | null {
  switch (department) {
    case 'pessoal':
      return contact.dp_responsible_id;
    case 'financeiro':
      return contact.financeiro_responsible_id;
    case 'contabil':
      return contact.contabil_responsible_id;
    case 'comercial':
      return contact.comercial_responsible_id;
    default:
      return contact.responsible_id;
  }
}

interface GroupAccumulator {
  total: number;
  launched: number;
  clients: Set<string>;
  pendingClients: Set<string>;
}

function bump(map: Map<string, GroupAccumulator>, key: string, clientId: string, isLaunched: boolean) {
  const entry = map.get(key) ?? {
    total: 0,
    launched: 0,
    clients: new Set<string>(),
    pendingClients: new Set<string>(),
  };
  entry.total += 1;
  entry.clients.add(clientId);
  if (isLaunched) entry.launched += 1;
  else entry.pendingClients.add(clientId);
  map.set(key, entry);
}

/**
 * Breakdown do que o RPC generate_monthly_fiscal_tasks vai criar (e do que já foi
 * criado) pro período. Compartilhado entre o preview de Pré-lançamento e o modal de
 * seleção de regime/colaborador — os números precisam bater entre os dois.
 *
 * Lançamento é incremental: uma obrigação de um (cliente, obrigação) já lançada em
 * uma leva anterior (outro regime/colaborador) entra como "já lançada" e não conta
 * de novo em "pendente" — é exatamente o mesmo critério de dedup do RPC (NOT EXISTS
 * em fiscal_tasks por contact_id+obligation_id+competência).
 */
export function useCalendarLaunchBreakdown(rows: FiscalCalendarEffectiveRow[], year: number, month: number) {
  const { company } = useCompany();
  const companyId = company?.id;

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<EligibleContact[]>({
    queryKey: ['fiscal-eligible-contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(
          'id, name, tax_regime, responsible_id, dp_responsible_id, financeiro_responsible_id, contabil_responsible_id, comercial_responsible_id'
        )
        .eq('company_id', companyId!)
        .eq('is_active', true)
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

  const { data: existingTasks = [], isLoading: existingLoading } = useQuery<
    { contact_id: string; obligation_id: string }[]
  >({
    // Prefixo 'fiscal-tasks' de propósito: useConfirmMonthlyTasks já invalida
    // queryKey ['fiscal-tasks'] no onSuccess, isso cai junto sem invalidação extra.
    queryKey: ['fiscal-tasks', 'launch-existing', companyId, year, month],
    queryFn: async () =>
      fetchAllPages<{ contact_id: string; obligation_id: string }>(() =>
        supabase
          .from('fiscal_tasks')
          .select('contact_id, obligation_id')
          .eq('company_id', companyId!)
          .eq('competence_year', year)
          .eq('competence_month', month)
          .order('id', { ascending: true })
      ),
    enabled: !!companyId,
  });

  const profileName = (id: string | null) => {
    if (!id) return 'Sem responsável';
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email?.split('@')[0] || 'Desconhecido';
  };

  const breakdown = useMemo(() => {
    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const existingSet = new Set(existingTasks.map((t) => `${t.contact_id}|${t.obligation_id}`));

    const byRegime = new Map<string, GroupAccumulator>();
    const byCollaborator = new Map<string, GroupAccumulator>();

    const perObligation = rows.map((r) => {
      const department = r.fiscal_obligations_catalog?.department;
      const linkedContactIds = clientObligations
        .filter((co) => co.obligation_id === r.obligation_id)
        .map((co) => co.contact_id);

      let total = 0;
      let launched = 0;

      linkedContactIds.forEach((contactId) => {
        const contact = contactsById.get(contactId);
        if (!contact) return;
        const respId = deptResponsibleId(contact, department);
        if (!respId) return; // mesma regra do RPC: só conta com responsável definido no setor

        const isLaunched = existingSet.has(`${contactId}|${r.obligation_id}`);
        total += 1;
        if (isLaunched) launched += 1;

        const regimeKey = contact.tax_regime ?? '__none__';
        bump(byRegime, regimeKey, contactId, isLaunched);
        bump(byCollaborator, respId, contactId, isLaunched);
      });

      return {
        id: r.id,
        name: r.fiscal_obligations_catalog?.name ?? '—',
        total,
        launched,
        pending: total - launched,
        adjustedDueDate: r.adjusted_due_date,
        internalDeliveryDate: r.internal_delivery_date,
      };
    });

    const totalPending = perObligation.reduce((sum, o) => sum + o.pending, 0);

    const perRegime = Array.from(byRegime.entries())
      .map(([regime, g]) => ({
        regime: regime === '__none__' ? null : regime,
        label: regime === '__none__' ? 'Sem regime' : regimeLabel(regime),
        total: g.total,
        launched: g.launched,
        pending: g.total - g.launched,
        clientCount: g.clients.size,
        pendingClientCount: g.pendingClients.size,
        pct: totalPending > 0 ? ((g.total - g.launched) / totalPending) * 100 : 0,
      }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total);

    const perCollaborator = Array.from(byCollaborator.entries())
      .map(([id, g]) => ({
        id,
        name: profileName(id),
        total: g.total,
        launched: g.launched,
        pending: g.total - g.launched,
        clientCount: g.clients.size,
        pendingClientCount: g.pendingClients.size,
        pct: totalPending > 0 ? ((g.total - g.launched) / totalPending) * 100 : 0,
      }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total);

    // Contagem geral de clientes (não dá pra derivar de byRegime/byCollaborator:
    // um cliente pode ter tarefa pendente em mais de um grupo e seria contado 2x).
    const pendingClientsTotal = new Set<string>();
    const eligibleClientsTotal = new Set<string>();
    rows.forEach((r) => {
      const department = r.fiscal_obligations_catalog?.department;
      clientObligations
        .filter((co) => co.obligation_id === r.obligation_id)
        .forEach((co) => {
          const contact = contactsById.get(co.contact_id);
          if (!contact) return;
          const respId = deptResponsibleId(contact, department);
          if (!respId) return;
          eligibleClientsTotal.add(co.contact_id);
          if (!existingSet.has(`${co.contact_id}|${r.obligation_id}`)) {
            pendingClientsTotal.add(co.contact_id);
          }
        });
    });

    return {
      perObligation,
      perRegime,
      perCollaborator,
      totalTasks: totalPending,
      totalLaunched: perObligation.reduce((sum, o) => sum + o.launched, 0),
      clientCount: pendingClientsTotal.size,
      eligibleClientCount: eligibleClientsTotal.size,
    };
  }, [rows, contacts, clientObligations, existingTasks, profiles]);

  return {
    ...breakdown,
    loading: contactsLoading || clientObligationsLoading || existingLoading,
  };
}
