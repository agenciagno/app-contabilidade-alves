import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useFinancialGoals } from '@/hooks/useFinancialGoals';
import { useBudgets } from '@/hooks/useBudgets';

interface Props {
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

const emptyGoal = { title: '', targetValue: '', currentValue: '', startDate: '', endDate: '', notes: '' };

export function AddGoalOrBudgetDialog({ open, onOpenChange, monthYear }: Props) {
  const [tab, setTab] = useState<'meta' | 'orcamento'>('meta');
  const [goalForm, setGoalForm] = useState(emptyGoal);
  const [categoryId, setCategoryId] = useState('');
  const [budgetValue, setBudgetValue] = useState('');

  const { create: createGoal } = useFinancialGoals();
  const { despesaCategories, upsertBudget } = useBudgets(monthYear);

  const resetAndClose = () => {
    setGoalForm(emptyGoal);
    setCategoryId('');
    setBudgetValue('');
    setTab('meta');
    onOpenChange(false);
  };

  const handleSubmitGoal = (e: React.FormEvent) => {
    e.preventDefault();
    createGoal.mutate(
      {
        title: goalForm.title.trim(),
        target_value: parseCurrencyInput(goalForm.targetValue),
        current_value: parseCurrencyInput(goalForm.currentValue || '0'),
        start_date: goalForm.startDate,
        end_date: goalForm.endDate,
        notes: goalForm.notes.trim() || null,
      },
      { onSuccess: resetAndClose },
    );
  };

  const handleSubmitBudget = (e: React.FormEvent) => {
    e.preventDefault();
    upsertBudget.mutate(
      { categoryId, budgetValue: parseCurrencyInput(budgetValue) },
      { onSuccess: resetAndClose },
    );
  };

  const goalValid =
    !!goalForm.title.trim() && parseCurrencyInput(goalForm.targetValue) > 0 && !!goalForm.startDate && !!goalForm.endDate;
  const budgetValid = !!categoryId && parseCurrencyInput(budgetValue) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Adicionar</DialogTitle>
          <DialogDescription>Cadastre uma meta financeira ou um orçamento por categoria.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'meta' | 'orcamento')}>
          <TabsList className="w-full">
            <TabsTrigger value="meta" className="flex-1">Meta Financeira</TabsTrigger>
            <TabsTrigger value="orcamento" className="flex-1">Orçamento por Categoria</TabsTrigger>
          </TabsList>

          <TabsContent value="meta">
            <form onSubmit={handleSubmitGoal} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título *</Label>
                <Input
                  value={goalForm.title}
                  onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ex.: Reserva de emergência"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor alvo (R$) *</Label>
                  <Input
                    value={goalForm.targetValue}
                    onChange={(e) => setGoalForm((f) => ({ ...f, targetValue: formatCurrencyInput(e.target.value) }))}
                    placeholder="0,00"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor atual (R$)</Label>
                  <Input
                    value={goalForm.currentValue}
                    onChange={(e) => setGoalForm((f) => ({ ...f, currentValue: formatCurrencyInput(e.target.value) }))}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data de início *</Label>
                  <Input
                    type="date"
                    value={goalForm.startDate}
                    onChange={(e) => setGoalForm((f) => ({ ...f, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data final *</Label>
                  <Input
                    type="date"
                    value={goalForm.endDate}
                    onChange={(e) => setGoalForm((f) => ({ ...f, endDate: e.target.value }))}
                    min={goalForm.startDate || undefined}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observação</Label>
                <Textarea
                  value={goalForm.notes}
                  onChange={(e) => setGoalForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={resetAndClose}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={createGoal.isPending || !goalValid}>
                  {createGoal.isPending ? 'Salvando...' : 'Criar meta'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="orcamento">
            <form onSubmit={handleSubmitBudget} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria de despesa *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {despesaCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Teto mensal (R$) *</Label>
                <Input
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(formatCurrencyInput(e.target.value))}
                  placeholder="0,00"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Vale para {monthYear.split('-').reverse().join('/')}. Se a categoria já tiver orçamento neste mês, o valor é substituído.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={resetAndClose}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={upsertBudget.isPending || !budgetValid}>
                  {upsertBudget.isPending ? 'Salvando...' : 'Definir orçamento'}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
