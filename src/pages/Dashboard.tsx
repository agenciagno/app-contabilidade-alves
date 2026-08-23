import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Landmark,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardSummary, useAnnualMetrics, useMonthlyEvolution, useCategoryBreakdown } from '@/hooks/useRpcDashboard';
import { useBanks } from '@/hooks/useBanks';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import {
  ChartTooltip,
} from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDashboardWidgets } from '@/components/dashboard/DashboardWidgets';
import { useReportData, processReportData } from '@/hooks/useReportData';
import { PeriodComparison } from '@/components/reports/PeriodComparison';
import { BudgetTracker } from '@/components/financeiro/BudgetTracker';
import { FinancialHealthBadge } from '@/components/financeiro/FinancialHealthBadge';
import { StatCard } from '@/components/ds';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Paleta categórica dos donuts (21/08/2026) — antes eram cores HSL soltas
// sem token. --chart-anchor é o único token novo (ver src/index.css); os
// outros 4 passos já vinham da família --action, segura nos dois modos.
const CHART_COLORS = [
  'var(--chart-anchor)',
  'var(--action-hover)',
  'var(--action)',
  'var(--action-soft)',
  'var(--muted-ink)',
];

interface ChartDatum {
  name: string;
  value: number;
  color: string;
}

// Legenda lateral dos donuts (dot + nome + %) — o Figma tirou o rótulo de
// dentro da fatia e colocou como lista ao lado.
function ChartLegend({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ul className="min-w-0 flex-1 space-y-2.5">
      {data.map((d) => (
        <li key={d.name} className="flex items-center justify-between gap-3 text-body-sm">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="truncate text-ink">{d.name}</span>
          </span>
          <span className="shrink-0 text-muted-ink">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const now = new Date();

  const { isWidgetEnabled } = useDashboardWidgets();

  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const { banks, isLoading: loadingBanks } = useBanks();
  const { recurringTransactions } = useRecurringTransactions();

  // ---- RPC-backed metrics ----
  // Sem filtro avançado nesta tela (removido 22/08/2026) — sempre o período
  // aberto (todo o histórico), sem recorte de banco/categoria/contato/status.
  const SUMMARY_START = '1900-01-01';
  const SUMMARY_END = '2999-12-31';

  const { data: dashboardSummary, isLoading: loadingSummary } = useDashboardSummary(
    SUMMARY_START,
    SUMMARY_END,
  );

  const currentYear = now.getFullYear();
  const { data: annualRpc, isLoading: loadingAnnual } = useAnnualMetrics(currentYear);
  const { data: monthlyRpc, isLoading: loadingMonthly } = useMonthlyEvolution(6);
  const { data: categoryRpc, isLoading: loadingCategory } = useCategoryBreakdown(
    'despesa',
    SUMMARY_START,
    SUMMARY_END,
    5,
  );
  const { data: revenueCategoryRpc } = useCategoryBreakdown(
    'receita',
    SUMMARY_START,
    SUMMARY_END,
    5,
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

  // Category chart data (expenses) — paleta sempre tokenizada por posição,
  // igual ao Figma (21/08/2026: cor customizada da categoria descontinuada
  // aqui, era ela que fazia a tela destoar do protótipo).
  const categoryChartData = useMemo<ChartDatum[]>(() => {
    const rows = categoryRpc ?? [];
    return rows.map((r, idx) => ({
      name: r.category_name || 'Sem categoria',
      value: Number(r.total) || 0,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [categoryRpc]);


  // Revenue category chart data (via RPC)
  const revenueCategoryChartData = useMemo<ChartDatum[]>(() => {
    const rows = revenueCategoryRpc ?? [];
    return rows.map((r, idx) => ({
      name: r.category_name || 'Sem categoria',
      value: Number(r.total) || 0,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [revenueCategoryRpc]);

  // Period comparison data
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const invisibleBankIdArray = useMemo<string[]>(
    () => banks.filter(b => b.is_invisible).map(b => b.id),
    [banks],
  );
  const { data: thisMonthTx = [] } = useReportData({ startDate: thisMonthStart, endDate: now, invisibleBankIds: invisibleBankIdArray });
  const { data: lastMonthTx = [] } = useReportData({ startDate: lastMonthStart, endDate: lastMonthEnd, invisibleBankIds: invisibleBankIdArray });

  const thisMonthData = useMemo(() => processReportData(thisMonthTx), [thisMonthTx]);
  const lastMonthData = useMemo(() => processReportData(lastMonthTx), [lastMonthTx]);

  const isLoading = loadingBanks || loadingSummary || loadingAnnual || loadingMonthly || loadingCategory;

  return (
    <div className="space-y-7">
      {/* Header + filtros + banner: gap local de space-y-6 (24px, um degrau
          abaixo do space-y-7 do resto da página) — pedido do Gabriel pra
          aproximar o título do card de saúde financeira (21/08/2026). */}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 py-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-kicker uppercase text-muted-ink-2">~/financeiro · {annualMetrics.year}</p>
            <h1 className="mt-1 text-display text-ink">Dashboard.</h1>
          </div>
        </div>

        <FinancialHealthBadge lucroPrevisto={annualMetrics.lucroPrevisto} saldoBancario={summary.saldoBancario} />
      </div>

      {/* 4 StatCards separados, cada um com barra de progresso (Figma 21/08/2026) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<TrendingUp />}
          label="Receitas recebidas"
          value={formatCurrency(summary.receitasPagas)}
          hint={`a receber: ${formatCurrency(summary.aReceber)}`}
          progresso={summary.receitasPagas + summary.aReceber > 0
            ? (summary.receitasPagas / (summary.receitasPagas + summary.aReceber)) * 100
            : 0}
          tom="ok"
        />
        <StatCard
          icon={<TrendingDown />}
          label="Contas pagas"
          value={formatCurrency(summary.despesasPagas)}
          hint={`a pagar: ${formatCurrency(summary.aPagar)}`}
          progresso={summary.despesasPagas + summary.aPagar > 0
            ? (summary.despesasPagas / (summary.despesasPagas + summary.aPagar)) * 100
            : 0}
          tom="danger"
        />
        <StatCard
          icon={<Landmark />}
          label="Saldo bancário"
          value={formatCurrency(summary.saldoBancario)}
          hint="total dos bancos visíveis"
        />
        <StatCard
          icon={<BarChart3 />}
          label="Lucro realizado"
          value={formatCurrency(annualMetrics.lucroRealizado)}
          hint={`previsto: ${formatCurrency(annualMetrics.lucroPrevisto)}`}
          tom={annualMetrics.lucroRealizado >= 0 ? 'ok' : 'danger'}
        />
      </div>

      {/* Evolução Mensal + Comparativo de Períodos lado a lado (Figma 21/08/2026) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {isWidgetEnabled('evolution') && (
          <Card>
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
      </div>

      {/* Category Charts Row — donut + legenda lateral (dot + nome + %) */}
      {(isWidgetEnabled('revenueCategoryChart') || isWidgetEnabled('categoryChart')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {isWidgetEnabled('revenueCategoryChart') && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Receitas por Evento Contábil</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-52 w-full" />
                ) : revenueCategoryChartData.length > 0 ? (
                  <div className="flex flex-col items-center gap-6 sm:flex-row">
                    <div className="h-40 w-40 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={revenueCategoryChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
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
                    </div>
                    <ChartLegend data={revenueCategoryChartData} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-52 text-muted-foreground">
                    Sem receitas categorizadas
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isWidgetEnabled('categoryChart') && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Despesas por Evento Contábil</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-52 w-full" />
                ) : categoryChartData.length > 0 ? (
                  <div className="flex flex-col items-center gap-6 sm:flex-row">
                    <div className="h-40 w-40 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
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
                    </div>
                    <ChartLegend data={categoryChartData} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-52 text-muted-foreground">
                    Sem despesas categorizadas
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Orçamento por categoria (meta x realizado) */}
      <BudgetTracker />
    </div>
  );
}
