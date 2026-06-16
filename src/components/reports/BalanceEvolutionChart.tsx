import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BalanceData {
  month: string;
  balance: number;
  receitas: number;
  despesas: number;
}

interface BalanceEvolutionChartProps {
  data: BalanceData[];
  weeklyData?: BalanceData[];
  groupBy?: 'month' | 'week';
  onGroupByChange?: (value: 'month' | 'week') => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-sm mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <p className={`${data.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            Saldo: {formatCurrency(data.balance)}
          </p>
          <p className="text-emerald-500">
            + Receitas: {formatCurrency(data.receitas)}
          </p>
          <p className="text-red-500">
            - Despesas: {formatCurrency(data.despesas)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export function BalanceEvolutionChart({ 
  data, 
  weeklyData,
  groupBy = 'month', 
  onGroupByChange 
}: BalanceEvolutionChartProps) {
  const chartData = groupBy === 'week' && weeklyData ? weeklyData : data;

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Evolução do Saldo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            Sem dados para exibir
          </div>
        </CardContent>
      </Card>
    );
  }

  const minValue = Math.min(...chartData.map(d => d.balance));
  const maxValue = Math.max(...chartData.map(d => d.balance));
  const padding = (maxValue - minValue) * 0.1 || 1000;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Evolução do Saldo
          </CardTitle>
          {onGroupByChange && (
            <div className="flex gap-1">
              <Button
                variant={groupBy === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onGroupByChange('month')}
                className="text-xs h-7 px-2"
              >
                Mensal
              </Button>
              <Button
                variant={groupBy === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onGroupByChange('week')}
                className="text-xs h-7 px-2"
              >
                Semanal
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              domain={[minValue - padding, maxValue + padding]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{
                fill: 'hsl(var(--primary))',
                strokeWidth: 2,
                r: 4,
              }}
              activeDot={{
                fill: 'hsl(var(--primary))',
                strokeWidth: 2,
                r: 6,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
