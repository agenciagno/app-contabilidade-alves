import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Transaction } from '@/hooks/useTransactions';
import { isEffectivelyPaid } from '@/lib/financial-utils';

export const PAGE_SIZE = 99;
export const IS_EMPTY = '__IS_EMPTY_OR_NULL__';

export interface ServerFilters {
  type?: string;
  categoryIds?: string[];
  bankId?: string;
  searchTerm?: string;
  invisibleBankIds?: string[];
  columnFilters: {
    issue_date?: { start: string; end: string };
    issue_date_empty?: boolean;
    due_date?: { start: string; end: string };
    due_date_empty?: boolean;
    expected_date?: { start: string; end: string };
    expected_date_empty?: boolean;
    date?: { start: string; end: string };
    date_empty?: boolean;
    contactIds?: string[];
    eventNames?: string[];
    status?: string;
    amounts?: (number | string)[];
    paidAmounts?: (number | string)[];
  };
  sortField: string;
  sortOrder: 'asc' | 'desc';
}

function applyDateFilter(
  query: any,
  col: string,
  range?: { start: string; end: string },
  includeEmpty?: boolean
) {
  const hasRange = range?.start || range?.end;
  if (includeEmpty && hasRange) {
    // OR: date in range OR date is null
    const parts: string[] = [];
    if (range?.start && range?.end) {
      parts.push(`and(${col}.gte.${range.start},${col}.lte.${range.end})`);
    } else if (range?.start) {
      parts.push(`${col}.gte.${range.start}`);
    } else if (range?.end) {
      parts.push(`${col}.lte.${range.end}`);
    }
    parts.push(`${col}.is.null`);
    query = query.or(parts.join(','));
  } else if (includeEmpty) {
    query = query.is(col, null);
  } else {
    if (range?.start) query = query.gte(col, range.start);
    if (range?.end) query = query.lte(col, range.end);
  }
  return query;
}

function applyFilters(
  query: any,
  filters: ServerFilters
) {
  // Always exclude soft-deleted records
  query = query.is('deleted_at', null);

  // Type filter
  if (filters.type && filters.type !== 'all') {
    if (filters.type === IS_EMPTY) {
      query = query.or('type.is.null,type.eq.');
    } else {
      query = query.eq('type', filters.type);
    }
  }

  // Category filter with IS_EMPTY support
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    const hasEmpty = filters.categoryIds.includes(IS_EMPTY);
    const realIds = filters.categoryIds.filter(id => id !== IS_EMPTY);
    if (hasEmpty && realIds.length) {
      query = query.or(`category_id.in.(${realIds.join(',')}),category_id.is.null`);
    } else if (hasEmpty) {
      query = query.is('category_id', null);
    } else {
      query = query.in('category_id', realIds);
    }
  }

  // Bank filter with IS_EMPTY support
  if (filters.bankId && filters.bankId !== 'all') {
    if (filters.bankId === IS_EMPTY) {
      query = query.is('bank_id', null);
    } else {
      query = query.eq('bank_id', filters.bankId);
    }
  }

  // Exclude invisible bank transactions globally (unless a specific bank is selected)
  if (!filters.bankId || filters.bankId === 'all') {
    if (filters.invisibleBankIds && filters.invisibleBankIds.length > 0) {
      const notInFilter = filters.invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
      query = query.or(`bank_id.is.null,and(${notInFilter})`);
    }
  }

  if (filters.searchTerm) {
    const term = filters.searchTerm.replace(/%/g, '');
    query = query.or(`description.ilike.%${term}%,notes.ilike.%${term}%`);
  }

  const cf = filters.columnFilters;

  // Date column filters with empty support
  query = applyDateFilter(query, 'issue_date', cf.issue_date, cf.issue_date_empty);
  query = applyDateFilter(query, 'due_date', cf.due_date, cf.due_date_empty);
  query = applyDateFilter(query, 'expected_date', cf.expected_date, cf.expected_date_empty);
  query = applyDateFilter(query, 'date', cf.date, cf.date_empty);

  // Amount filters with IS_EMPTY support
  if (cf.amounts && cf.amounts.length > 0) {
    const hasEmpty = cf.amounts.includes(IS_EMPTY);
    const realVals = cf.amounts.filter(v => v !== IS_EMPTY) as number[];
    if (hasEmpty && realVals.length) {
      query = query.or(`amount.in.(${realVals.join(',')}),amount.is.null`);
    } else if (hasEmpty) {
      query = query.is('amount', null);
    } else {
      query = query.in('amount', realVals);
    }
  }
  if (cf.paidAmounts && cf.paidAmounts.length > 0) {
    const hasEmpty = cf.paidAmounts.includes(IS_EMPTY);
    const realVals = cf.paidAmounts.filter(v => v !== IS_EMPTY) as number[];
    if (hasEmpty && realVals.length) {
      query = query.or(`paid_amount.in.(${realVals.join(',')}),paid_amount.is.null`);
    } else if (hasEmpty) {
      query = query.is('paid_amount', null);
    } else {
      query = query.in('paid_amount', realVals);
    }
  }

  // Contact multi-select + event names with OR logic + IS_EMPTY support
  const allContactIds = cf.contactIds || [];
  const hasContactEmpty = allContactIds.includes(IS_EMPTY);
  const realContactIds = allContactIds.filter(id => id !== IS_EMPTY);
  const hasContacts = realContactIds.length > 0;
  const hasEvents = cf.eventNames && cf.eventNames.length > 0;

  const orParts: string[] = [];
  if (hasContacts) {
    orParts.push(`contact_id.in.(${realContactIds.join(',')})`);
  }
  if (hasEvents) {
    orParts.push(`and(contact_id.is.null,description.in.(${cf.eventNames!.map(e => `"${e.replace(/"/g, '\\"')}"`).join(',')}))`);
  }
  if (hasContactEmpty) {
    orParts.push('contact_id.is.null');
  }
  if (orParts.length > 0) {
    query = query.or(orParts.join(','));
  }

  // Status filter
  if (cf.status === 'Pago') {
    query = query.eq('is_paid', true);
  } else if (cf.status === 'Pendente') {
    // Frontend will re-check with isEffectivelyPaid
  }

  return query;
}

