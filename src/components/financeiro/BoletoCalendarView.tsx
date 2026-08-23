import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BoletoWithContact } from '@/hooks/useBoletoControls';

interface BoletoCalendarViewProps {
  boletos: BoletoWithContact[];
  isOverdue: (b: BoletoWithContact) => boolean;
  onBoletoClick: (b: BoletoWithContact) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Mesma cor por status já usada em StatusBadge (Boletos.tsx) — vencido=danger,
// pago=ok, gerado=info, impresso=neutral, a vencer=warn (22/08/2026).
function statusDotClass(b: BoletoWithContact, overdue: boolean) {
  if (overdue) return 'bg-danger';
  if (b.status === 'PAGO') return 'bg-ok';
  if (b.status === 'FILA_IMPRESSAO') return 'bg-brand';
  if (b.status === 'IMPRESSO') return 'bg-muted-ink';
  return 'bg-warn';
}

// Mesmo padrão visual de TaskCalendarView.tsx / TransactionCalendarView.tsx
// (mês em grid 7 colunas, até 3 itens por dia + "+N") — 22/08/2026.
export function BoletoCalendarView({ boletos, isOverdue, onBoletoClick }: BoletoCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const firstDayOffset = getDay(days[0]);

  const boletosByDay = useMemo(() => {
    const map: Record<string, BoletoWithContact[]> = {};
    boletos.forEach(b => {
      if (!b.data_vencimento) return;
      const key = b.data_vencimento;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [boletos]);

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
          const dayBoletos = boletosByDay[dateKey] || [];
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
                {dayBoletos.slice(0, 3).map(b => (
                  <button
                    key={b.id}
                    onClick={() => onBoletoClick(b)}
                    className="w-full text-left text-[10px] truncate rounded px-1 py-0.5 hover:opacity-80 transition-opacity flex items-center gap-1"
                  >
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDotClass(b, isOverdue(b)))} />
                    <span className="truncate text-foreground">{b.contact_name}</span>
                  </button>
                ))}
                {dayBoletos.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayBoletos.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
