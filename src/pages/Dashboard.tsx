import { useMemo, useState } from 'react';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Clock,
  Building2,
  Users,
  FileText,
  ChevronRight,
  PiggyBank,
  CreditCard,
  Tag,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Landmark,
  BarChart3,
  CalendarCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createGlobalLog } from '@/hooks/useGlobalLogs';
import { toast } from 'sonner';
import { useDashboardSummary, useAnnualMetrics, useMonthlyEvolution, useCategoryBreakdown } from '@/hooks/useRpcDashboard';
import { useBanks } from '@/hooks/useBanks';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useContacts } from '@/hooks/useContacts';
import { useCategories } from '@/hooks/useCategories';
import { 
  ChartTooltip, 
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, Area, AreaChart, CartesianGrid } from 'recharts';
import { format, addDays, addMonths, isBefore, isAfter, subMonths, subDays, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, Link } from 'react-router-dom';
import { DashboardWidgetsConfig, useDashboardWidgets } from '@/components/dashboard/DashboardWidgets';
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog';
import { BankFormDialog } from '@/components/banks/BankFormDialog';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { TransactionInsert } from '@/hooks/useTransactions';
import { UnifiedFilterBox, PeriodFilter, getDateRangeFromPeriod } from '@/components/filters/UnifiedFilterBox';
import { exportToCSV, exportToPDF, useReportData, processReportData } from '@/hooks/useReportData';
import { DRECard } from '@/components/reports/DRECard';
import { PeriodComparison } from '@/components/reports/PeriodComparison';
import { CashFlowForecast } from '@/components/reports/CashFlowForecast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const CHART_COLORS = [
  'hsl(142.1 76.2% 36.3%)',
  'hsl(221.2 83.2% 53.3%)',
  'hsl(262.1 83.3% 57.8%)',
  'hsl(24.6 95% 53.1%)',
  'hsl(346.8 77.2% 49.8%)',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const now = new Date();

  const { widgets, toggleWidget, isWidgetEnabled } = useDashboardWidgets();

  // Dialog states
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [defaultTransactionType, setDefaultTransactionType] = useState<'receita' | 'despesa'>('despesa');
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // Filter states - Default to 'all' (limpo)
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { transactions: rawTransactions, isLoading: loadingTransactions, createTransaction } = useTransactions();
  const { banks, isLoading: loadingBanks, createBank } = useBanks();
  const { recurringTransactions } = useRecurringTransactions();
  const { contacts, createContact } = useContacts();
  const { categories, createCategory } = useCategories();

  // Filter out transactions linked to invisible banks
  const invisibleBankIds = useMemo(() => new Set(banks.filter(b => b.is_invisible).map(b => b.id)), [banks]);
  const allTransactions = useMemo(() => rawTransactions.filter(t => !t.bank_id || !invisibleBankIds.has(t.bank_id)), [rawTransactions, invisibleBankIds]);

  // Get date range for filtering
  const getDateRange = (): { start: Date; end: Date } | null => {
    if (period === 'custom' && customStartDate && customEndDate) {
      return { start: customStartDate, end: customEndDate };
    }
    return getDateRangeFromPeriod(period);
  };

  // Clear all filters - limpa para estado padrão 'all'
  const handleClearFilters = () => {
    setPeriod('all');
    setSearchTerm('');
    setSelectedBankId('all');
    setCategoryFilter('all');
    setContactFilter('all');
    setPaymentStatusFilter('all');
    setCustomStartDate(null);
    setCustomEndDate(null);
  };

  // Filter transactions based on all filters
  const transactions = useMemo(() => {
    let result = [...allTransactions];
    
    // Date filter
    const dateRange = getDateRange();
    if (dateRange) {
      result = result.filter((t) => {
        const d = t.date || t.due_date || t.issue_date;
        if (!d) return false;
        const txDate = parseISO(d);
        return isWithinInterval(txDate, { start: dateRange.start, end: dateRange.end });
      });
    }
    
    // Bank filter
    if (selectedBankId !== 'all') {
      result = result.filter(t => t.bank_id === selectedBankId);
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category_id === categoryFilter);
    }
    
    // Contact filter
    if (contactFilter !== 'all') {
      result = result.filter(t => t.contact_id === contactFilter);
    }
    
    // Payment status filter
    if (paymentStatusFilter === 'paid') {
      result = result.filter(t => t.is_paid);
    } else if (paymentStatusFilter === 'pending') {
      result = result.filter(t => !t.is_paid);
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(t => t.description.toLowerCase().includes(search));
    }
    
    return result;
  }, [allTransactions, period, customStartDate, customEndDate, selectedBankId, categoryFilter, contactFilter, paymentStatusFilter, searchTerm]);

  // ---- RPC-backed metrics (replaces previous useMemo aggregations) ----
  // Date range for the summary RPC (when no period filter, use a wide-open range)
  const _summaryRange = useMemo(() => {
    const r = getDateRange();
    return {
      start: r ? format(r.start, 'yyyy-MM-dd') : '1900-01-01',
      end:   r ? format(r.end,   'yyyy-MM-dd') : '2999-12-31',
    };
  }, [period, customStartDate, customEndDate]);

  const _summaryFilters = useMemo(() => ({
    bankId: selectedBankId !== 'all' ? selectedBankId : undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    contactId: contactFilter !== 'all' ? contactFilter : undefined,
    paymentStatus: paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
  }), [selectedBankId, categoryFilter, contactFilter, paymentStatusFilter]);

  const { data: dashboardSummary, isLoading: loadingSummary } = useDashboardSummary(
    _summaryRange.start,
    _summaryRange.end,
    _summaryFilters,
  );

  const currentYear = now.getFullYear();
  const { data: annualRpc, isLoading: loadingAnnual } = useAnnualMetrics(currentYear);
  const { data: monthlyRpc, isLoading: loadingMonthly } = useMonthlyEvolution(6);
  const { data: categoryRpc, isLoading: loadingCategory } = useCategoryBreakdown(
    'despesa',
    _summaryRange.start,
    _summaryRange.end,
    5,
    {
      bankId: _summaryFilters.bankId,
      contactId: _summaryFilters.contactId,
    },
  );

  // Adapt RPC snake_case → camelCase consumed by JSX (interface unchanged)
  const summary = useMemo(() => {
    const saldoBancario = banks
      .filter(b => b.is_active && !b.is_invisible)
      .reduce((sum, b) => sum + Number(b.current_balance), 0);
    return {
      receitasPagas: Number(dashboardSummary?.receitas_pagas ?? 0),
      aReceber:      Number(dashboardSummary?.a_receber ?? 0),
      despesasPagas: Number(dashboardSummary?.despesas_pagas ?? 0),
      aPagar:        Number(dashboardSummary?.a_pagar ?? 0),
      saldoBancario,
    };
  }, [dashboardSummary, banks]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBankId !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (contactFilter !== 'all') count++;
    if (paymentStatusFilter !== 'all') count++;
    if (searchTerm) count++;
    if (period !== 'all') count++;
    return count;
  }, [selectedBankId, categoryFilter, contactFilter, paymentStatusFilter, searchTerm, period]);

  const annualMetrics = useMemo(() => ({
    lucroPrevisto: Number(annualRpc?.lucro_previsto ?? 0),
    lucroRealizado: Number(annualRpc?.lucro_realizado ?? 0),
    receitasAcumuladas: Number(annualRpc?.receitas_pagas_ano ?? 0),
    despesasAcumuladas: Number(annualRpc?.despesas_pagas_ano ?? 0),
    year: String(currentYear),
  }), [annualRpc, currentYear]);

  const monthlyEvolution = useMemo(() => {
    const rows = monthlyRpc ?? [];
    return rows.map(r => {
      const d = parseISO(r.mes);
      const receitas = Number(r.receitas) || 0;
      const despesas = Number(r.despesas) || 0;
      return {
        key: format(d, 'yyyy-MM'),
        month: format(d, 'MMM', { locale: ptBR }),
        receitas,
        despesas,
        saldo: receitas - despesas,
      };
    });
  }, [monthlyRpc]);

  // Category chart data (expenses) — colors looked up from categories list
  const categoryChartData = useMemo(() => {
    const rows = categoryRpc ?? [];
    return rows.map((r, idx) => {
      const cat = r.category_id ? categories.find(c => c.id === r.category_id) : null;
      return {
        name: r.category_name || 'Sem categoria',
        value: Number(r.total) || 0,
        color: cat?.color || CHART_COLORS[idx % CHART_COLORS.length],
      };
    });
  }, [categoryRpc, categories]);


  // Revenue category chart data
  const revenueCategoryChartData = useMemo(() => {
    const categoryMap = new Map<string, { name: string; value: number; color: string }>();
    
    transactions.forEach(t => {
      if (t.type === 'receita' && t.category) {
        const existing = categoryMap.get(t.category.id);
        if (existing) {
          existing.value += Number(t.amount);
        } else {
          categoryMap.set(t.category.id, {
            name: t.category.name,
            value: Number(t.amount),
            color: t.category.color || CHART_COLORS[categoryMap.size % CHART_COLORS.length],
          });
        }
      }
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  // Pending transactions (unified list - a receber + a pagar)
  const pendingTransactions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allTransactions
      .filter(t => !t.is_paid)
      .sort((a, b) => new Date(a.due_date || a.date || '9999-12-31').getTime() - new Date(b.due_date || b.date || '9999-12-31').getTime())
      .slice(0, 15);
  }, [allTransactions]);

  // DRE data
  const dreData = useMemo(() => {
    const faturamentoBruto = transactions.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const impostos = faturamentoBruto * 0.15;
    const despesasOperacionais = transactions.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);
    return { faturamentoBruto, impostos, despesasOperacionais };
  }, [transactions]);

  // Period comparison data
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const invisibleBankIdArray = useMemo(() => Array.from(invisibleBankIds), [invisibleBankIds]);
  const { data: thisMonthTx = [] } = useReportData({ startDate: thisMonthStart, endDate: now, invisibleBankIds: invisibleBankIdArray });
  const { data: lastMonthTx = [] } = useReportData({ startDate: lastMonthStart, endDate: lastMonthEnd, invisibleBankIds: invisibleBankIdArray });

  const thisMonthData = useMemo(() => processReportData(thisMonthTx), [thisMonthTx]);
  const lastMonthData = useMemo(() => processReportData(lastMonthTx), [lastMonthTx]);


  const isLoading = loadingTransactions || loadingBanks || loadingSummary || loadingAnnual || loadingMonthly || loadingCategory;

  // Handlers
  const handleNewTransaction = (type: 'receita' | 'despesa') => {
    setDefaultTransactionType(type);
    setTransactionDialogOpen(true);
  };

  const handleTransactionSubmit = (data: TransactionInsert) => {
    createTransaction.mutate(data, {
      onSuccess: () => setTransactionDialogOpen(false),
    });
  };

  const handleBankSubmit = (data: any) => {
    createBank.mutate(data, {
      onSuccess: () => setBankDialogOpen(false),
    });
  };

  const handleContactSubmit = (data: any) => {
    createContact.mutate(data, {
      onSuccess: () => setContactDialogOpen(false),
    });
  };

  const handleCategorySubmit = (data: any) => {
    createCategory.mutate(data, {
      onSuccess: () => setCategoryDialogOpen(false),
    });
  };

  // Export handlers
  const handleExportCSV = () => {
    const reportData = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
      date: t.date,
      is_paid: t.is_paid,
      category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color || '' } : null,
      bank: t.bank ? { id: t.bank.id, name: t.bank.name, color: t.bank.color || '' } : null,
      contact: t.contact ? { id: t.contact.id, name: t.contact.name, type: t.contact.type } : null,
    }));
    exportToCSV(reportData);
  };

  const handleExportPDF = () => {
    const reportData = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
      date: t.date,
      is_paid: t.is_paid,
      category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color || '' } : null,
      bank: t.bank ? { id: t.bank.id, name: t.bank.name, color: t.bank.color || '' } : null,
      contact: t.contact ? { id: t.contact.id, name: t.contact.name, type: t.contact.type } : null,
    }));
    const totals = {
      receitas: transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + Number(t.amount), 0),
      despesas: transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + Number(t.amount), 0),
    };
    const dateRange = getDateRange();
    exportToPDF(reportData, totals, dateRange?.start, dateRange?.end);
  };

  // Period label for display
  const periodLabel = useMemo(() => {
    const dateRange = getDateRange();
    if (dateRange) {
      return `${format(dateRange.start, "dd/MM/yyyy")} - ${format(dateRange.end, "dd/MM/yyyy")}`;
    }
    return 'Visão Geral';
  }, [period, customStartDate, customEndDate]);

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            {periodLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <DashboardWidgetsConfig widgets={widgets} onToggle={toggleWidget} />
          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                <FileText className="w-4 h-4" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => navigate('/relatorios')}>
            <FileText className="w-4 h-4 mr-2" />
            Relatórios
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button 
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => handleNewTransaction('receita')}
        >
          <Plus className="w-4 h-4" />
          Receita
        </Button>
        <Button 
          variant="destructive" 
          className="gap-2"
          onClick={() => handleNewTransaction('despesa')}
        >
          <Plus className="w-4 h-4" />
          Despesa
        </Button>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => setBankDialogOpen(true)}
        >
          <Building2 className="w-4 h-4" />
          Conta
        </Button>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => setContactDialogOpen(true)}
        >
          <Users className="w-4 h-4" />
          Cliente/Forn.
        </Button>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => setCategoryDialogOpen(true)}
        >
          <Tag className="w-4 h-4" />
          Categoria
        </Button>
      </div>

      {/* Collapsible Filters */}
      <div className="flex items-center justify-end">
        <Button variant="outline" className="gap-2 relative" onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal className="w-4 h-4" />
          Filtros Avançados
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <UnifiedFilterBox
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            period={period}
            onPeriodChange={setPeriod}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            bankId={selectedBankId}
            onBankChange={setSelectedBankId}
            banks={banks}
            categoryId={categoryFilter}
            onCategoryChange={setCategoryFilter}
            categories={categories}
            paymentStatus={paymentStatusFilter}
            onPaymentStatusChange={setPaymentStatusFilter}
            contactId={contactFilter}
            onContactChange={setContactFilter}
            contacts={contacts}
            onClearFilters={handleClearFilters}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* KPI Cards - 3 columns matching Transactions page style */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Card className="border-border/30">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receitas Recebidas</p>
                {isLoading ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight text-emerald-500">{formatCurrency(summary.receitasPagas)}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  A Receber: <span className="text-emerald-400">{formatCurrency(summary.aReceber)}</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contas Pagas</p>
                {isLoading ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight text-red-500">{formatCurrency(summary.despesasPagas)}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  A Pagar: <span className="text-red-400">{formatCurrency(summary.aPagar)}</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo Bancário</p>
                {isLoading ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <p className={`text-3xl font-semibold tracking-tight ${summary.saldoBancario >= 0 ? 'text-primary' : 'text-red-500'}`}>
                    {formatCurrency(summary.saldoBancario)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Total bancos visíveis
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Annual Ticker Cards - 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="border-border/30 border-l-2 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <p className="text-xs text-muted-foreground">Lucro Previsto — {annualMetrics.year}</p>
            </div>
            <p className={`text-base font-bold ${annualMetrics.lucroPrevisto >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(annualMetrics.lucroPrevisto)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Receitas − Despesas (ano)</p>
          </CardContent>
        </Card>

        <Card className="border-border/30 border-l-2 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-xs text-muted-foreground">Lucro Realizado — {annualMetrics.year}</p>
            </div>
            <p className={`text-base font-bold ${annualMetrics.lucroRealizado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(annualMetrics.lucroRealizado)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Realizado no ano corrente</p>
          </CardContent>
        </Card>

        <Card className="border-border/30 border-l-2 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
              <p className="text-xs text-muted-foreground">Receitas Acumuladas — {annualMetrics.year}</p>
            </div>
            <p className="text-base font-bold text-emerald-500">
              {formatCurrency(annualMetrics.receitasAcumuladas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Receitas já realizadas</p>
          </CardContent>
        </Card>

        <Card className="border-border/30 border-l-2 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-muted-foreground">Despesas Acumuladas — {annualMetrics.year}</p>
            </div>
            <p className="text-base font-bold text-red-500">
              {formatCurrency(annualMetrics.despesasAcumuladas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Despesas já realizadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista Unificada de Contas Pendentes - moved above evolution */}
      {isWidgetEnabled('pendingList') && (
        <Card className="border-border/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Contas Pendentes
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/financeiro/pagar-receber" className="text-xs text-muted-foreground">
                  Ver todas <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : pendingTransactions.length > 0 ? (
              <div className="space-y-2">
                {pendingTransactions.map((transaction) => {
                  const isReceita = transaction.type === 'receita';
                  const txDateStr = transaction.due_date || transaction.date || transaction.issue_date;
                  const txDate = txDateStr ? new Date(txDateStr + 'T12:00:00') : new Date();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isOverdue = isBefore(txDate, today);
                  
                  return (
                    <div
                      key={transaction.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isReceita 
                          ? 'bg-emerald-500/10 border-emerald-500/20' 
                          : 'bg-red-500/10 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isReceita ? 'bg-emerald-500/20' : 'bg-red-500/20'
                        }`}>
                          {isReceita ? (
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.contact?.name || 'Sem contato'} • Venc: {format(txDate, "dd/MM/yyyy")}
                            {isOverdue && (
                              <Badge variant="outline" className="ml-2 text-amber-500 border-amber-500/50">
                                Vencido
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className={`font-semibold ml-3 ${
                        isReceita ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {formatCurrency(Number(transaction.amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma conta pendente
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly Evolution - Full Width & Larger */}
      {isWidgetEnabled('evolution') && (
        <Card className="border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução Mensal</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : monthlyEvolution.some(d => d.receitas > 0 || d.despesas > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyEvolution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0 84.2% 60.2%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(0 84.2% 60.2%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="receitas" 
                    stroke="hsl(142.1 76.2% 36.3%)" 
                    fillOpacity={1} 
                    fill="url(#colorReceitas)" 
                    name="Receitas"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="despesas" 
                    stroke="hsl(0 84.2% 60.2%)" 
                    fillOpacity={1} 
                    fill="url(#colorDespesas)" 
                    name="Despesas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Category Charts Row */}
      {(isWidgetEnabled('revenueCategoryChart') || isWidgetEnabled('categoryChart')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Revenue Category Pie Chart */}
          {isWidgetEnabled('revenueCategoryChart') && (
            <Card className="border-border/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Receitas por Evento Contábil</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : revenueCategoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueCategoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {revenueCategoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Sem receitas categorizadas
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Expense Category Pie Chart */}
          {isWidgetEnabled('categoryChart') && (
            <Card className="border-border/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Despesas por Evento Contábil</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Sem despesas categorizadas
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* DRE Card */}
      {isWidgetEnabled('dre') && (
        <DRECard
          faturamentoBruto={dreData.faturamentoBruto}
          impostos={dreData.impostos}
          despesasOperacionais={dreData.despesasOperacionais}
        />
      )}

      {/* Period Comparison */}
      {isWidgetEnabled('periodComparison') && (
        <PeriodComparison
          currentPeriod={{
            receitas: thisMonthData.totals.receitas,
            despesas: thisMonthData.totals.despesas,
            saldo: thisMonthData.totals.receitas - thisMonthData.totals.despesas,
          }}
          previousPeriod={{
            receitas: lastMonthData.totals.receitas,
            despesas: lastMonthData.totals.despesas,
            saldo: lastMonthData.totals.receitas - lastMonthData.totals.despesas,
          }}
        />
      )}

      {/* Cash Flow Forecast */}
      {isWidgetEnabled('cashFlowForecast') && (
        <CashFlowForecast />
      )}

      {/* Dialogs */}
      <TransactionFormDialog
        open={transactionDialogOpen}
        onOpenChange={setTransactionDialogOpen}
        transaction={null}
        categories={categories}
        banks={banks}
        contacts={contacts}
        onSubmit={handleTransactionSubmit}
        isLoading={createTransaction.isPending}
        defaultType={defaultTransactionType}
      />

      <BankFormDialog
        open={bankDialogOpen}
        onOpenChange={setBankDialogOpen}
        onSubmit={handleBankSubmit}
        isLoading={createBank.isPending}
      />

      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onSubmit={handleContactSubmit}
        isLoading={createContact.isPending}
      />

      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSubmit={handleCategorySubmit}
        isLoading={createCategory.isPending}
      />
    </div>
  );
}
