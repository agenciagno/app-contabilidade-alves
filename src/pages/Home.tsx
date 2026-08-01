import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  isToday,
  isBefore,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wallet,
  Users,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  UserPlus,
  Receipt,
  ListChecks,
  ScrollText,
} from 'lucide-react';
import { DsAlert } from '@/components/ds';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { useProfile } from '@/hooks/useProfile';
import { useBanks } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { useTransactions } from '@/hooks/useTransactions';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useCategories } from '@/hooks/useCategories';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

/**
 * Marcos legais da Reforma Tributária usados no destaque do topo.
 * Fonte: `_context/reforma-tributaria.md` (LC 214/2025, Resolução CGSN 186/2026).
 * Reverificar perto de cada data — já houve adiamento de prazo nesta reforma.
 */
const MARCOS_RT: { data: string; titulo: string; detalhe: string }[] = [
  {
    data: '2026-08-03',
    titulo: 'Campos IBS/CBS passam a ser obrigatórios na nota',
    detalhe: 'Acaba a tolerância: a nota sem os campos pode ser rejeitada.',
  },
  {
    data: '2026-09-01',
    titulo: 'Abre a janela de opção do Simples para 2027',
    detalhe: 'Até 30/09 cada cliente escolhe entre regime unificado (DAS) e IBS/CBS por fora.',
  },
  {
    data: '2026-11-30',
    titulo: 'Último dia para cancelar a opção feita em setembro',
    detalhe: 'Sem manifestação, o cliente segue no regime unificado.',
  },
];

