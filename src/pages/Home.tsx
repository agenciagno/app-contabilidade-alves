import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, isToday, isBefore, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wallet,
  Users,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  DollarSign,
  UserPlus,
  Receipt,
} from 'lucide-react';
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  
  // New states for improvements
  const [chartPeriod, setChartPeriod] = useState<'month' | 'week'>('month');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    // Soma das receitas recorrentes ativas para o mês
    const receitasRecorrentes = recurringTransactions.filter(
      (r) => r.is_active && r.type === 'receita'
    );
    
    const totalRecorrente = receitasRecorrentes.reduce((sum, r) => {
      if (r.frequency === 'monthly') return sum + Number(r.amount);
      if (r.frequency === 'weekly') return sum + Number(r.amount) * 4;
      if (r.frequency === 'yearly') return sum + Number(r.amount) / 12;
      return sum;
    }, 0);

    // Receitas pendentes no mês
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

    // Total previsto para o mês (simplificado: soma das receitas recorrentes ativas)
    const totalPrevisto = receitasRecorrentes.reduce((sum, r) => {
      if (r.frequency === 'monthly') return sum + Number(r.amount);
      if (r.frequency === 'weekly') return sum + Number(r.amount) * 4;
      if (r.frequency === 'yearly') return sum + Number(r.amount) / 12;
      return sum;
    }, 0);

    // Receitas já recebidas no mês
    const recebido = monthlyResult.receitas;

    const percentual = totalPrevisto > 0 ? Math.min((recebido / totalPrevisto) * 100, 100) : 0;

    return {
      recebido,
      previsto: totalPrevisto,
      percentual: Math.round(percentual),
    };
  }, [recurringTransactions, monthlyResult.receitas]);

  // Refresh function for honorários
  const handleRefreshHonorarios = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 1000);
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
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
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

  const isLoading = profileLoading || banksLoading || contactsLoading || transactionsLoading || recurringLoading || categoriesLoading;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground capitalize mb-2">{label}</p>
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

  // Determine which chart data to use
  const activeChartData = chartPeriod === 'week' ? weeklyChartData : chartData;

  return (
    <div className="space-y-6">
      {/* Header de Boas-Vindas */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-64 mb-2" />
          ) : (
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {getGreeting()}, {userName} 👋
            </h1>
          )}
          <p className="text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* Atalhos Rápidos */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setContactDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Cliente
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setRevenueDialogOpen(true)}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Receita
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setExpenseDialogOpen(true)}
          >
            <TrendingDown className="h-4 w-4 mr-2" />
            Despesa
          </Button>
        </div>
      </div>

      {/* Cards de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card Financeiro */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Financeiro
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-5 w-24" />
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Total em Contas</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(totalBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resultado do Mês</p>
                  <div className="flex items-baseline gap-2">
                    <p
                      className={`text-lg font-semibold flex items-center gap-1 ${
                        monthlyResult.resultado >= 0 ? 'text-emerald-500' : 'text-destructive'
                      }`}
                    >
                      {monthlyResult.resultado >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {formatCurrency(monthlyResult.resultado)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    / {formatCurrency(previstoMes)} previsto
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={percentualRealizado} className="h-1.5 flex-1" />
                    <span className={`text-xs font-medium ${
                      percentualRealizado >= 100 ? 'text-emerald-500' : 
                      percentualRealizado >= 50 ? 'text-yellow-500' : 'text-destructive'
                    }`}>
                      {percentualRealizado}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card CRM */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CRM</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-5 w-24" />
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes Ativos</p>
                  <p className="text-2xl font-bold text-foreground">{crmStats.total}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={crmStats.inadimplentes > 0 ? 'destructive' : 'secondary'}
                    className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate('/crm', { state: { filterStatus: 'inadimplente' } })}
                  >
                    {crmStats.inadimplentes > 0 && (
                      <AlertTriangle className="h-3 w-3 mr-1" />
                    )}
                    {crmStats.inadimplentes} Inadimplente{crmStats.inadimplentes !== 1 && 's'}
                  </Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card Honorários */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Honorários do Mês
            </CardTitle>
            <TooltipProvider>
              <TooltipUI>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleRefreshHonorarios}
                  >
                    <RefreshCw className={`h-4 w-4 text-violet-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Última atualização: {format(lastRefresh, 'HH:mm')}
                </TooltipContent>
              </TooltipUI>
            </TooltipProvider>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-2 w-full" />
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-foreground">
                    {honorariosStats.percentual}%
                  </p>
                  <p className="text-xs text-muted-foreground">recebido</p>
                </div>
                <Progress value={honorariosStats.percentual} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(honorariosStats.recebido)} / {formatCurrency(honorariosStats.previsto)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seção Principal - Grid de 2 Colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Desempenho */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              {chartPeriod === 'week' ? 'Desempenho Semanal' : 'Desempenho Mensal'}
            </CardTitle>
            <ToggleGroup
              type="single"
              value={chartPeriod}
              onValueChange={(value) => value && setChartPeriod(value as 'month' | 'week')}
              className="bg-muted/50 rounded-lg p-0.5"
            >
              <ToggleGroupItem
                value="week"
                className="text-xs px-3 py-1 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Semana
              </ToggleGroupItem>
              <ToggleGroupItem
                value="month"
                className="text-xs px-3 py-1 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Mês
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
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
                    tickFormatter={(value) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => (value === 'receitas' ? 'Receitas' : 'Despesas')}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Bar
                    dataKey="receitas"
                    fill="hsl(142.1 76.2% 36.3%)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="despesas"
                    fill="hsl(0 84.2% 60.2%)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Alertas Críticos */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Atenção Imediata
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => navigate('/transacoes')}
            >
              Ver todas
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : criticalAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma pendência urgente</p>
                <p className="text-xs">Suas contas estão em dia! 🎉</p>
              </div>
            ) : (
              <div className="space-y-3">
                {criticalAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          alert.status === 'overdue'
                            ? 'bg-destructive'
                            : alert.status === 'today'
                            ? 'bg-orange-500'
                            : 'bg-yellow-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {alert.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {alert.status === 'overdue'
                            ? 'Vencida'
                            : alert.status === 'today'
                            ? 'Vence hoje'
                            : 'Vence amanhã'}{' '}
                          • {format(new Date(alert.due_date!), 'dd/MM')}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        alert.type === 'receita' ? 'text-emerald-500' : 'text-destructive'
                      }`}
                    >
                      {alert.type === 'receita' ? '+' : '-'}
                      {formatCurrency(Number(alert.amount))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
