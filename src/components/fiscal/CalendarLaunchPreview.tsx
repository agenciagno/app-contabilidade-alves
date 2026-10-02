import { useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarLaunchBreakdown } from '@/hooks/useCalendarLaunchBreakdown';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

interface Props {
  rows: FiscalCalendarEffectiveRow[];
  year: number;
  month: number;
  reviewed: boolean;
  onReviewedChange: (v: boolean) => void;
}

export function CalendarLaunchPreview({ rows, year, month, reviewed, onReviewedChange }: Props) {
  const breakdown = useCalendarLaunchBreakdown(rows, year, month);
  const { perObligation, perCollaborator, totalTasks, totalLaunched, clientCount, loading } = breakdown;

  const overloaded = perCollaborator.filter((c) => c.pct > 40);

  // Reset reviewed flag quando o calendário muda de fato (recálculo), não a cada
  // lançamento parcial — senão o segundo lançamento (outro regime/colaborador) exige
  // marcar "revisei" de novo sem motivo, já que a distribuição não mudou.
  useEffect(() => {
    onReviewedChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, year, month]);

  return (
    <Card className="p-5 space-y-5 border-ok/20 bg-ok/[0.03]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-ok" />
            Pré-lançamento
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? (
              <Skeleton className="h-4 w-64" />
            ) : (
              <>
                Serão geradas <strong className="text-foreground">{totalTasks}</strong> tarefa(s) para{' '}
                <strong className="text-foreground">{clientCount}</strong> cliente(s).
                {totalLaunched > 0 && (
                  <span className="text-muted-foreground"> ({totalLaunched} já lançada(s) neste período.)</span>
                )}
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox checked={reviewed} onCheckedChange={(v) => onReviewedChange(!!v)} />
          Revisei a distribuição
        </label>
      </div>

      {overloaded.length > 0 && (
        <div className="space-y-2">
          {overloaded.map((c) => (
            <div
              key={c.id ?? 'none'}
              className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-warn dark:text-warn mt-0.5" />
              <p>
                <strong>{c.name}</strong> ficará com <strong>{c.pct.toFixed(0)}%</strong> das tarefas pendentes ({c.pending}) —
                considere redistribuir.
              </p>
            </div>
          ))}
        </div>
      )}

      <div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Por obrigação</h3>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obrigação</TableHead>
                  <TableHead className="text-right w-24">Pendente</TableHead>
                  <TableHead className="w-28">Vencimento</TableHead>
                  <TableHead className="w-28">Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  perObligation.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.pending}
                        {o.launched > 0 && (
                          <span className="text-[11px] text-muted-foreground block">{o.launched} lançada(s)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.adjustedDueDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.internalDeliveryDate), 'dd/MM/yyyy')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

      </div>
    </Card>
  );
}
