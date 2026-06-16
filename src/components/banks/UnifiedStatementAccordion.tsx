import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, List } from 'lucide-react';
import { Bank } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { useCategories } from '@/hooks/useCategories';
import { useBankTransactions } from '@/hooks/useBankTransactions';

interface UnifiedStatementAccordionProps {
  banks: Bank[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface DayGroup {
  dateLabel: string;
  dateRaw: string;
  rows: any[];
  dayBalance: number;
}

function formatDayLabel(dateStr: string) {
  const [d, m, y] = dateStr.split('/');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${weekDays[date.getDay()]}, ${d}/${m}/${y}`;
}

function groupByDay(rows: any[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let currentDate = '';
  let currentGroup: DayGroup | null = null;

  for (const row of rows) {
    if (row.date !== currentDate) {
      currentDate = row.date;
      currentGroup = {
        dateLabel: formatDayLabel(row.date),
        dateRaw: row.date,
        rows: [],
        dayBalance: 0,
      };
      groups.push(currentGroup);
    }
    currentGroup!.rows.push(row);
    currentGroup!.dayBalance = row.running_balance;
  }

  return groups;
}

export function UnifiedStatementAccordion({ banks }: UnifiedStatementAccordionProps) {
  const { contacts } = useContacts();
  const { categories } = useCategories();

  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstOfYear);
  const [endDate, setEndDate] = useState(todayStr);
  const [contactId, setContactId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [bankId, setBankId] = useState('all');

  // Exclude invisible banks from unified statement
  const visibleBanks = banks.filter(b => !b.is_invisible);
  const banksList = visibleBanks.map(b => ({ id: b.id, initial_balance: b.initial_balance, is_active: b.is_active }));

  const { rows, openingBalance, totalIncome, totalExpense, closingBalance, isLoading } = useBankTransactions(
    {
      bankId: bankId as string,
      startDate: startDate || null,
      endDate: endDate || null,
      contactId: contactId === 'all' ? null : contactId,
      categoryId: categoryId === 'all' ? null : categoryId,
    },
    banksList
  );

  const bankColorMap = banks.reduce<Record<string, string>>((acc, b) => {
    acc[b.id] = b.color;
    return acc;
  }, {});

  const dayGroups = groupByDay(rows).reverse();

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="unified" className="border border-border/50 rounded-xl bg-card overflow-hidden">
        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <List className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground text-base">Extrato Unificado</span>
            <Badge variant="secondary" className="text-xs">{rows.length} lançamentos</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          {/* Filters */}
          <div className="space-y-3 mt-2 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="pl-9 text-sm"
                  min="1900-01-01" max="9999-12-31"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="pl-9 text-sm"
                  min="1900-01-01" max="9999-12-31"
                />
              </div>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Todos os bancos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os bancos</SelectItem>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Todos os eventos contábeis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground">Saldo Inicial</p>
              <p className="font-semibold text-sm mt-1">{formatCurrency(openingBalance)}</p>
            </div>
            <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
              <p className="text-xs text-muted-foreground">Total Entradas</p>
              <p className="font-semibold text-sm text-green-500 mt-1">+{formatCurrency(totalIncome)}</p>
            </div>
            <div className="bg-destructive/5 rounded-lg p-3 border border-destructive/20">
              <p className="text-xs text-muted-foreground">Total Saídas</p>
              <p className="font-semibold text-sm text-destructive mt-1">-{formatCurrency(totalExpense)}</p>
            </div>
          </div>

          {/* Statement grouped by day */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="space-y-1">
              {/* Closing balance (top, since newest first) */}
              {rows.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-primary/5 rounded-lg border-2 border-primary/20">
                  <span className="text-xs text-muted-foreground italic font-bold">Saldo Final do Período</span>
                  <span className="text-xs font-bold">{formatCurrency(closingBalance)}</span>
                </div>
              )}

              {dayGroups.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  Nenhuma movimentação encontrada neste período
                </div>
              ) : (
                dayGroups.map((group) => (
                  <div key={group.dateRaw} className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border/30">
                      <span className="text-xs font-semibold text-foreground">{group.dateLabel}</span>
                      <span className={`text-xs font-bold ${group.dayBalance >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        Saldo {formatCurrency(group.dayBalance)}
                      </span>
                    </div>
                    <div className="divide-y divide-border/30">
                      {group.rows.map((row: any) => {
                        const color = row.bank_id ? bankColorMap[row.bank_id] : undefined;
                        return (
                          <div key={row.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{row.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {row.bank_name && (
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color || '#888' }} />
                                    <span className="text-[11px] text-muted-foreground">{row.bank_name}</span>
                                  </div>
                                )}
                                {row.contact_name && (
                                  <span className="text-[11px] text-muted-foreground truncate">{row.contact_name}</span>
                                )}
                                {row.category_name && (
                                  <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{row.category_name}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-xs font-semibold ${row.type === 'receita' ? 'text-green-500' : 'text-destructive'}`}>
                                {row.type === 'receita' ? '+' : '-'}{formatCurrency(row.amount)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{formatCurrency(row.running_balance)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* Opening balance (bottom, since newest first) */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-lg">
                <span className="text-xs text-muted-foreground italic">Saldo Inicial do Período</span>
                <span className="text-xs font-semibold">{formatCurrency(openingBalance)}</span>
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
