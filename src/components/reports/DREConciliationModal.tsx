import { Fragment, useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronDown, ChevronRight, ChevronUp, FileText, AlertCircle, Eraser,
  Pencil, Loader2, Search, X, Filter,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCategories } from '@/hooks/useCategories';
import { useContacts } from '@/hooks/useContacts';
import { useBanks } from '@/hooks/useBanks';
import { useToast } from '@/hooks/use-toast';
import { BulkEditDialog } from '@/components/transactions/BulkEditDialog';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
}

const IS_EMPTY = '__empty__';
type SortOrder = 'asc' | 'desc' | null;

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDateBR(d: string | null) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

interface ConciliationTxn {
  id: string;
  description: string;
  type: 'receita' | 'despesa';
  amount: number;
  paid_amount: number | null;
  is_paid: boolean;
  expected_date: string | null;
  date: string | null;
  issue_date: string | null;
  due_date: string | null;
  category_id: string | null;
  contact_id: string | null;
  bank_id: string | null;
}

// Visual-only À Vista detection: paid + issue=due=date (all filled and equal).
function isVisualAVista(t: ConciliationTxn) {
  return !!t.is_paid && !!t.date && !!t.due_date && !!t.issue_date
    && t.date === t.due_date && t.due_date === t.issue_date;
}

