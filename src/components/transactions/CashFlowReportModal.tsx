import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateField, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { cn } from '@/lib/utils';
import { FileText, X, ChevronDown, Search } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { format, parseISO, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { zebraPorData } from '@/lib/pdf-zebra';
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

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function weekdayOf(iso?: string | null): string {
  if (!iso) return '';
  const src = iso.includes('/') ? iso.split('/').reverse().join('-') : iso;
  const [y, m, d] = src.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS_PT[new Date(y, m - 1, d).getDay()];
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
  const isInternalCompany = (company as any)?.is_internal === true;
  const summaryRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'report' | 'monthly'>('report');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [categorySearch, setCategorySearch] = useState('');
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');
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
  const [monthlySelectedContacts, setMonthlySelectedContacts] = useState<Set<string>>(new Set());
  const [monthlyContactSearch, setMonthlyContactSearch] = useState('');
  const [monthlyMonths, setMonthlyMonths] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let m = currentMonth; m <= 11; m++) s.add(m);
    return s;
  });
  const [monthlyFilterMode, setMonthlyFilterMode] = useState<'months' | 'period'>('months');
  const [monthlyPeriodStart, setMonthlyPeriodStart] = useState('');
  const [monthlyPeriodEnd, setMonthlyPeriodEnd] = useState('');
  const [monthlyGroupBy, setMonthlyGroupBy] = useState<'evento' | 'cliente'>('evento');

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
      setCategoryIds(new Set(initialCategoryIds));
      setCategorySearch('');
      setContactIds(new Set(initialContactIds));
      setContactSearch('');
      setTypeFilter(isReceivables ? 'receita' : 'all');
      setMonthlyYear(currentYear);
      setMonthlyStatus('pending');
      setMonthlySelectedCategories(new Set());
      setMonthlySelectedContacts(new Set());
      setMonthlyVersion('resumida');
      setMonthlyMonths(autoFillMonths('pending', currentYear));
      setMonthlyFilterMode('months');
      setMonthlyPeriodStart('');
      setMonthlyPeriodEnd('');
      setMonthlyGroupBy('evento');
    }
    // Só reseta na transição fechado→aberto. `initialCategoryIds`/`initialContactIds`
    // não entram nas deps de propósito — são arrays novos a cada render do pai (ex.:
    // `columnFilters.contactIds || []` em CashFlowTab.tsx), e depender deles aqui fazia
    // esse efeito disparar de novo a qualquer re-render externo enquanto o modal já
    // estava aberto, jogando a aba de volta pra "Relatório" sem o usuário tocar em nada
    // — achado ao vivo nesta sessão (22/08/2026), não um comportamento do Figma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = new Date();

  const periodLabel = startDate && endDate
    ? `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`
    : 'Acumulado Geral';
  const categoryLabel = categoryIds.size === 0
    ? 'Todos'
    : categoryIds.size === 1
      ? categories.find(c => categoryIds.has(c.id))?.name || '1 selecionado'
      : `${categoryIds.size} eventos selecionados`;
  const contactLabel = contactIds.size === 0
    ? 'Todos'
    : contactIds.size === 1
      ? contacts.find(c => contactIds.has(c.id))?.name || '1 selecionado'
      : `${contactIds.size} selecionados`;
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

  // Interno (Eventos Contábeis): só sub-eventos aparecem nos filtros (macro é
  // cabeçalho de agrupamento, some aqui mas segue visível na tela de cadastro).
  // Cliente (Categorias) não força hierarquia — toda categoria entra.
  const subCategories = useMemo(
    () => categories.filter(c => !isInternalCompany || (c.parent_id !== null && c.parent_id !== undefined)),
    [categories, isInternalCompany],
  );

  const activeBanks = useMemo(() => banks.filter(b => b.is_active), [banks]);
  const totalBankBalance = useMemo(() => activeBanks.reduce((s, b) => s + Number(b.current_balance), 0), [activeBanks]);

  // Pre-filter: in receivables mode, only "A Receber" entries (receita > 0)
  // with Evento Contábil: Honorários Contábeis — mirrors CashFlowTab
  const txns = useMemo(() => {
    if (!isReceivables) return transactions;
    return transactions.filter(
      t => t.type === 'receita' && Number(t.amount) > 0 && t.category?.name === 'Honorários Contábeis'
    );
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

    if (categoryIds.size > 0) result = result.filter(t => !!t.category_id && categoryIds.has(t.category_id));
    if (contactIds.size > 0) result = result.filter(t => !!t.contact_id && contactIds.has(t.contact_id));
    if (typeFilter !== 'all') result = result.filter(t => t.type === typeFilter);

    result.sort((a, b) => (dateKeyOf(a) || '').localeCompare(dateKeyOf(b) || ''));
    return result;
  }, [txns, startDate, endDate, categoryIds, contactIds, typeFilter, isReceivables]);

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

  // Colunas ativas da Consulta Mensal: meses do ano selecionado (modo padrão)
  // ou os meses cobertos pelo período personalizado (pode cruzar anos).
  const activeColumns = useMemo(() => {
    if (monthlyFilterMode === 'period') {
      if (!monthlyPeriodStart || !monthlyPeriodEnd) return [] as { year: number; month: number }[];
      const [sy, sm] = monthlyPeriodStart.split('-').map(Number);
      const [ey, em] = monthlyPeriodEnd.split('-').map(Number);
      const endMonthIdx = em - 1;
      const cols: { year: number; month: number }[] = [];
      let y = sy, m = sm - 1, guard = 0;
      while ((y < ey || (y === ey && m <= endMonthIdx)) && guard < 240) {
        cols.push({ year: y, month: m });
        m++;
        if (m > 11) { m = 0; y++; }
        guard++;
      }
      return cols;
    }
    return sortedSelectedMonths.map(m => ({ year: monthlyYear, month: m }));
  }, [monthlyFilterMode, monthlyPeriodStart, monthlyPeriodEnd, sortedSelectedMonths, monthlyYear]);

  const columnLabel = (c: { year: number; month: number }) =>
    monthlyFilterMode === 'period' ? `${MONTHS_PT[c.month]}/${String(c.year).slice(2)}` : MONTHS_PT[c.month];

  const monthlyPeriodDisplay = monthlyFilterMode === 'period'
    ? (monthlyPeriodStart && monthlyPeriodEnd ? `${formatDateBR(monthlyPeriodStart)} a ${formatDateBR(monthlyPeriodEnd)}` : 'Selecione o período')
    : `${sortedSelectedMonths.map(m => MONTHS_PT[m]).join(', ') || '—'} / ${monthlyYear}`;

  const macroColumnLabel = monthlyGroupBy === 'cliente' ? 'Cliente/Fornecedor' : 'Evento';
  const monthlyTitleSuffix = monthlyGroupBy === 'cliente' ? ' — por Cliente/Fornecedor' : '';

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

  // ─── Agrupamento mensal: Evento Contábil ou Cliente/Fornecedor ────
  // Estrutura única (macro → filhos) serve tanto a Versão Resumida (só macro)
  // quanto a Completa (macro + filhos) — e tanto o agrupamento por Evento
  // quanto por Cliente/Fornecedor, trocando qual é macro e qual é filho.
  type HierarchicalGroup = {
    macroName: string;
    macroColor: string | null;
    monthly: number[];
    total: number;
    children: { name: string; color: string | null; monthly: number[]; total: number }[];
  };

  const getEventKey = (t: Transaction, catMap: Map<string, Category>) => {
    const catId = t.category_id || '__none__';
    const cat = catId !== '__none__' ? catMap.get(catId) : null;
    return { id: catId, name: cat?.name || 'Sem evento', color: cat?.color ?? null };
  };
  const getContactKey = (t: Transaction) => ({
    id: t.contact?.id || '__no_contact__',
    name: t.contact?.name || 'Sem cliente/fornecedor',
    color: null as string | null,
  });

  const monthlyGroups = useMemo(() => {
    const isPaid = monthlyStatus === 'paid';
    const catMap = new Map(categories.map(c => [c.id, c]));
    const colIndex = new Map(activeColumns.map((c, i) => [`${c.year}-${pad2(c.month + 1)}`, i]));

    const rows = txns.filter(t => {
      if (t.is_paid !== isPaid) return false;
      const ref = isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date);
      if (!ref || !colIndex.has(ref.slice(0, 7))) return false;
      // O filtro pré-agregação segue a mesma dimensão do agrupamento ativo
      // (Evento Contábil ou Cliente/Fornecedor) — a seleção de cada um fica
      // guardada à parte, então trocar de aba não perde o filtro anterior.
      if (monthlyGroupBy === 'cliente') {
        if (monthlySelectedContacts.size > 0 && !monthlySelectedContacts.has(t.contact_id || '__no_contact__')) return false;
      } else {
        if (expandedSelectedCategories.size > 0 && !expandedSelectedCategories.has(t.category_id)) return false;
      }
      return true;
    });

    const macroKeyFn = monthlyGroupBy === 'cliente' ? getContactKey : (t: Transaction) => getEventKey(t, catMap);
    const childKeyFn = monthlyGroupBy === 'cliente' ? (t: Transaction) => getEventKey(t, catMap) : getContactKey;

    const macroMap = new Map<string, {
      name: string; color: string | null; monthly: number[]; total: number;
      children: Map<string, { name: string; monthly: number[]; total: number }>;
    }>();

    for (const t of rows) {
      const ref = (isPaid ? t.date : (isReceivables ? (t.due_date || t.expected_date) : t.expected_date))!;
      const colIdx = colIndex.get(ref.slice(0, 7))!;
      const amt = Number(isPaid ? (t.paid_amount ?? t.amount) : t.amount);
      const signed = t.type === 'receita' ? amt : -amt;

      const macro = macroKeyFn(t);
      let mg = macroMap.get(macro.id);
      if (!mg) {
        mg = { name: macro.name, color: macro.color, monthly: Array(activeColumns.length).fill(0), total: 0, children: new Map() };
        macroMap.set(macro.id, mg);
      }
      mg.monthly[colIdx] += signed;
      mg.total += signed;

      const child = childKeyFn(t);
      let cg = mg.children.get(child.id);
      if (!cg) {
        cg = { name: child.name, monthly: Array(activeColumns.length).fill(0), total: 0 };
        mg.children.set(child.id, cg);
      }
      cg.monthly[colIdx] += signed;
      cg.total += signed;
    }

    const groups: HierarchicalGroup[] = Array.from(macroMap.values())
      .filter(g => Math.abs(g.total) > 0.0001)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .map(g => ({
        macroName: g.name,
        macroColor: g.color,
        monthly: g.monthly,
        total: g.total,
        children: Array.from(g.children.values())
          .filter(c => Math.abs(c.total) > 0.0001)
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      }));

    const colTotals: number[] = Array(activeColumns.length).fill(0);
    let grand = 0;
    for (const g of groups) {
      g.monthly.forEach((v, i) => { colTotals[i] += v; });
      grand += g.total;
    }

    return { groups, colTotals, grand };
  }, [txns, monthlyStatus, expandedSelectedCategories, monthlySelectedContacts, activeColumns, categories, isReceivables, monthlyGroupBy]);

  // Versão Resumida usa só o nível macro (mesmos totais, sem os filhos)
  const monthlyMatrix = useMemo(() => ({
    events: monthlyGroups.groups.map(g => ({ name: g.macroName, color: g.macroColor, monthly: g.monthly, total: g.total })),
    colTotals: monthlyGroups.colTotals,
    grand: monthlyGroups.grand,
  }), [monthlyGroups]);

  const monthlyHierarchicalMatrix = monthlyGroups;

  const monthlyCategoryLabel = useMemo(() => {
    if (monthlySelectedCategories.size === 0) return 'Todas';
    const names = categories.filter(c => monthlySelectedCategories.has(c.id)).map(c => c.name);
    if (names.length === 1) return names[0];
    return `${names.length} eventos: ${names.join(', ')}`;
  }, [monthlySelectedCategories, categories]);
  const monthlyContactLabel = useMemo(() => {
    if (monthlySelectedContacts.size === 0) return 'Todos';
    const names = contacts.filter(c => monthlySelectedContacts.has(c.id)).map(c => c.name);
    if (names.length === 1) return names[0];
    return `${names.length} selecionados: ${names.join(', ')}`;
  }, [monthlySelectedContacts, contacts]);
  const monthlyFilterDimensionLabel = monthlyGroupBy === 'cliente' ? 'Cliente/Fornecedor' : 'Evento Contábil';
  const monthlyFilterValueLabel = monthlyGroupBy === 'cliente' ? monthlyContactLabel : monthlyCategoryLabel;
  const monthlyStatusLabel = monthlyStatus === 'paid' ? 'Pago/Recebido' : 'Pagar/Receber';

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
      ? [['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia']]
      : [['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia']];
    const body = rowsWithBalance.map(r => isReceivables ? [
      r.contact?.name || r.description,
      formatCurrency(Number(r.amount)),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      formatCurrency(r.saldoAtual),
      getStatus(r.is_paid, r.due_date),
      weekdayOf(r.due_date || r.expected_date),
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
      weekdayOf(r.expected_date || r.due_date),
    ]);
    const columnStyles = isReceivables ? {
      0: { cellWidth: 50, halign: 'center' as const },
      1: { cellWidth: 32, halign: 'center' as const },
      2: { cellWidth: 24, halign: 'center' as const },
      3: { cellWidth: 36, halign: 'center' as const },
      4: { cellWidth: 56, halign: 'center' as const },
      5: { cellWidth: 30, halign: 'center' as const },
      6: { cellWidth: 16, halign: 'center' as const },
      7: { cellWidth: 12, halign: 'center' as const },
    } : {
      0: { cellWidth: 20, halign: 'center' as const },
      1: { cellWidth: 38, halign: 'center' as const },
      2: { cellWidth: 24, halign: 'center' as const },
      3: { cellWidth: 24, halign: 'center' as const },
      4: { cellWidth: 22, halign: 'center' as const },
      5: { cellWidth: 28, halign: 'center' as const },
      6: { cellWidth: 38, halign: 'center' as const },
      7: { cellWidth: 26, halign: 'center' as const },
      8: { cellWidth: 18, halign: 'center' as const },
      9: { cellWidth: 12, halign: 'center' as const },
    };

    // Chave do agrupamento visual: a data que a tabela usa como referência em cada modo
    // (vencimento em "A Receber", data prevista no fluxo completo).
    const chavesDeData = rowsWithBalance.map(r =>
      isReceivables
        ? (r.due_date ? formatDateBR(r.due_date) : '')
        : formatDateBR(r.expected_date || r.due_date || '')
    );

    autoTable(doc, {
      startY: sepY + 10,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', lineColor: [235, 238, 242], lineWidth: 0.1 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
      // Destaque agrupado por data (não linha sim/linha não).
      ...zebraPorData(chavesDeData),
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
      ? ['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia']
      : ['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia'];
    const colSpan = headers.length;
    const tableRows = rowsWithBalance.map(r => isReceivables ? [
      r.contact?.name || r.description || '',
      Number(r.amount).toFixed(2).replace('.', ','),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      r.notes || '',
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
      weekdayOf(r.due_date || r.expected_date),
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
      weekdayOf(r.expected_date || r.due_date),
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
      ? ['Cliente', 'Receber', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia']
      : ['Prevista', 'Cliente', 'Receber', 'Pagar', 'Vencimento', 'Evento', 'Histórico', 'Saldo Atual', 'Status', 'Dia'];
    const dataLines = rowsWithBalance.map(r => (isReceivables ? [
      `"${(r.contact?.name || r.description || '').replace(/"/g, '""')}"`,
      Number(r.amount).toFixed(2).replace('.', ','),
      r.due_date ? formatDateBR(r.due_date) : '',
      r.category?.name || '',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
      r.saldoAtual.toFixed(2).replace('.', ','),
      getStatus(r.is_paid, r.due_date),
      weekdayOf(r.due_date || r.expected_date),
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
      weekdayOf(r.expected_date || r.due_date),
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
  const monthlyFileSuffix = monthlyFilterMode === 'period'
    ? `${monthlyPeriodStart || 'geral'}_${monthlyPeriodEnd || 'geral'}`
    : `${monthlyYear}`;
  const monthlyFilePrefix = `consulta-mensal${monthlyGroupBy === 'cliente' ? '-cliente' : ''}-${monthlyFileSuffix}-${monthlyStatus}`;

  const exportMonthlyPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const emittedAt = `Emitido em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()} às ${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text((isReceivables ? 'Consulta Mensal — A Receber' : 'Consulta Mensal — Pagar/Receber') + monthlyTitleSuffix, 14, 18);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${monthlyPeriodDisplay} • ${monthlyStatusLabel}`, 14, 25);
    const tableStartY = 32;

    const monthsCount = activeColumns.length || 1;
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
      for (let i = 0; i < activeColumns.length; i++) {
        for (const e of monthlyMatrix.events) {
          const w = doc.getTextWidth(fmt(e.monthly[i]));
          if (w > maxMonth) maxMonth = w;
        }
        const w = doc.getTextWidth(fmt(monthlyMatrix.colTotals[i]));
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
    const head = [[macroColumnLabel, ...activeColumns.map(columnLabel), 'TOTAL']];

    // Build body rows based on version
    let body: string[][];
    let foot: string[][];
    const rowMeta: { isMacro?: boolean; isChild?: boolean }[] = [];

    if (monthlyVersion === 'completa') {
      body = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        // Macro row
        body.push([g.macroName, ...g.monthly.map(fmt), fmt(g.total)]);
        rowMeta.push({ isMacro: true });
        // Children
        for (const c of g.children) {
          body.push([c.name, ...c.monthly.map(fmt), fmt(c.total)]);
          rowMeta.push({ isChild: true });
        }
      }
      foot = [['TOTAL', ...monthlyHierarchicalMatrix.colTotals.map(fmt), fmt(monthlyHierarchicalMatrix.grand)]];
    } else {
      body = monthlyMatrix.events.map(e => [
        e.name,
        ...e.monthly.map(fmt),
        fmt(e.total),
      ]);
      foot = [[
        'TOTAL',
        ...monthlyMatrix.colTotals.map(fmt),
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

    doc.save(`${monthlyFilePrefix}.pdf`);
  };

  const exportMonthlyXLS = () => {
    const monthHeaders = activeColumns.map(columnLabel);
    const headers = [macroColumnLabel, ...monthHeaders, 'TOTAL'];
    const meta = `
      <tr><td colspan="${headers.length}"><b>${company?.name || 'Empresa'}</b></td></tr>
      <tr><td colspan="${headers.length}">${(isReceivables ? 'Consulta Mensal — A Receber' : 'Consulta Mensal — Pagar/Receber') + monthlyTitleSuffix}</td></tr>
      <tr><td colspan="${headers.length}">Período: ${monthlyPeriodDisplay} • Status: ${monthlyStatusLabel} • ${monthlyFilterDimensionLabel}: ${monthlyFilterValueLabel}</td></tr>
      <tr><td colspan="${headers.length}"></td></tr>
    `;
    let rows: string;
    let totalRow: string;
    if (monthlyVersion === 'completa') {
      const rowParts: string[] = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        rowParts.push(`<tr style="background:#EBEBF0;font-weight:bold"><td>${g.macroName}</td>${g.monthly.map(v => `<td>${v.toFixed(2).replace('.', ',')}</td>`).join('')}<td>${g.total.toFixed(2).replace('.', ',')}</td></tr>`);
        for (const c of g.children) {
          rowParts.push(`<tr><td style="padding-left:16px;color:#666">${c.name}</td>${c.monthly.map(v => `<td>${v.toFixed(2).replace('.', ',')}</td>`).join('')}<td>${c.total.toFixed(2).replace('.', ',')}</td></tr>`);
        }
      }
      rows = rowParts.join('');
      totalRow = `<tr><td><b>TOTAL</b></td>${monthlyHierarchicalMatrix.colTotals.map(v => `<td><b>${v.toFixed(2).replace('.', ',')}</b></td>`).join('')}<td><b>${monthlyHierarchicalMatrix.grand.toFixed(2).replace('.', ',')}</b></td></tr>`;
    } else {
      rows = monthlyMatrix.events.map(e =>
        `<tr><td>${e.name}</td>${e.monthly.map(v => `<td>${v.toFixed(2).replace('.', ',')}</td>`).join('')}<td>${e.total.toFixed(2).replace('.', ',')}</td></tr>`
      ).join('');
      totalRow = `<tr><td><b>TOTAL</b></td>${monthlyMatrix.colTotals.map(v => `<td><b>${v.toFixed(2).replace('.', ',')}</b></td>`).join('')}<td><b>${monthlyMatrix.grand.toFixed(2).replace('.', ',')}</b></td></tr>`;
    }
    const table = `<table>${meta}<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${rows}${totalRow}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${monthlyFilePrefix}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthlyCSV = () => {
    const monthHeaders = activeColumns.map(columnLabel);
    const headers = [macroColumnLabel, ...monthHeaders, 'TOTAL'];
    const meta = [
      company?.name || 'Empresa',
      (isReceivables ? 'Consulta Mensal — A Receber' : 'Consulta Mensal — Pagar/Receber') + monthlyTitleSuffix,
      `Período: ${monthlyPeriodDisplay}`,
      `Status: ${monthlyStatusLabel}`,
      `${monthlyFilterDimensionLabel}: ${monthlyFilterValueLabel}`,
      '',
    ];
    let rows: string[];
    let totalRow: string;
    if (monthlyVersion === 'completa') {
      rows = [];
      for (const g of monthlyHierarchicalMatrix.groups) {
        rows.push([
          `"${g.macroName.replace(/"/g, '""')}"`,
          ...g.monthly.map(v => v.toFixed(2).replace('.', ',')),
          g.total.toFixed(2).replace('.', ','),
        ].join(';'));
        for (const c of g.children) {
          rows.push([
            `"  ${c.name.replace(/"/g, '""')}"`,
            ...c.monthly.map(v => v.toFixed(2).replace('.', ',')),
            c.total.toFixed(2).replace('.', ','),
          ].join(';'));
        }
      }
      totalRow = [
        'TOTAL',
        ...monthlyHierarchicalMatrix.colTotals.map(v => v.toFixed(2).replace('.', ',')),
        monthlyHierarchicalMatrix.grand.toFixed(2).replace('.', ','),
      ].join(';');
    } else {
      rows = monthlyMatrix.events.map(e => [
        `"${e.name.replace(/"/g, '""')}"`,
        ...e.monthly.map(v => v.toFixed(2).replace('.', ',')),
        e.total.toFixed(2).replace('.', ','),
      ].join(';'));
      totalRow = [
        'TOTAL',
        ...monthlyMatrix.colTotals.map(v => v.toFixed(2).replace('.', ',')),
        monthlyMatrix.grand.toFixed(2).replace('.', ','),
      ].join(';');
    }
    const csv = [...meta, headers.join(';'), ...rows, totalRow].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${monthlyFilePrefix}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => mode === 'monthly' ? exportMonthlyPDF() : exportPDF();
  const handleExportXLS = () => mode === 'monthly' ? exportMonthlyXLS() : exportXLS();
  const handleExportCSV = () => mode === 'monthly' ? exportMonthlyCSV() : exportCSV();

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto print-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-action" />
            {isReceivables ? 'Relatório de A Receber' : 'Relatório de Contas a Pagar/Receber'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'report' | 'monthly')}>
            <TabsList className={cn(segmentedListClass, 'w-full h-11')}>
              <TabsTrigger value="report" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Relatório</TabsTrigger>
              <TabsTrigger value="monthly" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Consulta Mensal</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'report' && (<>

          {/* Period with clear button */}
          <div>
            <Label className="text-kicker uppercase text-muted-ink mb-2 block">Período</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-ink-2">Data Início</Label>
                <DateField value={startDate} onChange={setStartDate} min="1900-01-01" max="9999-12-31" />
              </div>
              <div className="space-y-1">
                <Label className="text-ink-2">Data Fim</Label>
                <div className="relative flex gap-1">
                  <DateField value={endDate} onChange={setEndDate} min="1900-01-01" max="9999-12-31" className="flex-1" />
                  {(startDate || endDate) && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 no-print" onClick={clearDates} title="Limpar datas (Acumulado Geral)">
                      <X className="w-4 h-4 text-muted-ink" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Category + Contact + Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-ink-2 mb-2 block">Evento Contábil</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate text-left">{categoryLabel}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="p-2 border-b border-line-2 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-ink" />
                      <Input
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        placeholder="Pesquisar evento..."
                        className="h-8 pl-7 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCategoryIds(new Set())}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
                    >
                      <Checkbox checked={categoryIds.size === 0} />
                      <span>Todos</span>
                    </button>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-2 space-y-0.5">
                      {(() => {
                        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const q = norm(categorySearch.trim());
                        const filtered = q ? subCategories.filter(c => norm(c.name).includes(q)) : subCategories;
                        if (filtered.length === 0) {
                          return <div className="px-2 py-4 text-sm text-muted-ink text-center">Nenhum evento encontrado</div>;
                        }
                        return filtered.map(cat => {
                          const checked = categoryIds.has(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                setCategoryIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                                  return next;
                                });
                              }}
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
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
            <div>
              <Label className="text-ink-2 mb-2 block">Cliente/Fornecedor</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate text-left">{contactLabel}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="p-2 border-b border-line-2 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-ink" />
                      <Input
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Pesquisar cliente/fornecedor..."
                        className="h-8 pl-7 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setContactIds(new Set())}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
                    >
                      <Checkbox checked={contactIds.size === 0} />
                      <span>Todos</span>
                    </button>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-2 space-y-0.5">
                      {(() => {
                        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const q = norm(contactSearch.trim());
                        const filtered = q ? contacts.filter(c => norm(c.name).includes(q)) : contacts;
                        if (filtered.length === 0) {
                          return <div className="px-2 py-4 text-sm text-muted-ink text-center">Nenhum cliente/fornecedor encontrado</div>;
                        }
                        return filtered.map(ct => {
                          const checked = contactIds.has(ct.id);
                          return (
                            <button
                              key={ct.id}
                              type="button"
                              onClick={() => {
                                setContactIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(ct.id)) next.delete(ct.id); else next.add(ct.id);
                                  return next;
                                });
                              }}
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
                            >
                              <Checkbox checked={checked} />
                              <span className="truncate">{ct.name}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
            {!isReceivables && (
            <div>
              <Label className="text-ink-2 mb-2 block">Tipo</Label>
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

          {/* Preview Summary — 4 cards matching main screen. Segue o tema (claro/escuro)
              a partir do redesign do modal Relatório Pagar/Receber (22/08/2026) — o
              Figma passou a mostrar esse card se adaptando, diferente da exceção
              "sempre branco, é print" registrada antes pros modais de relatório. */}
          <div>
            <Label className="text-kicker uppercase text-muted-ink mb-2 block">Preview do Resumo</Label>
            <div
              ref={summaryRef}
              className="rounded-lg border border-line bg-paper p-3 space-y-2 print-visible"
            >
              <div>
                <h3 className="font-bold text-ink text-sm">{isReceivables ? 'Relatório de A Receber' : 'Relatório de Contas a Pagar/Receber'}</h3>
                <p className="text-[10px] text-muted-ink">Período: {periodLabel}</p>
              </div>
              <div className={`grid ${isReceivables ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5`}>
                <div className="bg-action-tint rounded p-1.5 border-l-2 border-l-action">
                  <p className="text-[9px] text-action">Capital de Giro</p>
                  <p className={`font-bold text-[11px] ${kpis.capitalDeGiro >= 0 ? 'text-action' : 'text-danger'}`}>{formatCurrency(kpis.capitalDeGiro)}</p>
                </div>
                <div className="bg-ok-soft rounded p-1.5 border-l-2 border-l-ok">
                  <p className="text-[9px] text-ok">Entradas</p>
                  <p className="font-bold text-ok text-[11px]">{formatCurrency(kpis.entradas)}</p>
                </div>
                {!isReceivables && (
                  <div className="bg-danger-soft rounded p-1.5 border-l-2 border-l-danger">
                    <p className="text-[9px] text-danger">Saídas</p>
                    <p className="font-bold text-danger text-[11px]">{formatCurrency(kpis.saidas)}</p>
                  </div>
                )}
                <div className="bg-bg-2 rounded p-1.5 border-l-2 border-l-muted-ink-2">
                  <p className="text-[9px] text-muted-ink">Saldos Atuais</p>
                  <p className="font-bold text-ink text-[11px]">{formatCurrency(kpis.totalBankBalance)}</p>
                </div>
              </div>
              <div className="border-t border-line-2 pt-1.5">
                <p className="text-[10px] text-muted-ink-2">
                  {filteredRows.length} lançamentos • Gerado em {pad2(today.getDate())}/{pad2(today.getMonth() + 1)}/{today.getFullYear()}
                </p>
              </div>
            </div>
          </div>
          </>)}

          {mode === 'monthly' && (
            <div className="space-y-4">
              {/* Filtrar por: Meses do Ano ou Período Personalizado */}
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Filtrar por</Label>
                <Tabs value={monthlyFilterMode} onValueChange={(v) => setMonthlyFilterMode(v as 'months' | 'period')}>
                  <TabsList className={cn(segmentedListClass, 'w-full h-11')}>
                    <TabsTrigger value="months" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Meses do Ano</TabsTrigger>
                    <TabsTrigger value="period" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Período Personalizado</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Status pills — ordem do Figma: Status vem antes de Ano (22/08/2026) */}
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Status</Label>
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

              {monthlyFilterMode === 'months' && (
              /* Year pills */
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Ano</Label>
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
              )}

              {monthlyFilterMode === 'months' ? (
              /* Months pills */
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Meses</Label>
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
              ) : (
              /* Período personalizado */
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Período</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-ink-2">Data Início</Label>
                    <DateField value={monthlyPeriodStart} onChange={setMonthlyPeriodStart} min="1900-01-01" max="9999-12-31" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-ink-2">Data Fim</Label>
                    <DateField value={monthlyPeriodEnd} onChange={setMonthlyPeriodEnd} min="1900-01-01" max="9999-12-31" />
                  </div>
                </div>
                {(!monthlyPeriodStart || !monthlyPeriodEnd) && (
                  <p className="text-xs text-muted-ink mt-1.5">Selecione as duas datas para gerar a consulta.</p>
                )}
              </div>
              )}

              {/* Agrupar por: Evento Contábil ou Cliente/Fornecedor — ordem do Figma:
                  vem antes do filtro pré-agregação (22/08/2026) */}
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Agrupar por</Label>
                <Tabs value={monthlyGroupBy} onValueChange={(v) => setMonthlyGroupBy(v as 'evento' | 'cliente')}>
                  <TabsList className={cn(segmentedListClass, 'w-full h-11')}>
                    <TabsTrigger value="evento" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Evento Contábil</TabsTrigger>
                    <TabsTrigger value="cliente" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Cliente/Fornecedor</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Filtro pré-agregação: dinâmico conforme o Agrupar por */}
              {monthlyGroupBy === 'evento' ? (
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Evento Contábil</Label>
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
                    <div className="p-2 border-b border-line-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-ink" />
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
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
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
                          const filtered = q ? subCategories.filter(c => norm(c.name).includes(q)) : subCategories;
                          if (filtered.length === 0) {
                            return <div className="px-2 py-4 text-sm text-muted-ink text-center">Nenhum evento encontrado</div>;
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
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
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
              ) : (
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Cliente/Fornecedor</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className="truncate text-left">
                        {monthlySelectedContacts.size === 0
                          ? 'Todos os clientes/fornecedores'
                          : monthlySelectedContacts.size === 1
                          ? contacts.find(c => monthlySelectedContacts.has(c.id))?.name || '1 selecionado'
                          : `${monthlySelectedContacts.size} selecionados`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="p-2 border-b border-line-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-ink" />
                        <Input
                          value={monthlyContactSearch}
                          onChange={(e) => setMonthlyContactSearch(e.target.value)}
                          placeholder="Pesquisar cliente/fornecedor..."
                          className="h-8 pl-7 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setMonthlySelectedContacts(new Set())}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
                      >
                        <Checkbox checked={monthlySelectedContacts.size === 0} />
                        <span>Todos os clientes/fornecedores</span>
                      </button>
                    </div>
                    <ScrollArea className="h-64">
                      <div className="p-2 space-y-0.5">
                        {(() => {
                          const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                          const q = norm(monthlyContactSearch.trim());
                          const filtered = q ? contacts.filter(c => norm(c.name).includes(q)) : contacts;
                          if (filtered.length === 0) {
                            return <div className="px-2 py-4 text-sm text-muted-ink text-center">Nenhum cliente/fornecedor encontrado</div>;
                          }
                          return filtered.map(ct => {
                            const checked = monthlySelectedContacts.has(ct.id);
                            return (
                              <button
                                key={ct.id}
                                type="button"
                                onClick={() => {
                                  setMonthlySelectedContacts(prev => {
                                    const next = new Set(prev);
                                    if (next.has(ct.id)) next.delete(ct.id); else next.add(ct.id);
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-bg-2 text-left"
                              >
                                <Checkbox checked={checked} />
                                <span className="truncate">{ct.name}</span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
              )}

              {/* Version toggle */}
              <div>
                <Label className="text-kicker uppercase text-muted-ink mb-2 block">Versão do Relatório</Label>
                <Tabs value={monthlyVersion} onValueChange={(v) => setMonthlyVersion(v as 'resumida' | 'completa')}>
                  <TabsList className={cn(segmentedListClass, 'w-full h-11')}>
                    <TabsTrigger value="resumida" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Versão Resumida</TabsTrigger>
                    <TabsTrigger value="completa" className={cn(segmentedTriggerClass, 'flex-1 h-9')}>Versão Completa</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Preview summary */}
              <div className="rounded-lg border border-line bg-bg-2 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-ink">{monthlyGroupBy === 'cliente' ? 'Clientes/Fornecedores' : 'Eventos'} com valor:</span>
                  <span className="font-semibold text-ink">{monthlyMatrix.events.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-ink">{monthlyFilterMode === 'period' ? 'Meses no período' : 'Meses selecionados'}:</span>
                  <span className="font-semibold text-ink">{activeColumns.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-ink">Total geral:</span>
                  <span className={cn('font-semibold', monthlyMatrix.grand >= 0 ? 'text-ok' : 'text-danger')}>
                    {formatCurrency(monthlyMatrix.grand)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Export buttons — pills preenchidas sem ícone, igual ao Figma (22/08/2026):
              a biblioteca de ícones do protótipo não cobre PDF/XLS/CSV/Imagem/Imprimir. */}
          <div>
            <Label className="text-kicker uppercase text-muted-ink mb-2 block">Exportar</Label>
            <div className={cn('grid gap-2', mode === 'monthly' ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-5')}>
              <Button variant="secondary" className="h-9 text-xs border-transparent bg-bg-2 hover:bg-bg-3 no-print" onClick={handleExportPDF}>
                PDF
              </Button>
              <Button variant="secondary" className="h-9 text-xs border-transparent bg-bg-2 hover:bg-bg-3 no-print" onClick={handleExportXLS}>
                XLS
              </Button>
              <Button variant="secondary" className="h-9 text-xs border-transparent bg-bg-2 hover:bg-bg-3 no-print" onClick={handleExportCSV}>
                CSV
              </Button>
              {mode === 'report' && (
                <>
                  <Button variant="secondary" className="h-9 text-xs border-transparent bg-bg-2 hover:bg-bg-3 no-print" onClick={exportImage}>
                    Imagem
                  </Button>
                  <Button variant="secondary" className="h-9 text-xs border-transparent bg-bg-2 hover:bg-bg-3 no-print" onClick={handlePrint}>
                    Imprimir
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
