import { useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Scale, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarLaunchBreakdown } from '@/hooks/useCalendarLaunchBreakdown';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

interface Props {
  rows: FiscalCalendarEffectiveRow[];
  reviewed: boolean;
  onReviewedChange: (v: boolean) => void;
}

export function CalendarLaunchPreview({ rows, reviewed, onReviewedChange }: Props) {
  const breakdown = useCalendarLaunchBreakdown(rows);
  const { perObligation, perCollaborator, perRegime, totalTasks, clientCount, loading } = breakdown;

  const overloaded = perCollaborator.filter((c) => c.pct > 40);

  // Reset reviewed flag when rows change
  useEffect(() => {
    onReviewedChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const initials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

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
                <strong>{c.name}</strong> ficará com <strong>{c.pct.toFixed(0)}%</strong> das tarefas ({c.count}) — considere
                redistribuir.
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div>
          <h3 className="text-sm font-semibold mb-2">Por obrigação</h3>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obrigação</TableHead>
                  <TableHead className="text-right w-20">Clientes</TableHead>
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
                      <TableCell className="text-right tabular-nums">{o.clientCount}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.adjustedDueDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.internalDeliveryDate), 'dd/MM/yyyy')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Scale className="h-4 w-4" /> Por regime tributário
          </h3>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : perRegime.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa será gerada.</p>
            ) : (
              perRegime.map((r) => (
                <div
                  key={r.regime ?? 'none'}
                  className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="tabular-nums">
                      {r.taskCount} tarefa(s)
                    </Badge>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.clientCount} cliente(s)</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" /> Por colaborador
          </h3>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : perCollaborator.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa será gerada.</p>
            ) : (
              perCollaborator.map((c) => (
                <div
                  key={c.id ?? 'none'}
                  className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div
                        className={
                          c.pct > 40
                            ? 'h-full bg-warn'
                            : c.pct > 25
                              ? 'h-full bg-ok'
                              : 'h-full bg-primary'
                        }
                        style={{ width: `${Math.min(100, c.pct)}%` }}
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className="tabular-nums">
                    {c.count} ({c.pct.toFixed(0)}%)
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
