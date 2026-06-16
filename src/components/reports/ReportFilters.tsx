import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, Download, FileText, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Bank {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  type: string;
}

export type QuickPeriod = 'thisMonth' | 'lastMonth' | 'thisYear' | 'last30Days' | 'last15Days' | 'nextMonth' | 'next30Days' | 'next15Days' | null;

interface ReportFiltersProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  bankId: string;
  onBankChange: (value: string) => void;
  transactionType: string;
  onTransactionTypeChange: (value: string) => void;
  contactId: string;
  onContactChange: (value: string) => void;
  paymentStatus: string;
  onPaymentStatusChange: (value: string) => void;
  categories: Category[];
  banks: Bank[];
  contacts: Contact[];
  onExportCSV: () => void;
  onExportPDF: () => void;
  quickPeriod: QuickPeriod;
  onQuickPeriodChange: (period: QuickPeriod) => void;
}

const pastPeriodOptions: { value: QuickPeriod; label: string }[] = [
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês anterior' },
  { value: 'thisYear', label: 'Este ano' },
  { value: 'last30Days', label: 'Últimos 30 dias' },
  { value: 'last15Days', label: 'Últimos 15 dias' },
];

const futurePeriodOptions: { value: QuickPeriod; label: string }[] = [
  { value: 'nextMonth', label: 'Próximo mês' },
  { value: 'next30Days', label: 'Próximos 30 dias' },
  { value: 'next15Days', label: 'Próximos 15 dias' },
];

export function ReportFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  categoryId,
  onCategoryChange,
  bankId,
  onBankChange,
  transactionType,
  onTransactionTypeChange,
  contactId,
  onContactChange,
  paymentStatus,
  onPaymentStatusChange,
  categories,
  banks,
  contacts,
  onExportCSV,
  onExportPDF,
  quickPeriod,
  onQuickPeriodChange,
}: ReportFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Filtros</CardTitle>
              <CardDescription>Personalize seu relatório</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Past period buttons */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Períodos Passados</label>
            <div className="flex flex-wrap gap-2">
              {pastPeriodOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={quickPeriod === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onQuickPeriodChange(option.value)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Future period buttons for accounts payable/receivable */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Contas a Pagar/Receber (Pendentes)
            </label>
            <div className="flex flex-wrap gap-2">
              {futurePeriodOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={quickPeriod === option.value ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => onQuickPeriodChange(option.value)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date and filter row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Data Inicial</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Selecione'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={onStartDateChange} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Data Final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Selecione'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={onEndDateChange} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <Select value={transactionType} onValueChange={onTransactionTypeChange}>
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
              <label className="text-sm font-medium text-foreground">Evento Contábil</label>
              <Select value={categoryId} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Banco</label>
              <Select value={bankId} onValueChange={onBankChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cliente/Fornecedor</label>
              <Select value={contactId} onValueChange={onContactChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name}
                    </SelectItem>
                  ))}
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
        </CardContent>
      </Card>

      {/* Export Card */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Exportar Relatório</CardTitle>
              <CardDescription>Baixe seus dados em diferentes formatos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onExportCSV} className="gap-2 flex-1 sm:flex-none">
              <Download className="h-4 w-4" />
              <span>Exportar CSV</span>
            </Button>
            <Button onClick={onExportPDF} className="gap-2 flex-1 sm:flex-none bg-primary hover:bg-primary/90">
              <FileText className="h-4 w-4" />
              <span>Exportar PDF</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}