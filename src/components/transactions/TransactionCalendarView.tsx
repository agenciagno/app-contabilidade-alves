import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CashFlowCalendarItem {
  id: string;
  dateKey: string | null;
  label: string;
  type: 'receita' | 'despesa';
}

interface TransactionCalendarViewProps {
  items: CashFlowCalendarItem[];
  onItemClick: (id: string) => void;
  /** Chamado com a data (yyyy-MM-dd) quando o "+N" de um dia é clicado. */
  onMoreClick: (dateKey: string) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Mesmo padrão visual de src/components/fiscal/TaskCalendarView.tsx (mês em
// grid 7 colunas, até 3 itens por dia + "+N"), adaptado pra transações
// (bolinha por tipo receita/despesa em vez de status de tarefa) — 22/08/2026.
export function TransactionCalendarView({ items, onItemClick, onMoreClick }: TransactionCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const firstDayOffset = getDay(days[0]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, CashFlowCalendarItem[]> = {};
    items.forEach(item => {
      if (!item.dateKey) return;
      if (!map[item.dateKey]) map[item.dateKey] = [];
      map[item.dateKey].push(item);
    });
    return map;
  }, [items]);

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
          const dayItems = itemsByDay[dateKey] || [];
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
                {dayItems.slice(0, 3).map(item => (
                  <button
                    key={item.id}
                    onClick={() => onItemClick(item.id)}
                    className="w-full text-left text-[10px] truncate rounded px-1 py-0.5 hover:opacity-80 transition-opacity flex items-center gap-1"
                  >
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', item.type === 'receita' ? 'bg-ok' : 'bg-danger')} />
                    <span className="truncate text-foreground">{item.label}</span>
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <button
                    onClick={() => onMoreClick(dateKey)}
                    className="text-[10px] text-muted-foreground px-1 hover:text-primary hover:underline"
                  >
                    +{dayItems.length - 3}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
