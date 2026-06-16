import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Filter, Search, X, CalendarIcon } from 'lucide-react';
import { Category } from '@/hooks/useCategories';
import { Bank } from '@/hooks/useBanks';
import { Contact } from '@/hooks/useContacts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
export type PeriodFilter = 'all' | 'thisMonth' | 'lastMonth' | 'last30Days' | 'last15Days' | 'thisYear' | 'next15Days' | 'nextMonth' | 'next30Days' | 'custom';
interface TransactionFiltersProps {
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;
  type: string;
  onTypeChange: (type: string) => void;
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
  bankId: string;
  onBankChange: (bankId: string) => void;
  contactId: string;
  onContactChange: (contactId: string) => void;
  paymentStatus: string;
  onPaymentStatusChange: (status: string) => void;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  categories: Category[];
  banks: Bank[];
  contacts: Contact[];
  onClearFilters: () => void;
  customStartDate: Date | null;
  customEndDate: Date | null;
  onCustomStartDateChange: (date: Date | null) => void;
  onCustomEndDateChange: (date: Date | null) => void;
}
const periodOptions: {
  value: PeriodFilter;
  label: string;
}[] = [{
  value: 'all',
  label: 'Todos'
}, {
  value: 'thisMonth',
  label: 'Este mês'
}, {
  value: 'lastMonth',
  label: 'Mês anterior'
}, {
  value: 'last30Days',
  label: 'Últimos 30 dias'
}, {
  value: 'last15Days',
  label: 'Últimos 15 dias'
}, {
  value: 'thisYear',
  label: 'Este ano'
}, {
  value: 'next15Days',
  label: 'Próximos 15 dias'
}, {
  value: 'nextMonth',
  label: 'Próximo mês'
}, {
  value: 'next30Days',
  label: 'Próximos 30 dias'
}, {
  value: 'custom',
  label: 'Personalizado'
}];
export function TransactionFilters({
  period,
  onPeriodChange,
  type,
  onTypeChange,
  categoryId,
  onCategoryChange,
  bankId,
  onBankChange,
  contactId,
  onContactChange,
  paymentStatus,
  onPaymentStatusChange,
  searchTerm,
  onSearchChange,
  categories,
  banks,
  contacts,
  onClearFilters,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange
}: TransactionFiltersProps) {
  const hasActiveFilters = period !== 'thisMonth' || type !== 'all' || categoryId !== 'all' || bankId !== 'all' || contactId !== 'all' || paymentStatus !== 'all' || searchTerm !== '';
  return <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold text-primary">Filtros</span>
          </div>
          {hasActiveFilters && <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
              Limpar
            </Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* First row of filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Período</label>
            <Select value={period} onValueChange={v => onPeriodChange(v as PeriodFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range - Only shown when period is 'custom' */}
          {period === 'custom' && <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Início</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !customStartDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "dd/MM/yyyy", {
                    locale: ptBR
                  }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStartDate || undefined} onSelect={date => onCustomStartDateChange(date || null)} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Fim</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !customEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "dd/MM/yyyy", {
                    locale: ptBR
                  }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEndDate || undefined} onSelect={date => onCustomEndDateChange(date || null)} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tipo</label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Categoria</label>
            <Select value={categoryId} onValueChange={onCategoryChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{
                    backgroundColor: cat.color
                  }} />
                      {cat.name}
                    </div>
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Conta</label>
            <Select value={bankId} onValueChange={onBankChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {banks.filter(b => b.is_active).map(bank => <SelectItem key={bank.id} value={bank.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{
                    backgroundColor: bank.color
                  }} />
                      {bank.name}
                    </div>
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Status</label>
            <Select value={paymentStatus} onValueChange={onPaymentStatusChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Cliente/Fornecedor</label>
            <Select value={contactId} onValueChange={onContactChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {contacts.filter(c => c.is_active).map(contact => <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar por descrição..." className="pl-9" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>;
}