/** Anel de progresso do card, no mesmo espírito dos medidores do painel. */
const GaugeRing = ({
  value,
  tone,
}: {
  value: number;
  tone: 'ok' | 'atencao' | 'critico';
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  const stroke =
    tone === 'ok'
      ? 'hsl(var(--success))'
      : tone === 'atencao'
        ? 'hsl(var(--warning))'
        : 'hsl(var(--destructive))';

  return (
    <div className="relative w-[124px] h-[124px]">
      <svg viewBox="0 0 124 124" className="w-full h-full -rotate-90">
        <circle
          cx="62"
          cy="62"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-border"
        />
        <circle
          cx="62"
          cy="62"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={stroke}
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      {/* Marca de status no topo do anel, como no painel de referência. */}
      <span
        className="absolute left-1/2 top-[6px] -translate-x-1/2 w-2 h-2 rounded-full"
        style={{ backgroundColor: stroke }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-metric-xl text-ink">
          {clamped}%
        </span>
      </div>
    </div>
  );
};

const GaugeCell = ({
  value,
  tone,
  label,
  hint,
}: {
  value: number;
  tone: 'ok' | 'atencao' | 'critico';
  label: string;
  hint: string;
}) => (
  <div className="flex flex-col items-center gap-3 px-6 py-8">
    <GaugeRing value={value} tone={tone} />
    <div className="text-center space-y-1">
      <p className="text-kicker uppercase text-muted-ink">
        {label}
      </p>
      <p className="text-meta text-muted-ink">{hint}</p>
    </div>
  </div>
);

const StatCell = ({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon?: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) => (
  <div className="px-6 py-5">
    <div className="flex items-center gap-1.5 mb-1.5">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-ink" strokeWidth={1.75} />}
      <p className="text-kicker uppercase text-muted-ink">
        {label}
      </p>
    </div>
    <p className={cn('text-metric-xl text-ink', valueClassName)}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-meta text-muted-ink">{hint}</p>}
  </div>
);

const SectionHeading = ({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-kicker font-bold text-ink">{number}</span>
        <span className="text-kicker uppercase text-muted-ink">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-h3-section text-ink">{title}</h2>
    </div>
    {children}
  </div>
);

/** Moldura dos cards. No escuro ganha borda mais clara para separar do fundo. */
const cardShell =
  'rounded-lg border border-line bg-paper overflow-hidden';

const Home = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userName, isLoading: profileLoading } = useProfile();
  const { banks, isLoading: banksLoading } = useBanks();
  const { contacts, createContact, isLoading: contactsLoading } = useContacts();
  const { transactions, createTransaction, isLoading: transactionsLoading } = useTransactions();
  const { recurringTransactions, isLoading: recurringLoading } = useRecurringTransactions();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  const [chartPeriod, setChartPeriod] = useState<'month' | 'week'>('month');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState<'todos' | 'financeiro' | 'carteira'>('todos');

  const today = new Date();
  const currentMonthStart = startOfMonth(today);
  const currentMonthEnd = endOfMonth(today);

  // KPI: Saldo Total em Contas
  const totalBalance = useMemo(() => {
    return banks
      .filter((b) => b.is_active)
      .reduce((sum, bank) => sum + Number(bank.current_balance), 0);
  }, [banks]);

  // KPI: Resultado Líquido do Mês (Realizado)
  const monthlyResult = useMemo(() => {
    const monthTransactions = transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= currentMonthStart && date <= currentMonthEnd && t.is_paid;
    });

    const receitas = monthTransactions
      .filter((t) => t.type === 'receita')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const despesas = monthTransactions
      .filter((t) => t.type === 'despesa')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { receitas, despesas, resultado: receitas - despesas };
  }, [transactions, currentMonthStart, currentMonthEnd]);

  // KPI: Previsto do Mês (recorrentes + pendentes)
  const previstoMes = useMemo(() => {
    const receitasRecorrentes = recurringTransactions.filter(
      (r) => r.is_active && r.type === 'receita'
    );

    const totalRecorrente = receitasRecorrentes.reduce((sum, r) => {
      if (r.frequency === 'monthly') return sum + Number(r.amount);
      if (r.frequency === 'weekly') return sum + Number(r.amount) * 4;
      if (r.frequency === 'yearly') return sum + Number(r.amount) / 12;
      return sum;
    }, 0);

    const receitasPendentes = transactions
      .filter((t) => {
        if (t.type !== 'receita' || t.is_paid) return false;
        const dueDate = t.due_date ? new Date(t.due_date) : new Date(t.date);
        return dueDate >= currentMonthStart && dueDate <= currentMonthEnd;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return Math.max(totalRecorrente, monthlyResult.receitas + receitasPendentes);
  }, [recurringTransactions, transactions, currentMonthStart, currentMonthEnd, monthlyResult.receitas]);

  // Percentual realizado
  const percentualRealizado = useMemo(() => {
    if (previstoMes <= 0) return 100;
    return Math.min(Math.round((monthlyResult.receitas / previstoMes) * 100), 100);
  }, [monthlyResult.receitas, previstoMes]);

  // KPI: Clientes Ativos e Inadimplentes
  const crmStats = useMemo(() => {
    const activeClients = contacts.filter(
      (c) => c.is_active && (c.type === 'cliente' || c.type === 'ambos')
    );

    const clientIds = activeClients.map((c) => c.id);

    const inadimplentes = new Set(
      transactions
        .filter(
          (t) =>
            t.contact_id &&
            clientIds.includes(t.contact_id) &&
            !t.is_paid &&
            t.due_date &&
            isBefore(new Date(t.due_date), today)
        )
        .map((t) => t.contact_id)
    );

    return {
      total: activeClients.length,
      inadimplentes: inadimplentes.size,
    };
  }, [contacts, transactions, today]);

  // KPI: % Honorários Recebidos
  const honorariosStats = useMemo(() => {
    const receitasRecorrentes = recurringTransactions.filter(
      (r) => r.is_active && r.type === 'receita'
    );

    const totalPrevisto = receitasRecorrentes.reduce((sum, r) => {
      if (r.frequency === 'monthly') return sum + Number(r.amount);
      if (r.frequency === 'weekly') return sum + Number(r.amount) * 4;
      if (r.frequency === 'yearly') return sum + Number(r.amount) / 12;
      return sum;
    }, 0);

    const recebido = monthlyResult.receitas;
    const percentual = totalPrevisto > 0 ? Math.min((recebido / totalPrevisto) * 100, 100) : 0;

    return {
      recebido,
      previsto: totalPrevisto,
      percentual: Math.round(percentual),
    };
  }, [recurringTransactions, monthlyResult.receitas]);

  // Proporção da carteira em atraso — razão entre os dois números do card de carteira.
  const inadimplenciaPct = useMemo(() => {
    if (crmStats.total <= 0) return 0;
    return Math.round((crmStats.inadimplentes / crmStats.total) * 100);
  }, [crmStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['banks'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
    ]);
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Gráfico: Últimos 6 meses
  const chartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(today, i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthTransactions = transactions.filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= monthStart && tDate <= monthEnd && t.is_paid;
      });

      const receitas = monthTransactions
        .filter((t) => t.type === 'receita')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const despesas = monthTransactions
        .filter((t) => t.type === 'despesa')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      months.push({
        month: format(date, 'MMM', { locale: ptBR }),
        receitas,
        despesas,
      });
    }
    return months;
  }, [transactions, today]);

  // Gráfico: Esta Semana (por dia)
  const weeklyChartData = useMemo(() => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return days.map((day) => {
      const dayTransactions = transactions.filter((t) => {
        const tDate = new Date(t.date);
        return tDate.toDateString() === day.toDateString() && t.is_paid;
      });

      const receitas = dayTransactions
        .filter((t) => t.type === 'receita')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const despesas = dayTransactions
        .filter((t) => t.type === 'despesa')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        month: format(day, 'EEE', { locale: ptBR }),
        receitas,
        despesas,
      };
    });
  }, [transactions, today]);

  // Alertas: Transações vencidas ou vencendo
  const criticalAlerts = useMemo(() => {
    return transactions
      .filter((t) => {
        if (t.is_paid || !t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return isBefore(dueDate, addDays(today, 2));
      })
      .map((t) => {
        const dueDate = new Date(t.due_date!);
        let status: 'overdue' | 'today' | 'tomorrow' = 'tomorrow';
        if (isBefore(dueDate, today) && !isToday(dueDate)) status = 'overdue';
        else if (isToday(dueDate)) status = 'today';
        return { ...t, status };
      })
      .sort((a, b) => {
        const priority = { overdue: 0, today: 1, tomorrow: 2 };
        return priority[a.status] - priority[b.status];
      })
      .slice(0, 5);
  }, [transactions, today]);

  // Próximo marco da Reforma Tributária ainda não vencido.
  const proximoMarcoRt = useMemo(() => {
    return MARCOS_RT.map((m) => {
      const data = new Date(`${m.data}T00:00:00`);
      return { ...m, dataObj: data, dias: differenceInCalendarDays(data, today) };
    }).find((m) => m.dias >= 0);
  }, [today]);

  const isLoading =
    profileLoading ||
    banksLoading ||
    contactsLoading ||
    transactionsLoading ||
    recurringLoading ||
    categoriesLoading;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-ink capitalize mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name === 'receitas' ? 'Receitas' : 'Despesas'}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const activeChartData = chartPeriod === 'week' ? weeklyChartData : chartData;

  const shortcuts = [
    {
      title: 'Nova receita',
      hint: 'Honorário, avulso',
      icon: TrendingUp,
      accent: true,
      onClick: () => setRevenueDialogOpen(true),
    },
    {
      title: 'Nova despesa',
      hint: 'Custo, imposto',
      icon: TrendingDown,
      onClick: () => setExpenseDialogOpen(true),
    },
    {
      title: 'Novo cliente',
      hint: 'Cadastro rápido',
      icon: UserPlus,
      onClick: () => setContactDialogOpen(true),
    },
    {
      title: 'Tarefas do dia',
      hint: 'Obrigações',
      icon: ListChecks,
      onClick: () => navigate('/fiscal/tarefas'),
    },
  ];

  const showFinanceiro = cardFilter === 'todos' || cardFilter === 'financeiro';
  const showCarteira = cardFilter === 'todos' || cardFilter === 'carteira';

  return (
    <div className="max-w-[1400px] mx-auto space-y-12">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-ink mb-2">
            ~/dashboard
          </p>
          {isLoading ? (
            <Skeleton className="h-12 w-72 mb-2" />
          ) : (
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink">
              {getGreeting()}, {userName}.
            </h1>
          )}
          <p className="text-muted-ink mt-2">
            {isLoading ? (
              <Skeleton className="h-5 w-56" />
            ) : (
              <>
                {crmStats.total} {crmStats.total === 1 ? 'cliente ativo' : 'clientes ativos'} e{' '}
                {criticalAlerts.length}{' '}
                {criticalAlerts.length === 1 ? 'pendência urgente' : 'pendências urgentes'}.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-muted-ink hover:text-ink gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            atualizar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Novo lançamento
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setRevenueDialogOpen(true)} className="gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                Receita
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExpenseDialogOpen(true)} className="gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                Despesa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setContactDialogOpen(true)} className="gap-2">
                <UserPlus className="w-4 h-4" />
                Cliente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Destaque — próximo marco da Reforma Tributária */}
      {proximoMarcoRt && (
        <div className="rounded-xl bg-brand-banner px-8 py-7 text-on-banner">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-pill bg-white/[0.16] px-3 py-1.5 text-kicker uppercase text-on-banner">
                <Sparkles className="h-3.5 w-3.5" />
                Reforma Tributária · prazo
              </span>

              <h2 className="mt-5 text-h2-hero">
                {proximoMarcoRt.titulo}
              </h2>
              <p className="mt-3 text-body text-on-banner/70">
                {proximoMarcoRt.detalhe} Avise a carteira antes que o prazo feche.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {/* Dentro do banner as cores são fixas: fundo escuro nos dois modos */}
                <Button
                  size="lg"
                  onClick={() => navigate('/reforma-tributaria')}
                  className="border-white bg-white text-[color:var(--banner-to)] hover:bg-white/90"
                >
                  <ArrowRight className="h-4 w-4" />
                  Ver o que muda
                </Button>
                <Button
                  size="lg"
                  onClick={() => navigate('/fiscal/tarefas')}
                  className="border-white/20 bg-white/[0.08] text-on-banner hover:bg-white/[0.16]"
                >
                  <ListChecks className="h-4 w-4" />
                  Abrir tarefas
                </Button>
              </div>
            </div>

            <div className="shrink-0 rounded-lg border border-white/10 bg-white/[0.13] px-7 py-6 text-center">
              <p className="text-display">
                {proximoMarcoRt.dias === 0 ? 'hoje' : proximoMarcoRt.dias}
              </p>
              {proximoMarcoRt.dias > 0 && (
                <p className="mt-1 text-kicker uppercase text-on-banner/60">
                  {proximoMarcoRt.dias === 1 ? 'dia' : 'dias'}
                </p>
              )}
              <p className="mt-3 border-t border-white/10 pt-3 text-meta text-on-banner/70">
                {format(proximoMarcoRt.dataObj, "d 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Faixas de alerta — vencidas e vencendo */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-3">
          {criticalAlerts.slice(0, 3).map((alert) => (
            /* Alert do DS: borda esquerda 3px, fundo pelo tom do status */
            <DsAlert
              key={alert.id}
              tone={alert.status === 'overdue' ? 'danger' : 'warn'}
              icon={<AlertTriangle strokeWidth={1.75} />}
              title={`${alert.description} ${
                alert.status === 'overdue'
                  ? 'está vencida'
                  : alert.status === 'today'
                    ? 'vence hoje'
                    : 'vence amanhã'
              }`}
              description={`${alert.type === 'receita' ? 'A receber' : 'A pagar'} · ${formatCurrency(
                Number(alert.amount),
              )} · vencimento ${format(new Date(alert.due_date!), 'dd/MM')}`}
              action={
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => navigate('/financeiro/pagar-receber')}
                >
                  Ver detalhes
                </Button>
              }
            />
          ))}
        </div>
      )}

      {/* 01 — Visão geral */}
      <section>
        <SectionHeading number="01" eyebrow="Visão geral" title="Financeiro & carteira">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-paper p-1">
            {(
              [
                { key: 'todos', label: 'Todos', count: 2 },
                { key: 'financeiro', label: 'Financeiro', count: 1 },
                { key: 'carteira', label: 'Carteira', count: 1 },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCardFilter(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                  cardFilter === tab.key
                    ? 'bg-accent font-semibold text-ink'
                    : 'text-muted-ink hover:text-ink'
                )}
              >
                {tab.label}
                <span className="text-[11px] text-muted-ink">{tab.count}</span>
              </button>
            ))}
          </div>
        </SectionHeading>

        <div className="space-y-5">
          {/* Card Financeiro */}
          {showFinanceiro && (
            <div className={cardShell}>
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-success/10 shrink-0">
                    <Wallet className="w-5 h-5 text-success" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg font-bold tracking-tight text-ink truncate">
                        Financeiro do mês
                      </h3>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        ativo
                      </span>
                    </div>
                    {/* first-letter, não capitalize: "julho de 2026" viraria "Julho De 2026". */}
                    <p className="text-sm text-muted-ink first-letter:uppercase">
                      {format(today, "MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-lg gap-1.5"
                  onClick={() => navigate('/painel-financeiro')}
                >
                  Gerenciar
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {isLoading ? (
                <div className="border-t border-line p-8">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-line divide-y sm:divide-y-0 sm:divide-x divide-border dark:divide-white/10">
                    <GaugeCell
                      value={honorariosStats.percentual}
                      tone={
                        honorariosStats.percentual >= 80
                          ? 'ok'
                          : honorariosStats.percentual >= 50
                            ? 'atencao'
                            : 'critico'
                      }
                      label="Honorários"
                      hint={`${formatCurrency(honorariosStats.recebido)} de ${formatCurrency(honorariosStats.previsto)}`}
                    />
                    <GaugeCell
                      value={percentualRealizado}
                      tone={
                        percentualRealizado >= 80
                          ? 'ok'
                          : percentualRealizado >= 50
                            ? 'atencao'
                            : 'critico'
                      }
                      label="Realizado"
                      hint={`sobre ${formatCurrency(previstoMes)} previsto`}
                    />
                    <GaugeCell
                      value={inadimplenciaPct}
                      tone={
                        inadimplenciaPct <= 10 ? 'ok' : inadimplenciaPct <= 25 ? 'atencao' : 'critico'
                      }
                      label="Inadimplência"
                      hint={`${crmStats.inadimplentes} de ${crmStats.total} clientes`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-line divide-y sm:divide-y-0 sm:divide-x divide-border dark:divide-white/10">
                    <StatCell
                      icon={Wallet}
                      label="Saldo em contas"
                      value={formatCurrency(totalBalance)}
                      hint={`${banks.filter((b) => b.is_active).length} contas ativas`}
                    />
                    <StatCell
                      icon={monthlyResult.resultado >= 0 ? TrendingUp : TrendingDown}
                      label="Resultado do mês"
                      value={formatCurrency(monthlyResult.resultado)}
                      hint={`${formatCurrency(monthlyResult.receitas)} recebido`}
                      valueClassName={
                        monthlyResult.resultado >= 0 ? 'text-success' : 'text-destructive'
                      }
                    />
                    <StatCell
                      icon={Receipt}
                      label="Despesas do mês"
                      value={formatCurrency(monthlyResult.despesas)}
                      hint="pagas neste mês"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line bg-muted/30 px-6 py-3">
                    <p className="text-[13px] text-muted-ink">
                      atualizado às <span className="font-semibold text-ink">{format(lastRefresh, 'HH:mm')}</span>
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-ink">
                      Financeiro
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Card Carteira */}
          {showCarteira && (
            <div className={cardShell}>
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 shrink-0">
                    <Users className="w-5 h-5 text-primary" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg font-bold tracking-tight text-ink truncate">
                        Carteira de clientes
                      </h3>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        ativo
                      </span>
                    </div>
                    <p className="text-sm text-muted-ink">Empresas atendidas</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-lg gap-1.5"
                  onClick={() => navigate('/contatos')}
                >
                  Gerenciar
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {isLoading ? (
                <div className="border-t border-line p-8">
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-line divide-y sm:divide-y-0 sm:divide-x divide-border dark:divide-white/10">
                    <StatCell
                      label="Clientes ativos"
                      value={String(crmStats.total)}
                      hint="clientes e ambos"
                    />
                    <StatCell
                      label="Inadimplentes"
                      value={String(crmStats.inadimplentes)}
                      hint="com título vencido"
                      valueClassName={crmStats.inadimplentes > 0 ? 'text-destructive' : undefined}
                    />
                    <StatCell
                      label="Pendências urgentes"
                      value={String(criticalAlerts.length)}
                      hint="vencidas ou vencendo"
                      valueClassName={criticalAlerts.length > 0 ? 'text-warning' : undefined}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line bg-muted/30 px-6 py-3">
                    <button
                      onClick={() => navigate('/contatos')}
                      className="text-[13px] text-muted-ink hover:text-ink transition-colors"
                    >
                      ver a carteira completa
                    </button>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-ink">
                      Carteira
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 02 — Atalhos */}
      <section>
        <SectionHeading number="02" eyebrow="Atalhos" title="Operação rápida">
          <button
            onClick={() => navigate('/movimentacoes')}
            className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
          >
            ver tudo
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {shortcuts.map((s) => (
            <button
              key={s.title}
              onClick={s.onClick}
              className="group flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-4 text-left shadow-sc-sm transition-colors hover:bg-bg-2"
            >
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-md',
                  s.accent ? 'bg-brand text-on-brand' : 'bg-bg-2 text-muted-ink'
                )}
              >
                <s.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-h4-card leading-tight text-ink">{s.title}</p>
                <p className="truncate text-meta text-muted-ink">{s.hint}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-ink transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </section>

      {/* 03 — Desempenho */}
      <section>
        <SectionHeading number="03" eyebrow="Desempenho" title="Receitas e despesas">
          <ToggleGroup
            type="single"
            value={chartPeriod}
            onValueChange={(value) => value && setChartPeriod(value as 'month' | 'week')}
            className="rounded-xl border border-line bg-paper p-1"
          >
            <ToggleGroupItem
              value="week"
              className="text-[13px] px-3 py-1 h-7 rounded-lg data-[state=on]:bg-accent data-[state=on]:font-semibold"
            >
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem
              value="month"
              className="text-[13px] px-3 py-1 h-7 rounded-lg data-[state=on]:bg-accent data-[state=on]:font-semibold"
            >
              Mês
            </ToggleGroupItem>
          </ToggleGroup>
        </SectionHeading>

        <div className={cn(cardShell, 'p-6')}>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={activeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  className="capitalize"
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => (value === 'receitas' ? 'Receitas' : 'Despesas')}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <Bar dataKey="receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Dialogs */}
      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onSubmit={(data) =>
          createContact.mutate(data, {
            onSuccess: () => setContactDialogOpen(false),
          })
        }
        isLoading={createContact.isPending}
      />

      <TransactionFormDialog
        open={revenueDialogOpen}
        onOpenChange={setRevenueDialogOpen}
        defaultType="receita"
        onSubmit={(data) =>
          createTransaction.mutate(data, {
            onSuccess: () => setRevenueDialogOpen(false),
          })
        }
        isLoading={createTransaction.isPending}
        categories={categories}
        banks={banks}
        contacts={contacts}
      />

      <TransactionFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        defaultType="despesa"
        onSubmit={(data) =>
          createTransaction.mutate(data, {
            onSuccess: () => setExpenseDialogOpen(false),
          })
        }
        isLoading={createTransaction.isPending}
        categories={categories}
        banks={banks}
        contacts={contacts}
      />
    </div>
  );
};

export default Home;
