import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Plus, Upload, Pencil, Trash2, TrendingUp, TrendingDown, Receipt,
  Download, FileSpreadsheet, FileText, AlertTriangle, Landmark,
  BarChart3, CalendarCheck, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Building2, CheckCircle2, Search, Filter, X, ArrowUpDown, CircleDollarSign, ArrowLeftRight
} from 'lucide-react';
import { useTransactions, Transaction, TransactionInsert } from '@/hooks/useTransactions';
import { useServerTransactions, useTransactionKPIs, useDistinctTransactionValues, PAGE_SIZE, ServerFilters, IS_EMPTY } from '@/hooks/useServerTransactions';
import { isEffectivelyPaid } from '@/lib/financial-utils';
import { useCategories } from '@/hooks/useCategories';
import { useBanks } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { useTransactionAttachments } from '@/hooks/useTransactionAttachments';
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog';
import { ImportSpreadsheetDialog } from '@/components/transactions/ImportSpreadsheetDialog';
import { PeriodFilter, getDateRangeFromPeriod } from '@/components/filters/UnifiedFilterBox';
import { exportToCSV, exportToPDF, ReportTransaction } from '@/hooks/useReportData';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BulkEditDialog } from '@/components/transactions/BulkEditDialog';
import { BulkSettleDialog } from '@/components/transactions/BulkSettleDialog';
import { TransferFormDialog, TransferInput } from '@/components/transactions/TransferFormDialog';
import {
  startOfMonth, endOfMonth, isWithinInterval, parseISO, format
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateShort(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return format(new Date(dateStr + 'T12:00:00'), 'dd/MM/yy');
}

type SortField = 'issue_date' | 'due_date' | 'expected_date' | 'date';
type SortOrder = 'asc' | 'desc';

interface ColumnFilters {
  issue_date?: { start: string; end: string };
  issue_date_empty?: boolean;
  due_date?: { start: string; end: string };
  due_date_empty?: boolean;
  expected_date?: { start: string; end: string };
  expected_date_empty?: boolean;
  date?: { start: string; end: string };
  date_empty?: boolean;
  contactIds?: string[];
  eventNames?: string[];
  status?: string;
  amounts?: (number | string)[];
  paidAmounts?: (number | string)[];
}

// Column filter popover for date columns
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
        <button
          onClick={() => onSort(sortField, 'asc')}
          className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted ${isActive && currentSortOrder === 'asc' ? 'bg-primary/10 text-primary font-medium' : ''}`}
        >
          <ChevronUp className="w-3 h-3" /> Mais antigo primeiro
        </button>
        <button
          onClick={() => onSort(sortField, 'desc')}
          className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted ${isActive && currentSortOrder === 'desc' ? 'bg-primary/10 text-primary font-medium' : ''}`}
        >
          <ChevronDown className="w-3 h-3" /> Mais recente primeiro
        </button>
      </div>
      <label className="flex items-center gap-2 px-1 py-1 cursor-pointer text-xs">
        <Checkbox checked={!!includeEmpty} onCheckedChange={(c) => onIncludeEmptyChange?.(!!c)} className="h-3.5 w-3.5" />
        <span className="italic text-muted-foreground">(Vazio)</span>
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

function TextColumnFilter({ values, selected, onChange }: { values: string[]; selected?: string; onChange: (v?: string) => void }) {
  return (
    <div className="space-y-1 p-2 w-48 max-h-60 overflow-auto">
      <button onClick={() => onChange(undefined)} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted ${!selected ? 'bg-primary/10 text-primary font-medium' : ''}`}>
        Todos
      </button>
      {values.map(v => (
        <button key={v} onClick={() => onChange(v)} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted truncate ${selected === v ? 'bg-primary/10 text-primary font-medium' : ''}`}>
          {v}
        </button>
      ))}
    </div>
  );
}

