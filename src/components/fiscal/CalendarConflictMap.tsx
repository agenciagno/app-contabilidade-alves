import { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

interface Props {
  rows: FiscalCalendarEffectiveRow[];
  year: number;
  month: number;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarConflictMap({ rows, year, month }: Props) {
  const [open, setOpen] = useState(false);

  const days = useMemo(() => {
    const ref = new Date(year, month - 1, 1);
    return eachDayOfInterval({ start: startOfMonth(ref), end: endOfMonth(ref) });
  }, [year, month]);

  const byDay = useMemo(() => {
    const m = new Map<string, FiscalCalendarEffectiveRow[]>();
    rows.forEach((r) => {
      const key = r.adjusted_due_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    });
    return m;
  }, [rows]);

  const criticalCount = Array.from(byDay.values()).filter((arr) => arr.length >= 5).length;
  const conflictCount = Array.from(byDay.values()).filter((arr) => arr.length >= 2).length;

  const firstOffset = getDay(days[0]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <h3 className="text-sm font-semibold">Mapa de conflitos</h3>
          {conflictCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {conflictCount} dia(s) com múltiplas obrigações
            </span>
          )}
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 ml-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              {criticalCount} dia(s) crítico(s)
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="p-4 border-t">
          <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstOffset }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const items = byDay.get(key) ?? [];
                const count = items.length;
                const critical = count >= 5;
                const conflict = count >= 2 && !critical;

                const cell = (
                  <div
                    className={cn(
                      'aspect-square rounded-md border text-xs p-1.5 flex flex-col items-start justify-between transition-colors',
                      conflict && 'bg-amber-100 dark:bg-amber-900/30 border-amber-500/40',
                      critical && 'bg-red-100 dark:bg-red-900/30 border-red-500/50',
                      !conflict && !critical && count === 0 && 'bg-muted/30 border-border/40',
                      !conflict && !critical && count === 1 && 'bg-background border-border/60',
                    )}
                  >
                    <span className="font-medium">{format(day, 'd')}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-semibold self-end',
                          critical && 'text-red-700 dark:text-red-400',
                          conflict && 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {count} obrig.
                      </span>
                    )}
                  </div>
                );

                if (count === 0) return <div key={key}>{cell}</div>;
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">{cell}</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-medium mb-1">
                        {format(day, "dd 'de' MMMM", { locale: ptBR })} — {count} obrigação(ões)
                        {critical && <span className="text-red-300 ml-2">⚠ Dia crítico</span>}
                      </p>
                      <ul className="text-xs space-y-0.5">
                        {items.map((r) => (
                          <li key={r.id}>• {r.fiscal_obligations_catalog?.name ?? '—'}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}
    </Card>
  );
}
