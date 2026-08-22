import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDREData, DRESectionRow, DRECalculatedRow, DRERowResult } from '@/hooks/useDREData';
import { DREReportModal } from '@/components/reports/DREReportModal';
import { DREConciliationModal } from '@/components/reports/DREConciliationModal';
import { PageHeader, StatCardRow } from '@/components/ds';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPerc(value: number) {
  return `${value.toFixed(1)}%`;
}

function valueColor(value: number) {
  if (value > 0) return 'text-ok';
  if (value < 0) return 'text-danger';
  return 'text-muted-foreground';
}

function SectionRow({ row }: { row: DRESectionRow }) {
  return (
    <>
      <TableRow className="hover:bg-ok/10 bg-ok/5 font-semibold dre-section-row">
        <TableCell className="pl-4">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--dre-section-color)' }}>{row.macroName}</span>
            {!row.macroId && (
              <span className="text-[10px] px-1.5 py-0.5 bg-warn-soft text-warn rounded dark:bg-warn/30 dark:text-warn">
                Não cadastrado
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">{formatCurrency(row.previsto)}</TableCell>
        <TableCell className="text-right">{formatCurrency(row.realizado)}</TableCell>
        <TableCell className={cn('text-right', valueColor(row.rxp))}>{formatCurrency(row.rxp)}</TableCell>
        <TableCell className="text-right text-muted-foreground">{formatPerc(row.percPrevisto)}</TableCell>
        <TableCell className="text-right text-muted-foreground">{formatPerc(row.percRealizado)}</TableCell>
      </TableRow>

      {row.children.filter(child => child.previsto !== 0 || child.realizado !== 0).map(child => (
        <TableRow key={child.id} className="hover:bg-muted/20">
          <TableCell className="pl-12">
            <span className="text-muted-foreground">↳</span> {child.name}
          </TableCell>
          <TableCell className="text-right">{formatCurrency(child.previsto)}</TableCell>
          <TableCell className="text-right">{formatCurrency(child.realizado)}</TableCell>
          <TableCell className={cn('text-right', valueColor(child.rxp))}>{formatCurrency(child.rxp)}</TableCell>
          <TableCell className="text-right text-muted-foreground">{formatPerc(child.percPrevisto)}</TableCell>
          <TableCell className="text-right text-muted-foreground">{formatPerc(child.percRealizado)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

function CalculatedRow({ row }: { row: DRECalculatedRow }) {
  const isLucro = row.key.startsWith('lucro');
  const isFinal = row.key === 'lucro_liquido' || row.key === 'fluxo_caixa';

  return (
    <TableRow className={cn(
      'font-bold',
      isFinal
        ? 'bg-primary text-primary-foreground hover:bg-primary'
        : 'bg-muted/50 dark:bg-muted/30',
    )}>
      <TableCell className="pl-4">
        <span className={cn(
          isFinal ? 'text-primary-foreground' : 'text-foreground',
          'uppercase text-sm tracking-wide'
        )}>
          {row.label}
        </span>
      </TableCell>
      <TableCell className={cn('text-right', isFinal && 'text-primary-foreground')}>{formatCurrency(row.previsto)}</TableCell>
      <TableCell className={cn('text-right', isFinal && 'text-primary-foreground')}>{formatCurrency(row.realizado)}</TableCell>
      <TableCell className={cn('text-right', isFinal ? 'text-primary-foreground' : valueColor(row.rxp))}>{formatCurrency(row.rxp)}</TableCell>
      <TableCell className={cn('text-right', isFinal && 'text-primary-foreground')}>{formatPerc(row.percPrevisto)}</TableCell>
      <TableCell className={cn('text-right', isFinal && 'text-primary-foreground')}>{formatPerc(row.percRealizado)}</TableCell>
    </TableRow>
  );
}

export default function DRE() {
  const now = new Date();
  const [startDate, setStartDate] = useState(() => format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(now), 'yyyy-MM-dd'));
  const [reportOpen, setReportOpen] = useState(false);
  const [conciliationOpen, setConciliationOpen] = useState(false);
  const { dreRows, summary } = useDREData(startDate, endDate);

  const handleClear = () => {
    const today = new Date();
    setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
  };

  // Dynamic month/year label
  const parsedStart = new Date(startDate + 'T12:00:00');
  const monthLabel = !isNaN(parsedStart.getTime())
    ? format(parsedStart, "MMMM'-'yy", { locale: ptBR })
    : '';

  const margemPct = summary.receitaLiquida.realizado
    ? (summary.lucroPrejuizoLiquido.realizado / summary.receitaLiquida.realizado) * 100
    : 0;
  const pctDoPrevisto = summary.receitaLiquida.previsto
    ? (summary.receitaLiquida.realizado / summary.receitaLiquida.previsto) * 100
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · demonstrativo"
        title="DRE."
        subtitle={<>Demonstrativo de resultado · <span className="capitalize">{monthLabel}</span>.</>}
        actions={
          <>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-[150px] border-line bg-paper text-ui [&::-webkit-calendar-picker-indicator]:hidden" />
              <span className="text-meta text-muted-ink">até</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-[150px] border-line bg-paper text-ui [&::-webkit-calendar-picker-indicator]:hidden" />
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleClear} title="Limpar filtro">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={() => setConciliationOpen(true)}>
              Conciliação
            </Button>
            <Button onClick={() => setReportOpen(true)}>
              Gerar relatório
            </Button>
          </>
        }
      />

      <StatCardRow
        items={[
          { label: 'Receita bruta', value: formatCurrency(summary.receitaLiquida.previsto), hint: 'previsto no mês' },
          { label: 'Receita realizada', value: formatCurrency(summary.receitaLiquida.realizado), hint: `${pctDoPrevisto.toFixed(0)}% do previsto` },
          { label: 'Despesas', value: formatCurrency(summary.despesasOperacionais.realizado + summary.custoPessoal.realizado), hint: 'custo operacional' },
          { label: 'Resultado', value: formatCurrency(summary.lucroPrejuizoLiquido.realizado), hint: `margem de ${margemPct.toFixed(0)}%`, emphasis: 'warm' },
        ]}
      />

      {/* DRE Table */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">Evento Contábil</TableHead>
                <TableHead className="text-right w-[14%]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted underline-offset-4">Previsto (R$)</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Inclui transações pagas cuja data prevista está no período. Use "Conciliação" para detalhar.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right w-[14%]">Realizado (R$)</TableHead>
                <TableHead className="text-right w-[14%]">RXP (R$)</TableHead>
                <TableHead className="text-right w-[12%]">% Prev.</TableHead>
                <TableHead className="text-right w-[12%]">% Real.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dreRows.map((row, idx) => {
                if (row.type === 'section') {
                  // Hide sections where both previsto and realizado are zero
                  
                  return (
                    <SectionRow
                      key={row.macroName + idx}
                      row={row}
                    />
                  );
                }
                return <CalculatedRow key={row.key} row={row} />;
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DREReportModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        startDate={startDate}
        endDate={endDate}
      />

      <DREConciliationModal
        open={conciliationOpen}
        onOpenChange={setConciliationOpen}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
