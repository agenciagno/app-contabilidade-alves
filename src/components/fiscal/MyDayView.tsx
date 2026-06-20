import { useMemo, useState } from 'react';
import { format, parseISO, differenceInCalendarDays, isToday, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Target, AlertTriangle, Clock, CheckCircle, Upload, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { FiscalTask } from '@/hooks/useFiscalTasks';

const STATUS_OPTIONS = [
  { value: 'a_fazer', label: 'A Fazer' },
  { value: 'em_progresso', label: 'Em Progresso' },
  { value: 'aguardando_cliente', label: 'Aguardando Cliente' },
  { value: 'concluido', label: 'Concluído' },
];

const statusBadgeClass: Record<string, string> = {
  a_fazer: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  aguardando_cliente: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  em_progresso: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  concluido: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

type Mode = 'mine' | 'overview';

interface Props {
  tasks: FiscalTask[];
  contactsMap: Record<string, string>;
  profilesMap: Record<string, { name: string; initials: string }>;
  myProfileId: string | null;
  isAdminUser: boolean;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: FiscalTask) => void;
  onUploadAttachment: (task: FiscalTask, file: File) => Promise<void>;
}

function bucketize(tasks: FiscalTask[]) {
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const in7 = addDays(today, 7);

  const overdue: FiscalTask[] = [];
  const dueToday: FiscalTask[] = [];
  const next48h: FiscalTask[] = [];
  const next7: FiscalTask[] = [];

  for (const t of tasks) {
    if (t.status === 'concluido') continue;
    if (!t.due_date) continue;
    const d = parseISO(t.due_date);
    const diff = differenceInCalendarDays(d, today);
    if (diff < 0) overdue.push(t);
    else if (t.due_date === todayStr) dueToday.push(t);
    else if (diff === 1 || diff === 2) next48h.push(t);
    else if (d <= in7) next7.push(t);
  }
  overdue.sort((a, b) => a.due_date.localeCompare(b.due_date));
  next48h.sort((a, b) => a.due_date.localeCompare(b.due_date));
  next7.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return { overdue, dueToday, next48h, next7 };
}

function TaskItem({
  task,
  contactsMap,
  onStatusChange,
  onTaskClick,
  onUploadAttachment,
  urgencyBadge,
}: {
  task: FiscalTask;
  contactsMap: Record<string, string>;
  onStatusChange: Props['onStatusChange'];
  onTaskClick: Props['onTaskClick'];
  onUploadAttachment: Props['onUploadAttachment'];
  urgencyBadge?: React.ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const clientName = contactsMap[task.contact_id] || '—';
  const inputId = `myday-att-${task.id}`;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      await onUploadAttachment(task, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Card className="p-3 hover:shadow-sm transition-shadow">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => onTaskClick(task)}
          className="text-left min-w-0 flex-1"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{clientName}</span>
            {urgencyBadge}
            <Badge variant="outline" className={`text-[10px] ${statusBadgeClass[task.status]}`}>
              {STATUS_OPTIONS.find((s) => s.value === task.status)?.label ?? task.status}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">{task.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Vencimento: {task.due_date ? format(parseISO(task.due_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={task.status} onValueChange={(v) => onStatusChange(task.id, v)}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {task.attachment_url ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
              <a href={task.attachment_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Ver
              </a>
            </Button>
          ) : (
            <>
              <Label htmlFor={inputId} className="cursor-pointer">
                <div className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-dashed border-border hover:bg-muted/50 text-xs">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Enviando...' : 'Anexar'}
                </div>
              </Label>
              <input id={inputId} type="file" className="hidden" onChange={handleFile} disabled={uploading} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function TaskListSection({
  title,
  items,
  contactsMap,
  onStatusChange,
  onTaskClick,
  onUploadAttachment,
  badgeFor,
}: {
  title: string;
  items: FiscalTask[];
  contactsMap: Record<string, string>;
  onStatusChange: Props['onStatusChange'];
  onTaskClick: Props['onTaskClick'];
  onUploadAttachment: Props['onUploadAttachment'];
  badgeFor?: (t: FiscalTask) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title} <span className="text-muted-foreground font-normal">({items.length})</span></h3>
      <div className="space-y-2">
        {items.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            contactsMap={contactsMap}
            onStatusChange={onStatusChange}
            onTaskClick={onTaskClick}
            onUploadAttachment={onUploadAttachment}
            urgencyBadge={badgeFor?.(t)}
          />
        ))}
      </div>
    </section>
  );
}

function buildUrgencySections(
  tasks: FiscalTask[],
  limit: number | null,
  contactsMap: Record<string, string>,
  onStatusChange: Props['onStatusChange'],
  onTaskClick: Props['onTaskClick'],
  onUploadAttachment: Props['onUploadAttachment'],
) {
  const today = startOfDay(new Date());
  const { overdue, dueToday, next48h, next7 } = bucketize(tasks);
  const all = [...overdue, ...dueToday, ...next48h, ...next7];
  const limited = limit == null ? all : all.slice(0, limit);
  const setIds = new Set(limited.map((t) => t.id));

  const f = (list: FiscalTask[]) => list.filter((t) => setIds.has(t.id));

  return {
    totalShown: limited.length,
    totalAll: all.length,
    sections: (
      <div className="space-y-4">
        <TaskListSection
          title="🔴 Atrasadas"
          items={f(overdue)}
          contactsMap={contactsMap}
          onStatusChange={onStatusChange}
          onTaskClick={onTaskClick}
          onUploadAttachment={onUploadAttachment}
          badgeFor={(t) => {
            const days = Math.abs(differenceInCalendarDays(parseISO(t.due_date), today));
            return (
              <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {days} dia{days === 1 ? '' : 's'} de atraso
              </Badge>
            );
          }}
        />
        <TaskListSection
          title="🟠 Vencem Hoje"
          items={f(dueToday)}
          contactsMap={contactsMap}
          onStatusChange={onStatusChange}
          onTaskClick={onTaskClick}
          onUploadAttachment={onUploadAttachment}
          badgeFor={() => (
            <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> Hoje
            </Badge>
          )}
        />
        <TaskListSection
          title="🟡 Próximas 48h"
          items={f(next48h)}
          contactsMap={contactsMap}
          onStatusChange={onStatusChange}
          onTaskClick={onTaskClick}
          onUploadAttachment={onUploadAttachment}
          badgeFor={(t) => (
            <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
              {format(parseISO(t.due_date), 'dd/MM', { locale: ptBR })}
            </Badge>
          )}
        />
        <TaskListSection
          title="Próximos 7 dias"
          items={f(next7)}
          contactsMap={contactsMap}
          onStatusChange={onStatusChange}
          onTaskClick={onTaskClick}
          onUploadAttachment={onUploadAttachment}
        />
      </div>
    ),
  };
}

export function MyDayView({
  tasks,
  contactsMap,
  profilesMap,
  myProfileId,
  isAdminUser,
  onStatusChange,
  onTaskClick,
  onUploadAttachment,
}: Props) {
  const [mode, setMode] = useState<Mode>('mine');
  const [showAll, setShowAll] = useState(false);

  // Tasks for "Minha fila"
  const myTasks = useMemo(
    () => (myProfileId ? tasks.filter((t) => t.responsible_id === myProfileId) : []),
    [tasks, myProfileId],
  );

  // Progress: current competence month/year (independent of competence filter)
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const progressTasks = useMemo(() => {
    const base = mode === 'mine' ? myTasks : tasks;
    return base.filter(
      (t: any) => t.competence_year === curYear && t.competence_month === curMonth,
    );
  }, [mode, myTasks, tasks, curYear, curMonth]);
  const totalMonth = progressTasks.length;
  const doneMonth = progressTasks.filter((t) => t.status === 'concluido').length;
  const pct = totalMonth > 0 ? Math.round((doneMonth / totalMonth) * 100) : 0;

  const limit = showAll ? null : 20;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header: progress + toggle */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Meu Dia</h2>
          </div>
          {isAdminUser && (
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
              className="border border-border/50 rounded-md p-0.5"
            >
              <ToggleGroupItem value="mine" className="h-8 px-3 text-xs">Minha fila</ToggleGroupItem>
              <ToggleGroupItem value="overview" className="h-8 px-3 text-xs">Visão geral</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">
              Meu mês: <span className="font-semibold">{doneMonth}</span> de <span className="font-semibold">{totalMonth}</span> tarefas concluídas
            </span>
            <span className="text-muted-foreground text-xs">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>

      <Separator />

      {/* Body */}
      {mode === 'mine' ? (
        (() => {
          const pending = myTasks.filter((t) => t.status !== 'concluido');
          if (!myProfileId) {
            return (
              <p className="text-sm text-muted-foreground italic">Perfil do usuário não localizado.</p>
            );
          }
          if (pending.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                <p className="text-base font-medium text-foreground">Tudo em dia!</p>
                <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
              </div>
            );
          }
          const { totalShown, totalAll, sections } = buildUrgencySections(
            myTasks, limit, contactsMap, onStatusChange, onTaskClick, onUploadAttachment,
          );
          return (
            <>
              {sections}
              {limit != null && totalAll > totalShown && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                    Ver todas as {totalAll} tarefas
                  </Button>
                </div>
              )}
            </>
          );
        })()
      ) : (
        (() => {
          // Group by responsible
          const groups = new Map<string, FiscalTask[]>();
          for (const t of tasks) {
            const key = t.responsible_id ?? '__unassigned__';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(t);
          }
          const entries = Array.from(groups.entries()).sort((a, b) => {
            const an = a[0] === '__unassigned__' ? 'zzz' : profilesMap[a[0]]?.name ?? 'zzz';
            const bn = b[0] === '__unassigned__' ? 'zzz' : profilesMap[b[0]]?.name ?? 'zzz';
            return an.localeCompare(bn);
          });
          if (entries.length === 0) {
            return <p className="text-sm text-muted-foreground italic">Nenhuma tarefa.</p>;
          }
          return (
            <div className="space-y-8">
              {entries.map(([profId, list]) => {
                const name = profId === '__unassigned__'
                  ? 'Sem responsável'
                  : profilesMap[profId]?.name ?? '—';
                const pending = list.filter((t) => t.status !== 'concluido');
                if (pending.length === 0) return null;
                const { totalShown, totalAll, sections } = buildUrgencySections(
                  list, limit, contactsMap, onStatusChange, onTaskClick, onUploadAttachment,
                );
                return (
                  <div key={profId} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{name}</h3>
                      <Badge variant="outline" className="text-[10px]">{pending.length} pendente{pending.length === 1 ? '' : 's'}</Badge>
                    </div>
                    {sections}
                    {limit != null && totalAll > totalShown && (
                      <div className="flex justify-center pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                          Ver todas as {totalAll} tarefas
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
    </div>
  );
}
