import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addDays, format, startOfDay, parseISO } from 'date-fns';
import { useBanks } from './useBanks';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { isEffectivelyPaid } from '@/lib/financial-utils';

interface ForecastTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  category?: { name: string; color: string };
  isRecurring?: boolean;
  isOverdue?: boolean;
}

interface DailyForecast {
  date: string;
  dateFormatted: string;
  receitas: number;
  despesas: number;
  saldo: number;
  saldoAcumulado: number;
  transactions: ForecastTransaction[];
}

interface WeeklySummary {
  week: number;
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

interface CashFlowAlert {
  date: string;
  saldo: number;
  message: string;
}

// Ponto do gráfico combinado: passado = realizado, futuro = projetado.
export interface CashFlowChartPoint {
  date: string;
  dateFormatted: string;
  realizado: number | null;
  projetado: number | null;
}

export interface CashFlowForecastData {
  currentBalance: number;
  finalBalance: number;
  dailyForecast: DailyForecast[];
  weeklySummary: WeeklySummary[];
  alerts: CashFlowAlert[];
  totalReceitas: number;
  totalDespesas: number;
  pendingTransactions: ForecastTransaction[];
  chartData: CashFlowChartPoint[];
  firstNegativeDate: string | null;
  lowestProjected: number;
}

export function useCashFlowForecast(days: number = 30) {
  const { banks = [] } = useBanks();
  const { activeCompanyId } = useActiveCompany();

  // Calculate current balance from all active visible banks (exclude invisible)
  const currentBalance = banks
    .filter(b => b.is_active && !b.is_invisible)
    .reduce((sum, bank) => sum + Number(bank.current_balance), 0);

  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  // Get invisible bank IDs
  const invisibleBankIds = banks.filter(b => b.is_invisible).map(b => b.id);

  // Contas em aberto do horizonte. A data que importa aqui é a de VENCIMENTO (due_date),
  // não a de pagamento (`date`) — em lançamento não pago `date` é sempre NULL, então filtrar
  // por ela devolvia zero linha e a projeção ficava cega para toda a carteira.
  // Vencidos entram junto (due_date < hoje): são obrigações reais que ainda vão bater no caixa.
  const { data: pendingTransactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['cash-flow-pending', activeCompanyId, days, invisibleBankIds],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          date,
          due_date,
          expected_date,
          description,
          amount,
          type,
          is_paid,
          paid_amount,
          bank_id,
          category:categories(name, color)
        `)
        .eq('company_id', activeCompanyId!)
        .is('deleted_at', null)
        .eq('is_transfer', false)
        .eq('is_paid', false)
        .lte('due_date', format(endDate, 'yyyy-MM-dd'))
        .order('due_date');

      // Exclude transactions from invisible banks
      if (invisibleBankIds.length > 0) {
        const notInFilter = invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
        query = query.or(`bank_id.is.null,and(${notInFilter})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      const todayStr = format(today, 'yyyy-MM-dd');
      return data
        .filter(t => !isEffectivelyPaid(t as any))
        .map(t => {
          const venc = t.due_date || t.expected_date;
          return {
            id: t.id,
            // Vencido é tratado como impacto de hoje (D0) — o dinheiro já deveria ter saído/entrado.
            date: venc && venc < todayStr ? todayStr : (venc as string),
            description: t.description,
            amount: Number(t.amount),
            type: t.type as 'receita' | 'despesa',
            category: t.category,
            isRecurring: false,
            isOverdue: !!venc && venc < todayStr,
          };
        })
        .filter(t => !!t.date);
    },
    enabled: !!activeCompanyId,
  });

  // Fetch active recurring transactions
  const { data: recurringTransactions = [], isLoading: loadingRecurring } = useQuery({
    queryKey: ['cash-flow-recurring', activeCompanyId, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select(`
          id,
          description,
          amount,
          type,
          frequency,
          day_of_month,
          days_of_week,
          start_date,
          end_date,
          category:categories(name, color)
        `)
        .eq('company_id', activeCompanyId!)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  // Fetch paid transactions of the past window to reconstruct the REALIZED balance curve.
  const { data: paidHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['cash-flow-realized', activeCompanyId, days, invisibleBankIds],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('date, amount, paid_amount, type, bank_id')
        .eq('company_id', activeCompanyId!)
        .is('deleted_at', null)
        .eq('is_transfer', false)
        .eq('is_paid', true)
        .not('date', 'is', null)
        .gte('date', format(addDays(today, -days), 'yyyy-MM-dd'))
        .lte('date', format(today, 'yyyy-MM-dd'));
      if (invisibleBankIds.length > 0) {
        const notInFilter = invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
        query = query.or(`bank_id.is.null,and(${notInFilter})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as { date: string; amount: number; paid_amount: number | null; type: string }[];
    },
    enabled: !!activeCompanyId,
  });

  // Process the forecast data
  const forecastData: CashFlowForecastData = processCashFlowForecast(
    pendingTransactions,
    recurringTransactions,
    currentBalance,
    days,
    paidHistory
  );

  return {
    ...forecastData,
    isLoading: loadingTransactions || loadingRecurring || loadingHistory,
  };
}

function processCashFlowForecast(
  pendingTransactions: ForecastTransaction[],
  recurringTransactions: any[],
  currentBalance: number,
  days: number,
  paidHistory: { date: string; amount: number; paid_amount: number | null; type: string }[] = []
): CashFlowForecastData {
  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  // Projeta as ocorrências das contas recorrentes dentro do horizonte.
  // Cobre as 3 frequências aceitas no cadastro (antes só 'monthly' era projetada — 'weekly'
  // e 'yearly' eram aceitas no formulário e simplesmente não apareciam no fluxo).
  const recurringInstances: ForecastTransaction[] = [];
  const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  recurringTransactions.forEach(rt => {
    const startDate = rt.start_date ? parseISO(rt.start_date) : today;
    const rtEndDate = rt.end_date ? parseISO(rt.end_date) : endDate;

    // Datas candidatas dentro do horizonte, por frequência.
    const candidates: Date[] = [];

    if (rt.frequency === 'monthly' && rt.day_of_month) {
      let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
      while (cursor <= endDate) {
        // Mês curto: cai no último dia (mesma regra do LEAST(day_of_month, último dia) da RPC).
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        candidates.push(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(rt.day_of_month, lastDay)));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (rt.frequency === 'weekly') {
      const dias: string[] = Array.isArray(rt.days_of_week)
        ? rt.days_of_week
        : (() => { try { return JSON.parse(rt.days_of_week ?? '[]'); } catch { return []; } })();
      for (let d = new Date(today); d <= endDate; d = addDays(d, 1)) {
        if (dias.includes(DOW_NAMES[d.getDay()])) candidates.push(new Date(d));
      }
    } else if (rt.frequency === 'yearly' && rt.start_date) {
      const base = parseISO(rt.start_date);
      for (let y = today.getFullYear(); y <= endDate.getFullYear(); y++) {
        const lastDay = new Date(y, base.getMonth() + 1, 0).getDate();
        candidates.push(new Date(y, base.getMonth(), Math.min(base.getDate(), lastDay)));
      }
    }

    for (const testDate of candidates) {
      if (testDate < today || testDate > endDate) continue;
      if (testDate < startDate || testDate > rtEndDate) continue;

      // Se a RPC diária já materializou essa ocorrência, ela vem em pendingTransactions —
      // não projetar de novo. O casamento é por recurring_id (antes era por descrição+data,
      // que quebrava assim que alguém editasse o texto da conta recorrente).
      const dateStr = format(testDate, 'yyyy-MM-dd');
      const alreadyExists = pendingTransactions.some(
        pt => (pt as any).recurring_id === rt.id || (pt.description === rt.description && pt.date === dateStr)
      );
      if (alreadyExists) continue;

      recurringInstances.push({
        id: `${rt.id}-${dateStr}`,
        date: dateStr,
        description: rt.description,
        amount: Number(rt.amount),
        type: rt.type as 'receita' | 'despesa',
        category: rt.category,
        isRecurring: true,
      });
    }
  });

  // Combine all transactions
  const allTransactions = [...pendingTransactions, ...recurringInstances]
    .sort((a, b) => a.date.localeCompare(b.date));

  // Generate daily forecast
  const dailyForecast: DailyForecast[] = [];
  let saldoAcumulado = currentBalance;
  
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayTransactions = allTransactions.filter(t => t.date === dateStr);
    const receitas = dayTransactions
      .filter(t => t.type === 'receita')
      .reduce((sum, t) => sum + t.amount, 0);
    const despesas = dayTransactions
      .filter(t => t.type === 'despesa')
      .reduce((sum, t) => sum + t.amount, 0);
    const saldo = receitas - despesas;
    saldoAcumulado += saldo;
    
    dailyForecast.push({
      date: dateStr,
      dateFormatted: format(date, 'dd/MM'),
      receitas,
      despesas,
      saldo,
      saldoAcumulado,
      transactions: dayTransactions,
    });
  }

  // Generate weekly summary
  const weeklySummary: WeeklySummary[] = [];
  for (let week = 0; week < Math.ceil(days / 7); week++) {
    const weekStart = week * 7;
    const weekEnd = Math.min(weekStart + 7, days + 1);
    const weekData = dailyForecast.slice(weekStart, weekEnd);
    
    const receitas = weekData.reduce((sum, d) => sum + d.receitas, 0);
    const despesas = weekData.reduce((sum, d) => sum + d.despesas, 0);
    
    weeklySummary.push({
      week: week + 1,
      label: `Sem ${week + 1}`,
      receitas,
      despesas,
      saldo: receitas - despesas,
    });
  }

  // Generate alerts for negative balance days
  const alerts: CashFlowAlert[] = dailyForecast
    .filter(d => d.saldoAcumulado < 0)
    .map(d => ({
      date: d.date,
      saldo: d.saldoAcumulado,
      message: `Saldo negativo previsto em ${d.dateFormatted}`,
    }));

  const firstNegativeDate = alerts.length > 0 ? alerts[0].date : null;
  const lowestProjected = dailyForecast.reduce(
    (min, d) => Math.min(min, d.saldoAcumulado),
    currentBalance
  );

  const totalReceitas = allTransactions
    .filter(t => t.type === 'receita')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDespesas = allTransactions
    .filter(t => t.type === 'despesa')
    .reduce((sum, t) => sum + t.amount, 0);

  // ── Série REALIZADA (passado): reconstrói o saldo de fechamento diário
  // caminhando para trás a partir do saldo atual. netByDate = receita(+)/despesa(-) pagas no dia.
  const netByDate = new Map<string, number>();
  for (const t of paidHistory) {
    const amt = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
    netByDate.set(t.date, (netByDate.get(t.date) ?? 0) + (t.type === 'receita' ? amt : -amt));
  }
  const pastDates: Date[] = [];
  for (let i = 0; i <= days; i++) pastDates.push(addDays(today, -days + i)); // mais antigo → hoje
  const closings = new Array<number>(pastDates.length);
  closings[pastDates.length - 1] = currentBalance; // fechamento de hoje = saldo atual
  for (let i = pastDates.length - 2; i >= 0; i--) {
    const nextDayStr = format(pastDates[i + 1], 'yyyy-MM-dd');
    closings[i] = closings[i + 1] - (netByDate.get(nextDayStr) ?? 0);
  }

  // Gráfico combinado: passado (realizado) → hoje → futuro (projetado).
  const chartData: CashFlowChartPoint[] = [];
  for (let i = 0; i < pastDates.length - 1; i++) {
    chartData.push({
      date: format(pastDates[i], 'yyyy-MM-dd'),
      dateFormatted: format(pastDates[i], 'dd/MM'),
      realizado: closings[i],
      projetado: null,
    });
  }
  dailyForecast.forEach((d, idx) => {
    chartData.push({
      date: d.date,
      dateFormatted: d.dateFormatted,
      realizado: idx === 0 ? currentBalance : null, // ponto de junção em "hoje"
      projetado: d.saldoAcumulado,
    });
  });

  return {
    currentBalance,
    finalBalance: saldoAcumulado,
    dailyForecast,
    weeklySummary,
    alerts,
    totalReceitas,
    totalDespesas,
    pendingTransactions: allTransactions,
    chartData,
    firstNegativeDate,
    lowestProjected,
  };
}
