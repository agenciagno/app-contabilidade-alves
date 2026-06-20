import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, differenceInDays } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import { useUserRole } from '@/hooks/useUserRole';
import {
  useFiscalTasksOfMonth,
  useFiscalTasksPrevMonth,
  useFiscalCollaborators,
  useUpcomingFiscalTasks,
  useFiscalTasks48h,
  FiscalTaskRow,
} from '@/hooks/useFiscalDashboard';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const YEARS = [2025, 2026, 2027];

const COLOR_OK = 'hsl(142 71% 45%)';
const COLOR_LATE = 'hsl(0 84% 60%)';

const REGIMES = [
  { value: 'todos', label: 'Todos' },
  { value: 'Simples Nacional', label: 'Simples Nacional' },
  { value: 'Lucro Presumido', label: 'Lucro Presumido' },
  { value: 'Lucro Real', label: 'Lucro Real' },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isLateTask = (t: { status: string; due_date: string | null }, today: string) =>
  t.status !== 'concluido' && !!t.due_date && t.due_date < today;

// "no prazo" = concluida com completed_at <= fiscal_due_date (data)
const isOnTime = (t: FiscalTaskRow) => {
  if (t.status !== 'concluido' || !t.completed_at || !t.fiscal_due_date) return false;
  const completedDate = t.completed_at.slice(0, 10);
  return completedDate <= t.fiscal_due_date;
};

const computeComplianceRate = (tasks: FiscalTaskRow[]): { rate: number; total: number } => {
  const concluidas = tasks.filter((t) => t.status === 'concluido');
  if (concluidas.length === 0) return { rate: 0, total: 0 };
  const noPrazo = concluidas.filter(isOnTime).length;
  return { rate: Math.round((noPrazo / concluidas.length) * 100), total: concluidas.length };
};

const complianceColor = (pct: number) => {
  if (pct >= 90) return { border: 'border-l-green-500', text: 'text-green-600 dark:text-green-400', icon: 'text-green-500' };
  if (pct >= 70) return { border: 'border-l-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', icon: 'text-yellow-500' };
  return { border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', icon: 'text-red-500' };
};

function KpiCard({
  label,
  value,
  total,
  icon: Icon,
  borderClass,
  iconClass,
}: {
  label: string;
  value: number;
  total: number;
  icon: typeof ListChecks;
  borderClass: string;
  iconClass: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card className={cn('border-l-4', borderClass)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{pct}% do total</p>
          </div>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
      </CardContent>
    </Card>
  );
}

function RateKpiCard({
  label,
  rate,
  subtitle,
  icon: Icon,
}: {
  label: string;
  rate: number;
  subtitle: string;
  icon: typeof TrendingUp;
}) {
  const c = complianceColor(rate);
  return (
    <Card className={cn('border-l-4', c.border)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn('text-3xl font-semibold mt-1', c.text)}>{rate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <Icon className={cn('h-5 w-5', c.icon)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonKpiCard({
  current,
  previous,
  hasPrevious,
}: { current: number; previous: number; hasPrevious: boolean }) {
  const diff = current - previous;
  const isUp = diff > 0;
  const isDown = diff < 0;
  const colorClass = isUp ? 'text-green-600 dark:text-green-400' : isDown ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const borderClass = isUp ? 'border-l-green-500' : isDown ? 'border-l-red-500' : 'border-l-muted';
  const sign = diff > 0 ? '+' : '';

  return (
    <Card className={cn('border-l-4', borderClass)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Comparativo Mês Anterior</p>
            <div className="flex items-center gap-2 mt-1">
              {hasPrevious && isUp && <ArrowUp className="h-6 w-6 text-green-500" />}
              {hasPrevious && isDown && <ArrowDown className="h-6 w-6 text-red-500" />}
              <p className={cn('text-3xl font-semibold', colorClass)}>
                {hasPrevious ? `${sign}${diff}%` : '—'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasPrevious ? `vs ${previous}% do mês anterior` : 'sem dados do mês anterior'}
            </p>
          </div>
          <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, isLate }: { status: string; isLate: boolean }) {
  if (isLate) {
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 hover:bg-red-500/20">Atrasado</Badge>;
  }
  if (status === 'em_progresso') return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20">Em andamento</Badge>;
  if (status === 'aguardando_cliente') return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">Aguardando</Badge>;
  if (status === 'a_fazer') return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20">A Fazer</Badge>;
  if (status === 'concluido') return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Concluído</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

type RiskBand = 'critico' | 'atencao' | 'regular';

interface RiskClient {
  contact_id: string;
  name: string;
  atrasadas: number;
  oldestObligation: string | null;
  oldestDueDate: string | null;
  daysLate: number;
}

function RiskRadarCard({
  tasks,
  today,
  onClientClick,
  onSeeAll,
}: {
  tasks: FiscalTaskRow[];
  today: string;
  onClientClick: (contactId: string) => void;
  onSeeAll: () => void;
}) {
  const [openBand, setOpenBand] = useState<RiskBand | null>(null);

  const { critico, atencao, regular } = useMemo(() => {
    const byContact = new Map<string, { name: string; atrasadasList: FiscalTaskRow[]; hasAny: boolean }>();
    tasks.forEach((t) => {
      if (!t.contact_id) return;
      const name = t.contacts?.name ?? '—';
      const entry = byContact.get(t.contact_id) ?? { name, atrasadasList: [], hasAny: false };
      entry.hasAny = true;
      if (isLateTask(t, today)) entry.atrasadasList.push(t);
      byContact.set(t.contact_id, entry);
    });

    const buildRow = (contact_id: string, name: string, lates: FiscalTaskRow[]): RiskClient => {
      const sorted = [...lates].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
      const oldest = sorted[0];
      const daysLate = oldest?.due_date ? differenceInDays(parseISO(today), parseISO(oldest.due_date)) : 0;
      return {
        contact_id,
        name,
        atrasadas: lates.length,
        oldestObligation: oldest?.fiscal_obligations_catalog?.name ?? oldest?.title ?? null,
        oldestDueDate: oldest?.due_date ?? null,
        daysLate,
      };
    };

    const critico: RiskClient[] = [];
    const atencao: RiskClient[] = [];
    const regular: RiskClient[] = [];
    byContact.forEach((v, k) => {
      const row = buildRow(k, v.name, v.atrasadasList);
      if (row.atrasadas >= 3) critico.push(row);
      else if (row.atrasadas >= 1) atencao.push(row);
      else regular.push(row);
    });

    critico.sort((a, b) => b.atrasadas - a.atrasadas || b.daysLate - a.daysLate);
    atencao.sort((a, b) => b.atrasadas - a.atrasadas || b.daysLate - a.daysLate);
    regular.sort((a, b) => a.name.localeCompare(b.name));
    return { critico, atencao, regular };
  }, [tasks, today]);

  const bands: Array<{
    key: RiskBand;
    icon: string;
    label: string;
    list: RiskClient[];
    color: string;
    bg: string;
  }> = [
    { key: 'critico', icon: '🔴', label: 'Crítico', list: critico, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 hover:bg-red-500/15 border-red-500/30' },
    { key: 'atencao', icon: '🟡', label: 'Atenção', list: atencao, color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-500/10 hover:bg-yellow-500/15 border-yellow-500/30' },
    { key: 'regular', icon: '🟢', label: 'Regular', list: regular, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10 hover:bg-green-500/15 border-green-500/30' },
  ];

  const active = bands.find((b) => b.key === openBand);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-orange-500" />
          Radar de Risco
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {bands.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setOpenBand(openBand === b.key ? null : b.key)}
              className={cn(
                'flex items-center justify-between rounded-md border px-4 py-3 transition-colors text-left',
                b.bg,
                openBand === b.key && 'ring-2 ring-offset-1 ring-offset-background ring-current'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{b.icon}</span>
                <span className={cn('text-sm font-medium', b.color)}>{b.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-2xl font-semibold', b.color)}>{b.list.length}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openBand === b.key && 'rotate-180'
                  )}
                />
              </div>
            </button>
          ))}
        </div>

        <Collapsible open={!!active}>
          <CollapsibleContent>
            {active && (
              <div className="mt-2 rounded-md border bg-muted/30">
                {active.list.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Nenhum cliente nesta faixa.
                  </div>
                ) : (
                  <>
                    <div className="divide-y">
                      {active.list.slice(0, 10).map((c) => (
                        <button
                          key={c.contact_id}
                          type="button"
                          onClick={() => onClientClick(c.contact_id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/60 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{c.name}</p>
                            {active.key !== 'regular' && c.oldestObligation && (
                              <p className="text-xs text-muted-foreground truncate">
                                Mais antiga: {c.oldestObligation}
                                {c.oldestDueDate && ` — ${format(parseISO(c.oldestDueDate), 'dd/MM/yyyy')}`}
                              </p>
                            )}
                          </div>
                          {active.key !== 'regular' ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
                                {c.atrasadas} atrasada{c.atrasadas > 1 ? 's' : ''}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {c.daysLate}d
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs shrink-0">Em dia</Badge>
                          )}
                        </button>
                      ))}
                    </div>
                    {active.list.length > 10 && (
                      <div className="p-2 border-t flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onSeeAll}>
                          Ver todos ({active.list.length})
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default function FiscalDashboard() {
  const { isAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [regime, setRegime] = useState<string>('todos');

  const tasksQ = useFiscalTasksOfMonth(year, month);
  const prevTasksQ = useFiscalTasksPrevMonth(year, month);
  const collabsQ = useFiscalCollaborators();
  const upcomingQ = useUpcomingFiscalTasks();
  const tasks48hQ = useFiscalTasks48h();

  const today = todayIso();

  // Helper: filter tasks by regime
  const filterByRegime = <T extends { contacts?: { tax_regime?: string | null } | null }>(arr: T[]): T[] => {
    if (regime === 'todos') return arr;
    return arr.filter((t) => (t.contacts?.tax_regime ?? '') === regime);
  };

  const tasks = useMemo(() => filterByRegime(tasksQ.data ?? []), [tasksQ.data, regime]);
  const prevTasks = useMemo(() => filterByRegime(prevTasksQ.data ?? []), [prevTasksQ.data, regime]);
  const tasks48h = useMemo(() => filterByRegime(tasks48hQ.data ?? []), [tasks48hQ.data, regime]);
  const upcoming = useMemo(() => (upcomingQ.data ?? []), [upcomingQ.data]);

  const kpis = useMemo(() => {
    const total = tasks.length;
    const concluidas = tasks.filter((t) => t.status === 'concluido').length;
    const atrasadas = tasks.filter((t) => isLateTask(t, today)).length;
    const pendentes = tasks.filter((t) => t.status === 'a_fazer' && (!t.due_date || t.due_date >= today)).length;
    const emAndamento = tasks.filter((t) => t.status === 'em_progresso').length;
    return { total, concluidas, pendentes, atrasadas, emAndamento };
  }, [tasks, today]);

  const compliance = useMemo(() => computeComplianceRate(tasks), [tasks]);
  const prevCompliance = useMemo(() => computeComplianceRate(prevTasks), [prevTasks]);

  const semResponsavel = useMemo(
    () => tasks.filter((t) => !t.responsible_id && t.status !== 'concluido').length,
    [tasks]
  );

  const chartData = useMemo(() => {
    const collabs = collabsQ.data ?? [];
    const map = new Map<string, { name: string; concluidas: number; pendentes: number; emAndamento: number; atrasadas: number }>();
    collabs.forEach((c) => map.set(c.id, { name: c.full_name ?? '—', concluidas: 0, pendentes: 0, emAndamento: 0, atrasadas: 0 }));
    map.set('__none__', { name: 'Sem responsável', concluidas: 0, pendentes: 0, emAndamento: 0, atrasadas: 0 });

    tasks.forEach((t) => {
      const key = t.responsible_id ?? '__none__';
      const entry = map.get(key);
      if (!entry) return;
      if (isLateTask(t, today)) entry.atrasadas += 1;
      else if (t.status === 'concluido') entry.concluidas += 1;
      else if (t.status === 'em_progresso') entry.emAndamento += 1;
      else if (t.status === 'a_fazer') entry.pendentes += 1;
    });

    return Array.from(map.values()).filter(
      (e) => e.concluidas + e.pendentes + e.emAndamento + e.atrasadas > 0 || e.name !== 'Sem responsável'
    );
  }, [tasks, collabsQ.data, today]);

  const progressList = useMemo(() => {
    const collabs = collabsQ.data ?? [];
    return collabs.map((c) => {
      const own = tasks.filter((t) => t.responsible_id === c.id);
      const total = own.length;
      const concluidas = own.filter((t) => t.status === 'concluido');
      const concluidasCount = concluidas.length;
      const atrasadas = own.filter((t) => isLateTask(t, today)).length;
      const pct = total > 0 ? Math.round((concluidasCount / total) * 100) : 0;

      const noPrazoCount = concluidas.filter(isOnTime).length;
      const noPrazoPct = concluidasCount > 0 ? Math.round((noPrazoCount / concluidasCount) * 100) : null;

      const days = concluidas
        .filter((t) => t.completed_at && t.created_at)
        .map((t) => differenceInDays(parseISO(t.completed_at!), parseISO(t.created_at!)));
      const mediaDias = days.length > 0
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
        : null;

      return { id: c.id, name: c.full_name ?? '—', total, concluidas: concluidasCount, atrasadas, pct, noPrazoPct, mediaDias };
    });
  }, [tasks, collabsQ.data, today]);

  if (roleLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/fiscal/tarefas" replace />;

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ['fiscal-dashboard'] });
  const handleExport = () => window.print();

  const fmt = (s: string | null) => (s ? format(parseISO(s), 'dd/MM/yyyy') : '—');
  const fmtTime = (s: string | null) => {
    if (!s) return '—';
    // fiscal_due_date is `date`, sem hora; mostra como dd/MM
    return format(parseISO(s), 'dd/MM');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-semibold">Dashboard Fiscal</h1>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" /> Exportar PDF
            </Button>
          </div>
        </div>

        {/* Regime filter */}
        <div className="no-print">
          <ToggleGroup
            type="single"
            value={regime}
            onValueChange={(v) => v && setRegime(v)}
            className="justify-start flex-wrap"
          >
            {REGIMES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Sem responsável banner */}
      {semResponsavel > 0 && (
        <Alert className="bg-yellow-500/10 border-yellow-500/40">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between gap-3 w-full">
            <span className="font-medium">
              {semResponsavel} {semResponsavel === 1 ? 'tarefa' : 'tarefas'} sem responsável atribuído
            </span>
            <Button
              size="sm"
              variant="outline"
              className="no-print"
              onClick={() => navigate('/fiscal/tarefas?responsavel=none')}
            >
              Ver tarefas
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pendentes" value={kpis.pendentes} total={kpis.total} icon={Clock} borderClass="border-l-blue-500" iconClass="text-blue-500" />
        <KpiCard label="Em andamento" value={kpis.emAndamento} total={kpis.total} icon={ListChecks} borderClass="border-l-orange-500" iconClass="text-orange-500" />
        <KpiCard label="Atrasadas" value={kpis.atrasadas} total={kpis.total} icon={AlertTriangle} borderClass="border-l-red-500" iconClass="text-red-500" />
        <KpiCard label="Concluídas" value={kpis.concluidas} total={kpis.total} icon={CheckCircle2} borderClass="border-l-green-500" iconClass="text-green-500" />
      </div>

      {/* KPIs row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RateKpiCard
          label="Taxa de Cumprimento"
          rate={compliance.rate}
          subtitle={compliance.total > 0 ? `${compliance.total} concluída(s) avaliada(s)` : 'sem tarefas concluídas'}
          icon={TrendingUp}
        />
        <ComparisonKpiCard
          current={compliance.rate}
          previous={prevCompliance.rate}
          hasPrevious={prevCompliance.total > 0}
        />
      </div>

      {/* 48h widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Vencendo nas Próximas 48h
            <Badge variant="secondary">{tasks48h.length}</Badge>
          </CardTitle>
          {tasks48h.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="no-print"
              onClick={() => navigate('/fiscal/tarefas?filter=48h')}
            >
              Ver todas
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {tasks48hQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : tasks48h.length === 0 ? (
            <div className="flex items-center gap-3 py-6 text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span>Nenhuma obrigação vencendo nas próximas 48 horas</span>
            </div>
          ) : (
            <div className="divide-y">
              {tasks48h.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.contacts?.name ?? '—'}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {t.fiscal_obligations_catalog?.name ?? t.title ?? '—'}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-nowrap">{fmtTime(t.fiscal_due_date)}</div>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {(t.responsible?.full_name ?? '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <StatusBadge status={t.status} isLate={false} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tarefas por Colaborador</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="concluidas" name="Concluídas" stackId="a" fill={COLOR_OK} />
                <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill="hsl(217 91% 60%)" />
                <Bar dataKey="emAndamento" name="Em andamento" stackId="a" fill="hsl(25 95% 53%)" />
                <Bar dataKey="atrasadas" name="Atrasadas" stackId="a" fill={COLOR_LATE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Progress per collaborator */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Progresso por Colaborador</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {collabsQ.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))
          ) : progressList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum colaborador ativo.</p>
          ) : (
            progressList.map((c) => {
              const borderColor = c.noPrazoPct === null
                ? ''
                : c.noPrazoPct >= 90 ? 'border-l-4 border-l-green-500'
                : c.noPrazoPct >= 70 ? 'border-l-4 border-l-yellow-500'
                : 'border-l-4 border-l-red-500';
              return (
                <Card key={c.id} className={cn(borderColor)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {(c.name || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{c.name}</span>
                      </div>
                      {c.atrasadas > 0 && <Badge variant="destructive">{c.atrasadas} atrasada(s)</Badge>}
                    </div>
                    <Progress value={c.pct} />
                    <p className="text-xs text-muted-foreground">
                      {c.concluidas} de {c.total} tarefas — {c.pct}%
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">No prazo</p>
                        <p className="text-sm font-medium">{c.noPrazoPct !== null ? `${c.noPrazoPct}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Média dias</p>
                        <p className="text-sm font-medium">{c.mediaDias !== null ? `${c.mediaDias}` : '—'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Pendências por Cliente */}
      <ClientPendenciesSection tasks={tasks} today={today} onClientClick={(id) => navigate(`/fiscal/tarefas?contact=${id}`)} />

      {/* Upcoming */}
      <Card>
        <CardHeader><CardTitle className="text-base">Próximos Vencimentos (7 dias)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Obrigação</TableHead>
                <TableHead>Entrega Interna</TableHead>
                <TableHead>Vencimento Fiscal</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingQ.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : upcoming.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Nenhum vencimento nos próximos 7 dias
                  </TableCell>
                </TableRow>
              ) : (
                upcoming.map((r) => {
                  const late = isLateTask({ status: r.status, due_date: r.due_date }, today);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.contacts?.name ?? '—'}</TableCell>
                      <TableCell>{r.fiscal_obligations_catalog?.name ?? r.title ?? '—'}</TableCell>
                      <TableCell>{fmt(r.due_date)}</TableCell>
                      <TableCell>{fmt(r.fiscal_due_date)}</TableCell>
                      <TableCell>{r.responsible?.full_name ?? '—'}</TableCell>
                      <TableCell><StatusBadge status={r.status} isLate={late} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Pendências por Cliente ----
type ClientRow = {
  contactId: string;
  name: string;
  taxRegime: string | null;
  pendentes: number;
  emAndamento: number;
  aguardando: number;
  atrasadas: number;
  concluidas: number;
  total: number;
  compliance: number;
};

type SortKey = 'name' | 'regime' | 'pendentes' | 'emAndamento' | 'aguardando' | 'atrasadas' | 'concluidas' | 'compliance';

const REGIME_SHORT: Record<string, string> = {
  'Simples Nacional': 'SN',
  'Lucro Presumido': 'LP',
  'Lucro Real': 'LR',
  'MEI': 'MEI',
};

function regimeShortLabel(regime: string | null | undefined) {
  if (!regime) return '—';
  return REGIME_SHORT[regime] ?? regime;
}

function ClientPendenciesSection({
  tasks,
  today,
  onClientClick,
}: {
  tasks: FiscalTaskRow[];
  today: string;
  onClientClick: (contactId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('atrasadas');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo<ClientRow[]>(() => {
    const map = new Map<string, ClientRow>();
    for (const t of tasks as any[]) {
      const cid: string | null = t.contact_id ?? null;
      if (!cid) continue;
      let row = map.get(cid);
      if (!row) {
        row = {
          contactId: cid,
          name: t.contacts?.name ?? '—',
          taxRegime: t.contacts?.tax_regime ?? null,
          pendentes: 0,
          emAndamento: 0,
          aguardando: 0,
          atrasadas: 0,
          concluidas: 0,
          total: 0,
          compliance: 0,
        };
        map.set(cid, row);
      }
      row.total += 1;
      if (t.status === 'a_fazer') row.pendentes += 1;
      else if (t.status === 'em_progresso') row.emAndamento += 1;
      else if (t.status === 'aguardando_cliente') row.aguardando += 1;
      else if (t.status === 'concluido') row.concluidas += 1;
      if (t.status !== 'concluido' && t.due_date && t.due_date < today) row.atrasadas += 1;
    }
    for (const row of map.values()) {
      row.compliance = row.total > 0 ? Math.round((row.concluidas / row.total) * 100) : 0;
    }
    return Array.from(map.values());
  }, [tasks, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'regime') return (a.taxRegime ?? '').localeCompare(b.taxRegime ?? '') * dir;
      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;
      if (av === bv) return a.name.localeCompare(b.name);
      return (av - bv) * dir;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'regime' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const SortBtn = ({ k, label, align }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={cn(
        'inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors',
        align === 'right' ? 'justify-end w-full' : '',
      )}
    >
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-foreground' : 'text-muted-foreground/50')} />
    </button>
  );

  const trafficLight = (atrasadas: number) => {
    if (atrasadas >= 3) return 'bg-red-500';
    if (atrasadas >= 1) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">Pendências por Cliente</CardTitle>
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar cliente..."
          className="h-9 w-full sm:w-[260px]"
        />
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortBtn k="name" label="Cliente" /></TableHead>
              <TableHead><SortBtn k="regime" label="Regime" /></TableHead>
              <TableHead className="text-right"><SortBtn k="pendentes" label="Pendentes" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="emAndamento" label="Em Andamento" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="aguardando" label="Aguardando" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="atrasadas" label="Atrasadas" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="concluidas" label="Concluídas" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="compliance" label="% Compliance" align="right" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.contactId}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      onClick={() => onClientClick(r.contactId)}
                      className="inline-flex items-center gap-2 text-left hover:underline"
                    >
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', trafficLight(r.atrasadas))} />
                      <span className="truncate">{r.name}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{regimeShortLabel(r.taxRegime)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.pendentes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.emAndamento}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.aguardando}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.atrasadas > 0 ? (
                      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">{r.atrasadas}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.concluidas}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn(
                      'font-medium',
                      r.compliance >= 90 ? 'text-green-600 dark:text-green-400'
                        : r.compliance >= 70 ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400',
                    )}>
                      {r.compliance}%
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filtered.length > PER_PAGE && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">
              Mostrando {(currentPage - 1) * PER_PAGE + 1}–{Math.min(currentPage * PER_PAGE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
