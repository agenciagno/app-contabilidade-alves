import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GoalCard } from '@/components/financeiro/GoalCard';
import { AddGoalOrBudgetDialog } from '@/components/financeiro/AddGoalOrBudgetDialog';
import { useFinancialGoals } from '@/hooks/useFinancialGoals';
import { useBudgets } from '@/hooks/useBudgets';
import { PageHeader, StatCardRow, DsBadge, type BadgeTone } from '@/components/ds';
import { cn } from '@/lib/utils';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function currentMonthYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Estourado = passou do orçado (dado real). "Atenção" acima de 80% é um limiar
 * nosso, consistente com o mesmo corte usado na carga de colaboradores fiscais —
 * o Figma não define o número exato, então seguimos o padrão já adotado no app. */
function statusFor(pct: number, over: boolean): { tone: BadgeTone; label: string } {
  if (over) return { tone: 'danger', label: 'estourado' };
  if (pct > 0.8) return { tone: 'warn', label: 'atenção' };
  return { tone: 'ok', label: 'dentro' };
}

export default function MetasOrcamentos() {
  const monthYear = currentMonthYear();
  const { goals, isLoading: goalsLoading, updateProgress, remove } = useFinancialGoals();
  const { rows, totalBudget, totalRealizado, overCount, isLoading: budgetLoading, deleteBudget } = useBudgets(monthYear);
  const [addOpen, setAddOpen] = useState(false);

  const folga = totalBudget - totalRealizado;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · planejamento"
        title="Metas & orçamentos."
        subtitle="Teto de gasto por categoria e progresso das metas do período."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Nova meta / Orçamento
          </Button>
        }
      />

      <StatCardRow
        items={[
          { label: 'Orçado (mês)', value: formatCurrency(totalBudget), hint: monthYear.split('-').reverse().join('/') },
          { label: 'Realizado', value: formatCurrency(totalRealizado), hint: totalBudget > 0 ? `${Math.round((totalRealizado / totalBudget) * 100)}% do orçado` : '—' },
          { label: 'Categorias estouradas', value: overCount, hint: 'acima do orçamento', emphasis: overCount > 0 ? 'warm' : 'none' },
          { label: 'Folga orçamentária', value: formatCurrency(folga), hint: 'no mês' },
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Orçado (mês)</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Uso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgetLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-ink">
                  Nenhum orçamento definido para {monthYear.split('-').reverse().join('/')}.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const st = statusFor(r.pct, r.over);
                return (
                  <TableRow key={r.categoryId}>
                    <TableCell className="font-medium text-ink">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.categoryColor }} />
                        {r.categoryName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.budget)}</TableCell>
                    <TableCell className={cn('text-right', r.over && 'text-danger')}>{formatCurrency(r.realizado)}</TableCell>
                    <TableCell className="text-right">{(r.pct * 100).toFixed(1)}%</TableCell>
                    <TableCell><DsBadge tone={st.tone}>{st.label}</DsBadge></TableCell>
                    <TableCell>
                      {r.budgetId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-danger"
                          onClick={() => deleteBudget.mutate(r.budgetId!)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Metas financeiras — não tem tela própria no Figma (só orçamento por
          categoria), mantidas abaixo para não perder funcionalidade real. */}
      <div className="space-y-3">
        <p className="text-kicker uppercase text-muted-ink-2">Metas financeiras</p>
        {goalsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : goals.length === 0 ? (
          <p className="py-4 text-body text-muted-ink">
            Nenhuma meta cadastrada ainda. Use o botão <span className="font-medium">Nova meta</span> acima.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdateProgress={(current_value) => updateProgress.mutate({ id: goal.id, current_value })}
                onDelete={() => remove.mutate(goal.id)}
                isSaving={updateProgress.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <AddGoalOrBudgetDialog open={addOpen} onOpenChange={setAddOpen} monthYear={monthYear} />
    </div>
  );
}
