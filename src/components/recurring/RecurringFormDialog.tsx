import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { addMonths, differenceInMonths, format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCategories, CategoryInsert } from '@/hooks/useCategories';
import { useBanks, BankInsert } from '@/hooks/useBanks';
import { useContacts, ContactInsert } from '@/hooks/useContacts';
import { RecurringTransaction, RecurringTransactionInsert } from '@/hooks/useRecurringTransactions';
import { WeekDaysSelector } from './WeekDaysSelector';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { BankFormDialog } from '@/components/banks/BankFormDialog';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils';

interface RecurringFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurring?: RecurringTransaction | null;
  onSubmit: (data: RecurringTransactionInsert) => void;
  isLoading?: boolean;
  initialContactId?: string;
}

export function RecurringFormDialog({
  open,
  onOpenChange,
  recurring,
  onSubmit,
  isLoading,
  initialContactId,
}: RecurringFormDialogProps) {
  const { categories, createCategory } = useCategories();
  const { banks, createBank } = useBanks();
  const { contacts, createContact } = useContacts();
  
  const [formData, setFormData] = useState<RecurringTransactionInsert>({
    description: '',
    amount: 0,
    type: 'despesa',
    frequency: 'monthly',
    day_of_month: 1,
    times_per_week: 1,
    days_of_week: [],
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    category_id: null,
    bank_id: null,
    contact_id: null,
    is_active: true,
    notes: null,
  });

  const [amountDisplay, setAmountDisplay] = useState('0,00');
  const [installments, setInstallments] = useState<number | null>(null);
  
  // Inline creation dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);

  useEffect(() => {
    if (recurring) {
      setFormData({
        description: recurring.description,
        amount: recurring.amount,
        type: recurring.type,
        frequency: recurring.frequency,
        day_of_month: recurring.day_of_month,
        times_per_week: recurring.times_per_week || 1,
        days_of_week: recurring.days_of_week || [],
        start_date: recurring.start_date,
        end_date: recurring.end_date,
        category_id: recurring.category_id,
        bank_id: recurring.bank_id,
        contact_id: recurring.contact_id,
        is_active: recurring.is_active,
        notes: recurring.notes,
      });
      setAmountDisplay(formatCurrencyInput((recurring.amount * 100).toString()));
      
      // Calculate installments from existing dates when editing monthly
      if (recurring.frequency === 'monthly' && recurring.start_date && recurring.end_date) {
        const start = new Date(recurring.start_date);
        const end = new Date(recurring.end_date);
        const months = differenceInMonths(end, start) + 1;
        setInstallments(months > 0 ? months : null);
      } else {
        setInstallments(null);
      }
    } else {
      setFormData({
        description: '',
        amount: 0,
        type: 'despesa',
        frequency: 'monthly',
        day_of_month: 1,
        times_per_week: 1,
        days_of_week: [],
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        category_id: null,
        bank_id: null,
        contact_id: initialContactId || null,
        is_active: true,
        notes: null,
      });
      setAmountDisplay('0,00');
      setInstallments(null);
    }
  }, [recurring, open, initialContactId]);

  const calcularDataFim = () => {
    if (!installments || !formData.start_date) return null;
    const startDate = new Date(formData.start_date);
    const endDate = addMonths(startDate, installments - 1);
    return format(endDate, 'dd/MM/yyyy');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let calculatedEndDate = formData.end_date;
    
    // If monthly and has installments, calculate end_date
    if (formData.frequency === 'monthly' && installments) {
      const startDate = new Date(formData.start_date);
      const endDate = addMonths(startDate, installments - 1);
      calculatedEndDate = endDate.toISOString().split('T')[0];
    }
    
    onSubmit({
      ...formData,
      amount: parseCurrencyInput(amountDisplay),
      end_date: calculatedEndDate,
    });
  };

  const handleCategoryCreate = (data: CategoryInsert) => {
    createCategory.mutate(data, {
      onSuccess: (newCategory) => {
        setFormData(prev => ({ ...prev, category_id: newCategory.id }));
        setCategoryDialogOpen(false);
      }
    });
  };

  const handleContactCreate = (data: ContactInsert) => {
    createContact.mutate(data, {
      onSuccess: (newContact) => {
        setFormData(prev => ({ ...prev, contact_id: newContact.id }));
        setContactDialogOpen(false);
      }
    });
  };

  const handleBankCreate = (data: BankInsert) => {
    createBank.mutate(data, {
      onSuccess: (newBank) => {
        setFormData(prev => ({ ...prev, bank_id: newBank.id }));
        setBankDialogOpen(false);
      }
    });
  };

  const filteredCategories = categories;
  const activeBanks = banks.filter(b => b.is_active);
  const filteredContacts = contacts.filter(c => c.is_active);

  const frequencyLabels = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    yearly: 'Anual',
  };

  const isFormValid = 
    formData.description.trim() && 
    parseCurrencyInput(amountDisplay) > 0 && 
    formData.category_id && 
    formData.bank_id;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {recurring ? 'Editar Conta Recorrente' : 'Nova Conta Recorrente'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formData.type === 'despesa' ? 'destructive' : 'outline'}
                className="flex-1"
                onClick={() => setFormData(prev => ({ ...prev, type: 'despesa', category_id: null, contact_id: null }))}
              >
                Despesa
              </Button>
              <Button
                type="button"
                variant={formData.type === 'receita' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setFormData(prev => ({ ...prev, type: 'receita', category_id: null, contact_id: null }))}
              >
                Receita
              </Button>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Column 1 */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição <span className="text-destructive">*</span></Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Ex: Aluguel, Salário..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequência <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={(value: 'weekly' | 'monthly' | 'yearly') => 
                      setFormData(prev => ({ ...prev, frequency: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(frequencyLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_date">Data Início</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    min="1900-01-01" max="9999-12-31"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Evento Contábil <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.category_id || 'none'}
                    onValueChange={(value) => {
                      if (value === 'add_new') {
                        setCategoryDialogOpen(true);
                      } else {
                        setFormData(prev => ({ ...prev, category_id: value === 'none' ? null : value }));
                      }
                    }}
                  >
                    <SelectTrigger className={!formData.category_id ? 'border-muted-foreground/30' : ''}>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="add_new">
                        <div className="flex items-center gap-2 text-primary">
                          <Plus className="w-4 h-4" />
                          Novo evento contábil
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank">Conta/Banco <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.bank_id || 'none'}
                    onValueChange={(value) => {
                      if (value === 'add_new') {
                        setBankDialogOpen(true);
                      } else {
                        setFormData(prev => ({ ...prev, bank_id: value === 'none' ? null : value }));
                      }
                    }}
                  >
                    <SelectTrigger className={!formData.bank_id ? 'border-muted-foreground/30' : ''}>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeBanks.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: bank.color || '#10B981' }} 
                            />
                            {bank.name}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="add_new">
                        <div className="flex items-center gap-2 text-primary">
                          <Plus className="w-4 h-4" />
                          Nova conta/banco
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$) <span className="text-destructive">*</span></Label>
                  <Input
                    id="amount"
                    type="text"
                    inputMode="numeric"
                    value={amountDisplay}
                    onChange={(e) => setAmountDisplay(formatCurrencyInput(e.target.value))}
                    placeholder="0,00"
                    required
                    className="text-lg font-semibold"
                  />
                </div>

                {/* Weekly frequency options */}
                {formData.frequency === 'weekly' && (
                  <WeekDaysSelector
                    timesPerWeek={formData.times_per_week || 1}
                    selectedDays={formData.days_of_week || []}
                    onTimesChange={(times) => setFormData(prev => ({ 
                      ...prev, 
                      times_per_week: times,
                      days_of_week: (prev.days_of_week || []).slice(0, times)
                    }))}
                    onDaysChange={(days) => setFormData(prev => ({ ...prev, days_of_week: days }))}
                  />
                )}

                {formData.frequency === 'monthly' && (
                  <div className="space-y-2">
                    <Label htmlFor="day_of_month">Dia do Mês</Label>
                    <Input
                      id="day_of_month"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.day_of_month || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, day_of_month: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                )}

                {formData.frequency === 'monthly' ? (
                  <div className="space-y-2">
                    <Label htmlFor="installments">Número de Parcelas</Label>
                    <Input
                      id="installments"
                      type="number"
                      min="1"
                      max="120"
                      value={installments || ''}
                      onChange={(e) => setInstallments(parseInt(e.target.value) || null)}
                      placeholder="Ex: 12"
                    />
                    {installments && formData.start_date && (
                      <p className="text-xs text-muted-foreground">
                        Término previsto: {calcularDataFim()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="end_date">Data Fim (opcional)</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value || null }))}
                      min="1900-01-01" max="9999-12-31"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="contact">Contato</Label>
                  <Select
                    value={formData.contact_id || 'none'}
                    onValueChange={(value) => {
                      if (value === 'add_new') {
                        setContactDialogOpen(true);
                      } else {
                        setFormData(prev => ({ ...prev, contact_id: value === 'none' ? null : value }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem contato</SelectItem>
                      {filteredContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="add_new">
                        <div className="flex items-center gap-2 text-primary">
                          <Plus className="w-4 h-4" />
                          Novo cliente/fornecedor
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <Label htmlFor="is_active" className="font-medium">Ativa</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                </div>
              </div>
            </div>

            {/* Notes - Full width */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value || null }))}
                placeholder="Observações..."
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading || !isFormValid}>
                {isLoading ? 'Salvando...' : recurring ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inline creation dialogs */}
      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSubmit={handleCategoryCreate}
        isLoading={createCategory.isPending}
      />

      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onSubmit={handleContactCreate}
        isLoading={createContact.isPending}
      />

      <BankFormDialog
        open={bankDialogOpen}
        onOpenChange={setBankDialogOpen}
        onSubmit={handleBankCreate}
        isLoading={createBank.isPending}
      />
    </>
  );
}
