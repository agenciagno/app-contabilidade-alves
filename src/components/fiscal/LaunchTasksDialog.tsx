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

export interface LaunchFilters {
  taxRegimes: string[] | null;
  responsibleIds: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: FiscalCalendarEffectiveRow[];
  year: number;
  month: number;
  isPending: boolean;
  onConfirm: (filters: LaunchFilters) => void;
}

type Mode = 'all' | 'regime' | 'collaborator';

export function LaunchTasksDialog({ open, onOpenChange, rows, year, month, isPending, onConfirm }: Props) {
  const { perRegime, perCollaborator, totalTasks, loading } = useCalendarLaunchBreakdown(rows, year, month);
  const [mode, setMode] = useState<Mode>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setMode('all');
      setSelected(new Set());
    }
  }, [open]);

  const handleModeChange = (v: Mode) => {
    setMode(v);
    setSelected(new Set());
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeGroups = mode === 'regime' ? perRegime : mode === 'collaborator' ? perCollaborator : [];
  const groupKey = (g: { regime?: string | null; id?: string | null }) =>
    mode === 'regime' ? g.regime ?? undefined : g.id ?? undefined;

  const selectedPending = activeGroups
    .filter((g) => {
      const key = groupKey(g);
      return key && selected.has(key);
    })
    .reduce((sum, g) => sum + g.pending, 0);

  const handleConfirm = () => {
    if (mode === 'all') {
      onConfirm({ taxRegimes: null, responsibleIds: null });
    } else if (mode === 'regime') {
      onConfirm({ taxRegimes: Array.from(selected), responsibleIds: null });
    } else {
      onConfirm({ taxRegimes: null, responsibleIds: Array.from(selected) });
    }
  };

  const confirmDisabled = isPending || (mode !== 'all' && selected.size === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar tarefas</DialogTitle>
          <DialogDescription>
            Lance todas as tarefas pendentes do período, ou só as de regimes tributários ou colaboradores específicos.
            Quem já foi lançado antes não é duplicado.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as Mode)} className="gap-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="launch-mode-all" />
            <Label htmlFor="launch-mode-all" className="cursor-pointer font-normal">
              Todas as tarefas pendentes {!loading && <span className="text-muted-foreground">({totalTasks})</span>}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="regime" id="launch-mode-regime" />
            <Label htmlFor="launch-mode-regime" className="cursor-pointer font-normal">
              Selecionar regimes tributários
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="collaborator" id="launch-mode-collaborator" />
            <Label htmlFor="launch-mode-collaborator" className="cursor-pointer font-normal">
              Selecionar colaboradores
            </Label>
          </div>
        </RadioGroup>

        {(mode === 'regime' || mode === 'collaborator') && (
          <div className="space-y-1 rounded-md border p-3 max-h-64 overflow-y-auto">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : activeGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente neste período.</p>
            ) : (
              activeGroups.map((g) => {
                const key = groupKey(g);
                if (!key) return null;
                const label = mode === 'regime' ? (g as (typeof perRegime)[number]).label : (g as (typeof perCollaborator)[number]).name;
                const noPending = g.pending === 0;
                return (
                  <label
                    key={key}
                    className={`flex items-center justify-between gap-2 py-1 ${noPending ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected.has(key)}
                        onCheckedChange={() => toggle(key)}
                        disabled={noPending}
                      />
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {noPending ? 'já lançado' : `${g.pending} pendente(s)`}
                      {g.launched > 0 && !noPending ? ` · ${g.launched} lançada(s)` : ''}
                    </span>
                  </label>
                );
              })
            )}
            {selected.size > 0 && (
              <p className="text-xs text-muted-foreground pt-2 mt-1 border-t">
                {selectedPending} tarefa(s) serão lançadas.
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
