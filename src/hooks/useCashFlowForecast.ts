import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addDays, format, startOfDay, parseISO, isWithinInterval, getDate } from 'date-fns';
import { useBanks } from './useBanks';

interface ForecastTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'receita' | 'despesa';
  category?: { name: string; color: string };
  isRecurring?: boolean;
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
  
  // Calculate current balance from all active visible banks (exclude invisible)
  const currentBalance = banks
    .filter(b => b.is_active && !b.is_invisible)
    .reduce((sum, bank) => sum + Number(bank.current_balance), 0);

  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  // Get invisible bank IDs
  const invisibleBankIds = banks.filter(b => b.is_invisible).map(b => b.id);

  // Fetch pending transactions for the next X days
  const { data: pendingTransactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['cash-flow-pending', days, invisibleBankIds],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          date,
          description,
          amount,
          type,
          is_paid,
          bank_id,
          category:categories(name, color)
        `)
        .is('deleted_at', null)
        .eq('is_transfer', false)
        .eq('is_paid', false)
        .gte('date', format(today, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date');

      // Exclude transactions from invisible banks
      if (invisibleBankIds.length > 0) {
        const notInFilter = invisibleBankIds.map(id => `bank_id.neq.${id}`).join(',');
        query = query.or(`bank_id.is.null,and(${notInFilter})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data.map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
        type: t.type as 'receita' | 'despesa',
        category: t.category,
        isRecurring: false,
      }));
    },
  });

  // Fetch active recurring transactions
  const { data: recurringTransactions = [], isLoading: loadingRecurring } = useQuery({
    queryKey: ['cash-flow-recurring', days],
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
          start_date,
          end_date,
          category:categories(name, color)
        `)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    },
  });

  // Fetch paid transactions of the past window to reconstruct the REALIZED balance curve.
  const { data: paidHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['cash-flow-realized', days, invisibleBankIds],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('date, amount, paid_amount, type, bank_id')
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

  // Generate recurring transaction instances for the period
  const recurringInstances: ForecastTransaction[] = [];
  
  recurringTransactions.forEach(rt => {
    const startDate = rt.start_date ? parseISO(rt.start_date) : today;
    const rtEndDate = rt.end_date ? parseISO(rt.end_date) : endDate;
    
    // For monthly recurring transactions
    if (rt.frequency === 'monthly' && rt.day_of_month) {
      let currentDate = new Date(today);
      
      while (currentDate <= endDate) {
        const targetDay = rt.day_of_month;
        const testDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDay);
        
        if (testDate >= today && testDate <= endDate && testDate >= startDate && testDate <= rtEndDate) {
          // Check if there's already a pending transaction for this recurring
          const alreadyExists = pendingTransactions.some(pt => 
            pt.description === rt.description && 
            pt.date === format(testDate, 'yyyy-MM-dd')
          );
          
          if (!alreadyExists) {
            recurringInstances.push({
              id: `${rt.id}-${format(testDate, 'yyyy-MM-dd')}`,
              date: format(testDate, 'yyyy-MM-dd'),
              description: rt.description,
              amount: Number(rt.amount),
              type: rt.type as 'receita' | 'despesa',
              category: rt.category,
              isRecurring: true,
            });
          }
        }
        
        // Move to next month
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      }
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