function NumericMultiFilter({
  label, selected, onChange, values, onOpenChange, loading,
}: {
  label: string;
  selected: (number | string)[];
  onChange: (v: (number | string)[]) => void;
  values: number[];
  onOpenChange?: (open: boolean) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<(number | string)[]>([]);

  const isActive = selected.length > 0;

  const uniqueSorted = useMemo(() => {
    const set = new Set(values);
    return Array.from(set).sort((a, b) => a - b);
  }, [values]);

  const filtered = search
    ? uniqueSorted.filter(v => formatCurrency(v).toLowerCase().includes(search.toLowerCase()))
    : uniqueSorted;

  const toggle = (v: number | string) => {
    setTemp(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };

  const clearAll = () => { setTemp([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTemp(selected);
      setSearch('');
    } else {
      onChange(temp);
      setSearch('');
    }
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };


  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="flex items-center justify-end gap-0.5">
      <span>{label}</span>
      {displayActive && (
        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors">
            <ColumnFilterIcon active={isActive} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="end" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar valor..." className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/30 mb-1">
              <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
              <span className="truncate italic text-muted-foreground">(Vazio)</span>
            </label>
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
            ) : filtered.length > 0 ? filtered.map(v => (
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

function CategoryMultiFilter({
  selected, onChange, categories,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  categories: { id: string; name: string; color: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<string[]>([]);

  const isActive = selected.length > 0;

  const filtered = search
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const toggle = (id: string) => {
    setTemp(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const clearAll = () => { setTemp([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTemp(selected);
      setSearch('');
    } else {
      onChange(temp);
      setSearch('');
    }
    setOpen(nextOpen);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant={isActive ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 relative">
              <Receipt className="w-4 h-4" />
              {isActive && (
                <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold">{selected.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Evento Contábil</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
        <div className="p-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento..." className="h-7 text-xs pl-7" autoFocus />
          </div>
        </div>
        <div className="max-h-60 overflow-auto p-1">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/30 mb-1">
            <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
            <span className="truncate italic text-muted-foreground">(Vazio)</span>
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
  );
}

function ColumnFilterIcon({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <Filter className={`w-3.5 h-3.5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground/70 hover:text-primary'}`} />
      {active && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </span>
  );
}

function ContactColumnFilter({
  columnFilters, setColumnFilters, uniqueContactOptions,
}: {
  columnFilters: ColumnFilters;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFilters>>;
  uniqueContactOptions: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempContacts, setTempContacts] = useState<string[]>([]);

  const selectedContacts = open ? tempContacts : (columnFilters.contactIds || []);
  const totalSelected = selectedContacts.length;
  const isActive = totalSelected > 0;

  const filteredContacts = search
    ? uniqueContactOptions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : uniqueContactOptions;

  const toggleContact = (id: string) => {
    setTempContacts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const clearAll = () => {
    setTempContacts([]);
    setSearch('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTempContacts(columnFilters.contactIds || []);
      setSearch('');
    } else {
      setColumnFilters(prev => {
        const n = { ...prev };
        if (tempContacts.length) n.contactIds = tempContacts; else delete n.contactIds;
        delete n.eventNames;
        return n;
      });
      setSearch('');
    }
    setOpen(nextOpen);
  };

  return (
    <div className="flex items-center gap-0.5">
      <span>Cliente</span>
      {isActive && (
        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{totalSelected}</Badge>
      )}
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
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-7 text-xs pl-7"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/30 mb-1">
              <Checkbox
                checked={selectedContacts.includes(IS_EMPTY)}
                onCheckedChange={() => toggleContact(IS_EMPTY)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate italic text-muted-foreground">(Vazio)</span>
            </label>
            {filteredContacts.length > 0 ? (
              filteredContacts.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                  <Checkbox
                    checked={selectedContacts.includes(c.id)}
                    onCheckedChange={() => toggleContact(c.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))
            ) : (
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

function EventoContabilColumnFilter({
  selected, onChange, categories,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  categories: { id: string; name: string; color: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<string[]>([]);

  const isActive = selected.length > 0;

  const filtered = search
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const toggle = (id: string) => {
    setTemp(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const clearAll = () => { setTemp([]); setSearch(''); };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTemp(selected);
      setSearch('');
    } else {
      onChange(temp);
      setSearch('');
    }
    setOpen(nextOpen);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="flex items-center gap-0.5">
      <span>Evento Contábil</span>
      {displayActive && (
        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>
      )}
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
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento..." className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/30 mb-1">
              <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
              <span className="truncate italic text-muted-foreground">(Vazio)</span>
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

// Skeleton rows for loading state
function TableSkeleton() {
  return (
    <div className="divide-y divide-border/30">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[24px_minmax(120px,1fr)_minmax(120px,1fr)_88px_88px_88px_80px_100px_100px_90px] gap-2 px-4 py-3 items-center">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-4 w-16 mx-auto" />
          <Skeleton className="h-4 w-16 mx-auto" />
          <Skeleton className="h-4 w-16 mx-auto" />
          <Skeleton className="h-6 w-14 mx-auto rounded-full" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-16 mx-auto" />
        </div>
      ))}
    </div>
  );
}

// Pagination controls
function PaginationControls({ currentPage, totalPages, totalCount, onPageChange, isFetching }: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  isFetching: boolean;
}) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-t border-border/40 gap-2">
      <span className="text-xs text-muted-foreground">
        {totalCount} transação(ões) • Página {currentPage} de {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={currentPage === 1 || isFetching}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="w-3 h-3" /> Anterior
        </Button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={currentPage === p ? 'default' : 'outline'}
              size="sm"
              className="h-7 w-7 text-xs p-0"
              disabled={isFetching}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={currentPage === totalPages || isFetching}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Próxima <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [bankFilter, setBankFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [currentPage, setCurrentPage] = useState(1);

  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Keep useTransactions for mutations only
  const {
    createTransaction, updateTransaction, deleteTransaction,
    togglePaid, bulkSettleWithDate, bulkCreateTransactions, createTransfer
  } = useTransactions();

  const { categories, createCategory } = useCategories();
  const { banks, createBank } = useBanks();
  const { contacts, createContact } = useContacts();
  const { uploadAttachment } = useTransactionAttachments();

  // Build server filters object
  const invisibleBankIds = useMemo(() => banks.filter(b => b.is_invisible).map(b => b.id), [banks]);

  const serverFilters: ServerFilters = useMemo(() => ({
    type: typeFilter,
    categoryIds: categoryFilters.length > 0 ? categoryFilters : undefined,
    bankId: bankFilter,
    searchTerm: searchTerm || undefined,
    invisibleBankIds: invisibleBankIds.length > 0 ? invisibleBankIds : undefined,
    columnFilters,
    sortField,
    sortOrder,
  }), [typeFilter, categoryFilters, bankFilter, searchTerm, invisibleBankIds, columnFilters, sortField, sortOrder]);

  // Server-side paginated data
  const { transactions, totalCount, totalPages, isLoading, isFetching } = useServerTransactions(currentPage, serverFilters);

  // Clamp page when it exceeds total pages (after filters reduce result set).
  // Does NOT auto-reset to page 1 when filters change — user stays where they are.
  useEffect(() => {
    if (!isLoading && totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage, isLoading]);


  // Independent KPIs (no pagination)
  const { kpis } = useTransactionKPIs(serverFilters);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'edit' | 'settle'>('edit');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkSettleOpen, setBulkSettleOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<'receita' | 'despesa'>('receita');
  const [importOpen, setImportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage]);

  // Bank totals for KPI cards
  const bankTotals = useMemo(() => {
    const activeBanks = banks.filter(b => b.is_active && !b.is_invisible);
    const totalBalance = activeBanks.reduce((sum, b) => sum + Number(b.current_balance), 0);
    return { totalBalance };
  }, [banks]);

  // BI Ticker — uses allTransactions from original hook for global metrics
  const biMetrics = useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

    return {
      contasEmAtraso: kpis.contasEmAtraso,
      receitasEmAtraso: kpis.receitasEmAtraso,
      capitalDeGiroMes: bankTotals.totalBalance + kpis.receitasPendentes - kpis.despesasPendentes,
      capitalDeGiroHoje: bankTotals.totalBalance + kpis.receitasPendentes - kpis.despesasPendentes,
      lucroPrevisto: (kpis.receitasPagas + kpis.receitasPendentes) - (kpis.despesasPagas + kpis.despesasPendentes),
      acumuladoReceitas: kpis.receitasPagas,
      acumuladoDespesas: kpis.despesasPagas,
    };
  }, [kpis, bankTotals]);

  // Contact options for the multi-filter (from contacts list, not transactions)
  const uniqueContactOptions = useMemo(() => {
    return contacts
      .filter(c => c.is_active)
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  // Category options for the Evento Contábil column filter
  const categoryOptions = useMemo(() => {
    return categories.map(c => ({ id: c.id, name: c.name, color: c.color || '#3B82F6' }));
  }, [categories]);

  // Distinct values for NumericMultiFilter (full dataset, fetched only when popover opens)
  const [openAmountFilter, setOpenAmountFilter] = useState<'amount' | 'paid_amount' | null>(null);
  const { values: distinctAmounts, isFetching: amountsFetching } = useDistinctTransactionValues('amount', serverFilters, openAmountFilter === 'amount');
  const { values: distinctPaidAmounts, isFetching: paidAmountsFetching } = useDistinctTransactionValues('paid_amount', serverFilters, openAmountFilter === 'paid_amount');

  const uniqueStatuses = ['Pago', 'Pendente'];


  const handleSubmit = async (data: TransactionInsert, pendingFiles?: File[], shouldClose?: boolean) => {
    if (editingTransaction) {
      updateTransaction.mutate({ id: editingTransaction.id, ...data }, {
        onSuccess: async () => {
          if (pendingFiles?.length) for (const file of pendingFiles) await uploadAttachment.mutateAsync({ file, transactionId: editingTransaction.id });
          setDialogOpen(false); setEditingTransaction(null);
        }
      });
    } else {
      createTransaction.mutate(data, {
        onSuccess: async (newTransaction) => {
          if (pendingFiles?.length) for (const file of pendingFiles) await uploadAttachment.mutateAsync({ file, transactionId: newTransaction.id });
          if (shouldClose) {
            setDialogOpen(false);
          } else {
            setFormResetKey(k => k + 1);
          }
        }
      });
    }
  };

  const handleEdit = (transaction: Transaction) => { setEditingTransaction(transaction); setDialogMode('edit'); setDialogOpen(true); };
  const handleSettle = (transaction: Transaction) => { setEditingTransaction(transaction); setDialogMode('settle'); setDialogOpen(true); };
  const handleDelete = () => { if (deleteId) deleteTransaction.mutate(deleteId, { onSuccess: () => setDeleteId(null) }); };
  const handleNewTransaction = (type: 'receita' | 'despesa') => { setDefaultType(type); setEditingTransaction(null); setDialogMode('edit'); setDialogOpen(true); };

  const handleSortDirect = (field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(transactions.map(t => t.id)));
  };
  const handleBulkPay = () => {
    if (selectedIds.size === 0) return;
    setBulkSettleOpen(true);
  };
  const handleBulkSettleConfirm = async (paymentDate: string) => {
    await bulkSettleWithDate.mutateAsync(
      { ids: Array.from(selectedIds), paymentDate },
    );
    setSelectedIds(new Set());
    setBulkSettleOpen(false);
  };
  const handleBulkDelete = async () => {
    for (const id of selectedIds) await deleteTransaction.mutateAsync(id);
    setSelectedIds(new Set()); setBulkDeleteConfirm(false);
  };

  const totals = { receitas: kpis.receitasPagas + kpis.receitasPendentes, despesas: kpis.despesasPagas + kpis.despesasPendentes };

  const updateColumnFilter = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[key]; else next[key] = value;
      return next;
    });
  };

  const hasActiveColumnFilters = Object.keys(columnFilters).length > 0;

  const tableScrollRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const exportTransactions = () => transactions.map(t => ({
    id: t.id, description: t.description, amount: Number(t.amount), type: t.type as 'receita' | 'despesa',
    date: t.date, is_paid: t.is_paid,
    category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color || '#6B7280' } : null,
    bank: t.bank ? { id: t.bank.id, name: t.bank.name, color: t.bank.color || '#3B82F6' } : null,
    contact: t.contact ? { id: t.contact.id, name: t.contact.name, type: t.contact.type } : null,
  })) as ReportTransaction[];


  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* ── Header ── */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between py-4 gap-3 min-w-0">
        <div className="space-y-1 shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Movimentações.</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-4 h-4" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToCSV(exportTransactions())} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { exportToPDF(exportTransactions(), totals); }} className="gap-2">
                <FileText className="w-4 h-4" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Importar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="w-4 h-4" /> Transferência
          </Button>
          <Button size="sm" onClick={() => handleNewTransaction('receita')} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
            <Plus className="w-4 h-4" /> Nova Movimentação
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
        <Card className="border-l-2 border-l-emerald-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">A Receber</p>
            </div>
            <p className="text-base sm:text-lg font-bold text-emerald-500 truncate">{formatCurrency(kpis.receitasPendentes)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Recebido: {formatCurrency(kpis.receitasPagas)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-red-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">A Pagar</p>
            </div>
            <p className="text-base sm:text-lg font-bold text-red-500 truncate">{formatCurrency(kpis.despesasPendentes)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Pago: {formatCurrency(kpis.despesasPagas)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-primary">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Landmark className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">Saldo Disponível</p>
            </div>
            <p className={`text-base sm:text-lg font-bold truncate ${bankTotals.totalBalance >= 0 ? 'text-primary' : 'text-red-500'}`}>{formatCurrency(bankTotals.totalBalance)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total bancos visíveis</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-red-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">Em Atraso</p>
            </div>
            <p className="text-sm font-bold text-orange-400">⬇ {formatCurrency(biMetrics.receitasEmAtraso)}</p>
            <p className="text-sm font-bold text-red-500">⬆ {formatCurrency(biMetrics.contasEmAtraso)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-blue-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">Capital de Giro</p>
            </div>
            <p className={`text-base sm:text-lg font-bold truncate ${biMetrics.capitalDeGiroMes >= 0 ? 'text-blue-400' : 'text-red-500'}`}>{formatCurrency(biMetrics.capitalDeGiroMes)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-emerald-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">Lucro Previsto</p>
            </div>
            <p className={`text-base sm:text-lg font-bold truncate ${biMetrics.lucroPrevisto >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(biMetrics.lucroPrevisto)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(), 'MMMM', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-amber-500">
          <CardContent className="px-3 py-[10px] min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <CalendarCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">Realizado</p>
            </div>
            <p className={`text-base sm:text-lg font-bold truncate ${biMetrics.acumuladoReceitas - biMetrics.acumuladoDespesas >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(biMetrics.acumuladoReceitas - biMetrics.acumuladoDespesas)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(), 'MMMM', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ── */}
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={searchOpen ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchTerm(''); }}>
                <Search className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pesquisar</TooltipContent>
          </Tooltip>
          {searchOpen && (
            <Input
              autoFocus
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Pesquisar..."
              className="h-8 w-32 sm:w-48 text-xs"
            />
          )}

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant={bankFilter !== 'all' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8">
                    <Landmark className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Conta Bancária</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1 max-h-60 overflow-auto">
                <button onClick={() => setBankFilter('all')} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted ${bankFilter === 'all' ? 'bg-primary/10 text-primary font-medium' : ''}`}>Todos</button>
                <button onClick={() => setBankFilter(IS_EMPTY)} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${bankFilter === IS_EMPTY ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                  <span className="italic text-muted-foreground">(Vazio)</span>
                </button>
                {banks.filter(b => b.is_active).map(b => (
                  <button key={b.id} onClick={() => setBankFilter(b.id)} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${bankFilter === b.id ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || '#10B981' }} />
                    {b.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <CategoryMultiFilter
            selected={categoryFilters}
            onChange={setCategoryFilters}
            categories={categories.map(c => ({ id: c.id, name: c.name, color: c.color || '#3B82F6' }))}
          />

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant={typeFilter !== 'all' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8">
                    {typeFilter === 'receita' ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : typeFilter === 'despesa' ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingUp className="w-4 h-4" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Tipo</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-36 p-2" align="start">
              <div className="space-y-1">
                <button onClick={() => setTypeFilter('all')} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted ${typeFilter === 'all' ? 'bg-primary/10 text-primary font-medium' : ''}`}>Todos</button>
                <button onClick={() => setTypeFilter(IS_EMPTY)} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${typeFilter === IS_EMPTY ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                  <span className="italic text-muted-foreground">(Vazio)</span>
                </button>
                <button onClick={() => setTypeFilter('receita')} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${typeFilter === 'receita' ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                  <TrendingUp className="w-3 h-3 text-emerald-500" /> Receita
                </button>
                <button onClick={() => setTypeFilter('despesa')} className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${typeFilter === 'despesa' ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                  <TrendingDown className="w-3 h-3 text-red-500" /> Despesa
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveColumnFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={() => setColumnFilters({})}>
              <X className="w-3 h-3" /> Limpar filtros de coluna
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button size="sm" className="h-7 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs" onClick={handleBulkPay}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pagar {selectedIds.size}
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="w-3.5 h-3.5" /> Editar {selectedIds.size}
                </Button>
                <Button size="sm" variant="destructive" className="h-7 gap-1.5 text-xs" onClick={() => setBulkDeleteConfirm(true)}>
                  <Trash2 className="w-3.5 h-3.5" /> Excluir {selectedIds.size}
                </Button>
              </>
            )}
            <span className="text-muted-foreground text-xs">{totalCount} transação(ões)</span>
          </div>
        </div>
      </TooltipProvider>

      {/* ── Transaction Table ── */}
      {!isFetching && transactions.length === 0 ? (
        <Card className="bg-card border-border/50">
          <CardContent className="text-muted-foreground text-center py-16">
            <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma transação encontrada</p>
            <p className="text-sm mt-1">Ajuste os filtros ou clique em "Nova Movimentação"</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden min-w-0">
          <CardContent className="p-0 min-w-0">
            <div ref={tableScrollRef} className="table-scroll-container max-h-[70vh] overflow-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="min-w-[1100px]">
              {/* Table Header */}
              <div className="grid grid-cols-[18px_minmax(120px,1fr)_minmax(120px,1fr)_96px_96px_96px_80px_100px_100px_90px] gap-2 px-4 py-2.5 bg-card border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em] sticky top-0 z-10">
                <div className="flex items-center justify-center">
                  <Checkbox checked={selectedIds.size === transactions.length && transactions.length > 0} onCheckedChange={toggleSelectAll} className="h-3.5 w-3.5" />
                </div>

                <ContactColumnFilter
                  columnFilters={columnFilters}
                  setColumnFilters={setColumnFilters}
                  uniqueContactOptions={uniqueContactOptions}
                />

                <EventoContabilColumnFilter
                  selected={categoryFilters}
                  onChange={setCategoryFilters}
                  categories={categoryOptions}
                />

                <div className="flex items-center justify-center gap-0.5">
                  <span>Vencimento</span>
                  <Popover>
                    <PopoverTrigger asChild><button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={!!columnFilters.due_date || !!columnFilters.due_date_empty || sortField === 'due_date'} /></button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><DateColumnFilter value={columnFilters.due_date} onChange={v => updateColumnFilter('due_date', v)} sortField="due_date" currentSortField={sortField} currentSortOrder={sortOrder} onSort={handleSortDirect} includeEmpty={!!columnFilters.due_date_empty} onIncludeEmptyChange={v => updateColumnFilter('due_date_empty', v || undefined)} /></PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-center gap-0.5">
                  <span>Prevista</span>
                  <Popover>
                    <PopoverTrigger asChild><button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={!!columnFilters.expected_date || !!columnFilters.expected_date_empty || sortField === 'expected_date'} /></button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><DateColumnFilter value={columnFilters.expected_date} onChange={v => updateColumnFilter('expected_date', v)} sortField="expected_date" currentSortField={sortField} currentSortOrder={sortOrder} onSort={handleSortDirect} includeEmpty={!!columnFilters.expected_date_empty} onIncludeEmptyChange={v => updateColumnFilter('expected_date_empty', v || undefined)} /></PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-center gap-0.5">
                  <span>Pagamento</span>
                  <Popover>
                    <PopoverTrigger asChild><button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={!!columnFilters.date || !!columnFilters.date_empty || sortField === 'date'} /></button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><DateColumnFilter value={columnFilters.date} onChange={v => updateColumnFilter('date', v)} sortField="date" currentSortField={sortField} currentSortOrder={sortOrder} onSort={handleSortDirect} includeEmpty={!!columnFilters.date_empty} onIncludeEmptyChange={v => updateColumnFilter('date_empty', v || undefined)} /></PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-center gap-0.5">
                  <span>Status</span>
                  <Popover>
                    <PopoverTrigger asChild><button className="p-1 rounded hover:bg-muted/60 transition-colors"><ColumnFilterIcon active={!!columnFilters.status} /></button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><TextColumnFilter values={uniqueStatuses} selected={columnFilters.status} onChange={v => updateColumnFilter('status', v)} /></PopoverContent>
                  </Popover>
                </div>

                <NumericMultiFilter
                  label="Valor"
                  selected={columnFilters.amounts || []}
                  onChange={v => updateColumnFilter('amounts', v.length > 0 ? v : undefined)}
                  values={distinctAmounts}
                  loading={amountsFetching}
                  onOpenChange={(o) => setOpenAmountFilter(o ? 'amount' : null)}
                />
                <NumericMultiFilter
                  label="Recebido"
                  selected={columnFilters.paidAmounts || []}
                  onChange={v => updateColumnFilter('paidAmounts', v.length > 0 ? v : undefined)}
                  values={distinctPaidAmounts}
                  loading={paidAmountsFetching}
                  onOpenChange={(o) => setOpenAmountFilter(o ? 'paid_amount' : null)}
                />

                <div className="text-center">Ações</div>
              </div>

              {/* Rows or Skeleton */}
              {isFetching ? (
                <TableSkeleton />
              ) : (
                <div className="divide-y divide-border/30">
                  {transactions.map(transaction => {
                    const isOverdue = !isEffectivelyPaid(transaction) && transaction.due_date && transaction.due_date < new Date().toISOString().split('T')[0];
                    return (
                      <div key={transaction.id} className={`grid grid-cols-[18px_minmax(120px,1fr)_minmax(120px,1fr)_96px_96px_96px_80px_100px_100px_90px] gap-2 px-4 py-[10px] hover:bg-muted/30 transition-colors items-center ${selectedIds.has(transaction.id) ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}>
                        <div className="flex items-center justify-center">
                          <Checkbox checked={selectedIds.has(transaction.id)} onCheckedChange={() => toggleSelect(transaction.id)} className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Tooltip><TooltipTrigger asChild><span className="truncate text-sm font-semibold text-foreground">{transaction.contact?.name ?? transaction.description}</span></TooltipTrigger><TooltipContent side="top" className="apple-tooltip"><p>{transaction.contact?.name ?? transaction.description}</p></TooltipContent></Tooltip>
                            {isOverdue && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/40 whitespace-nowrap shrink-0">Vencido</span>}
                            {(() => {
                              const isVisualCash = transaction.is_paid && !!transaction.date && !!transaction.due_date && !!transaction.issue_date && transaction.date === transaction.due_date && transaction.due_date === transaction.issue_date;
                              return isVisualCash && !transaction.is_transfer ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 whitespace-nowrap shrink-0">À Vista</span> : null;
                            })()}
                            {transaction.is_transfer && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 whitespace-nowrap shrink-0 inline-flex items-center gap-1">
                                <ArrowLeftRight className="w-2.5 h-2.5" /> Transferência
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {transaction.category ? (
                            <>
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: transaction.category.color || '#3B82F6' }} />
                              <Tooltip><TooltipTrigger asChild><span className="truncate" style={{ color: transaction.category.color }}>{transaction.category.name}</span></TooltipTrigger><TooltipContent side="top" className="apple-tooltip"><p>{transaction.category.name}</p></TooltipContent></Tooltip>
                            </>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                        <div className="text-center text-[12px] font-mono tabular-nums text-muted-foreground">{formatDateShort(transaction.due_date)}</div>
                        <div className="text-center text-[12px] font-mono tabular-nums text-muted-foreground">{formatDateShort(transaction.expected_date)}</div>
                        <div className="text-center text-[12px] font-mono tabular-nums text-muted-foreground">{formatDateShort(transaction.date)}</div>
                        <div className="flex justify-center">
                          {(() => {
                            const effectivelyPaid = isEffectivelyPaid(transaction);
                            return (
                              <button
                                onClick={() => togglePaid.mutate({ id: transaction.id, is_paid: !effectivelyPaid })}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer whitespace-nowrap min-w-[68px] text-center ${
                                  effectivelyPaid ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-amber-500 text-amber-500 bg-transparent hover:bg-amber-500/10'
                                }`}>
                                {effectivelyPaid ? 'Pago' : 'Pendente'}
                              </button>
                            );
                          })()}
                        </div>
                        <div className={`text-right font-bold text-[13px] tabular-nums truncate ${transaction.type === 'receita' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {transaction.type === 'receita' ? '+' : '-'}{formatCurrency(Number(transaction.amount))}
                        </div>
                        <div className={`text-right text-[13px] tabular-nums truncate ${isEffectivelyPaid(transaction) && transaction.paid_amount != null ? (transaction.type === 'receita' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold') : 'text-muted-foreground'}`}>
                          {isEffectivelyPaid(transaction) && transaction.paid_amount != null
                            ? `${transaction.type === 'receita' ? '+' : '-'}${formatCurrency(Number(transaction.paid_amount))}`
                            : '—'}
                        </div>
                        <div className="flex gap-1.5 justify-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={() => handleEdit(transaction)}><Pencil className="w-4 h-4 text-muted-foreground" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-500/10" onClick={() => handleSettle(transaction)}><CircleDollarSign className="w-4 h-4 text-emerald-500" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10" onClick={() => setDeleteId(transaction.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>

            {/* Pagination */}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              onPageChange={setCurrentPage}
              isFetching={isFetching}
            />
          </CardContent>
        </Card>
      )}

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editingTransaction}
        categories={categories}
        banks={banks}
        contacts={contacts}
        onSubmit={handleSubmit}
        onBulkSubmit={async (items) => { await bulkCreateTransactions.mutateAsync(items); }}
        isLoading={createTransaction.isPending || updateTransaction.isPending}
        defaultType={defaultType}
        mode={dialogMode}
        resetKey={formResetKey}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} transação(ões)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir {selectedIds.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportSpreadsheetDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        banks={banks}
        categories={categories}
        contacts={contacts}
        onImport={async (txns) => { await bulkCreateTransactions.mutateAsync(txns); }}
        onCreateCategory={async (name, type) => { const data = await createCategory.mutateAsync({ name, type, color: '#3B82F6', icon: 'tag' }); return { id: data.id }; }}
        onCreateContact={async (name) => { const data = await createContact.mutateAsync({ name, type: 'cliente', is_active: true, boleto_active: false, document: null, email: null, phone: null, cep: null, address: null, address_number: null, neighborhood: null, city: null, state: null, notes: null, tax_regime: null, representative_legal: null, boleto_value: null, boleto_due_day: null, boleto_start_date: null, origin: 'imported' }); return { id: data.id }; }}
        onCreateBank={async (name) => { const data = await createBank.mutateAsync({ name, initial_balance: 0, color: '#10B981', is_active: true, is_invisible: false, bank_code: null, agency: null, account_number: null }); return { id: data.id }; }}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedIds={Array.from(selectedIds)}
        contacts={contacts}
        categories={categories}
        banks={banks}
        onSuccess={() => setSelectedIds(new Set())}
      />

      <BulkSettleDialog
        open={bulkSettleOpen}
        onOpenChange={setBulkSettleOpen}
        count={selectedIds.size}
        onConfirm={handleBulkSettleConfirm}
        isLoading={bulkSettleWithDate.isPending}
      />

      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        banks={banks}
        onSubmit={(data: TransferInput) => createTransfer.mutate(data, { onSuccess: () => setTransferOpen(false) })}
        isLoading={createTransfer.isPending}
      />
    </div>
  );
}
