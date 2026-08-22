import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  if (Math.abs(variation) < 0.1) return <Minus className="h-3.5 w-3.5 text-muted-ink" />;
  if (variation > 0) {
    return isExpense ? (
      <TrendingUp className="h-3.5 w-3.5 text-danger" />
    ) : (
      <TrendingUp className="h-3.5 w-3.5 text-ok" />
    );
  }
  return isExpense ? (
    <TrendingDown className="h-3.5 w-3.5 text-ok" />
  ) : (
    <TrendingDown className="h-3.5 w-3.5 text-danger" />
  );
};

const getVariationColor = (variation: number, isExpense = false) => {
  if (Math.abs(variation) < 0.1) return 'text-muted-ink';
  if (variation > 0) {
    return isExpense ? 'text-danger' : 'text-ok';
  }
  return isExpense ? 'text-ok' : 'text-danger';
};

const hasData = (period: PeriodData) =>
  period.receitas > 0 || period.despesas > 0;

// Linha label+valor de uma seção (Este Mês/Mês Anterior) — cai pra
// "— sem lançamento" quando aquele período específico não tem dado
// (mesmo critério de `hasData` já usado no resto do componente).
function Row({ label, value, empty, tone }: { label: string; value: string; empty: boolean; tone?: 'ok' | 'danger' }) {
  return (
    <div>
      <p className="text-meta text-muted-ink">{label}</p>
      <p
        className={cn(
          'text-body font-semibold',
          empty ? 'text-muted-ink-2' : tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-ink',
        )}
      >
        {empty ? '— sem lançamento' : value}
      </p>
    </div>
  );
}

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

  const variations = [
    { label: 'Receitas', variation: receitasVariation, isExpense: false },
    { label: 'Despesas', variation: despesasVariation, isExpense: true },
    { label: 'Saldo', variation: saldoVariation, isExpense: false },
  ];

  return (
    <Card className="flex h-full flex-col gap-5 p-5">
      <h3 className="text-h4-card text-ink">Comparativo de Períodos</h3>

      <div className="flex flex-col gap-3">
        <p className="text-meta uppercase text-muted-ink-2">{currentLabel}</p>
        <Row label="Receitas" value={formatCurrency(currentPeriod.receitas)} empty={!hasCurrentData} tone="ok" />
        <Row label="Despesas" value={formatCurrency(currentPeriod.despesas)} empty={!hasCurrentData} tone="danger" />
        <Row label="Saldo" value={formatCurrency(currentPeriod.saldo)} empty={!hasCurrentData} />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-meta uppercase text-muted-ink-2">{previousLabel}</p>
        <Row label="Receitas" value={formatCurrency(previousPeriod.receitas)} empty={!hasPreviousData} tone="ok" />
        <Row label="Despesas" value={formatCurrency(previousPeriod.despesas)} empty={!hasPreviousData} tone="danger" />
        <Row label="Saldo" value={formatCurrency(previousPeriod.saldo)} empty={!hasPreviousData} />
      </div>

      {/* Variação: fundo recuado (--bg, o token de fundo de página usado como
          "superfície recuada" dentro do card — mesmo padrão do Figma). */}
      <div className="rounded-md bg-bg p-4">
        <p className="mb-3 text-meta uppercase text-muted-ink-2">Variação</p>
        {hasPreviousData ? (
          <div className="grid grid-cols-3 gap-3">
            {variations.map((v) => (
              <div key={v.label}>
                <p className="text-meta text-muted-ink">{v.label}</p>
                <div className="mt-1 flex items-center gap-1">
                  {getVariationIcon(v.variation, v.isExpense)}
                  <span className={cn('text-body-sm font-semibold', getVariationColor(v.variation, v.isExpense))}>
                    {v.variation >= 0 ? '+' : ''}
                    {v.variation.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-meta text-muted-ink">Variação disponível quando houver dados no período anterior.</p>
        )}
      </div>
    </Card>
  );
}
