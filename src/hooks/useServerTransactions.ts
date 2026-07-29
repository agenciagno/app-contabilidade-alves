import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Transaction } from '@/hooks/useTransactions';
import { useActiveCompany } from '@/contexts/CompanyContext';

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
  filters: ServerFilters,
  excludeColumn?: 'amount' | 'paid_amount'
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
  if (excludeColumn !== 'amount' && cf.amounts && cf.amounts.length > 0) {
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
  if (excludeColumn !== 'paid_amount' && cf.paidAmounts && cf.paidAmounts.length > 0) {
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

  // Status filter — resolvido inteiro no servidor.
  // Antes, "Pendente" não aplicava filtro nenhum aqui e o descarte acontecia no cliente,
  // depois do `count: 'exact'`: a página vinha com menos linhas do que deveria e o total /
  // número de páginas ficava superestimado. "Pago" tinha o mesmo problema em menor escala,
  // porque o `.eq('is_paid', true)` não checa data e valor pago.
  if (cf.status === 'Pago') {
    query = query
      .eq('is_paid', true)
      .not('date', 'is', null)
      .not('paid_amount', 'is', null);
  } else if (cf.status === 'Pendente') {
    query = query.or('is_paid.eq.false,date.is.null,paid_amount.is.null');
  }

  return query;
}

export function useServerTransactions(page: number, filters: ServerFilters) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { activeCompanyId } = useActiveCompany();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['server-transactions', activeCompanyId, page, filters],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          category:categories(id, name, color),
          bank:banks(id, name, color),
          contact:contacts(id, name, type)
        `, { count: 'exact' })
        .eq('company_id', activeCompanyId!);

      query = applyFilters(query, filters);

      // Sorting
      const sortCol = filters.sortField || 'due_date';
      const ascending = filters.sortOrder === 'asc';
      query = query.order(sortCol, { ascending, nullsFirst: false });
      query = query.order('id', { ascending: false }); // stable sort tiebreaker

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // O filtro de status já foi aplicado no servidor (applyFilters), então o `count`
      // e as linhas estão coerentes entre si — não há refiltragem no cliente.
      const rows = data as Transaction[];

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

// Separate KPI query — delegates aggregation to Postgres RPC `get_transaction_kpis`.
// O RPC passou a aceitar arrays e a coluna de data que a tabela está filtrando, para que
// os cards e a lista respondam exatamente ao mesmo recorte. Antes, multi-seleção de
// categoria/contato era descartada (voltava ao total geral) e o período sempre usava
// COALESCE(date,due_date,issue_date), independente da coluna escolhida pelo usuário.
export function useTransactionKPIs(filters: ServerFilters) {
  const { activeCompanyId } = useActiveCompany();
  const cf = filters.columnFilters;

  // Qual coluna de data a tabela está filtrando (a primeira preenchida, mesma prioridade
  // de antes) — agora essa informação vai junto para o RPC.
  const dateColumn: 'date' | 'due_date' | 'issue_date' | 'expected_date' | null =
    cf.date ? 'date'
    : cf.due_date ? 'due_date'
    : cf.issue_date ? 'issue_date'
    : cf.expected_date ? 'expected_date'
    : null;
  const dateRange = dateColumn ? cf[dateColumn] : undefined;

  const p_type =
    filters.type && filters.type !== 'all' && filters.type !== IS_EMPTY
      ? filters.type
      : null;

  const bankIsEmpty = filters.bankId === IS_EMPTY;
  const p_bank_id =
    filters.bankId && filters.bankId !== 'all' && !bankIsEmpty ? filters.bankId : null;

  const allCategoryIds = filters.categoryIds || [];
  const realCategoryIds = allCategoryIds.filter(id => id !== IS_EMPTY);
  const allContactIds = cf.contactIds || [];
  const realContactIds = allContactIds.filter(id => id !== IS_EMPTY);

  const rpcParams = {
    p_company_id: activeCompanyId,
    p_start_date: dateRange?.start || null,
    p_end_date: dateRange?.end || null,
    p_type,
    p_bank_id,
    p_category_id: null,
    p_contact_id: null,
    p_payment_status:
      cf.status === 'Pago' ? 'paid' : cf.status === 'Pendente' ? 'pending' : null,
    p_search: filters.searchTerm || null,
    p_category_ids: realCategoryIds.length ? realCategoryIds : null,
    p_contact_ids: realContactIds.length ? realContactIds : null,
    // bancos invisíveis só são excluídos quando nenhum banco específico foi escolhido,
    // exatamente como a tabela faz em applyFilters()
    p_exclude_bank_ids:
      !p_bank_id && !bankIsEmpty && filters.invisibleBankIds?.length
        ? filters.invisibleBankIds
        : null,
    p_date_column: dateColumn,
    p_include_null_category: allCategoryIds.includes(IS_EMPTY),
    p_include_null_contact: allContactIds.includes(IS_EMPTY),
    p_null_bank_only: bankIsEmpty,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-kpis', rpcParams],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_transaction_kpis', rpcParams as any);
      if (error) throw error;
      const d = data as any;
      return {
        receitasPagas: Number(d?.receitas_pagas ?? 0),
        receitasPendentes: Number(d?.receitas_pendentes ?? 0),
        despesasPagas: Number(d?.despesas_pagas ?? 0),
        despesasPendentes: Number(d?.despesas_pendentes ?? 0),
        contasEmAtraso: Number(d?.contas_em_atraso ?? 0),
        receitasEmAtraso: Number(d?.receitas_em_atraso ?? 0),
        totalFiltered: Number(d?.total_transacoes ?? 0),
      };
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  return {
    kpis: data ?? { receitasPagas: 0, receitasPendentes: 0, despesasPagas: 0, despesasPendentes: 0, contasEmAtraso: 0, receitasEmAtraso: 0, totalFiltered: 0 },
    isLoading,
  };
}

// Conjunto filtrado COMPLETO, para exportação. A tela exportava só a página corrente
// (99 linhas) com os totais do filtro inteiro no cabeçalho do PDF — números que não
// correspondiam às linhas listadas. Pagina de 1000 em 1000 porque o PostgREST corta aí.
export async function fetchFilteredTransactionsForExport(
  companyId: string,
  filters: ServerFilters
): Promise<Transaction[]> {
  const PAGE = 1000;
  const all: Transaction[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories(id, name, color),
        bank:banks(id, name, color),
        contact:contacts(id, name, type)
      `)
      .eq('company_id', companyId);

    query = applyFilters(query, filters);
    query = query
      .order(filters.sortField || 'due_date', { ascending: filters.sortOrder === 'asc', nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as Transaction[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

// Distinct values for column filters (e.g. Valor, Recebido) — full dataset, not paginated.
// Excludes the column's own filter to avoid self-restriction (Excel-style).
export function useDistinctTransactionValues(
  column: 'amount' | 'paid_amount',
  filters: ServerFilters,
  enabled: boolean
) {
  const { activeCompanyId } = useActiveCompany();
  const { data, isFetching } = useQuery({
    queryKey: ['distinct-transaction-values', activeCompanyId, column, filters],
    enabled: enabled && !!activeCompanyId,
    queryFn: async () => {
      let query = supabase.from('transactions').select(column).eq('company_id', activeCompanyId!);
      query = applyFilters(query, filters, column);
      query = query.limit(5000);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, number | null>>;
      const set = new Set<number>();
      let hasEmpty = false;
      for (const r of rows) {
        const v = r[column];
        if (v == null) hasEmpty = true;
        else set.add(Number(v));
      }
      const values = Array.from(set).sort((a, b) => a - b);
      return { values, hasEmpty };
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  return {
    values: data?.values ?? [],
    hasEmpty: data?.hasEmpty ?? false,
    isFetching,
  };
}

