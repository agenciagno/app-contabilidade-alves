import { useState, useMemo } from 'react';
import { Search, Calendar, X, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth, subMonths, subDays, addDays, addMonths, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type PeriodFilter = 'all' | 'thisMonth' | 'lastMonth' | 'last30Days' | 'last15Days' | 'thisYear' | 'next15Days' | 'nextMonth' | 'next30Days' | 'custom';

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface Bank {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

interface Contact {
  id: string;
  name: string;
  is_active: boolean;
}

interface UnifiedFilterBoxProps {
  // Search
  searchTerm: string;
  onSearchChange: (value: string) => void;
  
  // Period
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;
  customStartDate: Date | null;
  customEndDate: Date | null;
  onCustomStartDateChange: (date: Date | null) => void;
  onCustomEndDateChange: (date: Date | null) => void;
  
  // Dimensions
  bankId: string;
  onBankChange: (id: string) => void;
  banks: Bank[];
  
  categoryId: string;
  onCategoryChange: (id: string) => void;
  categories: Category[];
  
  paymentStatus: string;
  onPaymentStatusChange: (status: string) => void;
  
  contactId: string;
  onContactChange: (id: string) => void;
  contacts: Contact[];
  
  // Clear
  onClearFilters: () => void;
  
  // Optional type filter (for Transactions page)
  type?: string;
  onTypeChange?: (type: string) => void;
  showTypeFilter?: boolean;
}

const periodOptions: { value: PeriodFilter; label: string; group: 'past' | 'future' | 'other' }[] = [
  { value: 'all', label: 'Todos', group: 'other' },
  { value: 'thisMonth', label: 'Este Mês', group: 'past' },
  { value: 'lastMonth', label: 'Mês Anterior', group: 'past' },
  { value: 'last30Days', label: 'Últimos 30 dias', group: 'past' },
  { value: 'last15Days', label: 'Últimos 15 dias', group: 'past' },
  { value: 'thisYear', label: 'Este Ano', group: 'past' },
  { value: 'next15Days', label: 'Próximos 15 dias', group: 'future' },
  { value: 'nextMonth', label: 'Próximo Mês', group: 'future' },
  { value: 'next30Days', label: 'Próximos 30 dias', group: 'future' },
  { value: 'custom', label: 'Personalizado', group: 'other' },
];

const getPeriodLabel = (period: PeriodFilter): string => {
  const option = periodOptions.find(o => o.value === period);
  return option?.label || 'Período';
};

const getDateRangeFromPeriod = (period: PeriodFilter): { start: Date; end: Date } | null => {
  const now = new Date();
  switch (period) {
    case 'thisMonth':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'lastMonth':
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    case 'last30Days':
      return { start: subDays(now, 30), end: now };
    case 'last15Days':
      return { start: subDays(now, 15), end: now };
    case 'thisYear':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'next15Days':
      return { start: now, end: addDays(now, 15) };
    case 'nextMonth':
      const nextMonth = addMonths(now, 1);
      return { start: startOfMonth(nextMonth), end: endOfMonth(nextMonth) };
    case 'next30Days':
      return { start: now, end: addDays(now, 30) };
    default:
      return null;
  }
};

export function UnifiedFilterBox({
  searchTerm,
  onSearchChange,
  period,
  onPeriodChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  bankId,
  onBankChange,
  banks,
  categoryId,
  onCategoryChange,
  categories,
  paymentStatus,
  onPaymentStatusChange,
  contactId,
  onContactChange,
  contacts,
  onClearFilters,
  type,
  onTypeChange,
  showTypeFilter = false,
}: UnifiedFilterBoxProps) {
  const [periodPopoverOpen, setPeriodPopoverOpen] = useState(false);

  const hasActiveFilters = 
    period !== 'all' || 
    bankId !== 'all' || 
    categoryId !== 'all' || 
    paymentStatus !== 'all' || 
    contactId !== 'all' || 
    searchTerm !== '' ||
    (showTypeFilter && type !== 'all');

  const handlePeriodSelect = (value: PeriodFilter) => {
    onPeriodChange(value);
    if (value !== 'custom') {
      setPeriodPopoverOpen(false);
    }
  };

  const formatPeriodDisplay = () => {
    if (period === 'custom' && customStartDate && customEndDate) {
      return `${format(customStartDate, 'dd/MM/yy')} - ${format(customEndDate, 'dd/MM/yy')}`;
    }
    return getPeriodLabel(period);
  };

  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4 space-y-4">
        {/* Row 1: Search and Period */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              value={searchTerm} 
              onChange={(e) => onSearchChange(e.target.value)} 
              placeholder="Buscar por descrição..." 
              className="pl-9"
            />
          </div>

          {/* Period Selector - Smart Datepicker */}
          <Popover open={periodPopoverOpen} onOpenChange={setPeriodPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full md:w-[220px] justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{formatPeriodDisplay()}</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 space-y-3">
                {/* Quick shortcuts */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-2">Atalhos Rápidos</p>
                  <div className="grid grid-cols-2 gap-1">
                    {periodOptions.filter(o => o.value !== 'custom' && o.value !== 'all').map((option) => (
                      <Button
                        key={option.value}
                        variant={period === option.value ? 'default' : 'ghost'}
                        size="sm"
                        className="justify-start text-xs h-8"
                        onClick={() => handlePeriodSelect(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Custom range */}
                <div className="space-y-2">
                  <Button
                    variant={period === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={() => handlePeriodSelect('custom')}
                  >
                    Personalizado
                  </Button>
                  
                  {period === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Início</p>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className={cn(
                                "w-full justify-start text-left text-xs h-8",
                                !customStartDate && "text-muted-foreground"
                              )}
                            >
                              {customStartDate ? format(customStartDate, 'dd/MM/yy') : 'Selecione'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={customStartDate || undefined}
                              onSelect={(date) => onCustomStartDateChange(date || null)}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Fim</p>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className={cn(
                                "w-full justify-start text-left text-xs h-8",
                                !customEndDate && "text-muted-foreground"
                              )}
                            >
                              {customEndDate ? format(customEndDate, 'dd/MM/yy') : 'Selecione'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={customEndDate || undefined}
                              onSelect={(date) => onCustomEndDateChange(date || null)}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 2: Dimension Filters (4-5 columns) */}
        <div className={cn(
          "grid gap-4",
          showTypeFilter 
            ? "grid-cols-2 md:grid-cols-5" 
            : "grid-cols-2 md:grid-cols-4"
        )}>
          {/* Bank Filter */}
          <Select value={bankId} onValueChange={onBankChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Conta Bancária" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Contas</SelectItem>
              {banks.filter(b => b.is_active).map((bank) => (
                <SelectItem key={bank.id} value={bank.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: bank.color || '#3B82F6' }} 
                    />
                    {bank.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category Filter */}
          <Select value={categoryId} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Evento Contábil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Eventos Contábeis</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: cat.color || '#6B7280' }} 
                    />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={paymentStatus} onValueChange={onPaymentStatusChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>

          {/* Contact Filter */}
          <Select value={contactId} onValueChange={onContactChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Participante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Participantes</SelectItem>
              {contacts.filter(c => c.is_active).map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type Filter (only for Transactions page) */}
          {showTypeFilter && onTypeChange && (
            <Select value={type || 'all'} onValueChange={onTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Footer: Clear Filters */}
        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClearFilters} 
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Limpar Filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { getDateRangeFromPeriod };
