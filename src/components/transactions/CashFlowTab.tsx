import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertTriangle, TrendingUp, TrendingDown, Landmark,
  Filter, Search, X, ChevronUp, ChevronDown, ListChecks, CalendarDays,
} from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfYear, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { calcularEncargosAtraso } from '@/lib/financial-utils';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { CashFlowReportModal } from './CashFlowReportModal';
import { TransactionCalendarView } from './TransactionCalendarView';
import { TransactionActionsDialog } from './TransactionActionsDialog';
import { DayTransactionsDialog } from './DayTransactionsDialog';
import { TransactionFormDialog } from './TransactionFormDialog';
import { IconBox } from '@/components/ds';
import { useTransactions } from '@/hooks/useTransactions';
import { useTransactionAttachments } from '@/hooks/useTransactionAttachments';
import type { Transaction, TransactionInsert } from '@/hooks/useTransactions';
import type { Category } from '@/hooks/useCategories';
import type { Bank } from '@/hooks/useBanks';
import type { Contact } from '@/hooks/useContacts';

interface CashFlowTabProps {
  transactions: Transaction[];
  banks: Bank[];
  categories: Category[];
  contacts: Contact[];
  togglePaid: { mutate: (args: { id: string; is_paid: boolean }) => void };
  mode?: 'all' | 'receivables';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr: string) {
  return format(new Date(dateStr + 'T12:00:00'), 'dd/MM/yyyy');
}

function getDayOfWeek(dateStr: string) {
  return format(new Date(dateStr + 'T12:00:00'), 'EEEE', { locale: ptBR });
}

function getStatus(isPaid: boolean, dueDate: string | null): 'pago' | 'pendente' | 'vencido' {
  if (isPaid) return 'pago';
  if (dueDate) {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dueDate < today) return 'vencido';
  }
  return 'pendente';
}

// ─── Column filter components ──────────────────────────────────────

const IS_EMPTY = '__IS_EMPTY_OR_NULL__';

interface CashFlowColumnFilters {
  expected_date?: { start: string; end: string };
  expected_date_empty?: boolean;
  due_date?: { start: string; end: string };
  due_date_empty?: boolean;
  contactIds?: string[];
  eventNames?: string[];
  amounts?: (number | string)[];
  despesaAmounts?: (number | string)[];
  status?: string[];
}

type SortField = 'expected_date' | 'due_date';
type SortOrder = 'asc' | 'desc';

function ColumnFilterIcon({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      {/* w-3 (12px, era 14px) — mesmo ajuste já feito em Lançamentos (21/08/2026). */}
      <Filter className={`w-3 h-3 transition-colors ${active ? 'text-primary' : 'text-muted-foreground/70 hover:text-primary'}`} />
      {active && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
    </span>
  );
}

function DateColumnFilter({ value, onChange, sortField, currentSortField, currentSortOrder, onSort, includeEmpty, onIncludeEmptyChange }: {
  value?: { start: string; end: string };
  onChange: (v?: { start: string; end: string }) => void;
  sortField: SortField;
  currentSortField: SortField;
  currentSortOrder: SortOrder;
  onSort: (field: SortField, order: SortOrder) => void;
  includeEmpty?: boolean;
  onIncludeEmptyChange?: (v: boolean) => void;
}) {
  const [start, setStart] = useState(value?.start || '');
  const [end, setEnd] = useState(value?.end || '');
  const isActive = currentSortField === sortField;

  useEffect(() => {
    setStart(value?.start || '');
    setEnd(value?.end || '');
  }, [value?.start, value?.end]);

  const apply = () => {
    if (start || end) onChange({ start, end });
    else onChange(undefined);
  };
  const clear = () => { setStart(''); setEnd(''); onChange(undefined); onIncludeEmptyChange?.(false); };

  return (
    <div className="space-y-2 p-2 w-56">
      <div className="space-y-0.5 pb-2 border-b border-border/40">
        <button onClick={() => onSort(sortField, 'asc')} className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted ${isActive && currentSortOrder === 'asc' ? 'bg-primary/10 text-primary font-medium' : ''}`}>
          <ChevronUp className="w-3 h-3" /> Mais antigo primeiro
        </button>
        <button onClick={() => onSort(sortField, 'desc')} className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted ${isActive && currentSortOrder === 'desc' ? 'bg-primary/10 text-primary font-medium' : ''}`}>
          <ChevronDown className="w-3 h-3" /> Mais recente primeiro
        </button>
      </div>
      <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs">
        <Checkbox checked={!!includeEmpty} onCheckedChange={(c) => onIncludeEmptyChange?.(!!c)} className="h-3.5 w-3.5" />
        <span className="text-muted-foreground italic">(Vazio)</span>
      </label>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">De</label>
        <Input type="date" value={start} onChange={e => setStart(e.target.value)} max="9999-12-31" className="h-8 text-xs" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Até</label>
        <Input type="date" value={end} onChange={e => setEnd(e.target.value)} max="9999-12-31" className="h-8 text-xs" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={clear}>Limpar</Button>
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={apply}>Aplicar</Button>
      </div>
    </div>
  );
}

