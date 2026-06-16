import { useState, useMemo } from 'react';
import { CalendarDays, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransactions } from '@/hooks/useTransactions';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export function HeaderCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { transactions } = useTransactions();

  // Get dates with transactions
  const transactionDates = useMemo(() => {
    const dates: { [key: string]: { receitas: number; despesas: number } } = {};
    
    transactions.forEach((t) => {
      const dateKey = t.date || t.due_date || t.issue_date;
      if (!dateKey) return;
      if (!dates[dateKey]) {
        dates[dateKey] = { receitas: 0, despesas: 0 };
      }
      if (t.type === 'receita') {
        dates[dateKey].receitas += Number(t.amount);
      } else {
        dates[dateKey].despesas += Number(t.amount);
      }
    });
    
    return dates;
  }, [transactions]);

  // Get transactions for selected date
  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return transactions.filter((t) => {
      const d = t.date || t.due_date || t.issue_date;
      return d ? isSameDay(parseISO(d), selectedDate) : false;
    });
  }, [transactions, selectedDate]);

  // Dates with revenues
  const datesWithRevenue = useMemo(() => {
    return Object.entries(transactionDates)
      .filter(([_, data]) => data.receitas > 0)
      .map(([date]) => parseISO(date));
  }, [transactionDates]);

  // Dates with expenses
  const datesWithExpense = useMemo(() => {
    return Object.entries(transactionDates)
      .filter(([_, data]) => data.despesas > 0)
      .map(([date]) => parseISO(date));
  }, [transactionDates]);

  const totals = useMemo(() => {
    return selectedDayTransactions.reduce(
      (acc, t) => {
        if (t.type === 'receita') {
          acc.receitas += Number(t.amount);
        } else {
          acc.despesas += Number(t.amount);
        }
        return acc;
      },
      { receitas: 0, despesas: 0 }
    );
  }, [selectedDayTransactions]);

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
          modifiers={{
            hasRevenue: datesWithRevenue,
            hasExpense: datesWithExpense,
          }}
          modifiersClassNames={{
            hasRevenue: 'has-revenue',
            hasExpense: 'has-expense',
          }}
          className="rounded-t-md border-b"
          classNames={{
            day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 relative",
          }}
          components={{
            DayContent: ({ date }) => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const hasRevenue = transactionDates[dateKey]?.receitas > 0;
              const hasExpense = transactionDates[dateKey]?.despesas > 0;
              
              return (
                <div className="relative w-full h-full flex items-center justify-center">
                  <span>{date.getDate()}</span>
                  {(hasRevenue || hasExpense) && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {hasRevenue && (
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      )}
                      {hasExpense && (
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                      )}
                    </div>
                  )}
                </div>
              );
            },
          }}
        />
        
        {/* Selected day details */}
        <div className="p-3">
          <div className="text-sm font-medium text-foreground mb-2">
            {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : 'Selecione uma data'}
          </div>
          
          {selectedDayTransactions.length > 0 ? (
            <>
              <div className="flex gap-4 mb-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-success font-medium">{formatCurrency(totals.receitas)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-destructive font-medium">{formatCurrency(totals.despesas)}</span>
                </div>
              </div>
              
              <ScrollArea className="max-h-40">
                <div className="space-y-1.5">
                  {selectedDayTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 text-sm p-1.5 rounded bg-muted/50"
                    >
                      {t.type === 'receita' ? (
                        <TrendingUp className="w-3.5 h-3.5 text-success flex-shrink-0" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate text-foreground">{t.description}</span>
                      <span className={`font-medium flex-shrink-0 ${
                        t.type === 'receita' ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(Number(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhuma transação nesta data
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
