import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Info, Plus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

const RT_TAG = '[RT]';

export function isRtRow(r: FiscalCalendarEffectiveRow): boolean {
  const desc = r.fiscal_obligations_catalog?.description ?? '';
  const code = r.fiscal_obligations_catalog?.code ?? '';
  return desc.includes(RT_TAG) || code.startsWith('RT-');
}

interface Props {
  rows: FiscalCalendarEffectiveRow[];
  onNewRtObligation: () => void;
  disabled?: boolean;
}

export function IbsCbsSection({ rows, onNewRtObligation, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rtRows = useMemo(() => rows.filter(isRtRow), [rows]);

  return (
    <Card className="overflow-hidden border-purple-500/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-500/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <h3 className="text-sm font-semibold">Reforma Tributária — IBS/CBS</h3>
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40">
            Em preparação
          </Badge>
          <span className="text-xs text-muted-foreground">
            {rtRows.length} obrigação(ões)
          </span>
        </div>
      </button>

      {open && (
        <div className="p-4 border-t space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-purple-500/30 bg-purple-500/5 p-3 text-sm">
            <Info className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
            <p className="text-foreground">
              Obrigações da Reforma Tributária com datas provisórias baseadas na legislação vigente. Sujeitas a alteração
              conforme regulamentação.
            </p>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onNewRtObligation} disabled={disabled}>
              <Plus className="h-4 w-4" /> Nova obrigação RT
            </Button>
          </div>

          {rtRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma obrigação RT cadastrada para este mês.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Obrigação</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead className="w-32">Vencimento</TableHead>
                    <TableHead className="w-32">Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/40 text-[10px] px-1.5 py-0">
                            <Sparkles className="h-3 w-3 mr-1" />
                            RT
                          </Badge>
                          {r.fiscal_obligations_catalog?.name ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.fiscal_obligations_catalog?.applies_to ?? []).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{format(parseISO(r.adjusted_due_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(r.internal_delivery_date), 'dd/MM/yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