// ---------- Shared filter UI bits ----------
function ColumnFilterIcon({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <Filter className={cn('w-3.5 h-3.5 transition-colors', active ? 'text-primary' : 'text-muted-foreground/70 hover:text-primary')} />
      {active && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
    </span>
  );
}

function MultiSelectFilter({
  label, options, selected, onChange, align = 'start', allowEmpty = true, placeholder = 'Buscar...',
}: {
  label: string;
  options: { id: string; name: string; color?: string | null }[];
  selected: string[];
  onChange: (v: string[]) => void;
  align?: 'start' | 'end';
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<string[]>([]);

  const isActive = selected.length > 0;
  const filtered = search ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase())) : options;
  const toggle = (id: string) => setTemp(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleOpenChange = (next: boolean) => {
    if (next) { setTemp(selected); setSearch(''); }
    else { onChange(temp); setSearch(''); }
    setOpen(next);
  };

  const displaySelected = open ? temp : selected;
  const displayActive = displaySelected.length > 0;

  return (
    <div className="inline-flex items-center gap-0.5">
      <span>{label}</span>
      {displayActive && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold ml-0.5">{displaySelected.length}</Badge>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors">
            <ColumnFilterIcon active={isActive} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align={align} onOpenAutoFocus={e => e.preventDefault()}>
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder} className="h-7 text-xs pl-7" autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {allowEmpty && (
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs border-b border-border/30 mb-1">
                <Checkbox checked={displaySelected.includes(IS_EMPTY)} onCheckedChange={() => toggle(IS_EMPTY)} className="h-3.5 w-3.5" />
                <span className="truncate italic text-muted-foreground">(Vazio)</span>
              </label>
            )}
            {filtered.length > 0 ? filtered.map(o => (
              <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                <Checkbox checked={displaySelected.includes(o.id)} onCheckedChange={() => toggle(o.id)} className="h-3.5 w-3.5" />
                {o.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />}
                <span className="truncate">{o.name}</span>
              </label>
            )) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
            )}
          </div>
          {displayActive && (
            <div className="p-2 border-t border-border/40">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setTemp([])}>
                <X className="w-3 h-3 mr-1" /> Limpar ({displaySelected.length})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NumericRangeFilter({
  label, value, onChange, sortOrder, onSort, align = 'end',
}: {
  label: string;
  value?: { min?: number; max?: number };
  onChange: (v?: { min?: number; max?: number }) => void;
  sortOrder?: SortOrder;
  onSort?: (o: SortOrder) => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [minV, setMinV] = useState(value?.min !== undefined ? String(value.min) : '');
  const [maxV, setMaxV] = useState(value?.max !== undefined ? String(value.max) : '');

  useEffect(() => {
    setMinV(value?.min !== undefined ? String(value.min) : '');
    setMaxV(value?.max !== undefined ? String(value.max) : '');
  }, [value?.min, value?.max]);

  const isActive = value?.min !== undefined || value?.max !== undefined;

  const apply = () => {
    const minN = minV !== '' ? Number(minV.replace(',', '.')) : undefined;
    const maxN = maxV !== '' ? Number(maxV.replace(',', '.')) : undefined;
    if (minN === undefined && maxN === undefined) onChange(undefined);
    else onChange({ min: minN, max: maxN });
    setOpen(false);
  };
  const clear = () => { setMinV(''); setMaxV(''); onChange(undefined); };

  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors">
            <ColumnFilterIcon active={isActive || !!sortOrder} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-2" align={align} onOpenAutoFocus={e => e.preventDefault()}>
          {onSort && (
            <div className="space-y-0.5 pb-2 border-b border-border/40">
              <button
                onClick={() => { onSort('asc'); setOpen(false); }}
                className={cn('w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted', sortOrder === 'asc' && 'bg-primary/10 text-primary font-medium')}
              >
                <ChevronUp className="w-3 h-3" /> Menor primeiro
              </button>
              <button
                onClick={() => { onSort('desc'); setOpen(false); }}
                className={cn('w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted', sortOrder === 'desc' && 'bg-primary/10 text-primary font-medium')}
              >
                <ChevronDown className="w-3 h-3" /> Maior primeiro
              </button>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mínimo</label>
            <Input type="number" inputMode="decimal" value={minV} onChange={e => setMinV(e.target.value)} className="h-8 text-xs" placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Máximo</label>
            <Input type="number" inputMode="decimal" value={maxV} onChange={e => setMaxV(e.target.value)} className="h-8 text-xs" placeholder="0,00" />
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={clear}>Limpar</Button>
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={apply}>Aplicar</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DateRangeFilter({
  label, value, onChange, includeEmpty, onIncludeEmptyChange, sortOrder, onSort, align = 'start',
}: {
  label: string;
  value?: { start: string; end: string };
  onChange: (v?: { start: string; end: string }) => void;
  includeEmpty: boolean;
  onIncludeEmptyChange: (v: boolean) => void;
  sortOrder?: SortOrder;
  onSort?: (o: SortOrder) => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(value?.start || '');
  const [end, setEnd] = useState(value?.end || '');

  useEffect(() => {
    setStart(value?.start || '');
    setEnd(value?.end || '');
  }, [value?.start, value?.end]);

  const isActive = !!(value?.start || value?.end || includeEmpty);

  const apply = () => {
    if (start || end) onChange({ start, end });
    else onChange(undefined);
    setOpen(false);
  };
  const clear = () => { setStart(''); setEnd(''); onChange(undefined); onIncludeEmptyChange(false); };

  return (
    <div className="inline-flex items-center gap-0.5">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/60 transition-colors">
            <ColumnFilterIcon active={isActive || !!sortOrder} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-2" align={align} onOpenAutoFocus={e => e.preventDefault()}>
          {onSort && (
            <div className="space-y-0.5 pb-2 border-b border-border/40">
              <button
                onClick={() => { onSort('asc'); setOpen(false); }}
                className={cn('w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted', sortOrder === 'asc' && 'bg-primary/10 text-primary font-medium')}
              >
                <ChevronUp className="w-3 h-3" /> Mais antigo primeiro
              </button>
              <button
                onClick={() => { onSort('desc'); setOpen(false); }}
                className={cn('w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-muted', sortOrder === 'desc' && 'bg-primary/10 text-primary font-medium')}
              >
                <ChevronDown className="w-3 h-3" /> Mais recente primeiro
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 px-1 py-1 cursor-pointer text-xs">
            <Checkbox checked={includeEmpty} onCheckedChange={c => onIncludeEmptyChange(!!c)} className="h-3.5 w-3.5" />
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
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------- Modal ----------
interface MainSort { col: 'previstoDRE' | 'emAberto' | 'pagasComPrevista' | 'diferenca' | null; order: SortOrder }
interface DetailSort { col: 'expected_date' | 'date' | 'amount' | null; order: SortOrder }

interface MainColFilters {
  macroIds: string[];
  previstoDRE?: { min?: number; max?: number };
  emAberto?: { min?: number; max?: number };
  pagasComPrevista?: { min?: number; max?: number };
  diferenca?: { min?: number; max?: number };
}

interface DetailColFilters {
  expected_date?: { start: string; end: string };
  expected_date_empty: boolean;
  date?: { start: string; end: string };
  date_empty: boolean;
  contactIds: string[];
  subEventIds: string[];
  bankIds: string[];
  amount?: { min?: number; max?: number };
  statusIds: string[]; // 'paid' | 'pending'
}

const emptyMain: MainColFilters = { macroIds: [] };
const emptyDetail: DetailColFilters = {
  expected_date_empty: false,
  date_empty: false,
  contactIds: [],
  subEventIds: [],
  bankIds: [],
  statusIds: [],
};

export function DREConciliationModal({ open, onOpenChange, startDate, endDate }: Props) {
  const { categories } = useCategories();
  const { contacts } = useContacts();
  const { banks } = useBanks();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [mainFilters, setMainFilters] = useState<MainColFilters>(emptyMain);
  const [detailFilters, setDetailFilters] = useState<DetailColFilters>(emptyDetail);
  const [mainSort, setMainSort] = useState<MainSort>({ col: 'previstoDRE', order: 'desc' });
  const [detailSort, setDetailSort] = useState<DetailSort>({ col: 'expected_date', order: 'asc' });

  const clearFilters = () => {
    setSearchTerm('');
    setMainFilters(emptyMain);
    setDetailFilters(emptyDetail);
  };
  const hasActiveFilters =
    searchTerm !== '' ||
    mainFilters.macroIds.length > 0 ||
    !!mainFilters.previstoDRE ||
    !!mainFilters.emAberto ||
    !!mainFilters.pagasComPrevista ||
    !!mainFilters.diferenca ||
    !!detailFilters.expected_date ||
    detailFilters.expected_date_empty ||
    !!detailFilters.date ||
    detailFilters.date_empty ||
    detailFilters.contactIds.length > 0 ||
    detailFilters.subEventIds.length > 0 ||
    detailFilters.bankIds.length > 0 ||
    !!detailFilters.amount ||
    detailFilters.statusIds.length > 0;

  // ---------- Query: expected_date in period (matches DRE Previsto rule) ----------
  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['dre-conciliation-v2', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, description, type, amount, paid_amount, is_paid, expected_date, date, issue_date, due_date, category_id, contact_id, bank_id')
        .is('deleted_at', null)
        .gte('expected_date', startDate)
        .lte('expected_date', endDate);
      if (error) throw error;
      return (data || []) as unknown as ConciliationTxn[];
    },
    enabled: open && !!startDate && !!endDate,
  });

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // Helpers
  const macroOf = (categoryId: string | null) => {
    const cat = categoryId ? catMap.get(categoryId) : null;
    return cat?.parent_id ? catMap.get(cat.parent_id) : cat;
  };
  const subEventName = (categoryId: string | null) => {
    if (!categoryId) return '—';
    const cat = catMap.get(categoryId);
    if (!cat) return '—';
    return cat.parent_id ? cat.name : '—';
  };
  const contactName = (id: string | null) => id ? (contacts.find(c => c.id === id)?.name || '—') : '—';
  const bankName = (id: string | null) => id ? (banks.find(b => b.id === id)?.name || '—') : '—';

  // Apply detail-level filters at transaction level (and search)
  const filteredTxns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return txns.filter(t => {
      // expected_date
      if (detailFilters.expected_date || detailFilters.expected_date_empty) {
        if (!t.expected_date) {
          if (!detailFilters.expected_date_empty) return false;
        } else {
          const ed = detailFilters.expected_date;
          if (ed) {
            if (ed.start && t.expected_date < ed.start) return false;
            if (ed.end && t.expected_date > ed.end) return false;
          } else if (detailFilters.expected_date_empty) {
            return false; // only empty wanted
          }
        }
      }
      // date
      if (detailFilters.date || detailFilters.date_empty) {
        if (!t.date) {
          if (!detailFilters.date_empty) return false;
        } else {
          const dd = detailFilters.date;
          if (dd) {
            if (dd.start && t.date < dd.start) return false;
            if (dd.end && t.date > dd.end) return false;
          } else if (detailFilters.date_empty) {
            return false;
          }
        }
      }
      // contact
      if (detailFilters.contactIds.length > 0) {
        const key = t.contact_id || IS_EMPTY;
        if (!detailFilters.contactIds.includes(key)) return false;
      }
      // sub-event
      if (detailFilters.subEventIds.length > 0) {
        const cat = t.category_id ? catMap.get(t.category_id) : null;
        const subKey = cat?.parent_id ? cat.id : IS_EMPTY;
        if (!detailFilters.subEventIds.includes(subKey)) return false;
      }
      // bank
      if (detailFilters.bankIds.length > 0) {
        const key = t.bank_id || IS_EMPTY;
        if (!detailFilters.bankIds.includes(key)) return false;
      }
      // amount
      if (detailFilters.amount) {
        const a = Number(t.amount);
        if (detailFilters.amount.min !== undefined && a < detailFilters.amount.min) return false;
        if (detailFilters.amount.max !== undefined && a > detailFilters.amount.max) return false;
      }
      // status: tokens 'paid' | 'pending'
      if (detailFilters.statusIds.length > 0) {
        const tokens = new Set<string>();
        tokens.add(t.is_paid ? 'paid' : 'pending');
        const ok = detailFilters.statusIds.some(s => tokens.has(s));
        if (!ok) return false;
      }
      // macro filter
      if (mainFilters.macroIds.length > 0) {
        const macro = macroOf(t.category_id);
        const key = macro?.id || IS_EMPTY;
        if (!mainFilters.macroIds.includes(key)) return false;
      }
      // search
      if (term) {
        const cat = t.category_id ? catMap.get(t.category_id) : null;
        const macro = cat?.parent_id ? catMap.get(cat.parent_id) : cat;
        const contactN = t.contact_id ? (contacts.find(c => c.id === t.contact_id)?.name || '') : '';
        const bankN = t.bank_id ? (banks.find(b => b.id === t.bank_id)?.name || '') : '';
        const hay = [t.description, contactN, bankN, cat?.name || '', macro?.name || ''].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [txns, searchTerm, mainFilters.macroIds, detailFilters, catMap, contacts, banks]);

  // Group by macro
  interface Group {
    key: string;
    macroName: string;
    showInDre: boolean;
    previstoDRE: number;
    emAberto: number;
    pagasComPrevista: number;
    txns: ConciliationTxn[];
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Group>();
    for (const t of filteredTxns) {
      const macro = macroOf(t.category_id);
      const key = macro?.id || '__sem__';
      const macroName = macro?.name || '(Sem evento contábil)';
      const showInDre = macro ? macro.show_in_dre !== false : true;

      let g = map.get(key);
      if (!g) {
        g = { key, macroName, showInDre, previstoDRE: 0, emAberto: 0, pagasComPrevista: 0, txns: [] };
        map.set(key, g);
      }
      const amt = Number(t.amount);
      g.previstoDRE += amt;
      if (!t.is_paid) g.emAberto += amt;
      else g.pagasComPrevista += amt;
      g.txns.push(t);
    }

    let groups = Array.from(map.values());

    // Apply main numeric-range filters
    groups = groups.filter(g => {
      const ranges: [number, MainColFilters[keyof MainColFilters] | undefined][] = [
        [g.previstoDRE, mainFilters.previstoDRE],
        [g.emAberto, mainFilters.emAberto],
        [g.pagasComPrevista, mainFilters.pagasComPrevista],
        [g.previstoDRE - g.emAberto - g.pagasComPrevista, mainFilters.diferenca],
      ];
      for (const [val, r] of ranges) {
        if (!r) continue;
        const rr = r as { min?: number; max?: number };
        if (rr.min !== undefined && val < rr.min) return false;
        if (rr.max !== undefined && val > rr.max) return false;
      }
      return true;
    });

    // Sort
    if (mainSort.col && mainSort.order) {
      const sgn = mainSort.order === 'asc' ? 1 : -1;
      const get = (g: Group) => {
        switch (mainSort.col) {
          case 'previstoDRE': return g.previstoDRE;
          case 'emAberto': return g.emAberto;
          case 'pagasComPrevista': return g.pagasComPrevista;
          case 'diferenca': return g.previstoDRE - g.emAberto - g.pagasComPrevista;
          default: return 0;
        }
      };
      groups.sort((a, b) => (get(a) - get(b)) * sgn);
    }
    return groups;
  }, [filteredTxns, catMap, mainFilters, mainSort, startDate, endDate]);

  const totals = useMemo(() => {
    return grouped.reduce((acc, g) => {
      acc.previstoDRE += g.previstoDRE;
      acc.emAberto += g.emAberto;
      acc.pagasComPrevista += g.pagasComPrevista;
      return acc;
    }, { previstoDRE: 0, emAberto: 0, pagasComPrevista: 0 });
  }, [grouped]);

  // Options for header filters (built from all loaded txns, not the filtered set)
  const macroOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of txns) {
      const macro = macroOf(t.category_id);
      const id = macro?.id || IS_EMPTY;
      const name = macro?.name || '(Sem evento contábil)';
      if (!m.has(id)) m.set(id, name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [txns, catMap]);

  const contactOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of txns) {
      if (!t.contact_id) continue;
      const c = contacts.find(c => c.id === t.contact_id);
      if (c && !m.has(c.id)) m.set(c.id, c.name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [txns, contacts]);

  const subEventOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of txns) {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      if (cat?.parent_id) {
        if (!m.has(cat.id)) m.set(cat.id, cat.name);
      }
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [txns, catMap]);

  const bankOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of txns) {
      if (!t.bank_id) continue;
      const b = banks.find(b => b.id === t.bank_id);
      if (b && !m.has(b.id)) m.set(b.id, b.name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [txns, banks]);

  const statusOptions = [
    { id: 'paid', name: 'Pago' },
    { id: 'pending', name: 'Em aberto' },
  ];

  // ---------- Selection / actions ----------
  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectGroup = (txnIds: string[], checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      txnIds.forEach(id => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectedTxns = useMemo(() => txns.filter(t => selected.has(t.id)), [txns, selected]);

  const handleClearExpected = async () => {
    setClearing(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from('transactions').update({ expected_date: null }).in('id', ids);
      if (error) throw error;
      toast({ title: `Data Prevista removida em ${ids.length} transação(ões).` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dre-conciliation-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['dre-previsto'] }),
        queryClient.invalidateQueries({ queryKey: ['dre-realizado'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['server-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] }),
      ]);
      clearSelection();
      setConfirmClearOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro ao limpar Data Prevista', description: err.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Conciliação DRE × Pagar/Receber', 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, 14, 20);

    const body = grouped.map(g => {
      const diff = g.previstoDRE - (g.emAberto + g.pagasComPrevista);
      return [
        g.macroName + (g.showInDre ? '' : ' (fora da DRE)'),
        formatCurrency(g.previstoDRE),
        formatCurrency(g.emAberto),
        formatCurrency(g.pagasComPrevista),
        formatCurrency(diff),
      ];
    });

    autoTable(doc, {
      startY: 26,
      head: [['Evento Contábil', 'Previsto DRE', 'Em Aberto', 'Pagas c/ Prevista', 'Diferença']],
      body,
      foot: [[
        'TOTAL',
        formatCurrency(totals.previstoDRE),
        formatCurrency(totals.emAberto),
        formatCurrency(totals.pagasComPrevista),
        formatCurrency(totals.previstoDRE - totals.emAberto - totals.pagasComPrevista),
      ]],
      styles: { fontSize: 8, halign: 'center' },
      headStyles: { fillColor: [30, 41, 59], halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { halign: 'left' } },
    });

    doc.save(`conciliacao-dre-${startDate}_${endDate}.pdf`);
  };

  // Sort detail txns
  const sortDetail = (arr: ConciliationTxn[]) => {
    if (!detailSort.col || !detailSort.order) return arr;
    const sgn = detailSort.order === 'asc' ? 1 : -1;
    const get = (t: ConciliationTxn): string | number => {
      switch (detailSort.col) {
        case 'expected_date': return t.expected_date || '';
        case 'date': return t.date || '';
        case 'amount': return Number(t.amount);
        default: return 0;
      }
    };
    return arr.slice().sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (av < bv) return -1 * sgn;
      if (av > bv) return 1 * sgn;
      return 0;
    });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearSelection(); onOpenChange(v); }}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Conciliação DRE × Pagar/Receber</span>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileText className="h-4 w-4" /> Exportar PDF
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground mb-2 leading-relaxed">
          <p>
            Período: <strong>{formatDateBR(startDate)} a {formatDateBR(endDate)}</strong>.
            Lista transações com <strong>Data Prevista</strong> dentro do período (mesmo critério do Previsto da DRE).
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><strong>Previsto DRE</strong>: linhas com Data Prevista no período (pagas + em aberto). Idêntico à coluna Previsto da DRE.</li>
            <li><strong>Em Aberto</strong>: parcela ainda não liquidada — é o que aparece em Pagar/Receber.</li>
            <li><strong>Pagas c/ Prevista</strong>: já liquidadas, mas continuam compondo o Previsto da DRE.</li>
            <li><strong>Diferença</strong>: Previsto DRE − (Em Aberto + Pagas c/ Prevista). Deve ser zero.</li>
          </ul>
        </div>

        {/* Busca + Limpar filtros */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, cliente/fornecedor, conta, evento..."
              className="pl-9 h-9"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 mb-2">
            <span className="text-sm font-medium">{selected.size} transação(ões) selecionada(s)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={clearSelection}>Limpar seleção</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar em massa
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setConfirmClearOpen(true)}>
                <Eraser className="h-3.5 w-3.5" /> Limpar Data Prevista
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma transação com Data Prevista no período.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[8px]"></TableHead>
                <TableHead>
                  <MultiSelectFilter
                    label="Evento Contábil"
                    options={macroOptions}
                    selected={mainFilters.macroIds}
                    onChange={v => setMainFilters(p => ({ ...p, macroIds: v }))}
                    allowEmpty={false}
                    placeholder="Buscar evento..."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <NumericRangeFilter
                    label="Previsto DRE"
                    value={mainFilters.previstoDRE}
                    onChange={v => setMainFilters(p => ({ ...p, previstoDRE: v }))}
                    sortOrder={mainSort.col === 'previstoDRE' ? mainSort.order : null}
                    onSort={o => setMainSort({ col: 'previstoDRE', order: o })}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <NumericRangeFilter
                    label="Em Aberto"
                    value={mainFilters.emAberto}
                    onChange={v => setMainFilters(p => ({ ...p, emAberto: v }))}
                    sortOrder={mainSort.col === 'emAberto' ? mainSort.order : null}
                    onSort={o => setMainSort({ col: 'emAberto', order: o })}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <NumericRangeFilter
                    label="Pagas c/ Prevista"
                    value={mainFilters.pagasComPrevista}
                    onChange={v => setMainFilters(p => ({ ...p, pagasComPrevista: v }))}
                    sortOrder={mainSort.col === 'pagasComPrevista' ? mainSort.order : null}
                    onSort={o => setMainSort({ col: 'pagasComPrevista', order: o })}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <NumericRangeFilter
                    label="Diferença"
                    value={mainFilters.diferenca}
                    onChange={v => setMainFilters(p => ({ ...p, diferenca: v }))}
                    sortOrder={mainSort.col === 'diferenca' ? mainSort.order : null}
                    onSort={o => setMainSort({ col: 'diferenca', order: o })}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(g => {
                const diff = g.previstoDRE - (g.emAberto + g.pagasComPrevista);
                const isOpen = !!expanded[g.key];
                const allIds = g.txns.map(t => t.id);
                const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
                return (
                  <Fragment key={g.key}>
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(g.key)}>
                      <TableCell className="px-2">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {g.macroName}
                          {!g.showInDre && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <AlertCircle className="h-3 w-3" /> fora da DRE
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(g.previstoDRE)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(g.emAberto)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(g.pagasComPrevista)}</TableCell>
                      <TableCell className={cn('text-right font-semibold', Math.abs(diff) > 0.001 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {formatCurrency(diff)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={g.key + '-detail'}>
                        <TableCell colSpan={6} className="bg-muted/20 p-0">
                          <div className="p-3 space-y-2">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[32px]">
                                    <Checkbox
                                      checked={allSelected}
                                      onCheckedChange={(c) => selectGroup(allIds, !!c)}
                                      aria-label="Selecionar tudo"
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <DateRangeFilter
                                      label="Data Prevista"
                                      value={detailFilters.expected_date}
                                      onChange={v => setDetailFilters(p => ({ ...p, expected_date: v }))}
                                      includeEmpty={detailFilters.expected_date_empty}
                                      onIncludeEmptyChange={v => setDetailFilters(p => ({ ...p, expected_date_empty: v }))}
                                      sortOrder={detailSort.col === 'expected_date' ? detailSort.order : null}
                                      onSort={o => setDetailSort({ col: 'expected_date', order: o })}
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <DateRangeFilter
                                      label="Data Pagto."
                                      value={detailFilters.date}
                                      onChange={v => setDetailFilters(p => ({ ...p, date: v }))}
                                      includeEmpty={detailFilters.date_empty}
                                      onIncludeEmptyChange={v => setDetailFilters(p => ({ ...p, date_empty: v }))}
                                      sortOrder={detailSort.col === 'date' ? detailSort.order : null}
                                      onSort={o => setDetailSort({ col: 'date', order: o })}
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <MultiSelectFilter
                                      label="Cliente/Fornecedor"
                                      options={contactOptions}
                                      selected={detailFilters.contactIds}
                                      onChange={v => setDetailFilters(p => ({ ...p, contactIds: v }))}
                                      placeholder="Buscar cliente/fornecedor..."
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <MultiSelectFilter
                                      label="Evento Contábil"
                                      options={subEventOptions}
                                      selected={detailFilters.subEventIds}
                                      onChange={v => setDetailFilters(p => ({ ...p, subEventIds: v }))}
                                      placeholder="Buscar evento..."
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <MultiSelectFilter
                                      label="Conta Corrente"
                                      options={bankOptions}
                                      selected={detailFilters.bankIds}
                                      onChange={v => setDetailFilters(p => ({ ...p, bankIds: v }))}
                                      placeholder="Buscar conta..."
                                    />
                                  </TableHead>
                                  <TableHead className="text-right text-xs">
                                    <NumericRangeFilter
                                      label="Valor"
                                      value={detailFilters.amount}
                                      onChange={v => setDetailFilters(p => ({ ...p, amount: v }))}
                                      sortOrder={detailSort.col === 'amount' ? detailSort.order : null}
                                      onSort={o => setDetailSort({ col: 'amount', order: o })}
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    <MultiSelectFilter
                                      label="Status"
                                      options={statusOptions}
                                      selected={detailFilters.statusIds}
                                      onChange={v => setDetailFilters(p => ({ ...p, statusIds: v }))}
                                      allowEmpty={false}
                                      placeholder="Buscar status..."
                                    />
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sortDetail(g.txns).map(t => {
                                  const suspect = isVisualAVista(t);
                                  return (
                                    <TableRow key={t.id} className={cn(suspect && 'bg-blue-500/5')}>
                                      <TableCell>
                                        <Checkbox
                                          checked={selected.has(t.id)}
                                          onCheckedChange={() => toggleSelected(t.id)}
                                        />
                                      </TableCell>
                                      <TableCell className="text-xs">{formatDateBR(t.expected_date)}</TableCell>
                                      <TableCell className="text-xs">{formatDateBR(t.date)}</TableCell>
                                      <TableCell className="text-xs">{contactName(t.contact_id)}</TableCell>
                                      <TableCell className="text-xs">{subEventName(t.category_id)}</TableCell>
                                      <TableCell className="text-xs">{bankName(t.bank_id)}</TableCell>
                                      <TableCell className="text-right text-xs">{formatCurrency(Number(t.amount))}</TableCell>
                                      <TableCell className="text-xs">
                                        <div className="flex flex-wrap items-center gap-1">
                                          {t.is_paid ? (
                                            <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600">Pago</Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">Em aberto</Badge>
                                          )}
                                          {suspect && (
                                            <Badge variant="outline" className="text-[10px] border-blue-500/60 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                                              À Vista
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell></TableCell>
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.previstoDRE)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.emAberto)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.pagasComPrevista)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.previstoDRE - totals.emAberto - totals.pagasComPrevista)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Limpar Data Prevista em {selected.size} transação(ões)?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                A Data Prevista será removida das transações selecionadas. Elas deixarão de aparecer no
                <strong> Previsto da DRE</strong> e continuarão compondo o <strong>Realizado</strong> normalmente.
              </p>
              {selectedTxns.length <= 10 ? (
                <ul className="text-xs list-disc pl-5 max-h-40 overflow-auto">
                  {selectedTxns.map(t => (
                    <li key={t.id}>{t.description} — {formatCurrency(Number(t.amount))}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs">Primeiras 10 de {selectedTxns.length}:</p>
              )}
              {selectedTxns.length > 10 && (
                <ul className="text-xs list-disc pl-5 max-h-40 overflow-auto">
                  {selectedTxns.slice(0, 10).map(t => (
                    <li key={t.id}>{t.description} — {formatCurrency(Number(t.amount))}</li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); handleClearExpected(); }} disabled={clearing}>
            {clearing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <BulkEditDialog
      open={bulkEditOpen}
      onOpenChange={setBulkEditOpen}
      selectedIds={Array.from(selected)}
      contacts={contacts.map(c => ({ id: c.id, name: c.name, is_active: c.is_active }))}
      categories={categories.map(c => ({ id: c.id, name: c.name, type: c.type }))}
      banks={banks.map(b => ({ id: b.id, name: b.name, is_active: b.is_active }))}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['dre-conciliation-v2'] });
        clearSelection();
      }}
    />
    </>
  );
}
