import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  useFiscalTasksInRange,
  useCompleteFiscalTasks,
  FiscalTaskRow,
} from '@/hooks/useFiscalDashboard';
import { StatCardRow, DsBadge, SearchField } from '@/components/ds';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const YEARS = [2025, 2026, 2027];

const isoOfDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOfDate(new Date());
const inDaysIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoOfDate(d);
};

/** Vencida = não concluída com o prazo interno (data de entrega) antes de hoje. */
const isLateTask = (t: { status: string; due_date: string | null }, today: string) =>
  t.status !== 'concluido' && !!t.due_date && t.due_date < today;

/** Competência é o mês anterior ao vencimento. */
const prevMonth = (y: number, m: number) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} de ${y}`;

export default function FiscalDashboard() {
  const { isAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  // Padrão: mês corrente. Mês/Ano e o período livre são alternativos: escolher um limpa o outro.
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [filtroOpen, setFiltroOpen] = useState(false);
  const [collaborator, setCollaborator] = useState<string>('todos');

  const rangeAtivo = !!(range?.from && range?.to);
  const periodo = useMemo(() => {
    if (range?.from && range?.to) return { from: isoOfDate(range.from), to: isoOfDate(range.to) };
    const last = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
  }, [range, year, month]);

  const tasksQ = useFiscalTasksInRange(periodo.from, periodo.to);
  const profilesQ = useTeamProfiles();
  const completeTasks = useCompleteFiscalTasks();

  const today = todayIso();
  const em7dias = inDaysIso(7);

  // Colaboradores do filtro: quem tem tarefa no período (mais a seleção atual, para não sumir da lista).
  const collaboratorOptions = useMemo(() => {
    const ids = new Set<string>();
    (tasksQ.data ?? []).forEach((t) => { if (t.responsible_id) ids.add(t.responsible_id); });
    if (collaborator !== 'todos' && collaborator !== 'none') ids.add(collaborator);
    return [...ids]
      .map((id) => ({ id, name: profilesQ.data?.find((p) => p.id === id)?.full_name ?? 'Colaborador' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasksQ.data, profilesQ.data, collaborator]);

  const tasks = useMemo(() => {
    const all = tasksQ.data ?? [];
    if (collaborator === 'todos') return all;
    if (collaborator === 'none') return all.filter((t) => !t.responsible_id);
    return all.filter((t) => t.responsible_id === collaborator);
  }, [tasksQ.data, collaborator]);

  // As quatro partes (vencidas, pendentes, concluídas) somam o total do período; "vencem em 7 dias" é parte das pendentes.
  const kpis = useMemo(() => {
    let vencidas = 0, pendentes = 0, concluidas = 0, vencem7 = 0;
    for (const t of tasks) {
      if (t.status === 'concluido') concluidas += 1;
      else if (isLateTask(t, today)) vencidas += 1;
      else {
        pendentes += 1;
        if (t.due_date && t.due_date <= em7dias) vencem7 += 1;
      }
    }
    return { vencidas, pendentes, concluidas, vencem7 };
  }, [tasks, today, em7dias]);

  // Meses que o período cobre: o calendário só navega entre eles.
  const periodMonths = useMemo(() => {
    const [fy, fm] = periodo.from.split('-').map(Number);
    const [ty, tm] = periodo.to.split('-').map(Number);
    const out: Array<{ y: number; m: number }> = [];
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y += 1, m = 1) : (m += 1)) out.push({ y, m });
    return out;
  }, [periodo]);

  const subtitulo = useMemo(() => {
    const [fy, fm] = periodo.from.split('-').map(Number);
    const [ty, tm] = periodo.to.split('-').map(Number);
    const c1 = prevMonth(fy, fm);
    const c2 = prevMonth(ty, tm);
    const mesmaCompetencia = c1.y === c2.y && c1.m === c2.m;
    const competencia = mesmaCompetencia
      ? `à competência de ${monthLabel(c1.y, c1.m)}`
      : `às competências de ${monthLabel(c1.y, c1.m)} a ${monthLabel(c2.y, c2.m)}`;
    const vencimento = rangeAtivo
      ? `de ${format(parseISO(periodo.from), 'dd/MM/yyyy')} a ${format(parseISO(periodo.to), 'dd/MM/yyyy')}`
      : `em ${monthLabel(year, month)}`;
    return { vencimento: `Tarefas com vencimento ${vencimento}`, competencia: `Referente ${competencia}` };
  }, [periodo, rangeAtivo, year, month]);

  if (roleLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/fiscal/tarefas" replace />;

  // Abre a lista de Tarefas no mesmo período; num intervalo livre abre todos os meses.
  const mesQuery = rangeAtivo ? 'mes=todos' : `mes=${month}&ano=${year}`;
  const goToKanbanByContact = (contactId: string) =>
    navigate(`/fiscal/tarefas?view=kanban&contact_id=${contactId}&${mesQuery}`);
  const goToTasksByCollaborator = (profileId: string) =>
    navigate(`/fiscal/tarefas?responsible=${profileId}&${mesQuery}`);

  const escopo = rangeAtivo ? 'período' : 'mês';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-kicker uppercase text-muted-ink-2">~/tarefas</p>
          <h1 className="text-display text-ink">Dashboard fiscal.</h1>
          <p className="text-sm text-muted-ink">
            {subtitulo.vencimento}
            <br />
            {subtitulo.competencia}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print sm:justify-end">
          {/* Um filtro só: mês/ano em cima (padrão) e período livre embaixo; escolher datas sobrepõe o mês. */}
          <Popover open={filtroOpen} onOpenChange={setFiltroOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                <CalendarDays className="h-4 w-4" />
                {rangeAtivo
                  ? `${format(range!.from!, 'dd/MM/yy')} – ${format(range!.to!, 'dd/MM/yy')}`
                  : `${MONTHS[month - 1]} ${year}`}
                <ChevronDown className="h-3.5 w-3.5 text-muted-ink" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <div className="space-y-2 p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-muted-ink-2">Mês e ano</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(month)}
                    onValueChange={(v) => { setMonth(Number(v)); setRange(undefined); }}
                  >
                    <SelectTrigger className={cn('h-8 w-[140px] text-xs', rangeAtivo && 'text-muted-ink')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(year)}
                    onValueChange={(v) => { setYear(Number(v)); setRange(undefined); }}
                  >
                    <SelectTrigger className={cn('h-8 w-[90px] text-xs', rangeAtivo && 'text-muted-ink')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t border-line">
                <p className="px-3 pt-3 text-[11px] uppercase tracking-[0.05em] text-muted-ink-2">Ou escolha as datas</p>
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  defaultMonth={range?.from ?? new Date(year, month - 1, 1)}
                  selected={range}
                  onSelect={(r) => {
                    setRange(r);
                    if (r?.from && r?.to) setFiltroOpen(false);
                  }}
                />
              </div>
              {rangeAtivo && (
                <div className="border-t border-line p-2">
                  <Button variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => { setRange(undefined); setFiltroOpen(false); }}>
                    Voltar para {MONTHS[month - 1]} {year}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Select value={collaborator} onValueChange={setCollaborator}>
            <SelectTrigger className="h-8 w-[170px] text-xs shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              <SelectItem value="none">Sem responsável</SelectItem>
              {collaboratorOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Indicadores: todos do período filtrado (mês corrente por padrão) */}
      <StatCardRow
        items={[
          { label: 'Vencidas', value: kpis.vencidas, emphasis: kpis.vencidas > 0 ? 'warm' : 'none' },
          { label: 'Vencem em 7 dias', value: kpis.vencem7 },
          { label: `Pendentes do ${escopo}`, value: kpis.pendentes },
          { label: `Concluídas do ${escopo}`, value: kpis.concluidas },
        ]}
      />

      {/* Calendário Fiscal */}
      <FiscalCalendarCard
        tasks={tasks}
        today={today}
        months={periodMonths}
        rangeFrom={periodo.from}
        rangeTo={periodo.to}
        isLoading={tasksQ.isLoading}
        isCompleting={completeTasks.isPending}
        onCompleteTasks={(ids) => completeTasks.mutate(ids)}
      />

      {/* Pendências por Cliente */}
      <ClientPendenciesSection tasks={tasks} today={today} onClientClick={goToKanbanByContact} />

      {/* Colaboradores */}
      <CollaboratorsSection
        tasks={tasks}
        today={today}
        profiles={profilesQ.data ?? []}
        onCollaboratorClick={goToTasksByCollaborator}
      />
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

const dayRingClass: Record<DayStatus, string> = {
  ok: 'border-ok text-ok',
  warn: 'border-warn text-warn',
  danger: 'border-danger text-danger',
};

const LEGEND: Array<{ status: DayStatus; label: string }> = [
  { status: 'ok', label: 'Em dia' },
  { status: 'warn', label: 'Pendente' },
  { status: 'danger', label: 'Atrasado' },
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const statusOf = (list: FiscalTaskRow[], today: string): DayStatus => {
  if (list.some((t) => isLateTask(t, today))) return 'danger';
  if (list.every((t) => t.status === 'concluido')) return 'ok';
  return 'warn';
};

type ObligationGroup = {
  key: string;
  name: string;
  dueDate: string;
  tasks: FiscalTaskRow[];
};

type CalendarSelection = { title: string; dueDate: string; tasks: FiscalTaskRow[] };

/** O calendário acompanha o filtro do Dashboard: mostra só os meses do período (um, no filtro de mês) e navega entre eles. */
function FiscalCalendarCard({
  tasks,
  today,
  months,
  rangeFrom,
  rangeTo,
  isLoading,
  isCompleting,
  onCompleteTasks,
}: {
  tasks: FiscalTaskRow[];
  today: string;
  months: Array<{ y: number; m: number }>;
  rangeFrom: string;
  rangeTo: string;
  isLoading: boolean;
  isCompleting: boolean;
  onCompleteTasks: (ids: string[]) => void;
}) {
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const periodKey = `${months[0]?.y}-${months[0]?.m}-${months.length}`;
  // Mês em exibição: o de hoje, se o período o contém; senão o primeiro do período.
  const [viewIdx, setViewIdx] = useState(0);
  useEffect(() => {
    const [ty, tm] = today.split('-').map(Number);
    const i = months.findIndex((x) => x.y === ty && x.m === tm);
    setViewIdx(i >= 0 ? i : 0);
  }, [periodKey, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const { y: year, m: month } = months[Math.min(viewIdx, months.length - 1)] ?? { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };

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

  const obligationGroups = useMemo(() => {
    const map = new Map<string, ObligationGroup>();
    tasks.forEach((t) => {
      if (!t.fiscal_due_date) return;
      const name = t.fiscal_obligations_catalog?.name ?? t.title ?? 'Obrigação';
      const key = `${name}__${t.fiscal_due_date}`;
      const group = map.get(key) ?? { key, name, dueDate: t.fiscal_due_date, tasks: [] };
      group.tasks.push(t);
      map.set(key, group);
    });
    return Array.from(map.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks]);

  // Fileira de dias em destaque: semana completa (Seg–Dom), mostrando todo dia mesmo
  // sem obrigação — pedido do Gabriel (09/08/2026). Setas próprias deslocam por semana,
  // independente do mês navegado pela grade abaixo.
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Semana de partida: a de hoje se hoje cai no período; senão a do primeiro dia do período.
  const weekAnchor = today >= rangeFrom && today <= rangeTo ? today : rangeFrom;

  const weekStartDate = useMemo(() => {
    const t = parseISO(weekAnchor);
    const mondayOffset = (t.getDay() + 6) % 7; // Dom=6, Seg=0, ..., Sáb=5
    const monday = new Date(t);
    monday.setDate(t.getDate() - mondayOffset);
    return monday;
  }, [weekAnchor]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      const iso = isoOf(d);
      return { date: d, iso, tasks: byDay.get(iso) ?? [] };
    });
  }, [weekStartDate, byDay]);

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
    return statusOf(list, today);
  };

  const vencidos = useMemo(() => tasks.filter((t) => isLateTask(t, today)).length, [tasks, today]);
  const pendentesCount = useMemo(
    () => tasks.filter((t) => t.status !== 'concluido' && !isLateTask(t, today)).length,
    [tasks, today],
  );

  const openDay = (iso: string) => {
    const list = byDay.get(iso);
    if (!list || list.length === 0) return;
    // Título sempre pela data; as obrigações do dia aparecem no detalhe (antes só aparecia o nome quando havia uma).
    const title = format(parseISO(iso), "EEEE, d 'de' MMMM", { locale: ptBR });
    setSelection({ title: title.charAt(0).toUpperCase() + title.slice(1), dueDate: iso, tasks: list });
  };

  const shiftMonth = (delta: number) => setViewIdx((i) => Math.max(0, Math.min(months.length - 1, i + delta)));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Calendário Fiscal</CardTitle>
        <span className="text-xs text-muted-ink">
          {obligationGroups.length} {obligationGroups.length === 1 ? 'obrigação mapeada' : 'obrigações mapeadas'}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <>
            {/* Legenda */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-ink">
              {LEGEND.map((l) => (
                <span key={l.status} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', dayDotClass[l.status])} />
                  {l.label}
                </span>
              ))}
            </div>

            {/* Navegador de mês + resumo */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {months.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={viewIdx <= 0} onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <span className={cn('text-center text-sm font-medium text-ink', months.length > 1 && 'w-[120px]')}>{MONTHS[month - 1]} {year}</span>
                {months.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={viewIdx >= months.length - 1} onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                {vencidos > 0 && <DsBadge tone="danger">{vencidos} vencido{vencidos !== 1 ? 's' : ''}</DsBadge>}
                {pendentesCount > 0 && <DsBadge tone="warn">{pendentesCount} pendente{pendentesCount !== 1 ? 's' : ''}</DsBadge>}
              </div>
              <span className="text-xs text-muted-ink">Hoje: {format(parseISO(today), 'dd/MM')}</span>
            </div>

            {/* Semana em destaque (sem navegação) */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {weekDays.map((wd) => {
                const hasTasks = wd.tasks.length > 0;
                const status = hasTasks ? statusOf(wd.tasks, today) : null;
                const concluidas = wd.tasks.filter((t) => t.status === 'concluido').length;
                const pendentes = wd.tasks.length - concluidas;
                const names = new Set(wd.tasks.map((t) => t.fiscal_obligations_catalog?.name ?? t.title ?? 'Obrigação'));
                const label = names.size === 1 ? [...names][0] : `${names.size} obrigações`;
                const isToday = wd.iso === today;
                return (
                  <div
                    key={wd.iso}
                    role={hasTasks ? 'button' : undefined}
                    tabIndex={hasTasks ? 0 : undefined}
                    onClick={hasTasks ? () => openDay(wd.iso) : undefined}
                    onKeyDown={hasTasks ? (e) => { if (e.key === 'Enter' || e.key === ' ') openDay(wd.iso); } : undefined}
                    className={cn(
                      'flex min-w-0 flex-col gap-2 rounded-md border border-line bg-paper p-2.5 text-left transition-colors',
                      hasTasks && 'cursor-pointer hover:bg-bg-2',
                      isToday && 'border-ink/40',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                          status ? dayRingClass[status] : 'border-line text-muted-ink',
                        )}
                      >
                        {wd.date.getDate()}
                      </span>
                      <span className="min-w-0 truncate text-[10px] uppercase text-muted-ink">{WEEKDAYS_ABBR[wd.date.getDay()]}</span>
                    </div>
                    {hasTasks ? (
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-medium text-ink truncate" title={label}>{label}</p>
                        <p className="text-[11px] text-muted-ink truncate">
                          {concluidas} transmitida{concluidas !== 1 ? 's' : ''} · {pendentes} pendente{pendentes !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="truncate text-[11px] text-muted-ink-2">Sem obrigações</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grade do mês */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.05em] text-muted-ink-2">Calendário do mês</p>
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
                      onClick={() => openDay(cell.iso)}
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

      <CalendarSelectionSheet
        open={!!selection}
        onOpenChange={(o) => !o && setSelection(null)}
        selection={selection}
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

function CalendarSelectionSheet({
  open,
  onOpenChange,
  selection,
  today,
  isCompleting,
  onCompleteTasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: CalendarSelection | null;
  today: string;
  isCompleting: boolean;
  onCompleteTasks: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | DayTaskStatus>('todos');
  const [obligationFilter, setObligationFilter] = useState('todas');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tasks = selection?.tasks ?? [];

  useEffect(() => {
    setSearch('');
    setStatusFilter('todos');
    setObligationFilter('todas');
    setSelected(new Set());
  }, [selection?.title, selection?.dueDate]);

  const obrigacaoDe = (t: FiscalTaskRow) => t.fiscal_obligations_catalog?.name ?? t.title ?? 'Obrigação';

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

  // Obrigações do dia, com a contagem de empresas de cada uma.
  const obrigacoes = useMemo(() => {
    const map = new Map<string, Set<string | null>>();
    tasks.forEach((t) => {
      const n = obrigacaoDe(t);
      map.set(n, (map.get(n) ?? new Set()).add(t.contact_id));
    });
    return [...map.entries()].map(([nome, set]) => ({ nome, empresas: set.size })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return rows.filter(({ task, statusKey }) => {
      if (statusFilter !== 'todos' && statusKey !== statusFilter) return false;
      if (obligationFilter !== 'todas' && obrigacaoDe(task) !== obligationFilter) return false;
      if (!q) return true;
      const name = (task.contacts?.name ?? '').toLowerCase();
      const doc = (task.contacts?.document ?? '').replace(/\D/g, '');
      return name.includes(q) || (qDigits && doc.includes(qDigits));
    });
  }, [rows, search, statusFilter, obligationFilter]);

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

  const groupStatus = statusOf(tasks, today);
  const empresasCount = new Set(tasks.map((t) => t.contact_id)).size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto px-6 py-6">
        <SheetHeader className="space-y-1 pb-4">
          <SheetTitle className="text-2xl">{selection?.title}</SheetTitle>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', dayDotClass[groupStatus])} />
            {groupStatus === 'ok' ? 'Concluído' : 'Aberto'}
            {selection?.dueDate && ` · Vencimento: ${format(parseISO(selection.dueDate), 'dd/MM/yyyy')}`}
            {` · ${empresasCount} ${empresasCount === 1 ? 'empresa' : 'empresas'}`}
          </p>
          <p className="text-sm font-medium text-ink">
            {obrigacoes.map((o) => `${o.nome} (${o.empresas})`).join(' · ')}
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
            {obrigacoes.length > 1 && (
              <Select value={obligationFilter} onValueChange={setObligationFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as obrigações</SelectItem>
                  {obrigacoes.map((o) => <SelectItem key={o.nome} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-2 px-4 py-3">
              <span className="text-sm text-ink">
                {selected.size} {selected.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}
              </span>
              <Button size="sm" onClick={handleComplete} disabled={isCompleting}>
                <Plus className="h-4 w-4" /> Concluir tarefas
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Obrigação</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(({ task, statusKey }) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(task.id)}
                        onCheckedChange={(v) => toggleSelected(task.id, !!v)}
                        aria-label={`Selecionar ${task.contacts?.name ?? ''}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{task.contacts?.name ?? '—'}</TableCell>
                    <TableCell className="text-muted-ink">
                      {task.contacts?.document ? maskCPFCNPJ(task.contacts.document) : '—'}
                    </TableCell>
                    <TableCell className="text-ink">{obrigacaoDe(task)}</TableCell>
                    <TableCell>
                      <DsBadge tone={dayTaskStatusTone[statusKey]}>{dayTaskStatusLabel[statusKey]}</DsBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
              <TableHead className="text-right"><SortBtn k="atrasadas" label="Vencidas" align="right" /></TableHead>
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


