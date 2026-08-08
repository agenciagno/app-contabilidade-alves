import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn, maskCPFCNPJ } from '@/lib/utils';

import { useUserRole } from '@/hooks/useUserRole';
import {
  useFiscalTasksOfMonth,
  useFiscalCollaborators,
  useCompleteFiscalTasks,
  FiscalTaskRow,
} from '@/hooks/useFiscalDashboard';
import { StatCardRow, DsBadge, SearchField, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { TAX_REGIMES } from '@/constants/taxRegimes';
import { OBLIGATION_DEPARTMENTS } from '@/constants/obligationDepartments';


const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const YEARS = [2025, 2026, 2027];

// Bug antigo: comparava contra 'Simples Nacional' (Title Case) enquanto
// contacts.tax_regime guarda 'simples_nacional' (snake_case) — nunca batia,
// zerava a lista toda vez que uma aba de regime era clicada.
const REGIMES = [
  { value: 'todos', label: 'Todos' },
  ...TAX_REGIMES.filter((r) => ['simples_nacional', 'lucro_presumido', 'lucro_real'].includes(r.value)),
];

const DEPARTMENTS = [
  { value: 'todos', label: 'Todos' },
  ...OBLIGATION_DEPARTMENTS.map((d) => ({ value: d.value, label: d.short })),
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isLateTask = (t: { status: string; due_date: string | null }, today: string) =>
  t.status !== 'concluido' && !!t.due_date && t.due_date < today;

function KpiCard({
  label,
  value,
  icon: Icon,
  borderClass,
  iconClass,
}: {
  label: string;
  value: number;
  icon: typeof ArrowUpDown;
  borderClass: string;
  iconClass: string;
}) {
  return (
    <Card className={cn('border-l-4', borderClass)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.05em] font-medium truncate">{label}</p>
            <p className="text-[1.75rem] font-bold tracking-tight mt-1 leading-none">{value}</p>
          </div>
          <Icon className={cn('h-4 w-4 shrink-0', iconClass)} />
        </div>
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
  const [department, setDepartment] = useState<string>('todos');

  const tasksQ = useFiscalTasksOfMonth(year, month);
  const collabsQ = useFiscalCollaborators();
  const completeTasks = useCompleteFiscalTasks();

  const today = todayIso();

  const filterByRegime = <T extends { contacts?: { tax_regime?: string | null } | null }>(arr: T[]): T[] => {
    if (regime === 'todos') return arr;
    return arr.filter((t) => (t.contacts?.tax_regime ?? '') === regime);
  };
  const filterByDepartment = <T extends { department?: string | null }>(arr: T[]): T[] => {
    if (department === 'todos') return arr;
    return arr.filter((t) => t.department === department);
  };

  const tasks = useMemo(
    () => filterByDepartment(filterByRegime(tasksQ.data ?? [])),
    [tasksQ.data, regime, department],
  );

  const kpis = useMemo(() => {
    const concluidas = tasks.filter((t) => t.status === 'concluido').length;
    const atrasadas = tasks.filter((t) => isLateTask(t, today)).length;
    const pendentes = tasks.filter((t) => t.status === 'a_fazer' && (!t.due_date || t.due_date >= today)).length;
    const emAndamento = tasks.filter((t) => t.status === 'em_progresso').length;
    return { concluidas, pendentes, atrasadas, emAndamento };
  }, [tasks, today]);

  const semResponsavel = useMemo(
    () => tasks.filter((t) => !t.responsible_id && t.status !== 'concluido').length,
    [tasks]
  );

  if (roleLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/fiscal/tarefas" replace />;

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ['fiscal-dashboard'] });

  const goToKanbanByContact = (contactId: string) =>
    navigate(`/fiscal/tarefas?view=kanban&contact_id=${contactId}`);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-kicker uppercase text-muted-ink-2">
              ~/tarefas · {MONTHS[month - 1]?.toLowerCase()} {year}
            </p>
            <h1 className="text-display text-ink">Dashboard fiscal.</h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto flex-nowrap no-print">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[85px] text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-8 w-[120px] text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Regime */}
        <div className="no-print">
          <Tabs value={regime} onValueChange={setRegime}>
            <TabsList className={cn(tabsListClass, 'overflow-x-auto flex-nowrap')}>
              {REGIMES.map((r) => (
                <TabsTrigger key={r.value} value={r.value} className={tabsTriggerClass}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Sem responsável banner */}
      {semResponsavel > 0 && (
        <Alert className="bg-warn/10 border-warn/40">
          <AlertTriangle className="h-4 w-4 text-warn" />
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

      {/* Indicadores numerados (decisão 06): atraso primeiro, e só ele destacado */}
      <StatCardRow
        items={[
          {
            label: 'Atrasadas',
            value: kpis.atrasadas,
            hint: 'acumulado de meses anteriores',
            emphasis: kpis.atrasadas > 0 ? 'warm' : 'none',
          },
          { label: 'Pendentes', value: kpis.pendentes, hint: 'dentro do prazo' },
          { label: 'Em andamento', value: kpis.emAndamento, hint: 'com responsável ativo' },
          {
            label: 'Concluídas',
            value: kpis.concluidas,
            hint: tasks.length > 0
              ? `${Math.round((kpis.concluidas / tasks.length) * 100)}% do mês entregue`
              : 'nada lançado no mês',
          },
        ]}
      />

      {/* Calendário Fiscal */}
      <FiscalCalendarCard
        tasks={tasks}
        today={today}
        year={year}
        month={month}
        isLoading={tasksQ.isLoading}
        isCompleting={completeTasks.isPending}
        onCompleteTasks={(ids) => completeTasks.mutate(ids)}
      />

      {/* Pendências por Cliente */}
      <ClientPendenciesSection tasks={tasks} today={today} onClientClick={goToKanbanByContact} />
    </div>
  );
}


// ---- Calendário Fiscal ----
type DayStatus = 'ok' | 'warn' | 'danger';

const dayDotClass: Record<DayStatus, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function FiscalCalendarCard({
  tasks,
  today,
  year,
  month,
  isLoading,
  isCompleting,
  onCompleteTasks,
}: {
  tasks: FiscalTaskRow[];
  today: string;
  year: number;
  month: number;
  isLoading: boolean;
  isCompleting: boolean;
  onCompleteTasks: (ids: string[]) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, FiscalTaskRow[]>();
    tasks.forEach((t) => {
      if (!t.fiscal_due_date) return;
      const list = map.get(t.fiscal_due_date) ?? [];
      list.push(t);
      map.set(t.fiscal_due_date, list);
    });
    return map;
  }, [tasks]);

  const obligationCards = useMemo(() => {
    const map = new Map<string, { key: string; name: string; dueDate: string; concluidas: number; pendentes: number }>();
    tasks.forEach((t) => {
      if (!t.fiscal_due_date) return;
      const name = t.fiscal_obligations_catalog?.name ?? t.title ?? 'Obrigação';
      const key = `${name}__${t.fiscal_due_date}`;
      const row = map.get(key) ?? { key, name, dueDate: t.fiscal_due_date, concluidas: 0, pendentes: 0 };
      if (t.status === 'concluido') row.concluidas += 1;
      else row.pendentes += 1;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks]);

  const gridDays = useMemo(() => {
    const startWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }, [year, month]);

  const dayStatus = (iso: string): DayStatus | null => {
    const list = byDay.get(iso);
    if (!list || list.length === 0) return null;
    if (list.some((t) => isLateTask(t, today))) return 'danger';
    if (list.every((t) => t.status === 'concluido')) return 'ok';
    return 'warn';
  };

  const selectedTasks = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Calendário Fiscal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : obligationCards.length === 0 ? (
          <div className="flex items-center gap-3 py-6 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-ok" />
            <span>Nenhuma obrigação lançada neste mês</span>
          </div>
        ) : (
          <>
            {/* Fileira de cards de obrigação */}
            <div className="flex gap-3 overflow-x-auto flex-nowrap pb-1 -mx-1 px-1">
              {obligationCards.map((c) => (
                <div
                  key={c.key}
                  className="flex w-[168px] shrink-0 flex-col gap-1 rounded-md border border-line bg-paper p-3"
                >
                  <span className="text-lg font-bold leading-none text-ink">
                    {format(parseISO(c.dueDate), 'dd/MM')}
                  </span>
                  <span className="text-sm font-medium text-ink truncate" title={c.name}>{c.name}</span>
                  <span className="text-xs text-muted-ink">{MONTHS[month - 1]} {year}</span>
                  <span className="text-xs text-muted-ink">
                    {c.concluidas} transmitida{c.concluidas !== 1 ? 's' : ''} · {c.pendentes} pendente{c.pendentes !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Grade do mês */}
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-muted-ink mb-1">
                {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {gridDays.map((cell, i) => {
                  if (!cell) return <div key={`empty-${i}`} />;
                  const status = dayStatus(cell.iso);
                  const isToday = cell.iso === today;
                  return status ? (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelectedDay(cell.iso)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-md py-2 text-sm text-ink transition-colors hover:bg-bg-2',
                        isToday && 'bg-bg-2 font-semibold',
                      )}
                    >
                      <span>{cell.day}</span>
                      <span className={cn('h-1.5 w-1.5 rounded-full', dayDotClass[status])} />
                    </button>
                  ) : (
                    <div
                      key={cell.iso}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-md py-2 text-sm text-muted-ink',
                        isToday && 'bg-bg-2 font-semibold text-ink',
                      )}
                    >
                      <span>{cell.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>

      <DayTasksSheet
        open={!!selectedDay}
        onOpenChange={(o) => !o && setSelectedDay(null)}
        dateIso={selectedDay}
        tasks={selectedTasks}
        today={today}
        isCompleting={isCompleting}
        onCompleteTasks={onCompleteTasks}
      />
    </Card>
  );
}

type DayTaskStatus = 'concluida' | 'vencida' | 'pendente';

const dayTaskStatusLabel: Record<DayTaskStatus, string> = {
  concluida: 'Concluída',
  vencida: 'Vencida',
  pendente: 'Pendente',
};

const dayTaskStatusTone: Record<DayTaskStatus, 'ok' | 'danger' | 'warn'> = {
  concluida: 'ok',
  vencida: 'danger',
  pendente: 'warn',
};

function DayTasksSheet({
  open,
  onOpenChange,
  dateIso,
  tasks,
  today,
  isCompleting,
  onCompleteTasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateIso: string | null;
  tasks: FiscalTaskRow[];
  today: string;
  isCompleting: boolean;
  onCompleteTasks: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | DayTaskStatus>('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSearch('');
    setStatusFilter('todos');
    setSelected(new Set());
  }, [dateIso]);

  const rows = useMemo(
    () =>
      tasks.map((t) => {
        const statusKey: DayTaskStatus = t.status === 'concluido'
          ? 'concluida'
          : isLateTask(t, today) ? 'vencida' : 'pendente';
        return { task: t, statusKey };
      }),
    [tasks, today],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return rows.filter(({ task, statusKey }) => {
      if (statusFilter !== 'todos' && statusKey !== statusFilter) return false;
      if (!q) return true;
      const name = (task.contacts?.name ?? '').toLowerCase();
      const doc = (task.contacts?.document ?? '').replace(/\D/g, '');
      return name.includes(q) || (qDigits && doc.includes(qDigits));
    });
  }, [rows, search, statusFilter]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleComplete = () => {
    onCompleteTasks(Array.from(selected));
    setSelected(new Set());
  };

  const dateLabel = dateIso ? format(parseISO(dateIso), "dd 'de' MMMM", { locale: ptBR }) : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto px-6 py-6">
        <SheetHeader className="space-y-1 pb-4">
          <SheetTitle className="text-2xl first-letter:uppercase">{dateLabel}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {tasks.length} {tasks.length === 1 ? 'obrigação' : 'obrigações'} vencendo neste dia
          </p>
        </SheetHeader>

        <div className="space-y-4 pb-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              placeholder="Buscar por razão social ou CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="w-full sm:max-w-xs"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'todos' | DayTaskStatus)}>
              <SelectTrigger className="h-9 w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(({ task, statusKey }) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(task.id)}
                        disabled={statusKey === 'concluida'}
                        onCheckedChange={(v) => toggleSelected(task.id, !!v)}
                        aria-label={`Selecionar ${task.contacts?.name ?? ''}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{task.contacts?.name ?? '—'}</TableCell>
                    <TableCell className="text-muted-ink">
                      {task.contacts?.document ? maskCPFCNPJ(task.contacts.document) : '—'}
                    </TableCell>
                    <TableCell>
                      <DsBadge tone={dayTaskStatusTone[statusKey]}>{dayTaskStatusLabel[statusKey]}</DsBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-2 px-4 py-3">
              <span className="text-sm text-ink">
                {selected.size} {selected.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}
              </span>
              <Button size="sm" onClick={handleComplete} disabled={isCompleting}>
                Concluir tarefas
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


// ---- Pendências por Cliente ----
type ClientRow = {
  contactId: string;
  name: string;
  pendentes: number;
  emAndamento: number;
  aguardando: number;
  atrasadas: number;
  concluidas: number;
  total: number;
};

type SortKey = 'name' | 'pendentes' | 'emAndamento' | 'aguardando' | 'atrasadas' | 'concluidas';

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
          pendentes: 0,
          emAndamento: 0,
          aguardando: 0,
          atrasadas: 0,
          concluidas: 0,
          total: 0,
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
    return Array.from(map.values());
  }, [tasks, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
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
      setSortDir(key === 'name' ? 'asc' : 'desc');
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
    if (atrasadas >= 3) return 'bg-danger';
    if (atrasadas >= 1) return 'bg-warn';
    return 'bg-ok';
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
              <TableHead className="text-right"><SortBtn k="pendentes" label="Pendentes" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="emAndamento" label="Em Andamento" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="aguardando" label="Aguardando" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="atrasadas" label="Atrasadas" align="right" /></TableHead>
              <TableHead className="text-right"><SortBtn k="concluidas" label="Concluídas" align="right" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
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
                  <TableCell className="text-right tabular-nums">{r.pendentes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.emAndamento}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.aguardando}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.atrasadas > 0 ? (
                      <Badge className="bg-danger/15 text-danger dark:text-danger border-danger/30">{r.atrasadas}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.concluidas}</TableCell>
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
