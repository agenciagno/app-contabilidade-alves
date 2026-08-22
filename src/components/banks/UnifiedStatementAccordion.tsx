import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  const weekDays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${weekDays[date.getDay()]}, ${Number(d)} de ${months[date.getMonth()]} de ${y}`;
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

// Extrato Unificado — antes era um Accordion que abria sob demanda; no Figma
// é um card sempre aberto na coluna principal (22/08/2026), estrutura
// diferente da anterior, não só repintura. Mesma fonte de dado (useBankTransactions).
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
    <div className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="flex items-center gap-3 p-5 pb-4">
        <h2 className="text-h4-card text-ink">Extrato Unificado</h2>
        <Badge variant="secondary" className="text-xs font-normal">{rows.length} lançamentos</Badge>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-9 w-[140px] border-line bg-paper text-ui [&::-webkit-calendar-picker-indicator]:hidden"
            min="1900-01-01" max="9999-12-31"
          />
          <span className="text-ui text-muted-ink">a</span>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-9 w-[140px] border-line bg-paper text-ui [&::-webkit-calendar-picker-indicator]:hidden"
            min="1900-01-01" max="9999-12-31"
          />
        </div>

        <Select value={bankId} onValueChange={setBankId}>
          <SelectTrigger className="h-9 w-auto min-w-[140px] border-line bg-paper text-ui">
            <span className="text-muted-ink">Banco:</span>&nbsp;<SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {banks.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={contactId} onValueChange={setContactId}>
          <SelectTrigger className="h-9 w-auto min-w-[190px] border-line bg-paper text-ui">
            <span className="text-muted-ink">Cliente/Fornecedor:</span>&nbsp;<SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {contacts.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-auto min-w-[170px] border-line bg-paper text-ui">
            <span className="text-muted-ink">Evento Contábil:</span>&nbsp;<SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo — 3 colunas simples, sem caixa/borda (Figma não usa card aqui) */}
      <div className="grid grid-cols-3 gap-3 border-t border-line-2 px-5 py-4">
        <div>
          <p className="text-kicker uppercase text-muted-ink-2">Saldo Inicial</p>
          <p className="mt-1 font-mono text-ui-strong text-ink">{formatCurrency(openingBalance)}</p>
        </div>
        <div>
          <p className="text-kicker uppercase text-muted-ink-2">Total Entradas</p>
          <p className="mt-1 font-mono text-ui-strong text-ok">+{formatCurrency(totalIncome)}</p>
        </div>
        <div>
          <p className="text-kicker uppercase text-muted-ink-2">Total Saídas</p>
          <p className="mt-1 font-mono text-ui-strong text-danger">-{formatCurrency(totalExpense)}</p>
        </div>
      </div>

      {/* Extrato agrupado por dia */}
      {isLoading ? (
        <div className="space-y-2 p-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div>
          {rows.length > 0 && (
            <div className="flex items-center justify-between border-t border-line-2 px-5 py-3">
              <span className="text-ui-strong text-ink">Saldo Final do Período</span>
              <span className="font-mono text-ui-strong text-ink">{formatCurrency(closingBalance)}</span>
            </div>
          )}

          {dayGroups.length === 0 ? (
            <div className="py-12 text-center text-body text-muted-ink">
              Nenhuma movimentação encontrada neste período
            </div>
          ) : (
            dayGroups.map((group) => (
              <div key={group.dateRaw}>
                {/*
                  Faixa do separador de dia — bg-bg-2 (token, com variante dark
                  automática via CSS var), nunca hex literal. No Figma essa
                  faixa tinha um cinza-claro digitado à mão que sumia no modo
                  escuro atrás de texto quase branco (achado 19/08/2026).
                */}
                <div className="flex items-center justify-between bg-bg-2 px-5 py-2">
                  <span className="text-body-sm capitalize text-muted-ink">{group.dateLabel}</span>
                  <span className="text-body-sm text-muted-ink">saldo do dia: {formatCurrency(group.dayBalance)}</span>
                </div>
                <div className="divide-y divide-line-2">
                  {group.rows.map((row: any) => {
                    const color = row.bank_id ? bankColorMap[row.bank_id] : undefined;
                    return (
                      <div key={row.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body text-ink">{row.description}</p>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-meta text-muted-ink">
                            {row.bank_name && (
                              <>
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color || '#888' }} />
                                <span className="shrink-0">{row.bank_name}</span>
                              </>
                            )}
                            {row.bank_name && row.contact_name && <span className="shrink-0">·</span>}
                            {row.contact_name && <span className="truncate">{row.contact_name}</span>}
                          </div>
                        </div>
                        {row.category_name && (
                          <span className="shrink-0 whitespace-nowrap rounded-pill bg-bg-2 px-2 py-0.5 text-meta text-muted-ink">
                            {row.category_name}
                          </span>
                        )}
                        <div className="shrink-0 text-right">
                          <p className={`font-mono text-body-sm font-semibold ${row.type === 'receita' ? 'text-ok' : 'text-danger'}`}>
                            {row.type === 'receita' ? '+' : '-'}{formatCurrency(row.amount)}
                          </p>
                          <p className="font-mono text-meta text-muted-ink">{formatCurrency(row.running_balance)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <div className="flex items-center justify-between border-t border-line-2 px-5 py-3">
            <span className="text-body-sm text-muted-ink">Saldo Inicial do Período</span>
            <span className="font-mono text-ui-strong text-ink">{formatCurrency(openingBalance)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
