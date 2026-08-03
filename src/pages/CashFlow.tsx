import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  startOfMonth,
  endOfWeek,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  isValid,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, StatCardRow } from '@/components/ds';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useBanks } from '@/hooks/useBanks';
import { useTransactions, type Transaction } from '@/hooks/useTransactions';

type Granularidade = 'semana' | 'mes';
type HorizonteKey = '30' | '90' | '180';

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  entradas: number;
  saidas: number;
  resultado: number;
  saldo: number;
}

const HORIZONS: Record<HorizonteKey, { label: string; days: number }> = {
  '30': { label: 'Próximos 30 dias', days: 30 },
  '90': { label: 'Próximos 90 dias', days: 90 },
  '180': { label: 'Próximos 6 meses', days: 180 },
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function buildBuckets(start: Date, end: Date, gran: Granularidade): Bucket[] {
  const out: Bucket[] = [];
  if (gran === 'semana') {
    let cur = startOfWeek(start, { weekStartsOn: 1 });
    while (cur <= end) {
      const s = cur;
      const e = endOfWeek(cur, { weekStartsOn: 1 });
      out.push({
        key: format(s, 'yyyy-MM-dd'),
        label: `${format(s, 'dd/MM')} – ${format(e, 'dd/MM')}`,
        start: s,
        end: e,
        entradas: 0,
        saidas: 0,
        resultado: 0,
        saldo: 0,
      });
      cur = addWeeks(cur, 1);
    }
  } else {
    let cur = startOfMonth(start);
    while (cur <= end) {
      const s = cur;
      const e = endOfMonth(cur);
      out.push({
        key: format(s, 'yyyy-MM'),
        label: format(s, "MMM/yy", { locale: ptBR }),
        start: s,
        end: e,
        entradas: 0,
        saidas: 0,
        resultado: 0,
        saldo: 0,
      });
      cur = addMonths(cur, 1);
    }
  }
  return out;
}

function pickDate(t: Transaction): Date | null {
  const raw = t.due_date ?? t.expected_date;
  if (!raw) return null;
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

export default function CashFlow() {
  const [granularidade, setGranularidade] = useState<Granularidade>('semana');
  const [horizonteKey, setHorizonteKey] = useState<HorizonteKey>('90');

  const { banks, isLoading: loadingBanks } = useBanks();
  const { transactions, isLoading: loadingTx } = useTransactions();
  const isLoading = loadingBanks || loadingTx;

  const saldoInicial = useMemo(
    () =>
      (banks ?? [])
        .filter((b) => b.is_active && !b.is_invisible)
        .reduce((sum, b) => sum + Number(b.current_balance ?? 0), 0),
    [banks],
  );

  const { buckets, entradasTotal, saidasTotal, saldoFinal } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = HORIZONS[horizonteKey];
    const endDate = addDays(today, horizon.days);

    const bs = buildBuckets(today, endDate, granularidade);

    const pendentes = (transactions ?? []).filter(
      (t) => !t.is_paid && !t.deleted_at,
    );

    for (const t of pendentes) {
      const d = pickDate(t);
      if (!d) continue;
      if (!isWithinInterval(d, { start: bs[0]?.start ?? today, end: endDate })) continue;
      const b = bs.find((x) => isWithinInterval(d, { start: x.start, end: x.end }));
      if (!b) continue;
      const val = Number(t.amount ?? 0);
      if (t.type === 'receita') b.entradas += val;
      else b.saidas += val;
    }

    let acc = saldoInicial;
    let inTot = 0;
    let outTot = 0;
    for (const b of bs) {
      b.resultado = b.entradas - b.saidas;
      acc += b.resultado;
      b.saldo = acc;
      inTot += b.entradas;
      outTot += b.saidas;
    }

    return { buckets: bs, entradasTotal: inTot, saidasTotal: outTot, saldoFinal: acc };
  }, [transactions, saldoInicial, granularidade, horizonteKey]);

  const chartData = buckets.map((b) => ({ label: b.label, saldo: Number(b.saldo.toFixed(2)) }));
  const projetadoNegativo = saldoFinal < 0;
  const menorSaldo = buckets.reduce((min, b) => (b.saldo < min.saldo ? b : min), buckets[0] ?? { saldo: saldoFinal, label: '' });
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · projeção"
        title="Fluxo de caixa."
        subtitle="Projeção semanal a partir do saldo em contas."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['transactions'] });
                queryClient.invalidateQueries({ queryKey: ['banks'] });
              }}
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Select value={granularidade} onValueChange={(v) => setGranularidade(v as Granularidade)}>
              <SelectTrigger className="h-9 w-[130px] border-line bg-paper text-ui"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Semanal</SelectItem>
                <SelectItem value="mes">Mensal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={horizonteKey} onValueChange={(v) => setHorizonteKey(v as HorizonteKey)}>
              <SelectTrigger className="h-9 w-[170px] border-line bg-paper text-ui"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(HORIZONS) as HorizonteKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{HORIZONS[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <StatCardRow
        items={[
          { label: 'Saldo atual', value: brl(saldoInicial), hint: 'bancos visíveis' },
          { label: 'Entradas previstas', value: brl(entradasTotal), hint: HORIZONS[horizonteKey].label.toLowerCase() },
          { label: 'Saídas previstas', value: brl(saidasTotal), hint: HORIZONS[horizonteKey].label.toLowerCase() },
          {
            label: projetadoNegativo ? 'Menor saldo projetado' : 'Saldo projetado (fim)',
            value: brl(projetadoNegativo ? menorSaldo.saldo : saldoFinal),
            hint: projetadoNegativo ? `semana de ${menorSaldo.label}` : HORIZONS[horizonteKey].label.toLowerCase(),
            emphasis: projetadoNegativo ? 'warm' : 'none',
          },
        ]}
      />

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo projetado</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : buckets.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)
                    }
                  />
                  <ReTooltip
                    formatter={(v: number) => brl(v)}
                    labelClassName="text-foreground"
                  />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes por período</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : buckets.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="text-right">Saldo projetado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="font-medium">{b.label}</TableCell>
                    <TableCell className="text-right text-ok">
                      {b.entradas ? brl(b.entradas) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {b.saidas ? brl(b.saidas) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium',
                        b.resultado < 0 ? 'text-destructive' : b.resultado > 0 ? 'text-ok' : '',
                      )}
                    >
                      {brl(b.resultado)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold',
                        b.saldo < 0 ? 'text-destructive' : '',
                      )}
                    >
                      {brl(b.saldo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-12 text-center text-sm text-muted-foreground">
      Nenhum movimento previsto no horizonte selecionado.
    </div>
  );
}
