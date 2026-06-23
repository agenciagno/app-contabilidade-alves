import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileText, Table2, Image, TrendingUp, TrendingDown, Building2, Wallet, X, Printer, ChevronDown, Search } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { format, parseISO, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Transaction } from '@/hooks/useTransactions';
import type { Bank } from '@/hooks/useBanks';
import type { Contact } from '@/hooks/useContacts';

interface Category {
  id: string;
  name: string;
  color: string | null;
  type: string;
  parent_id?: string | null;
}

interface CashFlowReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  categories: Category[];
  contacts: Contact[];
  banks: Bank[];
  initialStartDate?: string;
  initialEndDate?: string;
  initialCategoryIds?: string[];
  initialContactIds?: string[];
  mode?: 'all' | 'receivables';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateBR(dateStr: string) {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function getStatus(isPaid: boolean, dueDate: string | null): string {
  if (isPaid) return 'Pago';
  if (dueDate) {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dueDate < today) return 'Vencido';
  }
  return 'Pendente';
}

export function CashFlowReportModal({
  open, onOpenChange, transactions, categories, contacts, banks,
  initialStartDate = '', initialEndDate = '', initialCategoryIds = [], initialContactIds = [],
  mode: variant = 'all',
}: CashFlowReportModalProps) {
  const isReceivables = variant === 'receivables';
  const { company } = useCompany();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'report' | 'monthly'>('report');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [contactId, setContactId] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Monthly query state
  const nowDate = new Date();
  const currentYear = nowDate.getFullYear();
  const currentMonth = nowDate.getMonth(); // 0..11
  const [monthlyYear, setMonthlyYear] = useState<number>(currentYear);
  const [monthlyStatus, setMonthlyStatus] = useState<'paid' | 'pending'>('pending');
  const [monthlyVersion, setMonthlyVersion] = useState<'resumida' | 'completa'>('resumida');
  const [monthlySelectedCategories, setMonthlySelectedCategories] = useState<Set<string>>(new Set());
  const [monthlyCategorySearch, setMonthlyCategorySearch] = useState('');
  const [monthlyMonths, setMonthlyMonths] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let m = currentMonth; m <= 11; m++) s.add(m);
    return s;
  });

  // Auto-fill months when status or year changes
  const autoFillMonths = (status: 'paid' | 'pending', year: number) => {
    const s = new Set<number>();
    if (year < currentYear) {
      for (let m = 0; m <= 11; m++) s.add(m);
    } else if (year > currentYear) {
      for (let m = 0; m <= 11; m++) s.add(m);
    } else {
      if (status === 'paid') {
        for (let m = 0; m <= currentMonth; m++) s.add(m);
      } else {
        for (let m = currentMonth; m <= 11; m++) s.add(m);
      }
    }
    return s;
  };

  useEffect(() => {
    if (open) {
      setMode('report');
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setCategoryId(initialCategoryIds.length === 1 ? initialCategoryIds[0] : 'all');
      setContactId(initialContactIds.length === 1 ? initialContactIds[0] : 'all');
      setTypeFilter(isReceivables ? 'receita' : 'all');
      setMonthlyYear(currentYear);
      setMonthlyStatus('pending');
      setMonthlySelectedCategories(new Set());
      setMonthlyVersion('resumida');
      setMonthlyMonths(autoFillMonths('pending', currentYear));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStartDate, initialEndDate, initialCategoryIds, initialContactIds]);

  const today = new Date();

  const periodLabel = startDate && endDate
    ? `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`
    : 'Acumulado Geral';
  const categoryLabel = categoryId !== 'all'
    ? categories.find(c => c.id === categoryId)?.name || 'Todos'
    : 'Todos';
  const contactLabel = contactId !== 'all'
    ? contacts.find(c => c.id === contactId)?.name || 'Todos'
    : 'Todos';
  const typeLabel = typeFilter === 'receita' ? 'A Receber' : typeFilter === 'despesa' ? 'A Pagar' : 'Todos';

  const clearDates = () => { setStartDate(''); setEndDate(''); };

  // ─── Resumo por Evento Contábil ──────────────────────────────────
  const buildEventSummary = (rows: typeof transactions) => {
    const map = new Map<string, { name: string; qty: number; receber: number; pagar: number }>();
    for (const r of rows) {
      const name = r.category?.name || 'Sem evento';
      const cur = map.get(name) || { name, qty: 0, receber: 0, pagar: 0 };
      cur.qty += 1;
      const amt = Number(r.amount);
      if (r.type === 'receita') cur.receber += amt;
      else cur.pagar += amt;
      map.set(name, cur);
    }
    return Array.from(map.values())
      .map(g => ({ ...g, saldo: g.receber - g.pagar }))
      .sort((a, b) => (Math.abs(b.receber) + Math.abs(b.pagar)) - (Math.abs(a.receber) + Math.abs(a.pagar)));
  };

  const activeBanks = useMemo(() => banks.filter(b => b.is_active), [banks]);
  const totalBankBalance = useMemo(() => activeBanks.reduce((s, b) => s + Number(b.current_balance), 0), [activeBanks]);

  // Pre-filter: in receivables mode, only "A Receber" entries (receita > 0) — mirrors CashFlowTab
  const txns = useMemo(() => {
    if (!isReceivables) return transactions;
    return transactions.filter(t => t.type === 'receita' && Number(t.amount) > 0);
  }, [transactions, isReceivables]);

  // Date key: receivables ranks by due_date (Vencimento); all ranks by expected_date (Data Prevista)
  const dateKeyOf = (t: Transaction): string | null =>
    isReceivables ? (t.due_date || t.expected_date || null) : (t.expected_date || null);

  // Filter: same strict rule as CashFlowTab
  const filteredRows = useMemo(() => {
    let result = txns.filter(t => !t.is_paid && (isReceivables ? (t.due_date || t.expected_date) : t.expected_date));

    if (startDate && endDate) {
      const s = parseISO(startDate);
      const e = parseISO(endDate);
      e.setHours(23, 59, 59, 999);
      result = result.filter(t => {
        const dateKey = dateKeyOf(t);
        if (!dateKey) return false;
        const d = parseISO(dateKey);
        return isWithinInterval(d, { start: s, end: e });
      });
    }

    if (categoryId !== 'all') result = result.filter(t => t.category_id === categoryId);
    if (contactId !== 'all') result = result.filter(t => t.contact_id === contactId);
    if (typeFilter !== 'all') result = result.filter(t => t.type === typeFilter);

    result.sort((a, b) => (dateKeyOf(a) || '').localeCompare(dateKeyOf(b) || ''));
    return result;
  }, [txns, startDate, endDate, categoryId, contactId, typeFilter, isReceivables]);

  // Running balance rows
  const rowsWithBalance = useMemo(() => {
    let saldo = totalBankBalance;
    return filteredRows.map(t => {
      const amt = Number(t.amount);
      if (t.type === 'receita') saldo += amt;
      else saldo -= amt;
      return { ...t, saldoAtual: saldo };
    });
  }, [filteredRows, totalBankBalance]);

  // KPIs matching main screen: Capital de Giro, Entradas, Saídas, Saldos Atuais
  const kpis = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const t of filteredRows) {
      const amt = Number(t.amount);
      if (t.type === 'receita') entradas += amt;
      else saidas += amt;
    }
    const capitalDeGiro = rowsWithBalance.length > 0 ? rowsWithBalance[rowsWithBalance.length - 1].saldoAtual : totalBankBalance;
    return { entradas, saidas, capitalDeGiro, totalBankBalance };
  }, [filteredRows, rowsWithBalance, totalBankBalance]);

  // ─── Monthly matrix data ──────────────────────────────────────────
  const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const t of txns) {
      const ref = t.is_paid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (ref) {
        const y = parseInt(ref.slice(0, 4), 10);
        if (!Number.isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [txns, currentYear, isReceivables]);

  const sortedSelectedMonths = useMemo(
    () => Array.from(monthlyMonths).sort((a, b) => a - b),
    [monthlyMonths],
  );

  // Expand selected categories to include children of any selected macro
  const expandedSelectedCategories = useMemo(() => {
    if (monthlySelectedCategories.size === 0) return monthlySelectedCategories;
    const expanded = new Set(monthlySelectedCategories);
    for (const selId of monthlySelectedCategories) {
      // If selId is a macro (parent of other categories), add all its children
      for (const cat of categories) {
        if (cat.parent_id === selId) {
          expanded.add(cat.id);
        }
      }
    }
    return expanded;
  }, [monthlySelectedCategories, categories]);

  const monthlyMatrix = useMemo(() => {
    // Filter rows by year + status + category
    const isPaid = monthlyStatus === 'paid';
    const rows = txns.filter(t => {
      if (t.is_paid !== isPaid) return false;
      const ref = isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (!ref) return false;
      if (parseInt(ref.slice(0, 4), 10) !== monthlyYear) return false;
      if (expandedSelectedCategories.size > 0 && !expandedSelectedCategories.has(t.category_id)) return false;
      return true;
    });

    // Aggregate by event/category name
    const map = new Map<string, { name: string; color: string | null; monthly: number[]; total: number }>();
    for (const t of rows) {
      const ref = isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (!ref) continue;
      const month = parseInt(ref.slice(5, 7), 10) - 1;
      if (!sortedSelectedMonths.includes(month)) continue;
      const name = t.category?.name || 'Sem evento';
      const color = (t.category as any)?.color ?? null;
      const cur = map.get(name) || { name, color, monthly: Array(12).fill(0), total: 0 };
      const amt = Number(isPaid ? (t.paid_amount ?? t.amount) : t.amount);
      const signed = t.type === 'receita' ? amt : -amt;
      cur.monthly[month] += signed;
      cur.total += signed;
      map.set(name, cur);
    }

    // Hide events with total === 0
    const events = Array.from(map.values())
      .filter(e => Math.abs(e.total) > 0.0001)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    // Column totals + grand total (only for selected months)
    const colTotals: number[] = Array(12).fill(0);
    let grand = 0;
    for (const e of events) {
      for (const m of sortedSelectedMonths) {
        colTotals[m] += e.monthly[m];
      }
      grand += e.total;
    }
    return { events, colTotals, grand };
  }, [txns, monthlyYear, monthlyStatus, expandedSelectedCategories, sortedSelectedMonths, isReceivables]);

  // ─── Hierarchical matrix for "Versão Completa" (Evento → Cliente/Fornecedor) ──
  type HierarchicalEvent = {
    macroName: string;
    macroColor: string | null;
    monthly: number[];
    total: number;
    children: { name: string; color: string | null; monthly: number[]; total: number }[];
  };

  const monthlyHierarchicalMatrix = useMemo(() => {
    if (monthlyVersion !== 'completa') return { groups: [] as HierarchicalEvent[], colTotals: Array(12).fill(0) as number[], grand: 0 };

    const isPaid = monthlyStatus === 'paid';
    const catMap = new Map(categories.map(c => [c.id, c]));

    const rows = txns.filter(t => {
      if (t.is_paid !== isPaid) return false;
      const ref = isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (!ref) return false;
      if (parseInt(ref.slice(0, 4), 10) !== monthlyYear) return false;
      if (expandedSelectedCategories.size > 0 && !expandedSelectedCategories.has(t.category_id)) return false;
      return true;
    });

    // Group by category → contact
    const eventMap = new Map<string, {
      catName: string; catColor: string | null;
      monthly: number[]; total: number;
      contacts: Map<string, { name: string; monthly: number[]; total: number }>;
    }>();

    for (const t of rows) {
      const ref = isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (!ref) continue;
      const month = parseInt(ref.slice(5, 7), 10) - 1;
      if (!sortedSelectedMonths.includes(month)) continue;

      const catId = t.category_id || '__none__';
      const cat = catId !== '__none__' ? catMap.get(catId) : null;
      const catName = cat?.name || 'Sem evento';
      const catColor = cat?.color ?? null;

      const amt = Number(isPaid ? (t.paid_amount ?? t.amount) : t.amount);
      const signed = t.type === 'receita' ? amt : -amt;

      let ev = eventMap.get(catId);
      if (!ev) {
        ev = { catName, catColor, monthly: Array(12).fill(0), total: 0, contacts: new Map() };
        eventMap.set(catId, ev);
      }
      ev.monthly[month] += signed;
      ev.total += signed;

      const contactKey = t.contact?.id || '__no_contact__';
      const contactName = t.contact?.name || 'Sem cliente/fornecedor';
      let ct = ev.contacts.get(contactKey);
      if (!ct) {
        ct = { name: contactName, monthly: Array(12).fill(0), total: 0 };
        ev.contacts.set(contactKey, ct);
      }
      ct.monthly[month] += signed;
      ct.total += signed;
    }

    const groups: HierarchicalEvent[] = Array.from(eventMap.values())
      .filter(ev => Math.abs(ev.total) > 0.0001)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .map(ev => ({
        macroName: ev.catName,
        macroColor: ev.catColor,
        monthly: ev.monthly,
        total: ev.total,
        children: Array.from(ev.contacts.values())
          .filter(c => Math.abs(c.total) > 0.0001)
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
          .map(c => ({ name: c.name, color: null, monthly: c.monthly, total: c.total })),
      }));

    const colTotals: number[] = Array(12).fill(0);
    let grand = 0;
    for (const g of groups) {
      for (const m of sortedSelectedMonths) colTotals[m] += g.monthly[m];
      grand += g.total;
    }

    return { groups, colTotals, grand };
  }, [monthlyVersion, txns, monthlyYear, monthlyStatus, expandedSelectedCategories, sortedSelectedMonths, categories, isReceivables]);

  const monthlyCategoryLabel = useMemo(() => {
    if (monthlySelectedCategories.size === 0) return 'Todas';
    const names = categories.filter(c => monthlySelectedCategories.has(c.id)).map(c => c.name);
    if (names.length === 1) return names[0];
    return `${names.length} eventos: ${names.join(', ')}`;
  }, [monthlySelectedCategories, categories]);
  const monthlyStatusLabel = monthlyStatus === 'paid' ? 'Pago/Recebido' : 'Pagar/Receber';
  const monthlyMonthsLabel = sortedSelectedMonths.map(m => MONTHS_PT[m]).join(', ') || '—';

  const toggleMonth = (m: number) => {
    setMonthlyMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  // ─── PDF Export ───────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const emittedAt = `Emitido em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()} às ${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(isReceivables ? 'Relatório de A Receber' : 'Relatório de Contas a Pagar/Receber', 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${periodLabel}`, 14, 25);

    // KPI cards (4 for all, 3 for receivables)
    const kpiCount = isReceivables ? 3 : 4;
    const cardH = 14;
    const cardY = 32;
    const gap = 2;
    const padX = 3;
    const labelOffsetY = 6;
    const valueOffsetY = 12;
    const totalW = 283 - 14; // page content width
    const cardW = (totalW - gap * (kpiCount - 1)) / kpiCount;
    const col1X = 14;
    const col2X = col1X + cardW + gap;
    const col3X = col2X + cardW + gap;
    const col4X = col3X + cardW + gap;

    // Capital de Giro
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(col1X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(29, 78, 216);
    doc.text('Capital de Giro', col1X + padX, cardY + labelOffsetY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(kpis.capitalDeGiro), col1X + padX, cardY + valueOffsetY);

    // Entradas
    doc.setFillColor(240, 255, 244);
    doc.roundedRect(col2X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(21, 128, 61);
    doc.text('Entradas', col2X + padX, cardY + labelOffsetY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(kpis.entradas), col2X + padX, cardY + valueOffsetY);

    if (!isReceivables) {
      // Saídas
      doc.setFillColor(255, 245, 245);
      doc.roundedRect(col3X, cardY, cardW, cardH, 2, 2, 'F');
      doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(220, 38, 38);
      doc.text('Saídas', col3X + padX, cardY + labelOffsetY);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(kpis.saidas), col3X + padX, cardY + valueOffsetY);
    }

    // Saldos Atuais (Bancos)
    const lastX = isReceivables ? col3X : col4X;
    doc.setFillColor(245, 245, 255);
    doc.roundedRect(lastX, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Saldos Atuais (Bancos)', lastX + padX, cardY + labelOffsetY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(formatCurrency(kpis.totalBankBalance), lastX + padX, cardY + valueOffsetY);

    const sepY = cardY + cardH + 4;
    doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3);
    doc.line(14, sepY, 283, sepY);

    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 160);
    doc.text(`${filteredRows.length} lançamentos • Gerado em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`, 14, sepY + 5);
    doc.setTextColor(0);

    // Table — in receivables, drop "Prevista" column and only show Vencimento
    const head = isReceivables
      ? [['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status']]
      : [['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status']];
    const body = rowsWithBalance.map(r => isReceivables ? [
      r.contact?.name || r.description,
      formatCurrency(Number(r.amount)),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      formatCurrency(r.saldoAtual),
      getStatus(r.is_paid, r.due_date),
    ] : [
      formatDateBR(r.expected_date || ''),
      r.contact?.name || r.description,
      r.type === 'receita' ? formatCurrency(Number(r.amount)) : '',
      r.type === 'despesa' ? formatCurrency(Number(r.amount)) : '',
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      formatCurrency(r.saldoAtual),
      getStatus(r.is_paid, r.due_date),
    ]);
    const columnStyles = isReceivables ? {
      0: { cellWidth: 50, halign: 'center' as const },
      1: { cellWidth: 32, halign: 'center' as const },
      2: { cellWidth: 24, halign: 'center' as const },
      3: { cellWidth: 36, halign: 'center' as const },
      4: { cellWidth: 60, halign: 'center' as const },
      5: { cellWidth: 32, halign: 'center' as const },
      6: { cellWidth: 18, halign: 'center' as const },
    } : {
      0: { cellWidth: 22, halign: 'center' as const },
      1: { cellWidth: 40, halign: 'center' as const },
      2: { cellWidth: 26, halign: 'center' as const },
      3: { cellWidth: 26, halign: 'center' as const },
      4: { cellWidth: 22, halign: 'center' as const },
      5: { cellWidth: 30, halign: 'center' as const },
      6: { cellWidth: 40, halign: 'center' as const },
      7: { cellWidth: 28, halign: 'center' as const },
      8: { cellWidth: 18, halign: 'center' as const },
    };

    autoTable(doc, {
      startY: sepY + 10,
      head,
      body,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      rowPageBreak: 'avoid',
      columnStyles,
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(emittedAt, 14, pageHeight - 8);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0);
      },
    });

    // ─── Resumo por Evento Contábil ───────────────────────────────
    const eventSummary = buildEventSummary(filteredRows);
    const eventTotals = eventSummary.reduce(
      (acc, g) => ({
        qty: acc.qty + g.qty,
        receber: acc.receber + g.receber,
        pagar: acc.pagar + g.pagar,
        saldo: acc.saldo + g.saldo,
      }),
      { qty: 0, receber: 0, pagar: 0, saldo: 0 }
    );

    if (eventSummary.length > 0) {
      const pageHeight = doc.internal.pageSize.height;
      const finalY = (doc as any).lastAutoTable.finalY;
      const remaining = pageHeight - finalY;
      // Need title + table header + at least 2 rows together (~40mm)
      let startY: number;
      if (remaining < 40) {
        doc.addPage();
        startY = 18;
      } else {
        startY = finalY + 8;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Resumo por Evento Contábil', 14, startY);

      autoTable(doc, {
        startY: startY + 3,
        head: [['Evento', 'Qtd', 'A Receber', 'A Pagar', 'Saldo']],
        body: eventSummary.map(g => [
          g.name,
          String(g.qty),
          formatCurrency(g.receber),
          formatCurrency(g.pagar),
          formatCurrency(g.saldo),
        ]),
        foot: [[
          { content: 'TOTAL', styles: { halign: 'center' } },
          { content: String(eventTotals.qty), styles: { halign: 'center' } },
          { content: formatCurrency(eventTotals.receber), styles: { halign: 'center' } },
          { content: formatCurrency(eventTotals.pagar), styles: { halign: 'center' } },
          { content: formatCurrency(eventTotals.saldo), styles: { halign: 'center' } },
        ]],
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', halign: 'center' },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        rowPageBreak: 'avoid',
        columnStyles: {
          0: { cellWidth: 95, halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 38, halign: 'center', textColor: [22, 163, 74] },
          3: { cellWidth: 38, halign: 'center', textColor: [239, 68, 68] },
          4: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
        },

        didDrawPage: (data) => {
          const pageCount = (doc as any).internal.getNumberOfPages();
          const pageHeight = doc.internal.pageSize.height;
          doc.setFontSize(7); doc.setTextColor(150);
          doc.text(emittedAt, 14, pageHeight - 8);
          doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
          doc.setTextColor(0);
        },
      });
    }

    const filePrefix = isReceivables ? 'a-receber' : 'contas-pagar-receber';
    doc.save(`${filePrefix}-${startDate || 'geral'}-${endDate || 'geral'}.pdf`);
  };

  // ─── XLS Export ───────────────────────────────────────────────────
  const exportXLS = () => {
    const headers = isReceivables
      ? ['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status']
      : ['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status'];
    const colSpan = headers.length;
    const tableRows = rowsWithBalance.map(r => isReceivables ? [
      r.contact?.name || r.description || '',
      Number(r.amount).toFixed(2).replace('.', ','),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
    ] : [
      formatDateBR(r.expected_date || ''),
      r.contact?.name || r.description || '',
      r.type === 'receita' ? Number(r.amount).toFixed(2).replace('.', ',') : '',
      r.type === 'despesa' ? Number(r.amount).toFixed(2).replace('.', ',') : '',
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
    ]);

    const headerRows = `
      <tr><td colspan="${colSpan}"><b>${company?.name || 'Empresa'}</b></td></tr>
      <tr><td colspan="${colSpan}">Período: ${periodLabel}</td></tr>
      <tr><td colspan="${colSpan}">Evento Contábil: ${categoryLabel}</td></tr>
      <tr><td colspan="${colSpan}">Cliente/Fornecedor: ${contactLabel}</td></tr>
      <tr><td colspan="${colSpan}"></td></tr>
    `;

    const eventSummary = buildEventSummary(filteredRows);
    const eventTotals = eventSummary.reduce(
      (acc, g) => ({
        qty: acc.qty + g.qty,
        receber: acc.receber + g.receber,
        pagar: acc.pagar + g.pagar,
        saldo: acc.saldo + g.saldo,
      }),
      { qty: 0, receber: 0, pagar: 0, saldo: 0 }
    );

    const eventBlock = eventSummary.length > 0
      ? `<tr><td colspan="${colSpan}"></td></tr>
         <tr><td colspan="${colSpan}"><b>Resumo por Evento Contábil</b></td></tr>
         <tr>${['Evento','Qtd','A Receber','A Pagar','Saldo'].map(h => `<th>${h}</th>`).join('')}</tr>
         ${eventSummary.map(g => `<tr><td>${g.name}</td><td>${g.qty}</td><td>${g.receber.toFixed(2).replace('.', ',')}</td><td>${g.pagar.toFixed(2).replace('.', ',')}</td><td>${g.saldo.toFixed(2).replace('.', ',')}</td></tr>`).join('')}
         <tr><td><b>TOTAL</b></td><td><b>${eventTotals.qty}</b></td><td><b>${eventTotals.receber.toFixed(2).replace('.', ',')}</b></td><td><b>${eventTotals.pagar.toFixed(2).replace('.', ',')}</b></td><td><b>${eventTotals.saldo.toFixed(2).replace('.', ',')}</b></td></tr>`
      : '';

    const table = `<table>${headerRows}<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${tableRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}${eventBlock}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filePrefix = isReceivables ? 'a-receber' : 'contas-pagar-receber';
    a.download = `${filePrefix}-${startDate || 'geral'}-${endDate || 'geral'}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── CSV Export ───────────────────────────────────────────────────
  const exportCSV = () => {
    const metaLines = [
      company?.name || 'Empresa',
      `Período: ${periodLabel}`,
      `Evento Contábil: ${categoryLabel}`,
      `Cliente/Fornecedor: ${contactLabel}`,
      '',
    ];

    const headers = isReceivables
      ? ['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status']
      : ['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status'];
    const dataLines = rowsWithBalance.map(r => (isReceivables ? [
      `"${(r.contact?.name || r.description || '').replace(/"/g, '""')}"`,
      Number(r.amount).toFixed(2).replace('.', ','),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
    ] : [
      formatDateBR(r.expected_date || ''),
      `"${(r.contact?.name || r.description || '').replace(/"/g, '""')}"`,
      r.type === 'receita' ? Number(r.amount).toFixed(2).replace('.', ',') : '',
      r.type === 'despesa' ? Number(r.amount).toFixed(2).replace('.', ',') : '',
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
    ]).join(';'));

    const eventSummary = buildEventSummary(filteredRows);
    const eventTotals = eventSummary.reduce(
      (acc, g) => ({
        qty: acc.qty + g.qty,
        receber: acc.receber + g.receber,
        pagar: acc.pagar + g.pagar,
        saldo: acc.saldo + g.saldo,
      }),
      { qty: 0, receber: 0, pagar: 0, saldo: 0 }
    );

    const eventCsvLines: string[] = [];
    if (eventSummary.length > 0) {
      eventCsvLines.push('');
      eventCsvLines.push('Resumo por Evento Contábil');
      eventCsvLines.push(['Evento', 'Qtd', 'A Receber', 'A Pagar', 'Saldo'].join(';'));
      for (const g of eventSummary) {
        eventCsvLines.push([
          `"${g.name.replace(/"/g, '""')}"`,
          String(g.qty),
          g.receber.toFixed(2).replace('.', ','),
          g.pagar.toFixed(2).replace('.', ','),
          g.saldo.toFixed(2).replace('.', ','),
        ].join(';'));
      }
      eventCsvLines.push([
        'TOTAL',
        String(eventTotals.qty),
        eventTotals.receber.toFixed(2).replace('.', ','),
        eventTotals.pagar.toFixed(2).replace('.', ','),
        eventTotals.saldo.toFixed(2).replace('.', ','),
      ].join(';'));
    }

    const csv = [...metaLines, headers.join(';'), ...dataLines, ...eventCsvLines].join('\r\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filePrefix = isReceivables ? 'a-receber' : 'contas-pagar-receber';
    a.download = `${filePrefix}-${startDate || 'geral'}-${endDate || 'geral'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── JPEG Export ──────────────────────────────────────────────────
  const exportImage = async () => {
    if (!summaryRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
      });
      const url = canvas.toDataURL('image/jpeg', 0.92);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${isReceivables ? 'resumo-a-receber' : 'resumo-pagar-receber'}-${startDate || 'geral'}-${endDate || 'geral'}.jpg`;
      a.click();
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
    }
  };

  // ─── Monthly Exports ──────────────────────────────────────────────
  const exportMonthlyPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const emittedAt = `Emitido em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()} às ${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Consulta Mensal — Pagar/Receber', 14, 18);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${monthlyMonthsLabel} / ${monthlyYear} • ${monthlyStatusLabel}`, 14, 25);
    const tableStartY = 32;

    const monthsCount = sortedSelectedMonths.length || 1;
    const pageW = 297 - 28;

    // Format values: try with R$ prefix; fall back to compact (no "R$ ") if too tight
    const fmtFull = (v: number) => formatCurrency(v);
    const fmtCompact = (v: number) =>
      new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

    // Try font sizes from largest to smallest until everything fits in one line
    const fontSteps = [7.5, 7, 6.5, 6, 5.5];
    let chosenFont = fontSteps[fontSteps.length - 1];
    let useCompact = false;
    let monthW = 14;
    let totalW = 28;
    let eventW = Math.max(40, Math.min(60, pageW * 0.26));
    const cellPadX = 1.8 * 2;

    const measureMax = (fmt: (v: number) => string, font: number) => {
      doc.setFontSize(font);
      let maxMonth = 0;
      for (const m of sortedSelectedMonths) {
        for (const e of monthlyMatrix.events) {
          const w = doc.getTextWidth(fmt(e.monthly[m]));
          if (w > maxMonth) maxMonth = w;
        }
        const w = doc.getTextWidth(fmt(monthlyMatrix.colTotals[m]));
        if (w > maxMonth) maxMonth = w;
      }
      let maxTotal = 0;
      for (const e of monthlyMatrix.events) {
        const w = doc.getTextWidth(fmt(e.total));
        if (w > maxTotal) maxTotal = w;
      }
      maxTotal = Math.max(maxTotal, doc.getTextWidth(fmt(monthlyMatrix.grand)));
      return { maxMonth, maxTotal };
    };

    let resolved = false;
    for (const font of fontSteps) {
      for (const compact of [false, true]) {
        const fmt = compact ? fmtCompact : fmtFull;
        const { maxMonth, maxTotal } = measureMax(fmt, font);
        const reqMonth = maxMonth + cellPadX + 0.5;
        const reqTotal = maxTotal + cellPadX + 0.5;
        if (eventW + reqMonth * monthsCount + reqTotal <= pageW) {
          chosenFont = font;
          useCompact = compact;
          monthW = reqMonth;
          totalW = reqTotal;
          resolved = true;
          break;
        }
      }
      if (resolved) break;
    }
    if (!resolved) {
      // Fallback: smallest font + compact, distribute remaining width
      chosenFont = fontSteps[fontSteps.length - 1];
      useCompact = true;
      const { maxTotal } = measureMax(fmtCompact, chosenFont);
      totalW = maxTotal + cellPadX + 0.5;
      monthW = Math.max(10, (pageW - eventW - totalW) / monthsCount);
    }

    const fmt = useCompact ? fmtCompact : fmtFull;
    const head = [['Evento', ...sortedSelectedMonths.map(m => MONTHS_PT[m]), 'TOTAL']];

    // Build body rows based on version
    let body: string[][];
    let foot: string[][];
    const rowMeta: { isMacro?: boolean; isChild?: boolean }[] = [];

    if (monthlyVersion === 'completa') {
      body = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        // Macro row
        body.push([g.macroName, ...sortedSelectedMonths.map(m => fmt(g.monthly[m])), fmt(g.total)]);
        rowMeta.push({ isMacro: true });
        // Children
        for (const c of g.children) {
          body.push([c.name, ...sortedSelectedMonths.map(m => fmt(c.monthly[m])), fmt(c.total)]);
          rowMeta.push({ isChild: true });
        }
      }
      foot = [['TOTAL', ...sortedSelectedMonths.map(m => fmt(monthlyHierarchicalMatrix.colTotals[m])), fmt(monthlyHierarchicalMatrix.grand)]];
    } else {
      body = monthlyMatrix.events.map(e => [
        e.name,
        ...sortedSelectedMonths.map(m => fmt(e.monthly[m])),
        fmt(e.total),
      ]);
      foot = [[
        'TOTAL',
        ...sortedSelectedMonths.map(m => fmt(monthlyMatrix.colTotals[m])),
        fmt(monthlyMatrix.grand),
      ]];
    }

    const colStyles: Record<number, any> = {
      0: { cellWidth: eventW, halign: 'center', overflow: 'linebreak' },
    };
    for (let i = 1; i <= monthsCount; i++) {
      colStyles[i] = { cellWidth: monthW, halign: 'center', overflow: 'visible' };
    }
    colStyles[monthsCount + 1] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold', overflow: 'visible' };


    autoTable(doc, {
      startY: tableStartY,
      head, body, foot,
      theme: 'striped',
      styles: { fontSize: chosenFont, cellPadding: 1.8, overflow: 'visible', valign: 'middle', halign: 'center' },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', overflow: 'visible' },
      footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold', halign: 'center', overflow: 'visible' },

      alternateRowStyles: { fillColor: [248, 248, 248] },
      rowPageBreak: 'avoid',
      columnStyles: colStyles,
      didDrawCell: monthlyVersion === 'completa' ? (data) => {
        if (data.section !== 'body') return;
        const meta = rowMeta[data.row.index];
        if (meta?.isMacro) {
          doc.setFillColor(235, 235, 240);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40, 40, 40);
          doc.setFontSize(chosenFont);
          const text = String(data.cell.raw || '');
          doc.text(text, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        } else if (meta?.isChild) {
          doc.setFillColor(255, 255, 255);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(chosenFont > 6 ? chosenFont - 0.5 : chosenFont);
          (doc as any).setCharSpace?.(0);
          const text = String(data.cell.raw || '');
          const yPos = data.cell.y + data.cell.height / 2 + 1;
          doc.setTextColor(data.column.index === 0 ? 100 : 80, data.column.index === 0 ? 100 : 80, data.column.index === 0 ? 100 : 80);
          doc.text(text, data.cell.x + data.cell.width / 2, yPos, { align: 'center' });
        }
      } : undefined,

      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(emittedAt, 14, pageHeight - 8);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0);
      },
    });

    doc.save(`consulta-mensal-${monthlyYear}-${monthlyStatus}.pdf`);
  };

  const exportMonthlyXLS = () => {
    const monthHeaders = sortedSelectedMonths.map(m => MONTHS_PT[m]);
    const headers = ['Evento', ...monthHeaders, 'TOTAL'];
    const meta = `
      <tr><td colspan="${headers.length}"><b>${company?.name || 'Empresa'}</b></td></tr>
      <tr><td colspan="${headers.length}">Consulta Mensal — Pagar/Receber</td></tr>
      <tr><td colspan="${headers.length}">Ano: ${monthlyYear} • Status: ${monthlyStatusLabel} • Evento: ${monthlyCategoryLabel}</td></tr>
      <tr><td colspan="${headers.length}"></td></tr>
    `;
    let rows: string;
    let totalRow: string;
    if (monthlyVersion === 'completa') {
      const rowParts: string[] = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        rowParts.push(`<tr style="background:#EBEBF0;font-weight:bold"><td>${g.macroName}</td>${sortedSelectedMonths.map(m => `<td>${g.monthly[m].toFixed(2).replace('.', ',')}</td>`).join('')}<td>${g.total.toFixed(2).replace('.', ',')}</td></tr>`);
        for (const c of g.children) {
          rowParts.push(`<tr><td style="padding-left:16px;color:#666">${c.name}</td>${sortedSelectedMonths.map(m => `<td>${c.monthly[m].toFixed(2).replace('.', ',')}</td>`).join('')}<td>${c.total.toFixed(2).replace('.', ',')}</td></tr>`);
        }
      }
      rows = rowParts.join('');
      totalRow = `<tr><td><b>TOTAL</b></td>${sortedSelectedMonths.map(m => `<td><b>${monthlyHierarchicalMatrix.colTotals[m].toFixed(2).replace('.', ',')}</b></td>`).join('')}<td><b>${monthlyHierarchicalMatrix.grand.toFixed(2).replace('.', ',')}</b></td></tr>`;
    } else {
      rows = monthlyMatrix.events.map(e =>
        `<tr><td>${e.name}</td>${sortedSelectedMonths.map(m => `<td>${e.monthly[m].toFixed(2).replace('.', ',')}</td>`).join('')}<td>${e.total.toFixed(2).replace('.', ',')}</td></tr>`
      ).join('');
      totalRow = `<tr><td><b>TOTAL</b></td>${sortedSelectedMonths.map(m => `<td><b>${monthlyMatrix.colTotals[m].toFixed(2).replace('.', ',')}</b></td>`).join('')}<td><b>${monthlyMatrix.grand.toFixed(2).replace('.', ',')}</b></td></tr>`;
    }
    const table = `<table>${meta}<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${rows}${totalRow}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `consulta-mensal-${monthlyYear}-${monthlyStatus}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthlyCSV = () => {
    const monthHeaders = sortedSelectedMonths.map(m => MONTHS_PT[m]);
    const headers = ['Evento', ...monthHeaders, 'TOTAL'];
    const meta = [
      company?.name || 'Empresa',
      'Consulta Mensal — Pagar/Receber',
      `Ano: ${monthlyYear}`,
      `Status: ${monthlyStatusLabel}`,
      `Evento Contábil: ${monthlyCategoryLabel}`,
      '',
    ];
    let rows: string[];
    let totalRow: string;
    if (monthlyVersion === 'completa') {
      rows = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        rows.push([
          `"${g.macroName.replace(/"/g, '""')}"`,
          ...sortedSelectedMonths.map(m => g.monthly[m].toFixed(2).replace('.', ',')),
          g.total.toFixed(2).replace('.', ','),
        ].join(';'));
        for (const c of g.children) {
          rows.push([
            `"  ${c.name.replace(/"/g, '""')}"`,
            ...sortedSelectedMonths.map(m => c.monthly[m].toFixed(2).replace('.', ',')),
            c.total.toFixed(2).replace('.', ','),
          ].join(';'));
        }
      }
      totalRow = [
        'TOTAL',
        ...sortedSelectedMonths.map(m => monthlyHierarchicalMatrix.colTotals[m].toFixed(2).replace('.', ',')),
        monthlyHierarchicalMatrix.grand.toFixed(2).replace('.', ','),
      ].join(';');
    } else {
      rows = monthlyMatrix.events.map(e => [
        `"${e.name.replace(/"/g, '""')}"`,
        ...sortedSelectedMonths.map(m => e.monthly[m].toFixed(2).replace('.', ',')),
        e.total.toFixed(2).replace('.', ','),
      ].join(';'));
      totalRow = [
        'TOTAL',
        ...sortedSelectedMonths.map(m => monthlyMatrix.colTotals[m].toFixed(2).replace('.', ',')),
        monthlyMatrix.grand.toFixed(2).replace('.', ','),
      ].join(';');
    }
    const csv = [...meta, headers.join(';'), ...rows, totalRow].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `consulta-mensal-${monthlyYear}-${monthlyStatus}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => mode === 'monthly' ? exportMonthlyPDF() : exportPDF();
  const handleExportXLS = () => mode === 'monthly' ? exportMonthlyXLS() : exportXLS();
  const handleExportCSV = () => mode === 'monthly' ? exportMonthlyCSV() : exportCSV();

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto print-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {isReceivables ? 'Relatório de A Receber' : 'Relatório de Contas a Pagar/Receber'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex justify-center">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as 'report' | 'monthly')}
              className="bg-muted/50 rounded-md p-1"
            >
              <ToggleGroupItem value="report" className="px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                Relatório
              </ToggleGroupItem>
              <ToggleGroupItem value="monthly" className="px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                Consulta Mensal
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {mode === 'report' && (<>

          {/* Period with clear button */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">Período</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data Início</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min="1900-01-01" max="9999-12-31" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data Fim</Label>
                <div className="relative flex gap-1">
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min="1900-01-01" max="9999-12-31" className="flex-1" />
                  {(startDate || endDate) && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 no-print" onClick={clearDates} title="Limpar datas (Acumulado Geral)">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Category + Contact + Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm font-semibold mb-1 block">Evento Contábil</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-semibold mb-1 block">Cliente/Fornecedor</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isReceivables && (
            <div>
              <Label className="text-sm font-semibold mb-1 block">Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="receita">A Receber</SelectItem>
                  <SelectItem value="despesa">A Pagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
          </div>

          <Separator className="my-2" />

          {/* Preview Summary — 4 cards matching main screen */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">Preview do Resumo</Label>
            <div
              ref={summaryRef}
              className="bg-white rounded-lg border border-gray-200 p-3 space-y-2 print-visible"
              style={{ fontFamily: 'sans-serif' }}
            >
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Relatório de Contas a Pagar/Receber</h3>
                <p className="text-[10px] text-gray-500">Período: {periodLabel}</p>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-blue-50 rounded p-1.5 border-l-2 border-l-blue-500">
                  <p className="text-[9px] text-blue-700">Capital de Giro</p>
                  <p className={`font-bold text-[11px] ${kpis.capitalDeGiro >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatCurrency(kpis.capitalDeGiro)}</p>
                </div>
                <div className="bg-green-50 rounded p-1.5 border-l-2 border-l-green-500">
                  <p className="text-[9px] text-green-700">Entradas</p>
                  <p className="font-bold text-green-700 text-[11px]">{formatCurrency(kpis.entradas)}</p>
                </div>
                <div className="bg-red-50 rounded p-1.5 border-l-2 border-l-red-500">
                  <p className="text-[9px] text-red-700">Saídas</p>
                  <p className="font-bold text-red-700 text-[11px]">{formatCurrency(kpis.saidas)}</p>
                </div>
                <div className="bg-gray-50 rounded p-1.5 border-l-2 border-l-gray-400">
                  <p className="text-[9px] text-gray-600">Saldos Atuais</p>
                  <p className="font-bold text-gray-800 text-[11px]">{formatCurrency(kpis.totalBankBalance)}</p>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-1.5">
                <p className="text-[10px] text-gray-400">
                  {filteredRows.length} lançamentos • Gerado em {pad2(today.getDate())}/{pad2(today.getMonth() + 1)}/{today.getFullYear()}
                </p>
              </div>
            </div>
          </div>
          </>)}

          {mode === 'monthly' && (
            <div className="space-y-4">
              {/* Year pills */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Ano</Label>
                <div className="flex flex-wrap gap-2">
                  {availableYears.map(y => (
                    <Button
                      key={y}
                      type="button"
                      variant={monthlyYear === y ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setMonthlyYear(y);
                        setMonthlyMonths(autoFillMonths(monthlyStatus, y));
                      }}
                      className="h-8 px-3"
                    >
                      {y}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Status pills */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Status</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { v: 'paid', l: 'Pago/Recebido' },
                    { v: 'pending', l: 'Pagar/Receber' },
                  ] as const).map(opt => (
                    <Button
                      key={opt.v}
                      type="button"
                      variant={monthlyStatus === opt.v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setMonthlyStatus(opt.v);
                        setMonthlyMonths(autoFillMonths(opt.v, monthlyYear));
                      }}
                      className="h-8 px-3"
                    >
                      {opt.l}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Months pills */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Meses</Label>
                <div className="flex flex-wrap gap-2">
                  {MONTHS_PT.map((label, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant={monthlyMonths.has(idx) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleMonth(idx)}
                      className="h-8 w-14 px-0"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Event Category multi-select dropdown */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Evento Contábil</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className="truncate text-left">
                        {monthlySelectedCategories.size === 0
                          ? 'Todas as categorias'
                          : monthlySelectedCategories.size === 1
                          ? categories.find(c => monthlySelectedCategories.has(c.id))?.name || '1 selecionado'
                          : `${monthlySelectedCategories.size} eventos selecionados`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="p-2 border-b space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={monthlyCategorySearch}
                          onChange={(e) => setMonthlyCategorySearch(e.target.value)}
                          placeholder="Pesquisar evento..."
                          className="h-8 pl-7 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setMonthlySelectedCategories(new Set())}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                      >
                        <Checkbox checked={monthlySelectedCategories.size === 0} />
                        <span>Todas as categorias</span>
                      </button>
                    </div>
                    <ScrollArea className="h-64">
                      <div className="p-2 space-y-0.5">
                        {(() => {
                          const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                          const q = norm(monthlyCategorySearch.trim());
                          const filtered = q ? categories.filter(c => norm(c.name).includes(q)) : categories;
                          if (filtered.length === 0) {
                            return <div className="px-2 py-4 text-sm text-muted-foreground text-center">Nenhum evento encontrado</div>;
                          }
                          return filtered.map(cat => {
                            const checked = monthlySelectedCategories.has(cat.id);
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  setMonthlySelectedCategories(prev => {
                                    const next = new Set(prev);
                                    if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                              >
                                <Checkbox checked={checked} />
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#3B82F6' }} />
                                <span className="truncate">{cat.name}</span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Version toggle */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Versão do Relatório</Label>
                <ToggleGroup
                  type="single"
                  value={monthlyVersion}
                  onValueChange={(v) => v && setMonthlyVersion(v as 'resumida' | 'completa')}
                  className="bg-muted/50 rounded-md p-1 w-full"
                >
                  <ToggleGroupItem value="resumida" className="flex-1 px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm text-xs">
                    Versão Resumida
                  </ToggleGroupItem>
                  <ToggleGroupItem value="completa" className="flex-1 px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm text-xs">
                    Versão Completa
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Preview summary */}
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Eventos com valor:</span>
                  <span className="font-semibold">
                    {monthlyVersion === 'completa'
                      ? `${monthlyHierarchicalMatrix.groups.length} eventos`
                      : monthlyMatrix.events.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Meses selecionados:</span>
                  <span className="font-semibold">{sortedSelectedMonths.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total geral:</span>
                  <span className={cn('font-semibold',
                    (monthlyVersion === 'completa' ? monthlyHierarchicalMatrix.grand : monthlyMatrix.grand) >= 0
                      ? 'text-green-600' : 'text-red-600'
                  )}>
                    {formatCurrency(monthlyVersion === 'completa' ? monthlyHierarchicalMatrix.grand : monthlyMatrix.grand)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Separator className="my-2" />

          {/* Export buttons */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Exportar</Label>
            <div className={cn('grid gap-2', mode === 'monthly' ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-5')}>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs no-print" onClick={handleExportPDF}>
                <FileText className="w-3.5 h-3.5 text-red-500" /> PDF
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs no-print" onClick={handleExportXLS}>
                <Table2 className="w-3.5 h-3.5 text-green-600" /> XLS
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs no-print" onClick={handleExportCSV}>
                <Table2 className="w-3.5 h-3.5 text-green-600" /> CSV
              </Button>
              {mode === 'report' && (
                <>
                  <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs no-print" onClick={exportImage}>
                    <Image className="w-3.5 h-3.5 text-purple-500" /> Imagem
                  </Button>
                  <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs no-print" onClick={handlePrint}>
                    <Printer className="w-3.5 h-3.5 text-muted-foreground" /> Imprimir
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
