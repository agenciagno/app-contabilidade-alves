import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { cn } from '@/lib/utils';

interface TaskCalendarViewProps {
  tasks: FiscalTask[];
  contactsMap: Record<string, string>;
  onTaskClick: (task: FiscalTask) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function TaskCalendarView({ tasks, contactsMap, onTaskClick }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const firstDayOffset = getDay(days[0]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, FiscalTask[]> = {};
    tasks.forEach(task => {
      const key = task.due_date;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    });
    return map;
  }, [tasks]);

  const statusColor: Record<string, string> = {
    a_fazer: 'bg-blue-500',
    aguardando_cliente: 'bg-yellow-500',
    em_progresso: 'bg-orange-500',
    concluido: 'bg-emerald-500',
  };

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
                'min-h-[80px] border border-border/20 rounded p-1',
                isToday && 'bg-primary/5 border-primary/30'
              )}
            >
              <span className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, 3).map(task => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className="w-full text-left text-[10px] truncate rounded px-1 py-0.5 hover:opacity-80 transition-opacity flex items-center gap-1"
                  >
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor[task.status])} />
                    <span className="truncate text-foreground">{task.title}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
