import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { getEffectiveAmount, getEffectiveDate } from '@/lib/financial-utils';
import { zebraPorData } from '@/lib/pdf-zebra';

interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  categoryId?: string;
  bankId?: string;
  transactionType?: string;
  contactId?: string;
  paymentStatus?: string;
  invisibleBankIds?: string[];
}

export interface ReportTransaction {
  id: string;
  description: string;
  amount: number;
  paid_amount?: number | null;
  type: 'receita' | 'despesa';
  date: string | null;
  due_date?: string | null;
  issue_date?: string | null;
  is_paid: boolean;
  category?: { id: string; name: string; color: string } | null;
  bank?: { id: string; name: string; color: string } | null;
  contact?: { id: string; name: string; type: string; tax_regime?: string | null; phone?: string | null } | null;
}

export function useReportData(filters: ReportFilters) {
  const { activeCompanyId } = useActiveCompany();
  return useQuery({
    queryKey: ['report-data', activeCompanyId, filters],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // Pagina de 1000 em 1000: sem .range() o PostgREST corta em 1000 linhas e devolve
      // sem erro nenhum, então o relatório truncava em silêncio.
      const PAGE = 1000;
      const all: ReportTransaction[] = [];

      for (let from = 0; ; from += PAGE) {
        let query = supabase
          .from('transactions')
          .select(`
            id,
            description,
            amount,
            paid_amount,
            type,
            date,
            due_date,
            issue_date,
            is_paid,
            category:categories(id, name, color),
            bank:banks(id, name, color),
            contact:contacts(id, name, type, tax_regime, phone)
          `)
          .eq('company_id', activeCompanyId!)
          .is('deleted_at', null)
          .eq('is_transfer', false)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);

        // Período pela data efetiva (pagamento → vencimento → emissão), igual às RPCs de
        // agregação. Filtrar só por `date` deixava de fora TODO lançamento em aberto (que
        // tem date NULL): o comparativo do Dashboard só enxergava o que já havia sido pago,
        // e ainda assim divergia dos cards, que somam paid_amount e usam o COALESCE.
        // PostgREST não filtra expressão, então o recorte de data é aplicado no cliente.
        if (filters.categoryId && filters.categoryId !== 'all') {
          query = query.eq('category_id', filters.categoryId);
        }
        if (filters.bankId && filters.bankId !== 'all') {
          query = query.eq('bank_id', filters.bankId);
        }
        if (filters.transactionType && filters.transactionType !== 'all') {
          query = query.eq('type', filters.transactionType);
        }
        if (filters.contactId && filters.contactId !== 'all') {
          query = query.eq('contact_id', filters.contactId);
        }
        if (filters.paymentStatus === 'paid') {
          query = query.eq('is_paid', true).not('date', 'is', null).not('paid_amount', 'is', null);
        } else if (filters.paymentStatus === 'pending') {
          query = query.or('is_paid.eq.false,date.is.null,paid_amount.is.null');
        }
        // Exclude invisible bank transactions
        if (filters.invisibleBankIds && filters.invisibleBankIds.length > 0) {
          const notInFilter = filters.invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
          query = query.or(`bank_id.is.null,and(${notInFilter})`);
        }

        const { data, error } = await query;
        if (error) throw error;
        const batch = (data ?? []) as ReportTransaction[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }

      const start = filters.startDate ? format(filters.startDate, 'yyyy-MM-dd') : null;
      const end = filters.endDate ? format(filters.endDate, 'yyyy-MM-dd') : null;
      if (!start && !end) return all;

      return all.filter((t) => {
        const d = getEffectiveDate(t);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    },
  });
}

// Valor efetivo de uma linha do relatório: pago quando liquidado, previsto quando em aberto.
// Antes tudo somava `amount` cru, então o bloco "Comparativo de Períodos" do Dashboard e o
// card "Receitas Recebidas" mostravam receitas diferentes para o MESMO mês (R$ 175.852,67 x
// R$ 172.703,73 em jul/26) — há 491 lançamentos com paid_amount diferente de amount.
const rowAmount = (t: ReportTransaction) =>
  getEffectiveAmount({
    is_paid: t.is_paid,
    amount: Number(t.amount),
    paid_amount: t.paid_amount ?? null,
    date: t.date,
  });

export function processReportData(transactions: ReportTransaction[]) {
  // Totals
  const totals = transactions.reduce(
    (acc, t) => {
      const amount = rowAmount(t);
      if (t.type === 'receita') {
        acc.receitas += amount;
      } else {
        acc.despesas += amount;
      }
      return acc;
    },
    { receitas: 0, despesas: 0 }
  );

  // Category breakdown
  const categoryMap = new Map<string, { name: string; value: number; color: string; type: string }>();
  transactions.forEach((t) => {
    const catName = t.category?.name || 'Sem evento contábil';
    const catColor = t.category?.color || '#6B7280';
    const key = `${catName}-${t.type}`;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.value += rowAmount(t);
    } else {
      categoryMap.set(key, { name: catName, value: rowAmount(t), color: catColor, type: t.type });
    }
  });

  const receitasByCategory = Array.from(categoryMap.values())
    .filter((c) => c.type === 'receita')
    .sort((a, b) => b.value - a.value);

  const despesasByCategory = Array.from(categoryMap.values())
    .filter((c) => c.type === 'despesa')
    .sort((a, b) => b.value - a.value);

  // Monthly breakdown
  const monthlyMap = new Map<string, { month: string; receitas: number; despesas: number }>();
  transactions.forEach((t) => {
    const eff = getEffectiveDate(t);
    if (!eff) return; // sem nenhuma data não há como agrupar (parseISO(null) estourava aqui)
    const monthKey = format(parseISO(eff), 'yyyy-MM');
    const monthLabel = format(parseISO(eff), 'MMM/yy', { locale: ptBR });
    const existing = monthlyMap.get(monthKey);
    const amount = rowAmount(t);

    if (existing) {
      if (t.type === 'receita') {
        existing.receitas += amount;
      } else {
        existing.despesas += amount;
      }
    } else {
      monthlyMap.set(monthKey, {
        month: monthLabel,
        receitas: t.type === 'receita' ? amount : 0,
        despesas: t.type === 'despesa' ? amount : 0,
      });
    }
  });

  const monthlyData = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => data);

  // Balance evolution data (monthly)
  const balanceEvolution = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((acc, [, data]) => {
      const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const newBalance = lastBalance + data.receitas - data.despesas;
      acc.push({
        month: data.month,
        balance: newBalance,
        receitas: data.receitas,
        despesas: data.despesas,
      });
      return acc;
    }, [] as { month: string; balance: number; receitas: number; despesas: number }[]);

  // Weekly breakdown for balance evolution
  const weeklyMap = new Map<string, { week: string; receitas: number; despesas: number }>();
  transactions.forEach((t) => {
    const eff = getEffectiveDate(t);
    if (!eff) return;
    const date = parseISO(eff);
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    const weekLabel = `Sem ${format(weekStart, 'dd/MM', { locale: ptBR })}`;
    const existing = weeklyMap.get(weekKey);
    const amount = rowAmount(t);

    if (existing) {
      if (t.type === 'receita') {
        existing.receitas += amount;
      } else {
        existing.despesas += amount;
      }
    } else {
      weeklyMap.set(weekKey, {
        week: weekLabel,
        receitas: t.type === 'receita' ? amount : 0,
        despesas: t.type === 'despesa' ? amount : 0,
      });
    }
  });

  const weeklyBalanceEvolution = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((acc, [, data]) => {
      const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const newBalance = lastBalance + data.receitas - data.despesas;
      acc.push({
        month: data.week,
        balance: newBalance,
        receitas: data.receitas,
        despesas: data.despesas,
      });
      return acc;
    }, [] as { month: string; balance: number; receitas: number; despesas: number }[]);

  return {
    totals,
    receitasByCategory,
    despesasByCategory,
    monthlyData,
    balanceEvolution,
    weeklyBalanceEvolution,
  };
}

