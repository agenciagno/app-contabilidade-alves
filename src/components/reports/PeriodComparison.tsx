import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

interface PeriodData {
  receitas: number;
  despesas: number;
  saldo: number;
}

interface PeriodComparisonProps {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
  currentLabel?: string;
  previousLabel?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const calculateVariation = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const getVariationIcon = (variation: number, isExpense = false) => {
  if (Math.abs(variation) < 0.1) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (variation > 0) {
    return isExpense ? (
      <TrendingUp className="h-4 w-4 text-red-500" />
    ) : (
      <TrendingUp className="h-4 w-4 text-emerald-500" />
    );
  }
  return isExpense ? (
    <TrendingDown className="h-4 w-4 text-emerald-500" />
  ) : (
    <TrendingDown className="h-4 w-4 text-red-500" />
  );
};

const getVariationColor = (variation: number, isExpense = false) => {
  if (Math.abs(variation) < 0.1) return 'text-muted-foreground';
  if (variation > 0) {
    return isExpense ? 'text-red-500' : 'text-emerald-500';
  }
  return isExpense ? 'text-emerald-500' : 'text-red-500';
};

const hasData = (period: PeriodData) => 
  period.receitas > 0 || period.despesas > 0;

export function PeriodComparison({
  currentPeriod,
  previousPeriod,
  currentLabel = 'Este Mês',
  previousLabel = 'Mês Anterior',
}: PeriodComparisonProps) {
  const receitasVariation = calculateVariation(currentPeriod.receitas, previousPeriod.receitas);
  const despesasVariation = calculateVariation(currentPeriod.despesas, previousPeriod.despesas);
  const saldoVariation = calculateVariation(currentPeriod.saldo, previousPeriod.saldo);

  const hasPreviousData = hasData(previousPeriod);
  const hasCurrentData = hasData(currentPeriod);

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Comparativo de Períodos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasCurrentData && !hasPreviousData ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">Sem dados para comparação</p>
            <p className="text-xs">Adicione transações para ver o comparativo</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Current Period */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">{currentLabel}</h4>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Receitas</span>
                  <p className="text-lg font-semibold text-emerald-500">
                    {formatCurrency(currentPeriod.receitas)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Despesas</span>
                  <p className="text-lg font-semibold text-red-500">
                    {formatCurrency(currentPeriod.despesas)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Saldo</span>
                  <p className={`text-lg font-semibold ${currentPeriod.saldo >= 0 ? 'text-primary' : 'text-orange-500'}`}>
                    {formatCurrency(currentPeriod.saldo)}
                  </p>
                </div>
              </div>
            </div>

            {/* Previous Period */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">{previousLabel}</h4>
              {hasPreviousData ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Receitas</span>
                    <p className="text-lg font-semibold text-emerald-500/70">
                      {formatCurrency(previousPeriod.receitas)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Despesas</span>
                    <p className="text-lg font-semibold text-red-500/70">
                      {formatCurrency(previousPeriod.despesas)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Saldo</span>
                    <p className={`text-lg font-semibold ${previousPeriod.saldo >= 0 ? 'text-primary/70' : 'text-orange-500/70'}`}>
                      {formatCurrency(previousPeriod.saldo)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-4 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-xs text-center">Sem dados no período anterior</p>
                </div>
              )}
            </div>

            {/* Variations */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 md:col-span-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Variação</h4>
              {hasPreviousData ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block mb-1">Receitas</span>
                    <div className="flex items-center justify-center gap-1">
                      {getVariationIcon(receitasVariation)}
                      <span className={`text-lg font-bold ${getVariationColor(receitasVariation)}`}>
                        {receitasVariation >= 0 ? '+' : ''}{receitasVariation.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block mb-1">Despesas</span>
                    <div className="flex items-center justify-center gap-1">
                      {getVariationIcon(despesasVariation, true)}
                      <span className={`text-lg font-bold ${getVariationColor(despesasVariation, true)}`}>
                        {despesasVariation >= 0 ? '+' : ''}{despesasVariation.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block mb-1">Saldo</span>
                    <div className="flex items-center justify-center gap-1">
                      {getVariationIcon(saldoVariation)}
                      <span className={`text-lg font-bold ${getVariationColor(saldoVariation)}`}>
                        {saldoVariation >= 0 ? '+' : ''}{saldoVariation.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Variação disponível quando houver dados no período anterior
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
