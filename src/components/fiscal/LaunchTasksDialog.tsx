import { useEffect, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarLaunchBreakdown } from '@/hooks/useCalendarLaunchBreakdown';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: FiscalCalendarEffectiveRow[];
  isPending: boolean;
  onConfirm: (taxRegimes: string[] | null) => void;
}

type Mode = 'all' | 'select';

export function LaunchTasksDialog({ open, onOpenChange, rows, isPending, onConfirm }: Props) {
  const { perRegime, totalTasks, loading } = useCalendarLaunchBreakdown(rows);
  const [mode, setMode] = useState<Mode>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setMode('all');
      setSelected(new Set());
    }
  }, [open]);

  const toggleRegime = (regime: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(regime)) next.delete(regime);
      else next.add(regime);
      return next;
    });
  };

  const selectedTasks = perRegime
    .filter((r) => r.regime && selected.has(r.regime))
    .reduce((sum, r) => sum + r.taskCount, 0);

  const handleConfirm = () => {
    onConfirm(mode === 'all' ? null : Array.from(selected));
  };

  const confirmDisabled = isPending || (mode === 'select' && selected.size === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar tarefas</DialogTitle>
          <DialogDescription>
            Lance todas as tarefas do período ou só as de regimes tributários específicos.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="launch-mode-all" />
            <Label htmlFor="launch-mode-all" className="cursor-pointer font-normal">
              Todas as tarefas {!loading && <span className="text-muted-foreground">({totalTasks})</span>}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="select" id="launch-mode-select" />
            <Label htmlFor="launch-mode-select" className="cursor-pointer font-normal">
              Selecionar regimes tributários
            </Label>
          </div>
        </RadioGroup>

        {mode === 'select' && (
          <div className="space-y-2 rounded-md border p-3">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : perRegime.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa a lançar neste período.</p>
            ) : (
              perRegime
                .filter((r) => !!r.regime)
                .map((r) => (
                  <label
                    key={r.regime}
                    className="flex items-center justify-between gap-2 cursor-pointer py-1"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected.has(r.regime!)}
                        onCheckedChange={() => toggleRegime(r.regime!)}
                      />
                      {r.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {r.taskCount} tarefa(s) · {r.clientCount} cliente(s)
                    </span>
                  </label>
                ))
            )}
            {mode === 'select' && selected.size > 0 && (
              <p className="text-xs text-muted-foreground pt-2 mt-1 border-t">
                {selectedTasks} tarefa(s) serão lançadas.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={confirmDisabled} className="bg-ok hover:bg-ok">
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Lançando...</>
            ) : (
              <><Rocket className="h-4 w-4" /> Lançar Tarefas</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