const formatCurrencyValue = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/** Data formatada da linha, tolerante a lançamento em aberto (sem data de pagamento). */
function rowDateBR(t: ReportTransaction): string {
  const d = getEffectiveDate(t);
  return d ? format(parseISO(d), 'dd/MM/yyyy') : '—';
}

export function exportToCSV(transactions: ReportTransaction[]) {
  const headers = ['Data', 'Descrição', 'Tipo', 'Categoria', 'Banco', 'Cliente/Fornecedor', 'Valor', 'Status'];
  // `parseISO(t.date)` estourava (TypeError) em qualquer lançamento pendente, que tem
  // date NULL — na prática o botão de exportar não gerava arquivo nenhum.
  const rows = transactions.map((t) => [
    rowDateBR(t),
    t.description,
    t.type === 'receita' ? 'Receita' : 'Despesa',
    t.category?.name || 'Sem categoria',
    t.bank?.name || 'Sem banco',
    t.contact?.name || '',
    rowAmount(t).toFixed(2).replace('.', ','),
    t.is_paid ? 'Pago' : 'Pendente',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(';'))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
}

export function exportToPDF(
  transactions: ReportTransaction[],
  totals: { receitas: number; despesas: number },
  startDate?: Date,
  endDate?: Date
) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text('Relatório Financeiro', 14, 22);
  
  // Period
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  const periodText = startDate && endDate
    ? `Período: ${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`
    : 'Período: Todo o histórico';
  doc.text(periodText, 14, 32);
  
  // Summary
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('Resumo', 14, 45);
  
  const saldo = totals.receitas - totals.despesas;
  
  doc.setFontSize(10);
  doc.setTextColor(34, 197, 94); // green
  doc.text(`Total Receitas: ${formatCurrencyValue(totals.receitas)}`, 14, 55);
  
  doc.setTextColor(239, 68, 68); // red
  doc.text(`Total Despesas: ${formatCurrencyValue(totals.despesas)}`, 14, 62);
  
  doc.setTextColor(saldo >= 0 ? 34 : 239, saldo >= 0 ? 197 : 68, saldo >= 0 ? 94 : 68);
  doc.text(`Saldo: ${formatCurrencyValue(saldo)}`, 14, 69);
  
  doc.setTextColor(100, 100, 100);
  doc.text(`Total de transações: ${transactions.length}`, 14, 76);
  
  // Transactions table
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('Transações', 14, 90);
  
  // Exporta o relatório inteiro (antes cortava em 50 linhas enquanto o resumo acima
  // anunciava o total de transações — o PDF não conferia com o próprio cabeçalho).
  const ordered = [...transactions].sort((a, b) =>
    (getEffectiveDate(a) ?? '').localeCompare(getEffectiveDate(b) ?? '')
  );
  const tableData = ordered.map((t) => [
    rowDateBR(t),
    t.description.substring(0, 30),
    t.type === 'receita' ? 'Receita' : 'Despesa',
    t.category?.name || '-',
    t.bank?.name || '-',
    `${t.type === 'receita' ? '+' : '-'} ${formatCurrencyValue(rowAmount(t))}`,
    t.is_paid ? 'Pago' : 'Pendente',
  ]);

  autoTable(doc, {
    startY: 95,
    head: [['Data', 'Descrição', 'Tipo', 'Categoria', 'Banco', 'Valor', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      lineColor: [235, 238, 242],
      lineWidth: 0.1,
    },
    ...zebraPorData(ordered.map(rowDateBR)),
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")} - Página ${i} de ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }
  
  doc.save(`relatorio-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
