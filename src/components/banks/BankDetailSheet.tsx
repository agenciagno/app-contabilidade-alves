import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Building2, FileBarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BankReportModal } from './BankReportModal';
import { Bank } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { useCategories } from '@/hooks/useCategories';
import { useBankTransactions } from '@/hooks/useBankTransactions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ds';

interface BankDetailSheetProps {
  bank: Bank | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function formatDayLabel(dateStr: string) {
  // dateStr is "dd/mm/yyyy"
  const [d, m, y] = dateStr.split('/');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${weekDays[date.getDay()]}, ${d}/${m}/${y}`;
}

export function BankDetailSheet({ bank, open, onOpenChange }: BankDetailSheetProps) {
  const { contacts } = useContacts();
  const { categories } = useCategories();

  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstOfYear);
  const [endDate, setEndDate] = useState(todayStr);
  const [contactId, setContactId] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [reportOpen, setReportOpen] = useState(false);

  const banks = bank ? [{ id: bank.id, initial_balance: bank.initial_balance, is_active: bank.is_active }] : [];

  const { rows, openingBalance, totalIncome, totalExpense, closingBalance, isLoading } = useBankTransactions(
    {
      bankId: bank?.id ?? 'all',
      startDate: startDate || null,
      endDate: endDate || null,
      contactId: contactId === 'all' ? null : contactId,
      categoryId: categoryId === 'all' ? null : categoryId,
    },
    banks
  );

  const dayGroups = groupByDay(rows).reverse();

  if (!bank) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <SheetHeader className="flex-shrink-0 space-y-0">
          <div className="p-6 pb-4 bg-bg-2 border-b border-line flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: bank.color + '40' }}
            >
              <Building2 className="w-7 h-7" style={{ color: bank.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl font-bold text-ink truncate">{bank.name}</SheetTitle>
              {(bank.bank_code || bank.agency || bank.account_number) && (
                <p className="text-sm text-muted-ink mt-0.5">
                  {[bank.bank_code, bank.agency && `Ag: ${bank.agency}`, bank.account_number && `Cc: ${bank.account_number}`]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
              )}
              <p className={`text-h3-section mt-2 ${closingBalance >= 0 ? 'text-ok' : 'text-danger'}`}>
                {formatCurrency(closingBalance)}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 flex-shrink-0" onClick={() => setReportOpen(true)}>
              <FileBarChart2 className="w-4 h-4" />
              Relatório
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 px-6 py-4">
            <div className="bg-bg rounded-lg p-3">
              <p className="text-kicker uppercase text-muted-ink">Saldo Inicial do Período</p>
              <p className="font-semibold text-sm text-ink mt-1">{formatCurrency(openingBalance)}</p>
            </div>
            <div className="bg-bg rounded-lg p-3">
              <p className="text-kicker uppercase text-muted-ink">Entradas</p>
              <p className="font-semibold text-sm text-ok mt-1">+{formatCurrency(totalIncome)}</p>
            </div>
            <div className="bg-bg rounded-lg p-3">
              <p className="text-kicker uppercase text-muted-ink">Saídas</p>
              <p className="font-semibold text-sm text-danger mt-1">-{formatCurrency(totalExpense)}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-line flex-shrink-0">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-ink-2">Data Início</Label>
              <DateField value={startDate} onChange={setStartDate} min="1900-01-01" max="9999-12-31" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-2">Data Fim</Label>
              <DateField value={endDate} onChange={setEndDate} min="1900-01-01" max="9999-12-31" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-2">Cliente/Fornecedor</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Todos os clientes/fornecedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-2">Evento Contábil</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Todos os eventos contábeis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Statement grouped by day */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              {/* Closing balance (top, since newest first) */}
              {rows.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-bg-2">
                  <span className="text-xs text-ink font-bold">Saldo Final do Período</span>
                  <span className="text-xs font-bold text-ink">{formatCurrency(closingBalance)}</span>
                </div>
              )}

              {dayGroups.length === 0 ? (
                <div className="text-center text-muted-ink py-8 text-sm">
                  Nenhuma movimentação encontrada neste período
                </div>
              ) : (
                dayGroups.map((group) => (
                  <div key={group.dateRaw} className="border-t border-line-2">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-bg-2">
                      <span className="text-xs font-semibold text-ink">{group.dateLabel}</span>
                      <span className={`text-xs font-bold ${group.dayBalance >= 0 ? 'text-ok' : 'text-danger'}`}>
                        Saldo {formatCurrency(group.dayBalance)}
                      </span>
                    </div>
                    {/* Day transactions */}
                    <div className="divide-y divide-line-2">
                      {group.rows.map((row: any) => (
                        <div key={row.id} className="flex items-center gap-3 px-3 py-2 hover:bg-bg-2 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink truncate">{row.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {row.contact_name && (
                                <span className="text-[11px] text-muted-ink truncate">{row.contact_name}</span>
                              )}
                              {row.category_name && (
                                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{row.category_name}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-semibold ${row.type === 'receita' ? 'text-ok' : 'text-danger'}`}>
                              {row.type === 'receita' ? '+' : '-'}{formatCurrency(row.amount)}
                            </p>
                            <p className="text-[11px] text-muted-ink">{formatCurrency(row.running_balance)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {/* Opening balance (bottom, since newest first) */}
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-line-2">
                <span className="text-xs text-muted-ink italic">Saldo Inicial do Período</span>
                <span className="text-xs font-semibold text-ink">{formatCurrency(openingBalance)}</span>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <BankReportModal
      open={reportOpen}
      onOpenChange={setReportOpen}
      banks={[bank]}
    />
    </>
  );
}

