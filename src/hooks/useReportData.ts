import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  type: 'receita' | 'despesa';
  date: string;
  due_date?: string | null;
  is_paid: boolean;
  category?: { id: string; name: string; color: string } | null;
  bank?: { id: string; name: string; color: string } | null;
  contact?: { id: string; name: string; type: string; tax_regime?: string | null; phone?: string | null } | null;
}

export function useReportData(filters: ReportFilters) {
  return useQuery({
    queryKey: ['report-data', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          description,
          amount,
          type,
          date,
          due_date,
          is_paid,
          category:categories(id, name, color),
          bank:banks(id, name, color),
          contact:contacts(id, name, type, tax_regime, phone)
        `)
        .is('deleted_at', null)
        .order('date', { ascending: false });

      if (filters.startDate) {
        query = query.gte('date', format(filters.startDate, 'yyyy-MM-dd'));
      }
      if (filters.endDate) {
        query = query.lte('date', format(filters.endDate, 'yyyy-MM-dd'));
      }
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
      if (filters.paymentStatus && filters.paymentStatus !== 'all') {
        query = query.eq('is_paid', filters.paymentStatus === 'paid');
      }
      // Exclude invisible bank transactions
      if (filters.invisibleBankIds && filters.invisibleBankIds.length > 0) {
        const notInFilter = filters.invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
        query = query.or(`bank_id.is.null,and(${notInFilter})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ReportTransaction[];
    },
  });
}

export function processReportData(transactions: ReportTransaction[]) {
  // Totals
  const totals = transactions.reduce(
    (acc, t) => {
      const amount = Number(t.amount);
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
      existing.value += Number(t.amount);
    } else {
      categoryMap.set(key, { name: catName, value: Number(t.amount), color: catColor, type: t.type });
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
    const monthKey = format(parseISO(t.date), 'yyyy-MM');
    const monthLabel = format(parseISO(t.date), 'MMM/yy', { locale: ptBR });
    const existing = monthlyMap.get(monthKey);
    const amount = Number(t.amount);
    
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
    const date = parseISO(t.date);
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    const weekLabel = `Sem ${format(weekStart, 'dd/MM', { locale: ptBR })}`;
    const existing = weeklyMap.get(weekKey);
    const amount = Number(t.amount);
    
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

export function exportToCSV(transactions: ReportTransaction[]) {
  const headers = ['Data', 'Descrição', 'Tipo', 'Categoria', 'Banco', 'Cliente/Fornecedor', 'Valor', 'Status'];
  const rows = transactions.map((t) => [
    format(parseISO(t.date), 'dd/MM/yyyy'),
    t.description,
    t.type === 'receita' ? 'Receita' : 'Despesa',
    t.category?.name || 'Sem categoria',
    t.bank?.name || 'Sem banco',
    t.contact?.name || '',
    Number(t.amount).toFixed(2).replace('.', ','),
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
  
  const tableData = transactions.slice(0, 50).map((t) => [
    format(parseISO(t.date), 'dd/MM/yyyy'),
    t.description.substring(0, 30),
    t.type === 'receita' ? 'Receita' : 'Despesa',
    t.category?.name || '-',
    t.bank?.name || '-',
    `${t.type === 'receita' ? '+' : '-'} ${formatCurrencyValue(Number(t.amount))}`,
    t.is_paid ? 'Pago' : 'Pendente',
  ]);
  
  autoTable(doc, {
    startY: 95,
    head: [['Data', 'Descrição', 'Tipo', 'Categoria', 'Banco', 'Valor', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
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