function ContactEventMultiFilter({
  columnFilters, setColumnFilters, uniqueContactOptions, uniqueEventOptions,
}: {
  columnFilters: CashFlowColumnFilters;
  setColumnFilters: React.Dispatch<React.SetStateAction<CashFlowColumnFilters>>;
  uniqueContactOptions: { id: string; name: string }[];
  uniqueEventOptions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempContacts, setTempContacts] = useState<string[]>([]);
  const [tempEvents, setTempEvents] = useState<string[]>([]);

  const selectedContacts = open ? tempContacts : (columnFilters.contactIds || []);
  const selectedEvents = open ? tempEvents : (columnFilters.eventNames || []);
  const totalSelected = selectedContacts.length + selectedEvents.length;
  const isActive = totalSelected > 0;

  const filteredContacts = search
    ? uniqueContactOptions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : uniqueContactOptions;
  const filteredEvents = search
    ? uniqueEventOptions.filter(d => d.toLowerCase().includes(search.toLowerCase()))
    : uniqueEventOptions;

  const toggleContact = (id: string) => setTempContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleEvent = (desc: string) => setTempEvents(prev => prev.includes(desc) ? prev.filter(x => x !== desc) : [...prev, desc]);
  const clearAll = () => { setTempContacts([]); setTempEvents([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTempContacts(columnFilters.contactIds || []);
      setTempEvents(columnFilters.eventNames || []);
      setSearch('');
    } else {
      setColumnFilters(prev => {
        const n = { ...prev };
        if (tempContacts.length) n.contactIds = tempContacts; else delete n.contactIds;
        if (tempEvents.length) n.eventNames = tempEvents; else delete n.eventNames;
        return n;
      });
      setSearch('');
    }
    setOpen(nextOpen);
  };

  return (
    <div className="flex items-center gap-0.5">
      <span>Cliente / Fornecedor</span>
      {isActive && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{totalSelected}</Badge>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors">
            <ColumnFilterIcon active={isActive} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {/* (Vazio) option */}
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/40 mb-1">
              <Checkbox checked={selectedContacts.includes(IS_EMPTY)} onCheckedChange={() => toggleContact(IS_EMPTY)} className="h-3.5 w-3.5" />
              <span className="text-muted-foreground italic">(Vazio)</span>
            </label>
            {filteredContacts.length > 0 && (
              <>
                <div className="pt-1 pb-0.5 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Clientes / Fornecedores</div>
                {filteredContacts.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                    <Checkbox checked={selectedContacts.includes(c.id)} onCheckedChange={() => toggleContact(c.id)} className="h-3.5 w-3.5" />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </>
            )}
            {filteredEvents.length > 0 && (
              <>
                <div className="pt-2 pb-0.5 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1">Eventos (sem contato)</div>
                {filteredEvents.map(desc => (
                  <label key={desc} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                    <Checkbox checked={selectedEvents.includes(desc)} onCheckedChange={() => toggleEvent(desc)} className="h-3.5 w-3.5" />
                    <span className="truncate">{desc}</span>
                  </label>
                ))}
              </>
            )}
            {filteredContacts.length === 0 && filteredEvents.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
            )}
          </div>
          {isActive && (
            <div className="p-2 border-t border-border/40">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Limpar ({totalSelected})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NumericMultiFilter({ label, selected, onChange, values }: {
  label: string; selected: (number | string)[]; onChange: (v: (number | string)[]) => void; values: number[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<(number | string)[]>([]);

  const isActive = selected.length > 0;
  const uniqueSorted = useMemo(() => Array.from(new Set(values)).sort((a, b) => a - b), [values]);
  const filtered = search ? uniqueSorted.filter(v => formatCurrency(v).toLowerCase().includes(search.toLowerCase())) : uniqueSorted;
  const toggle = (v: number | string) => setTemp(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  const clearAll = () => { setTemp([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) { setTemp(selected); setSearch(''); }
    else { onChange(temp); setSearch(''); }
    setOpen(nextOpen);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="flex items-center justify-end gap-0.5">
      <span>{label}</span>
      {displayActive && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={isActive} /></button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="end" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar valor..." className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/40 mb-1">
              <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
              <span className="text-muted-foreground italic">(Vazio)</span>
            </label>
            {filtered.length > 0 ? filtered.map(v => (
              <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                <Checkbox checked={displaySelected.includes(v)} onCheckedChange={() => toggle(v)} className="h-3.5 w-3.5" />
                <span className="truncate font-mono tabular-nums">{formatCurrency(v)}</span>
              </label>
            )) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum valor</p>
            )}
          </div>
          {displayActive && (
            <div className="p-2 border-t border-border/40">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Limpar ({displaySelected.length})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatusMultiFilter({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<string[]>([]);
  const options = ['pendente', 'vencido'];
  const labels: Record<string, string> = { pendente: 'Pendente', vencido: 'Vencido' };

  const isActive = selected.length > 0;
  const toggle = (v: string) => setTemp(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setTemp(selected);
    else onChange(temp);
    setOpen(nextOpen);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="flex items-center justify-center gap-0.5">
      <span>Status</span>
      {displayActive && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={isActive} /></button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="center" onOpenAutoFocus={e => e.preventDefault()}>
          {options.map(v => (
            <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
              <Checkbox checked={displaySelected.includes(v)} onCheckedChange={() => toggle(v)} className="h-3.5 w-3.5" />
              <span>{labels[v]}</span>
            </label>
          ))}
          {displayActive && (
            <div className="pt-1 border-t border-border/40 mt-1">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => { setTemp([]); }}>
                <X className="w-3 h-3 mr-1" /> Limpar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function EventoMultiFilter({ selected, onChange, categories }: {
  selected: string[]; onChange: (v: string[]) => void; categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<string[]>([]);

  const isActive = selected.length > 0;
  const filtered = search ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : categories;
  const toggle = (id: string) => setTemp(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const clearAll = () => { setTemp([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) { setTemp(selected); setSearch(''); }
    else { onChange(temp); setSearch(''); }
    setOpen(nextOpen);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="flex items-center gap-0.5">
      <span>Evento Contábil</span>
      {displayActive && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={isActive} /></button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento..." className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/40 mb-1">
              <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
              <span className="text-muted-foreground italic">(Vazio)</span>
            </label>
            {filtered.length > 0 ? filtered.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                <Checkbox checked={displaySelected.includes(c.id)} onCheckedChange={() => toggle(c.id)} className="h-3.5 w-3.5" />
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color || '#3B82F6' }} />
                <span className="truncate">{c.name}</span>
              </label>
            )) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
            )}
          </div>
          {displayActive && (
            <div className="p-2 border-t border-border/40">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Limpar ({displaySelected.length})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export function CashFlowTab({ transactions: transactionsRaw, banks, categories, contacts, togglePaid, mode = 'all' }: CashFlowTabProps) {
  const isReceivables = mode === 'receivables';

  // Pre-filter: in receivables mode, only "A Receber" entries (receita > 0)
  // with Evento Contábil: Honorários Contábeis
  const transactions = useMemo(() => {
    if (!isReceivables) return transactionsRaw;
    return transactionsRaw.filter(
      t => t.type === 'receita' && Number(t.amount) > 0 && t.category?.name === 'Honorários Contábeis'
    );
  }, [transactionsRaw, isReceivables]);

  const [reportOpen, setReportOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Clicar numa transação (lista ou calendário) abre a escolha de ação —
  // mesmas 3 ações de Lançamentos (Editar/Liquidar/Excluir), mesmos diálogos
  // reaproveitados (24/08/2026). O "+N" do calendário abre a lista do dia
  // inteiro, com as 3 ações inline em cada linha.
  const { updateTransaction, deleteTransaction } = useTransactions();
  const { uploadAttachment } = useTransactionAttachments();
  const [actionsTarget, setActionsTarget] = useState<(typeof rows)[number] | null>(null);
  const [moreDateKey, setMoreDateKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'edit' | 'settle'>('edit');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (row: (typeof rows)[number]) => {
    setActionsTarget(null);
    setMoreDateKey(null);
    setEditingTransaction(row as unknown as Transaction);
    setDialogMode('edit');
    setDialogOpen(true);
  };
  const openSettle = (row: (typeof rows)[number]) => {
    setActionsTarget(null);
    setMoreDateKey(null);
    setEditingTransaction(row as unknown as Transaction);
    setDialogMode('settle');
    setDialogOpen(true);
  };
  const openDelete = (row: (typeof rows)[number]) => {
    setActionsTarget(null);
    setMoreDateKey(null);
    setDeleteId(row.id);
  };

  const handleFormSubmit = async (data: TransactionInsert, pendingFiles?: File[]) => {
    if (!editingTransaction) return;
    updateTransaction.mutate({ id: editingTransaction.id, ...data }, {
      onSuccess: async () => {
        if (pendingFiles?.length) {
          for (const file of pendingFiles) await uploadAttachment.mutateAsync({ file, transactionId: editingTransaction.id });
        }
        setDialogOpen(false);
        setEditingTransaction(null);
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;
    deleteTransaction.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  // Global date filter — defaults to Jan 1 of current year → last day of the current month.
  const today = new Date();
  const defaultStart = format(startOfYear(today), 'yyyy-MM-dd');
  const defaultEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  const [globalStartDate, setGlobalStartDate] = useState(defaultStart);
  const [globalEndDate, setGlobalEndDate] = useState(defaultEnd);

  // Column filters
  const [columnFilters, setColumnFilters] = useState<CashFlowColumnFilters>({});
  const [sortField, setSortField] = useState<SortField>(isReceivables ? 'due_date' : 'expected_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
  };

  // Active banks total
  const activeBanks = useMemo(() => banks.filter(b => b.is_active && !b.is_invisible), [banks]);
  const totalBankBalance = useMemo(() => activeBanks.reduce((s, b) => s + Number(b.current_balance), 0), [activeBanks]);

  // Unique options for filters
  const uniqueContactOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      if (t.contact?.name && t.contact_id) map.set(t.contact_id, t.contact.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions]);

  // Interno (Eventos Contábeis): filtro mostra só sub-eventos (macro é cabeçalho
  // de agrupamento, some aqui mas segue visível na tela de cadastro). Cliente
  // (Categorias) não força hierarquia — toda categoria entra.
  const { isInternalCompany } = useActiveCompany();
  const subCategories = useMemo(
    () => categories.filter(c => !isInternalCompany || c.parent_id !== null),
    [categories, isInternalCompany],
  );

  const uniqueEventOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (!t.contact_id && t.description) set.add(t.description);
    }
    return Array.from(set).sort();
  }, [transactions]);

  // Filtered + sorted transactions
  const filtered = useMemo(() => {
    let result = transactions.filter(t => !t.is_paid && (isReceivables ? (t.due_date || t.expected_date) : t.expected_date));

    // Global date filter
    if (globalStartDate || globalEndDate) {
      result = result.filter(t => {
        const dateKey = isReceivables
          ? t.due_date
          : (t.expected_date || t.due_date || t.issue_date);
        if (!dateKey) return true;
        if (globalStartDate && dateKey < globalStartDate) return false;
        if (globalEndDate && dateKey > globalEndDate) return false;
        return true;
      });
    }

    // Column date filters (expected_date)
    if (columnFilters.expected_date || columnFilters.expected_date_empty) {
      const range = columnFilters.expected_date;
      const includeEmpty = !!columnFilters.expected_date_empty;
      result = result.filter(t => {
        const d = t.expected_date || t.due_date || t.issue_date;
        if (includeEmpty && !d) return true;
        if (range) {
          if (!d) return false;
          if (range.start && d < range.start) return false;
          if (range.end && d > range.end) return false;
          return true;
        }
        return !includeEmpty ? true : false;
      });
    }
    if (columnFilters.due_date || columnFilters.due_date_empty) {
      const range = columnFilters.due_date;
      const includeEmpty = !!columnFilters.due_date_empty;
      result = result.filter(t => {
        if (includeEmpty && !t.due_date) return true;
        if (range) {
          if (!t.due_date) return false;
          if (range.start && t.due_date < range.start) return false;
          if (range.end && t.due_date > range.end) return false;
          return true;
        }
        return !includeEmpty ? true : false;
      });
    }

    // Contact / event filters (with IS_EMPTY support)
    const hasContactFilter = columnFilters.contactIds?.length;
    const hasEventFilter = columnFilters.eventNames?.length;
    if (hasContactFilter || hasEventFilter) {
      const contactIds = columnFilters.contactIds || [];
      const eventNames = columnFilters.eventNames || [];
      const includeEmptyContact = contactIds.includes(IS_EMPTY);
      const realContactIds = contactIds.filter(id => id !== IS_EMPTY);

      result = result.filter(t => {
        let matchContact = false;
        let matchEvent = false;

        if (includeEmptyContact && !t.contact_id) matchContact = true;
        if (realContactIds.length && t.contact_id && realContactIds.includes(t.contact_id)) matchContact = true;
        if (eventNames.length && !t.contact_id && eventNames.includes(t.description)) matchEvent = true;

        if (hasContactFilter && hasEventFilter) return matchContact || matchEvent;
        if (hasContactFilter) return matchContact;
        return matchEvent;
      });
    }

    // Evento contábil (category) filter — handled in finalFiltered below

    // Amount filters (receita) with IS_EMPTY support
    if (columnFilters.amounts?.length) {
      const includeEmpty = columnFilters.amounts.includes(IS_EMPTY);
      const realAmounts = columnFilters.amounts.filter(v => v !== IS_EMPTY) as number[];
      result = result.filter(t => {
        if (t.type === 'receita') {
          if (includeEmpty && (t.amount == null)) return true;
          if (realAmounts.length && realAmounts.includes(Number(t.amount))) return true;
          return false;
        }
        return !columnFilters.despesaAmounts?.length;
      });
    }
    // Amount filters (despesa) with IS_EMPTY support
    if (columnFilters.despesaAmounts?.length) {
      const includeEmpty = columnFilters.despesaAmounts.includes(IS_EMPTY);
      const realAmounts = columnFilters.despesaAmounts.filter(v => v !== IS_EMPTY) as number[];
      result = result.filter(t => {
        if (t.type === 'despesa') {
          if (includeEmpty && (t.amount == null)) return true;
          if (realAmounts.length && realAmounts.includes(Number(t.amount))) return true;
          return false;
        }
        return !columnFilters.amounts?.length;
      });
    }

    // Status filter
    if (columnFilters.status?.length) {
      result = result.filter(t => {
        const s = getStatus(t.is_paid, t.due_date);
        return columnFilters.status!.includes(s);
      });
    }

    // Sort
    result.sort((a, b) => {
      const getVal = (t: Transaction) => {
        if (sortField === 'expected_date') return t.expected_date || t.due_date || t.issue_date || '';
        return t.due_date || '';
      };
      const va = getVal(a);
      const vb = getVal(b);
      return sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    return result;
  }, [transactions, globalStartDate, globalEndDate, columnFilters, sortField, sortOrder, isReceivables]);

  // Category filter state (separate from contactEvent)
  const [categoryFilterIds, setCategoryFilterIds] = useState<string[]>([]);

  const finalFiltered = useMemo(() => {
    if (!categoryFilterIds.length) return filtered;
    const includeEmpty = categoryFilterIds.includes(IS_EMPTY);
    const realIds = categoryFilterIds.filter(id => id !== IS_EMPTY);
    return filtered.filter(t => {
      if (includeEmpty && !t.category_id) return true;
      if (realIds.length && t.category_id && realIds.includes(t.category_id)) return true;
      return false;
    });
  }, [filtered, categoryFilterIds]);

  // KPIs from finalFiltered
  const kpis = useMemo(() => {
    let receitasPendentes = 0, despesasPendentes = 0;
    for (const t of finalFiltered) {
      const amt = Number(t.amount);
      if (t.type === 'receita') receitasPendentes += amt;
      else despesasPendentes += amt;
    }
    return { receitasPendentes, despesasPendentes };
  }, [finalFiltered]);

  // Running balance with juros/multa
  const rows = useMemo(() => {
    let saldoAcumulado = totalBankBalance;

    return finalFiltered.map(t => {
      const amt = Number(t.amount);
      const status = getStatus(t.is_paid, t.due_date);
      const isHonorarios = t.category?.name === 'Honorários Contábeis';
      let displayAmount = amt;
      let hasJuros = false;
      let jurosValue = 0;
      let multaValue = 0;
      let diasAtrasoValue = 0;

      // Multa 2% + juros 0,07%/dia desde o dia seguinte ao vencimento — mesma regra
      // enviada ao Sicoob na emissão do boleto (financial-utils.ts). Antes esta tela
      // cobrava 0,15%/dia só a partir do 5º dia, informando ao cliente um valor maior
      // do que o boleto de fato cobra.
      if (t.type === 'receita' && isHonorarios && status === 'vencido' && t.due_date) {
        const encargos = calcularEncargosAtraso(amt, t.due_date);
        if (encargos.temEncargos) {
          multaValue = encargos.multa;
          jurosValue = encargos.juros;
          displayAmount = encargos.total;
          hasJuros = true;
          diasAtrasoValue = encargos.diasAtraso;
        }
      }

      if (t.type === 'receita') {
        saldoAcumulado += amt;
      } else {
        saldoAcumulado -= amt;
      }

      return { ...t, status, displayAmount, hasJuros, originalAmount: amt, saldoAtual: saldoAcumulado, jurosValue, multaValue, diasAtrasoValue };
    });
  }, [finalFiltered, totalBankBalance]);

  // Capital de Giro = last row balance or totalBankBalance
  const capitalDeGiro = rows.length > 0 ? rows[rows.length - 1].saldoAtual : totalBankBalance;

  // Unique receita/despesa amounts for numeric filters
  const receitaAmounts = useMemo(() => finalFiltered.filter(t => t.type === 'receita').map(t => Number(t.amount)), [finalFiltered]);
  const despesaAmounts = useMemo(() => finalFiltered.filter(t => t.type === 'despesa').map(t => Number(t.amount)), [finalFiltered]);

  // Mesma ação do clique no badge de Status da tabela (marcar pago, com modal
  // de confirmação quando há juros/multa) — reaproveitada pelo clique no
  // modo Calendário, pra não duplicar a lógica (22/08/2026).
  const handleRowClick = (row: (typeof rows)[number]) => {
    if (!row.is_paid && row.hasJuros) {
      setConfirmModal({ open: true, row });
    } else {
      togglePaid.mutate({ id: row.id, is_paid: !row.is_paid });
    }
  };

  const calendarItems = useMemo(() => rows.map(row => ({
    id: row.id,
    dateKey: isReceivables ? row.due_date : (row.expected_date || row.due_date),
    label: row.contact?.name ?? row.description,
    type: row.type as 'receita' | 'despesa',
  })), [rows, isReceivables]);

  // Todas as transações do dia clicado no "+N" (o calendário só mostra 3 por célula).
  const dayRows = useMemo(() => {
    if (!moreDateKey) return [];
    return rows.filter(row => (isReceivables ? row.due_date : (row.expected_date || row.due_date)) === moreDateKey);
  }, [rows, moreDateKey, isReceivables]);

  return (
    <div className="space-y-4">
      {/*
        Header: filtro de data global + botão de relatório, dentro de um
        Card — no Figma essa fileira inteira tem fundo --paper/borda --line,
        igual aos blocos vizinhos (KPIs, tabela). Antes flutuava direto no
        cinza da página, achado medindo pixel a pixel a referência (21/08/2026).
      */}
      <Card className="bg-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            {isReceivables && (
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Data de Vencimento</span>
            )}
            <div className="flex items-center gap-2">
              {/*
                Sem ícone de calendário — Figma mostra só os inputs, texto "até"
                entre eles. Continua sendo <input type="date"> de verdade (sem
                popover novo, só a apresentação mudou), mas o indicador nativo
                do navegador (ícone de calendário do Chrome) é escondido via
                ::-webkit-calendar-picker-indicator — senão ele reaparece
                sozinho mesmo sem o ícone que a gente desenha (21/08/2026).
              */}
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={globalStartDate}
                  onChange={e => setGlobalStartDate(e.target.value)}
                  max="9999-12-31"
                  className="h-8 text-xs w-[140px] [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={globalEndDate}
                  onChange={e => setGlobalEndDate(e.target.value)}
                  max="9999-12-31"
                  className="h-8 text-xs w-[140px] [&::-webkit-calendar-picker-indicator]:hidden"
                />
              </div>
              {(globalStartDate !== defaultStart || globalEndDate !== defaultEnd) && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setGlobalStartDate(defaultStart); setGlobalEndDate(defaultEnd); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Toggle Lista/Calendário — mesma lógica de src/pages/FiscalTasks.tsx (22/08/2026). */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={v => v && setViewMode(v as 'list' | 'calendar')}
              className="gap-0.5 rounded-md border border-line bg-bg-2 p-1"
            >
              <ToggleGroupItem value="list" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Lista">
                <ListChecks className="h-[15px] w-[15px]" strokeWidth={1.75} />
              </ToggleGroupItem>
              <ToggleGroupItem value="calendar" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Calendário">
                <CalendarDays className="h-[15px] w-[15px]" strokeWidth={1.75} />
              </ToggleGroupItem>
            </ToggleGroup>
            {/* Sem ícone — Figma mostra só o texto (21/08/2026). */}
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              Gerar Relatório
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isReceivables ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
        {/* Capital de Giro — usa token --action (21/08/2026, era text-blue-500/400 e
            var(--apple-blue) soltos, dívida técnica já registrada). Sem borda-esquerda
            colorida: o Figma não tem esse traço nos 4 cards. */}
        <Card className="bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            {/* Ícone à esquerda, não à direita — medido pixel a pixel no Figma (21/08/2026). */}
            <IconBox tone="accent" icon={<Landmark />} />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Capital de Giro</p>
              <p className={`text-2xl font-extrabold ${capitalDeGiro >= 0 ? 'text-action' : 'text-danger'}`}>
                {formatCurrency(capitalDeGiro)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Entradas */}
        <Card className="bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <IconBox tone="ok" icon={<TrendingUp />} />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entradas</p>
              <p className="text-2xl font-extrabold text-ok">{formatCurrency(kpis.receitasPendentes)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Saídas */}
        {!isReceivables && (
        <Card className="bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <IconBox tone="danger" icon={<TrendingDown />} />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saídas</p>
              <p className="text-2xl font-extrabold text-danger">{formatCurrency(kpis.despesasPendentes)}</p>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Saldos Atuais */}
        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Saldos Atuais</p>
            <div className="space-y-1">
              {activeBanks.map(b => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color || 'hsl(var(--primary))' }} />
                    <span className="text-muted-foreground truncate">{b.name}</span>
                  </div>
                  <span className={`font-semibold tabular-nums ${Number(b.current_balance) >= 0 ? 'text-foreground' : 'text-danger'}`}>
                    {formatCurrency(Number(b.current_balance))}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm border-t border-border/50 pt-1 mt-1">
                <span className="font-semibold text-muted-foreground">Disponível Total</span>
                <span className={`font-bold tabular-nums ${totalBankBalance >= 0 ? 'text-action' : 'text-danger'}`}>
                  {formatCurrency(totalBankBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Grid / Calendário */}
      {viewMode === 'calendar' ? (
        <TransactionCalendarView
          items={calendarItems}
          onItemClick={id => {
            const row = rows.find(r => r.id === id);
            if (row) setActionsTarget(row);
          }}
          onMoreClick={dateKey => setMoreDateKey(dateKey)}
        />
      ) : (
      <Card className="bg-card">
        <CardContent className="p-0">
          <TooltipProvider>
            <div className="overflow-auto max-h-[70vh]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {!isReceivables && (
                    <TableHead className="text-xs whitespace-nowrap">
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="flex items-center gap-0.5 cursor-pointer">
                            <span>Data Prevista</span>
                            <ColumnFilterIcon active={!!columnFilters.expected_date || !!columnFilters.expected_date_empty || sortField === 'expected_date'} />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
                          <DateColumnFilter
                            value={columnFilters.expected_date}
                            onChange={v => setColumnFilters(prev => { const n = { ...prev }; if (v) n.expected_date = v; else delete n.expected_date; return n; })}
                            sortField="expected_date"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                            includeEmpty={!!columnFilters.expected_date_empty}
                            onIncludeEmptyChange={v => setColumnFilters(prev => ({ ...prev, expected_date_empty: v || undefined }))}
                          />
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    )}
                    <TableHead className="text-xs whitespace-nowrap">
                      <ContactEventMultiFilter
                        columnFilters={columnFilters}
                        setColumnFilters={setColumnFilters}
                        uniqueContactOptions={uniqueContactOptions}
                        uniqueEventOptions={uniqueEventOptions}
                      />
                    </TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-right">
                      <NumericMultiFilter
                        label="A Receber"
                        selected={columnFilters.amounts || []}
                        onChange={v => setColumnFilters(prev => { const n = { ...prev }; if (v.length) n.amounts = v; else delete n.amounts; return n; })}
                        values={receitaAmounts}
                      />
                    </TableHead>
                    {!isReceivables && (
                    <TableHead className="text-xs whitespace-nowrap text-right">
                      <NumericMultiFilter
                        label="A Pagar"
                        selected={columnFilters.despesaAmounts || []}
                        onChange={v => setColumnFilters(prev => { const n = { ...prev }; if (v.length) n.despesaAmounts = v; else delete n.despesaAmounts; return n; })}
                        values={despesaAmounts}
                      />
                    </TableHead>
                    )}
                    <TableHead className="text-xs whitespace-nowrap">
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="flex items-center gap-0.5 cursor-pointer">
                            <span>Vencimento</span>
                            <ColumnFilterIcon active={!!columnFilters.due_date || !!columnFilters.due_date_empty || sortField === 'due_date'} />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
                          <DateColumnFilter
                            value={columnFilters.due_date}
                            onChange={v => setColumnFilters(prev => { const n = { ...prev }; if (v) n.due_date = v; else delete n.due_date; return n; })}
                            sortField="due_date"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                            includeEmpty={!!columnFilters.due_date_empty}
                            onIncludeEmptyChange={v => setColumnFilters(prev => ({ ...prev, due_date_empty: v || undefined }))}
                          />
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    <TableHead className="text-xs whitespace-nowrap">
                      <EventoMultiFilter
                        selected={categoryFilterIds}
                        onChange={setCategoryFilterIds}
                        categories={subCategories}
                      />
                    </TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Histórico</TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-right">Saldo Atual</TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-center">
                      <StatusMultiFilter
                        selected={columnFilters.status || []}
                        onChange={v => setColumnFilters(prev => { const n = { ...prev }; if (v.length) n.status = v; else delete n.status; return n; })}
                      />
                    </TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Dia da Semana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isReceivables ? 8 : 10} className="text-center text-muted-foreground py-8">
                        Nenhuma transação encontrada.
                      </TableCell>
                    </TableRow>
                  ) : rows.map(row => (
                    <TableRow
                      key={row.id}
                      className="text-xs cursor-pointer hover:bg-muted/40"
                      onClick={() => setActionsTarget(row)}
                    >
                      {/* Data Prevista */}
                      {!isReceivables && (
                        <TableCell className="font-mono tabular-nums whitespace-nowrap">{row.expected_date ? formatDate(row.expected_date) : '—'}</TableCell>
                      )}

                      {/* Cliente/Fornecedor */}
                      <TableCell className="truncate max-w-[150px]"><Tooltip><TooltipTrigger asChild><span className="truncate block">{row.contact?.name ?? row.description}</span></TooltipTrigger><TooltipContent side="top" className="apple-tooltip"><p>{row.contact?.name ?? row.description}</p></TooltipContent></Tooltip></TableCell>


                      {/* A Receber */}
                      <TableCell className="text-right whitespace-nowrap">
                        {row.type === 'receita' ? (
                          row.hasJuros ? (
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end">
                                <span className="text-muted-foreground text-[10px]">{formatCurrency(row.originalAmount)}</span>
                                <span className="text-warn text-[10px]">J+M: {formatCurrency(row.jurosValue + row.multaValue)}</span>
                                <span className="text-ok font-bold">{formatCurrency(row.displayAmount)}</span>
                              </div>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="w-3.5 h-3.5 text-warn" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Multa 2%: {formatCurrency(row.multaValue)}</p>
                                  <p>Juros 0,07%/dia ({row.diasAtrasoValue} dias): {formatCurrency(row.jurosValue)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <span className="text-ok font-semibold">{formatCurrency(row.originalAmount)}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* A Pagar */}
                      {!isReceivables && (
                      <TableCell className="text-right whitespace-nowrap">
                        {row.type === 'despesa' ? (
                          <span className="text-danger font-semibold">{formatCurrency(row.originalAmount)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      )}

                      {/* Vencimento */}
                      <TableCell className="font-mono tabular-nums whitespace-nowrap">{row.due_date ? formatDate(row.due_date) : '—'}</TableCell>

                      {/* Evento Contábil */}
                      <TableCell className="truncate max-w-[120px]"><Tooltip><TooltipTrigger asChild><span className="truncate block">{row.category?.name ?? '—'}</span></TooltipTrigger><TooltipContent side="top" className="apple-tooltip"><p>{row.category?.name ?? '—'}</p></TooltipContent></Tooltip></TableCell>

                      {/* Histórico */}
                      <TableCell className="truncate max-w-[140px]"><Tooltip><TooltipTrigger asChild><span className="truncate block">{row.notes ?? '—'}</span></TooltipTrigger><TooltipContent side="top" className="apple-tooltip"><p>{row.notes ?? '—'}</p></TooltipContent></Tooltip></TableCell>

                      {/* Saldo Atual */}
                      <TableCell className={`text-right font-bold tabular-nums whitespace-nowrap ${row.saldoAtual < 0 ? 'text-danger' : 'text-foreground'}`}>
                        {formatCurrency(row.saldoAtual)}
                      </TableCell>

                      {/* Status — clique aqui é só o toggle rápido de pago, não abre a
                          escolha de ação (mesmo padrão de antes); por isso para a
                          propagação antes de chegar no onClick da linha. */}
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleRowClick(row)}
                          className="cursor-pointer"
                        >
                          {row.status === 'pago' ? (
                            <Badge className="bg-ok text-white hover:bg-ok text-[10px]">Pago</Badge>
                          ) : row.status === 'vencido' ? (
                            <Badge className="bg-danger text-white hover:bg-danger text-[10px]">Vencido</Badge>
                          ) : (
                            <Badge variant="outline" className="border-warn text-warn text-[10px]">Pendente</Badge>
                          )}
                        </button>
                      </TableCell>

                      {/* Dia da Semana */}
                      <TableCell className="capitalize whitespace-nowrap">
                        {(() => {
                          const d = isReceivables ? row.due_date : (row.expected_date || row.due_date);
                          return d ? getDayOfWeek(d) : '—';
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
      )}

      {/* Modal de Confirmação de Pagamento */}
      <Dialog open={confirmModal.open} onOpenChange={(open) => !open && setConfirmModal({ open: false, row: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          {confirmModal.row && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O cliente <strong>{confirmModal.row.contact?.name ?? confirmModal.row.description}</strong> pagou o valor original ou com juros e multa?
              </p>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    togglePaid.mutate({ id: confirmModal.row!.id, is_paid: true });
                    setConfirmModal({ open: false, row: null });
                  }}
                >
                  Valor Original — {formatCurrency(confirmModal.row.originalAmount)}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    togglePaid.mutate({ id: confirmModal.row!.id, is_paid: true });
                    setConfirmModal({ open: false, row: null });
                  }}
                >
                  Com J+M — {formatCurrency(confirmModal.row.displayAmount)}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Modal — inherits active filters */}
      <CashFlowReportModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        transactions={transactions}
        categories={categories}
        contacts={contacts}
        banks={banks}
        initialStartDate={globalStartDate}
        initialEndDate={globalEndDate}
        initialCategoryIds={categoryFilterIds}
        initialContactIds={columnFilters.contactIds || []}
        mode={mode}
      />

      {/* Clicar numa transação (lista ou pílula do calendário) → escolher ação */}
      <TransactionActionsDialog
        transaction={actionsTarget}
        onOpenChange={(open) => !open && setActionsTarget(null)}
        onEdit={() => actionsTarget && openEdit(actionsTarget)}
        onSettle={() => actionsTarget && openSettle(actionsTarget)}
        onDelete={() => actionsTarget && openDelete(actionsTarget)}
      />

      {/* "+N" do calendário → todas as transações do dia, ações inline */}
      <DayTransactionsDialog
        dateKey={moreDateKey}
        rows={dayRows}
        onOpenChange={(open) => !open && setMoreDateKey(null)}
        onEdit={openEdit}
        onSettle={openSettle}
        onDelete={openDelete}
      />

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTransaction(null); }}
        transaction={editingTransaction}
        categories={categories}
        banks={banks}
        contacts={contacts}
        onSubmit={handleFormSubmit}
        isLoading={updateTransaction.isPending}
        mode={dialogMode}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