// ---- Colaboradores ----
type CollaboratorRowData = {
  id: string | null;
  name: string;
  total: number;
  vencidas: number;
  pendentes: number;
  concluidas: number;
};

function CollaboratorsSection({
  tasks,
  today,
  profiles,
  onCollaboratorClick,
}: {
  tasks: FiscalTaskRow[];
  today: string;
  profiles: { id: string; full_name: string | null }[];
  onCollaboratorClick: (profileId: string) => void;
}) {
  const rows = useMemo<CollaboratorRowData[]>(() => {
    const map = new Map<string, CollaboratorRowData>();
    for (const t of tasks) {
      const key = t.responsible_id ?? '__sem__';
      let r = map.get(key);
      if (!r) {
        r = {
          id: t.responsible_id,
          name: t.responsible_id ? (profiles.find((p) => p.id === t.responsible_id)?.full_name ?? 'Colaborador') : 'Sem responsável',
          total: 0, vencidas: 0, pendentes: 0, concluidas: 0,
        };
        map.set(key, r);
      }
      r.total += 1;
      if (t.status === 'concluido') r.concluidas += 1;
      else if (isLateTask(t, today)) r.vencidas += 1;
      else r.pendentes += 1;
    }
    return [...map.values()].sort((a, b) => b.vencidas - a.vencidas || b.pendentes - a.pendentes || a.name.localeCompare(b.name));
  }, [tasks, today, profiles]);

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-base">Colaboradores</CardTitle>
        <p className="text-meta text-muted-ink">Tarefas do período por responsável · clique no nome para abrir as tarefas</p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead className="text-right">Tarefas</TableHead>
              <TableHead className="text-right">Vencidas</TableHead>
              <TableHead className="text-right">Pendentes</TableHead>
              <TableHead className="text-right">Concluídas</TableHead>
              <TableHead className="w-[180px]">Entregue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Sem tarefas neste período</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const pct = r.total > 0 ? Math.round((r.concluidas / r.total) * 100) : 0;
                return (
                  <TableRow key={r.id ?? '__sem__'}>
                    <TableCell className="font-medium">
                      {r.id
                        ? <button type="button" onClick={() => onCollaboratorClick(r.id!)} className="text-left hover:underline">{r.name}</button>
                        : <span className="text-warn">{r.name}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.vencidas > 0
                        ? <Badge className="border-danger/30 bg-danger/15 text-danger">{r.vencidas}</Badge>
                        : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.pendentes}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.concluidas}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums text-muted-ink">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
