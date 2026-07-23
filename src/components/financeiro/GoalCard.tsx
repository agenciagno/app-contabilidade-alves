import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { FinancialGoal } from '@/hooks/useFinancialGoals';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '');
  return (parseInt(numbers || '0', 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCurrencyInput(value: string): number {
  const numbers = value.replace(/\D/g, '');
  return parseInt(numbers || '0', 10) / 100;
}

interface Props {
  goal: FinancialGoal;
  onUpdateProgress: (currentValue: number) => void;
  onDelete: () => void;
  isSaving?: boolean;
}

export function GoalCard({ goal, onUpdateProgress, onDelete, isSaving }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const pct = goal.target_value > 0 ? Math.min(goal.current_value / goal.target_value, 1) * 100 : 0;
  const reached = goal.current_value >= goal.target_value;

  const startEdit = () => {
    setDraft(goal.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditing(true);
  };
  const confirmEdit = () => {
    onUpdateProgress(parseCurrencyInput(draft));
    setEditing(false);
  };

  return (
    <Card className="border-border/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-foreground leading-tight">{goal.title}</p>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Progress value={pct} className={reached ? '[&>div]:bg-emerald-500' : ''} />
          <div className="flex items-center justify-between text-xs">
            {editing ? (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">R$</span>
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(formatCurrencyInput(e.target.value))}
                  className="h-6 w-24 text-xs px-1.5"
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={confirmEdit} disabled={isSaving}>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {formatCurrency(goal.current_value)} / {formatCurrency(goal.target_value)}
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <span className={`font-semibold ${reached ? 'text-emerald-600' : 'text-foreground'}`}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
          <span>Início: {format(parseISO(goal.start_date), 'dd/MM/yyyy')}</span>
          <span>Fim: {format(parseISO(goal.end_date), 'dd/MM/yyyy')}</span>
        </div>
      </CardContent>
    </Card>
  );
}
