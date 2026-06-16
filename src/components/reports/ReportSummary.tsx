import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface ReportSummaryProps {
  totalReceitas: number;
  totalDespesas: number;
  transactionCount: number;
  startDate?: Date;
  endDate?: Date;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function ReportSummary({ 
  totalReceitas, 
  totalDespesas, 
  transactionCount,
  startDate,
  endDate 
}: ReportSummaryProps) {
  const saldo = totalReceitas - totalDespesas;

  const periodText = startDate && endDate
    ? `Período: ${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`
    : 'Período: Todo o histórico';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Receitas</p>
                <p className="text-lg font-semibold text-emerald-500">{formatCurrency(totalReceitas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Despesas</p>
                <p className="text-lg font-semibold text-red-500">{formatCurrency(totalDespesas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${saldo >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Wallet className={`h-5 w-5 ${saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo do Período</p>
                <p className={`text-lg font-semibold ${saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatCurrency(saldo)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Hash className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Transações</p>
                <p className="text-lg font-semibold text-foreground">{transactionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <p className="text-sm text-muted-foreground text-center">{periodText}</p>
    </div>
  );
}