export function useServerTransactions(page: number, filters: ServerFilters) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['server-transactions', page, filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          category:categories(id, name, color),
          bank:banks(id, name, color),
          contact:contacts(id, name, type)
        `, { count: 'exact' });

      query = applyFilters(query, filters);

      // Sorting
      const sortCol = filters.sortField || 'due_date';
      const ascending = filters.sortOrder === 'asc';
      query = query.order(sortCol, { ascending, nullsFirst: false });
      query = query.order('id', { ascending: false }); // stable sort tiebreaker

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      let rows = data as Transaction[];

      // Frontend defense: if status filter is "Pendente", also include is_paid=true that fail isEffectivelyPaid
      // If status is "Pago", exclude rows that don't pass isEffectivelyPaid
      if (filters.columnFilters.status === 'Pago') {
        rows = rows.filter(t => isEffectivelyPaid(t));
      } else if (filters.columnFilters.status === 'Pendente') {
        rows = rows.filter(t => !isEffectivelyPaid(t));
      }

      return { rows, count: count ?? 0 };
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  return {
    transactions: data?.rows ?? [],
    totalCount: data?.count ?? 0,
    totalPages: Math.ceil((data?.count ?? 0) / PAGE_SIZE),
    isLoading,
    isFetching,
  };
}

// Separate KPI query — same filters, no pagination, minimal columns
export function useTransactionKPIs(filters: ServerFilters) {
  const { data, isLoading } = useQuery({
    queryKey: ['transaction-kpis', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('id, type, amount, paid_amount, is_paid, date, due_date');

      query = applyFilters(query, filters);

      // Fetch all rows (paginated to avoid 1000 limit)
      const allRows: any[] = [];
      const BATCH = 1000;
      let offset = 0;
      while (true) {
        const { data: batch, error } = await query.range(offset, offset + BATCH - 1);
        if (error) throw error;
        allRows.push(...(batch || []));
        if (!batch || batch.length < BATCH) break;
        offset += BATCH;
        // Re-create query for next page
        query = supabase.from('transactions').select('id, type, amount, paid_amount, is_paid, date, due_date');
        query = applyFilters(query, filters);
        query = query.is('deleted_at', null);
      }

      const today = new Date().toISOString().split('T')[0];

      let receitasPagas = 0, receitasPendentes = 0, despesasPagas = 0, despesasPendentes = 0;
      let contasEmAtraso = 0, receitasEmAtraso = 0;

      for (const t of allRows) {
        const paid = isEffectivelyPaid(t);
        const amt = Number(t.amount);
        const effAmt = paid && t.paid_amount != null ? Number(t.paid_amount) : amt;

        if (t.type === 'receita') {
          if (paid) receitasPagas += effAmt; else receitasPendentes += amt;
        } else {
          if (paid) despesasPagas += effAmt; else despesasPendentes += amt;
        }

        if (!paid && t.due_date && t.due_date < today) {
          if (t.type === 'receita') receitasEmAtraso += amt;
          else contasEmAtraso += amt;
        }
      }

      return { receitasPagas, receitasPendentes, despesasPagas, despesasPendentes, contasEmAtraso, receitasEmAtraso, totalFiltered: allRows.length };
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  return {
    kpis: data ?? { receitasPagas: 0, receitasPendentes: 0, despesasPagas: 0, despesasPendentes: 0, contasEmAtraso: 0, receitasEmAtraso: 0, totalFiltered: 0 },
    isLoading,
  };
}
