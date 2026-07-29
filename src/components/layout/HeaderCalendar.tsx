import { useState, useMemo } from 'react';
import { CalendarDays, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isSameDay, isSameMonth, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getHolidayName, listHolidays, isBusinessDay } from '@/lib/business-days';

// Calendário de consulta do dia. Não mostra nada de financeiro — a leitura de
// receitas/despesas por data vive nas telas do módulo Financeiro (Movimentações,
// Pagar/Receber, Fluxo de Caixa), que têm filtro e contexto para isso.
export function HeaderCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const year = (selectedDate ?? new Date()).getFullYear();
  const holidays = useMemo(() => listHolidays(year), [year]);
  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);

  // Próximos feriados a partir de hoje, para o rodapé do popover.
  const upcoming = useMemo(() => {
    const today = startOfDay(new Date());
    const nextYear = listHolidays(today.getFullYear() + 1);
    return [...listHolidays(today.getFullYear()), ...nextYear]
      .filter((h) => !isAfter(today, h.date))
      .slice(0, 4);
  }, []);

  const selectedHoliday = selectedDate ? getHolidayName(selectedDate) : null;
  const selectedIsBusinessDay = selectedDate ? isBusinessDay(selectedDate) : false;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
        >
          <CalendarDays className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={ptBR}
          modifiers={{ holiday: holidayDates }}
          modifiersClassNames={{ holiday: 'text-destructive font-semibold' }}
          className="rounded-t-md border-b"
          classNames={{
            day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 relative',
          }}
          components={{
            DayContent: ({ date }) => {
              const isHoliday = !!getHolidayName(date);
              return (
                <div className="relative w-full h-full flex items-center justify-center">
                  <span>{date.getDate()}</span>
                  {isHoliday && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-destructive" />
                  )}
                </div>
              );
            },
          }}
        />

        {/* Dia selecionado */}
        <div className="p-3 space-y-2 w-[260px]">
          <div>
            <div className="text-sm font-medium text-foreground">
              {selectedDate
                ? format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    .replace(/^\w/, (c) => c.toUpperCase())
                : 'Selecione uma data'}
            </div>
            {selectedDate && (
              <div className="text-xs mt-0.5">
                {selectedHoliday ? (
                  <span className="text-destructive font-medium">Feriado · {selectedHoliday}</span>
                ) : selectedIsBusinessDay ? (
                  <span className="text-muted-foreground">Dia útil</span>
                ) : (
                  <span className="text-muted-foreground">Fim de semana</span>
                )}
              </div>
            )}
          </div>

          {upcoming.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center gap-1.5 mb-1.5">
                <PartyPopper className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Próximos feriados
                </span>
              </div>
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {upcoming.map((h) => (
                    <button
                      key={`${h.name}-${h.date.toISOString()}`}
                      onClick={() => setSelectedDate(h.date)}
                      className={`w-full flex items-center justify-between gap-2 text-xs p-1.5 rounded hover:bg-muted transition-colors ${
                        selectedDate && isSameDay(h.date, selectedDate) ? 'bg-muted' : ''
                      }`}
                    >
                      <span className="truncate text-foreground text-left">{h.name}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {format(h.date, "dd/MM", { locale: ptBR })}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
