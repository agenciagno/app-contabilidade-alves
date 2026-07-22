import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, AlertTriangle, Settings2 } from 'lucide-react';
import { useBudgets } from '@/hooks/useBudgets';
import { BudgetManagerDialog } from './BudgetManagerDialog';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function currentMonthYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function BudgetTracker() {
  const monthYear = currentMonthYear();
  const { rows, totalBudget, totalRealizado, overCount, isLoading } = useBudgets(monthYear);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Orçamento por Categoria
            {overCount > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> {overCount} estourado{overCount > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setManageOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Gerenciar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nenhum orçamento definido para {monthYear.split('-').reverse().join('/')}.<br />
            Clique em <span className="font-medium">Gerenciar</span> para definir tetos por categoria.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
              <span>Realizado {formatCurrency(totalRealizado)}</span>
              <span>Meta {formatCurrency(totalBudget)}</span>
            </div>
            {rows.map((r) => {
              const pctClamped = Math.min(r.pct, 1) * 100;
              const overWidth = r.pct > 1 ? Math.min((r.pct - 1) / r.pct, 1) * 100 : 0;
              return (
                <div key={r.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.categoryColor }} />
                      <span className="truncate">{r.categoryName}</span>
                    </div>
                    <span className={`tabular-nums shrink-0 ${r.over ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      {formatCurrency(r.realizado)} / {formatCurrency(r.budget)}
                      {r.over && <span className="ml-1">({Math.round(r.pct * 100)}%)</span>}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className={r.over ? 'bg-destructive' : r.pct >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}
                      style={{ width: `${r.over ? 100 - overWidth : pctClamped}%` }}
                    />
                    {r.over && <div className="bg-destructive/50" style={{ width: `${overWidth}%` }} />}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </CardContent>
      <BudgetManagerDialog open={manageOpen} onOpenChange={setManageOpen} monthYear={monthYear} />
    </Card>
  );
}
