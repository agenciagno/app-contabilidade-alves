import { Target } from 'lucide-react';
import { BudgetTracker } from '@/components/financeiro/BudgetTracker';

export default function MetasOrcamentos() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro · Planejamento</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Target className="w-7 h-7 text-primary" strokeWidth={1.75} />
          Metas & Orçamentos
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Defina um teto de gasto por categoria e acompanhe o progresso do mês.
        </p>
      </div>

      <BudgetTracker />
    </div>
  );
}
