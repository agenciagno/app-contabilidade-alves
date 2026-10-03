import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ds';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { cn } from '@/lib/utils';

interface TaskCalendarViewProps {
  tasks: FiscalTask[];
  contactsMap: Record<string, string>;
  onTaskClick: (task: FiscalTask) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_POR_DIA = 3;

const statusColor: Record<string, string> = {
  a_fazer: 'bg-state-todo',
  aguardando_cliente: 'bg-state-waiting',
  em_progresso: 'bg-state-doing',
  concluido: 'bg-ok',
};

/** O título da tarefa vem como "ISS - Competência 09/2026"; no calendário interessa só o nome da obrigação. */
const nomeDaObrigacao = (title: string) => title.replace(/\s*[-–]\s*Compet[eê]ncia\b.*$/i, '').trim() || title;

export function TaskCalendarView({ tasks, contactsMap, onTaskClick }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const firstDayOffset = getDay(days[0]);

  const rotulo = (task: FiscalTask) => {
    const cliente = task.contact_id ? contactsMap[task.contact_id] : '';
    return cliente ? `${nomeDaObrigacao(task.title)} - ${cliente}` : nomeDaObrigacao(task.title);
  };

  const tasksByDay = useMemo(() => {
    const map: Record<string, FiscalTask[]> = {};
    tasks.forEach(task => {
      const key = task.due_date;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => rotulo(a).localeCompare(rotulo(b))));
    return map;
  }, [tasks, contactsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarefasDoDia = diaAberto ? (tasksByDay[diaAberto] ?? []) : [];
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? tarefasDoDia.filter((t) => rotulo(t).toLowerCase().includes(q)) : tarefasDoDia;
  }, [tarefasDoDia, busca, contactsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirDia = (dateKey: string) => { setBusca(''); setDiaAberto(dateKey); };
  // Fecha a lista do dia e abre os detalhes da tarefa clicada.
  const abrirTarefa = (task: FiscalTask) => { setDiaAberto(null); onTaskClick(task); };

  return (
    <Card className="bg-card border-border/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-semibold text-foreground capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">{day}</div>
        ))}

        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px]" />
        ))}

        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDay[dateKey] || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-[80px] min-w-0 border border-border/20 rounded p-1',
                isToday && 'bg-primary/5 border-primary/30'
              )}
            >
              <span className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, MAX_POR_DIA).map(task => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    title={rotulo(task)}
                    className="w-full text-left text-[10px] truncate rounded px-1 py-0.5 hover:bg-bg-2 transition-colors flex items-center gap-1"
                  >
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor[task.status])} />
                    <span className="truncate text-foreground">{rotulo(task)}</span>
                  </button>
                ))}
                {dayTasks.length > MAX_POR_DIA && (
                  <button
                    type="button"
                    onClick={() => abrirDia(dateKey)}
                    className="rounded px-1 text-[10px] font-medium text-action hover:underline"
                  >
                    +{dayTasks.length - MAX_POR_DIA}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!diaAberto} onOpenChange={(o) => !o && setDiaAberto(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              {diaAberto && (() => { const t = format(parseISO(diaAberto), "EEEE, d 'de' MMMM", { locale: ptBR }); return t.charAt(0).toUpperCase() + t.slice(1); })()}
            </DialogTitle>
            <DialogDescription>
              {tarefasDoDia.length} tarefa{tarefasDoDia.length === 1 ? '' : 's'} neste dia. Clique em uma para abrir os detalhes.
            </DialogDescription>
          </DialogHeader>
          <SearchField placeholder="Buscar obrigação ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="w-full" />
          <div className="min-h-[200px] flex-1 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {filtradas.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
            ) : (
              filtradas.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => abrirTarefa(task)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-bg-2"
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', statusColor[task.status])} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{rotulo(task)}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
