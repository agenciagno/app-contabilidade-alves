import { Target } from 'lucide-react';
import { BudgetTracker } from '@/components/financeiro/BudgetTracker';
import { GoalCard } from '@/components/financeiro/GoalCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinancialGoals } from '@/hooks/useFinancialGoals';

export default function MetasOrcamentos() {
  const { goals, isLoading, updateProgress, remove } = useFinancialGoals();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro · Planejamento</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Target className="w-7 h-7 text-primary" strokeWidth={1.75} />
          Metas & Orçamentos
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Defina metas financeiras e tetos de gasto por categoria, e acompanhe o progresso.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Metas Financeiras</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhuma meta cadastrada ainda. Use o botão <span className="font-medium">Adicionar</span> abaixo.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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

      <BudgetTracker />
    </div>
  );
}
