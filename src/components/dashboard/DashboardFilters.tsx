import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Download, FileText, Filter, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type QuickPeriod = 'thisMonth' | 'lastMonth' | 'thisYear' | 'last30Days' | 'last15Days' | 'nextMonth' | 'next30Days' | 'next15Days' | null;

interface Bank {
  id: string;
  name: string;
  color: string | null;
}

interface DashboardFiltersProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onExportCSV: () => void;
  onExportPDF: () => void;
  quickPeriod: QuickPeriod;
  onQuickPeriodChange: (period: QuickPeriod) => void;
  banks?: Bank[];
  selectedBankId: string | null;
  onBankChange: (bankId: string | null) => void;
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

export function DashboardFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onExportCSV,
  onExportPDF,
  quickPeriod,
  onQuickPeriodChange,
  banks = [],
  selectedBankId,
  onBankChange,
}: DashboardFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Filtros</CardTitle>
              <CardDescription>Selecione o período e conta para visualização</CardDescription>
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

          {/* Date selectors and bank filter row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {/* Bank Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Conta/Banco</label>
              <Select 
                value={selectedBankId || 'all'} 
                onValueChange={(value) => onBankChange(value === 'all' ? null : value)}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Todas as Contas" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      Todas as Contas
                    </span>
                  </SelectItem>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      <span className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: bank.color || '#3B82F6' }} 
                        />
                        {bank.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  <Calendar 
                    mode="single" 
                    selected={startDate} 
                    onSelect={onStartDateChange} 
                    locale={ptBR} 
                    initialFocus 
                    className="pointer-events-auto"
                  />
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
                  <Calendar 
                    mode="single" 
                    selected={endDate} 
                    onSelect={onEndDateChange} 
                    locale={ptBR} 
                    initialFocus 
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Export buttons inline */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Exportar</label>
              <Button variant="outline" onClick={onExportCSV} className="w-full gap-2">
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">&nbsp;</label>
              <Button onClick={onExportPDF} className="w-full gap-2 bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
