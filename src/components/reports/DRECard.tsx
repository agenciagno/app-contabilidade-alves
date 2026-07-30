import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Percent } from 'lucide-react';

interface DRECardProps {
  faturamentoBruto: number;
  impostos: number;
  despesasOperacionais: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function DRECard({ faturamentoBruto, impostos, despesasOperacionais }: DRECardProps) {
  const lucroLiquido = faturamentoBruto - impostos - despesasOperacionais;
  const margemLucro = faturamentoBruto > 0 ? (lucroLiquido / faturamentoBruto) * 100 : 0;
  const isPositive = lucroLiquido >= 0;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Resultado Operacional (DRE)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Faturamento Bruto */}
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Faturamento Bruto</span>
            <span className="font-semibold text-emerald-500">{formatCurrency(faturamentoBruto)}</span>
          </div>

          {/* Impostos/Deduções */}
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Minus className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Impostos/Deduções</span>
            </div>
            <span className="font-medium text-red-500">- {formatCurrency(impostos)}</span>
          </div>

          {/* Despesas Operacionais */}
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Minus className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Despesas Operacionais</span>
            </div>
            <span className="font-medium text-red-500">- {formatCurrency(despesasOperacionais)}</span>
          </div>

          {/* Lucro Líquido */}
          <div className="flex items-center justify-between py-3 bg-muted/30 rounded-lg px-3 -mx-3">
            <div className="flex items-center gap-2">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium text-foreground">Lucro Líquido</span>
            </div>
            <span className={`font-bold text-lg ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(lucroLiquido)}
            </span>
          </div>

          {/* Margem de Lucro */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Margem de Lucro</span>
            </div>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
              isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
            }`}>
              {margemLucro.toFixed(1)}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
