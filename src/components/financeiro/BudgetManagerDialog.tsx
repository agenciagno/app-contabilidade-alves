import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBudgets } from '@/hooks/useBudgets';

interface BudgetManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthYear: string;
}

function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '');
  return (parseInt(numbers || '0', 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCurrencyInput(value: string): number {
  const numbers = value.replace(/\D/g, '');
  return parseInt(numbers || '0', 10) / 100;
}

export function BudgetManagerDialog({ open, onOpenChange, monthYear }: BudgetManagerDialogProps) {
  const { rows, despesaCategories, upsertBudget, deleteBudget } = useBudgets(monthYear);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Pré-preenche com os orçamentos existentes ao abrir.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    despesaCategories.forEach((c) => {
      const existing = rows.find((r) => r.categoryId === c.id);
      initial[c.id] = existing && existing.budget > 0
        ? existing.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
    });
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, despesaCategories.length, rows.length]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const c of despesaCategories) {
        const raw = values[c.id] ?? '';
        const val = parseCurrencyInput(raw);
        const existing = rows.find((r) => r.categoryId === c.id);
        if (val > 0) {
          if (!existing || existing.budget !== val) {
            await upsertBudget.mutateAsync({ categoryId: c.id, budgetValue: val });
          }
        } else if (existing?.budgetId) {
          // Zerado → remove o orçamento existente
          await deleteBudget.mutateAsync(existing.budgetId);
        }
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Orçamento por categoria</DialogTitle>
          <DialogDescription>
            Defina o teto de gasto mensal por categoria de despesa. Deixe em branco (ou zero) para remover.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {despesaCategories.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma categoria de despesa cadastrada.</p>
          )}
          {despesaCategories.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color || '#6B7280' }} />
                <Label className="text-sm truncate">{c.name}</Label>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">R$</span>
                <Input
                  value={values[c.id] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: formatCurrencyInput(e.target.value) }))}
                  placeholder="0,00"
                  className="h-8 w-28 text-sm text-right"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
