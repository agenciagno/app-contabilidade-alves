import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCashFlowForecast } from '@/hooks/useCashFlowForecast';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Wallet,
  CalendarDays,
  RefreshCw
} from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-foreground mb-2">{data.dateFormatted}</p>
        <div className="space-y-1 text-sm">
          <p className="text-emerald-500">Receitas: {formatCurrency(data.receitas)}</p>
          <p className="text-red-500">Despesas: {formatCurrency(data.despesas)}</p>
          <p className={`font-medium ${data.saldoAcumulado >= 0 ? 'text-primary' : 'text-destructive'}`}>
            Saldo: {formatCurrency(data.saldoAcumulado)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export function CashFlowForecast() {
  const { 
    currentBalance, 
    finalBalance, 
    dailyForecast, 
    weeklySummary, 
    alerts, 
    totalReceitas, 
    totalDespesas,
    pendingTransactions,
    isLoading 
  } = useCashFlowForecast(30);

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-[300px]" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const balanceChange = finalBalance - currentBalance;
  const balanceChangePercent = currentBalance !== 0 
    ? ((balanceChange / Math.abs(currentBalance)) * 100).toFixed(1) 
    : '0';

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Fluxo de Caixa Previsto - Próximos 30 dias</CardTitle>
          </div>
          {alerts.length > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {alerts.length} alerta{alerts.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Saldo Atual</p>
            <p className={`text-xl font-bold ${currentBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              {formatCurrency(currentBalance)}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Previsão Final</p>
            <p className={`text-xl font-bold ${finalBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              {formatCurrency(finalBalance)}
            </p>
            <p className={`text-xs flex items-center gap-1 ${balanceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {balanceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {balanceChange >= 0 ? '+' : ''}{balanceChangePercent}%
            </p>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-4">
            <p className="text-sm text-emerald-600">A Receber</p>
            <p className="text-xl font-bold text-emerald-500">{formatCurrency(totalReceitas)}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-4">
            <p className="text-sm text-red-600">A Pagar</p>
            <p className="text-xl font-bold text-red-500">{formatCurrency(totalDespesas)}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyForecast}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis 
                dataKey="dateFormatted" 
                tick={{ fontSize: 11 }}
                interval={4}
                className="text-muted-foreground"
              />
              <YAxis 
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                className="text-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              <Area 
                type="monotone" 
                dataKey="saldoAcumulado" 
                fill="hsl(var(--primary) / 0.1)" 
                stroke="none"
              />
              <Line 
                type="monotone" 
                dataKey="saldoAcumulado" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
                name="Saldo"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Summary */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Resumo por Semana
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {weeklySummary.map((week) => (
              <div 
                key={week.week} 
                className={`rounded-lg p-3 text-center ${
                  week.saldo >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}
              >
                <p className="text-xs text-muted-foreground">{week.label}</p>
                <p className={`text-sm font-bold ${week.saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {week.saldo >= 0 ? '+' : ''}{formatCurrency(week.saldo)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 max-h-[200px] overflow-y-auto">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-2 mb-2 sticky top-0 bg-destructive/10 pb-2">
              <AlertTriangle className="h-4 w-4" />
              Alertas de Saldo Negativo ({alerts.length})
            </h4>
            <ul className="space-y-1 text-sm text-destructive/80">
              {alerts.map((alert, i) => (
                <li key={i}>• {alert.message}: {formatCurrency(alert.saldo)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Transactions Table */}
        {pendingTransactions.length > 0 ? (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Próximas Movimentações ({pendingTransactions.length})
            </h4>
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento Contábil</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTransactions.slice(0, 15).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {t.date.split('-').reverse().slice(0, 2).join('/')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {t.type === 'receita' ? (
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{t.description}</span>
                          {t.isRecurring && (
                            <RefreshCw className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.category && (
                          <Badge
                            variant="secondary"
                            style={{ backgroundColor: `${t.category.color}20`, color: t.category.color }}
                            className="text-xs"
                          >
                            {t.category.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        t.type === 'receita' ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {t.type === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pendingTransactions.length > 15 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Mostrando 15 de {pendingTransactions.length} transações
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma transação pendente nos próximos 30 dias</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
