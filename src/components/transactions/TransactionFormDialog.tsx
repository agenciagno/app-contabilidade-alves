import { useState, useEffect, useRef } from 'react';
import { isEffectivelyPaid } from '@/lib/financial-utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Transaction, TransactionInsert } from '@/hooks/useTransactions';
import { Category, useCategories, CategoryInsert } from '@/hooks/useCategories';
import { Bank, useBanks, BankInsert } from '@/hooks/useBanks';
import { Contact, useContacts, ContactInsert } from '@/hooks/useContacts';
import { useParties } from '@/hooks/useParties';
import { useTransactionAttachments } from '@/hooks/useTransactionAttachments';
import { AttachmentUpload } from './AttachmentUpload';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { BankFormDialog } from '@/components/banks/BankFormDialog';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, User, Plus, AlertTriangle, CalendarIcon, Repeat } from 'lucide-react';
import { addBusinessDays } from '@/lib/business-days';
import { isValidDateString } from '@/lib/utils';
import { generateInstallments, calculateSummary } from '@/hooks/useInstallments';
import { cn } from '@/lib/utils';

interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  categories: Category[];
  banks: Bank[];
  contacts: Contact[];
  onSubmit: (data: TransactionInsert, pendingFiles?: File[], shouldClose?: boolean) => void;
  onBulkSubmit?: (data: TransactionInsert[]) => Promise<void>;
  isLoading?: boolean;
  defaultType?: 'receita' | 'despesa';
  mode?: 'edit' | 'settle';
  resetKey?: number;
}

function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '');
  const cents = parseInt(numbers || '0', 10);
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyInput(value: string): number {
  const numbers = value.replace(/\D/g, '');
  return parseInt(numbers || '0', 10) / 100;
}

export function TransactionFormDialog({
  open, onOpenChange, transaction, categories, banks, contacts, onSubmit, onBulkSubmit, isLoading, defaultType = 'receita', mode = 'edit', resetKey,
}: TransactionFormDialogProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const isSettleMode = mode === 'settle';
  const isEditing = !!transaction;
  const saveActionRef = useRef<'close' | 'continue'>('close');
  const formRef = useRef<HTMLFormElement>(null);

  const [type, setType] = useState<'receita' | 'despesa'>(defaultType);
  const [paymentCondition, setPaymentCondition] = useState<'a_vista' | 'a_prazo'>('a_vista');
  const [amount, setAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [date, setDate] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [bankId, setBankId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [partyId, setPartyId] = useState<string>('');
  const { data: parties = [] } = useParties();
  const activeParties = parties.filter((p) => p.is_active);
  const [notes, setNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [yearWarningDates, setYearWarningDates] = useState<{ label: string; value: string }[]>([]);
  const [pendingPayload, setPendingPayload] = useState<{ data: TransactionInsert; files: File[]; shouldClose: boolean } | null>(null);

  // Recurring/installment state
  const [isRecurring, setIsRecurring] = useState(false);
  const [endMode, setEndMode] = useState<'parcelas' | 'data_final'>('parcelas');
  const [installmentCount, setInstallmentCount] = useState<string>('');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [bulkSaving, setBulkSaving] = useState(false);

  const isAPrazo = paymentCondition === 'a_prazo' && !isEditing && !isSettleMode;
  const isAVista = paymentCondition === 'a_vista' && !isEditing && !isSettleMode;

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const { createCategory } = useCategories();
  const { createBank } = useBanks();
  const { createContact } = useContacts();
  const { attachments, uploadAttachment, deleteAttachment } = useTransactionAttachments(transaction?.id);

  const filteredCategories = categories.filter(c => c.type === type);
  const activeBanks = banks.filter(b => b.is_active);
  const filteredContacts = contacts.filter(c => c.is_active);

  // Calculate installment summary
  const installmentSummary = isRecurring && dueDate
    ? calculateSummary(
        dueDate,
        endMode,
        endMode === 'parcelas'
          ? parseInt(installmentCount || '0', 10)
          : endDate ? format(endDate, 'yyyy-MM-dd') : ''
      )
    : null;

  // Recurring validation
  const isRecurringValid = !isRecurring || (
    !!dueDate &&
    (endMode === 'parcelas'
      ? parseInt(installmentCount || '0', 10) >= 2
      : !!endDate && installmentSummary !== null && installmentSummary.count >= 2)
  );

  useEffect(() => {
    if (transaction) return;
    if (dueDate) {
      const dueDateObj = new Date(dueDate + 'T00:00:00');
      if (!isNaN(dueDateObj.getTime())) {
        if (type === 'receita') {
          const expected = addBusinessDays(dueDateObj, 2);
          setExpectedDate(format(expected, 'yyyy-MM-dd'));
        } else {
          setExpectedDate(dueDate);
        }
      }
    }
  }, [dueDate, type]);

  useEffect(() => {
    if (transaction) {
      const isPaid = isEffectivelyPaid(transaction);
      setType(transaction.type);
      setAmount(formatCurrencyInput(String(Math.round(Number(transaction.amount) * 100))));
      setPaidAmount(isPaid && transaction.paid_amount != null
        ? formatCurrencyInput(String(Math.round(Number(transaction.paid_amount) * 100)))
        : '');
      setDate(isPaid ? (transaction.date || '') : '');
      setIssueDate(transaction.issue_date || todayStr);
      setDueDate(transaction.due_date || '');
      setExpectedDate(transaction.expected_date || '');
      setCategoryId(transaction.category_id || '');
      setBankId(transaction.bank_id || '');
      setContactId(transaction.contact_id || '');
      setPartyId((transaction as { party_id?: string | null }).party_id || '');
      setNotes(transaction.notes || '');
      setPendingFiles([]);
      setIsRecurring(false);
    } else if (!transaction && open && !resetKey) {
      setType(defaultType);
      setPaymentCondition('a_vista');
      setAmount(''); setPaidAmount('');
      setDate(''); setIssueDate(todayStr); setDueDate(''); setExpectedDate('');
      setCategoryId(''); setBankId(''); setContactId(''); setPartyId('');
      setNotes(''); setPendingFiles([]);
      resetRecurring();
    } else if (!transaction && resetKey) {
      setAmount(''); setPaidAmount('');
      setDate(''); setIssueDate(todayStr); setDueDate(''); setExpectedDate('');
      setCategoryId(''); setBankId(''); setContactId(''); setPartyId('');
      setNotes(''); setPendingFiles([]);
      resetRecurring();
    }
  }, [transaction, open, defaultType, resetKey]);

  useEffect(() => {
    if (!open) {
      resetForm();
      resetRecurring();
    }
  }, [open]);

  useEffect(() => {
    if (transaction) return;
    // Limpa categoria apenas se a selecionada não pertence mais ao tipo atual
    if (categoryId && !categories.some(c => c.id === categoryId && c.type === type)) {
      setCategoryId('');
    }
  }, [type, transaction, categories, categoryId]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => setAmount(formatCurrencyInput(e.target.value));
  const handlePaidAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => setPaidAmount(formatCurrencyInput(e.target.value));

  const { toast } = useToast();

  const resetForm = () => {
    setAmount(''); setPaidAmount('');
    setDate(''); setIssueDate(todayStr); setDueDate(''); setExpectedDate('');
    setCategoryId(''); setBankId(''); setContactId('');
    setNotes(''); setPendingFiles([]);
  };

  const resetRecurring = () => {
    setIsRecurring(false);
    setEndMode('parcelas');
    setInstallmentCount('');
    setEndDate(undefined);
  };

  const handlePaymentConditionChange = (v: string) => {
    setPaymentCondition(v as 'a_vista' | 'a_prazo');
    if (v === 'a_prazo') {
      setPaidAmount('');
      setDate('');
    } else if (v === 'a_vista') {
      // À Vista não compõe Previsto da DRE — limpa data prevista
      setExpectedDate('');
    }
  };

  const checkYearAndSubmit = (payload: TransactionInsert, files: File[], shouldClose: boolean) => {
    const currentYear = new Date().getFullYear();
    const dateLabels: Record<string, string> = {
      issue_date: 'Emissão',
      due_date: 'Vencimento',
      expected_date: 'Prevista',
      date: 'Pagamento',
    };
    const offYearDates: { label: string; value: string }[] = [];
    for (const [key, label] of Object.entries(dateLabels)) {
      const val = (payload as any)[key];
      if (val && typeof val === 'string' && val.length >= 4) {
        const year = parseInt(val.substring(0, 4), 10);
        if (!isNaN(year) && year !== currentYear) {
          const [y, m, d] = val.split('-');
          offYearDates.push({ label, value: `${d}/${m}/${y}` });
        }
      }
    }
    if (offYearDates.length > 0) {
      setYearWarningDates(offYearDates);
      setPendingPayload({ data: payload, files, shouldClose });
      return;
    }
    executeSubmit(payload, files, shouldClose);
  };

  const executeSubmit = async (payload: TransactionInsert, files: File[], shouldClose: boolean) => {
    if (isRecurring && !isEditing && !isSettleMode && onBulkSubmit) {
      const count = installmentSummary?.count || 0;
      if (count < 2) return;
      const installments = generateInstallments(payload, count);
      setBulkSaving(true);
      try {
        await onBulkSubmit(installments);
        toast({ title: `${count} transações criadas com sucesso.` });
        onOpenChange(false);
      } catch (err: any) {
        toast({ title: 'Erro ao criar parcelas', description: err?.message || 'Erro desconhecido', variant: 'destructive' });
      } finally {
        setBulkSaving(false);
      }
    } else {
      onSubmit(payload, files, shouldClose);
    }
  };

  const handleConfirmYear = () => {
    if (pendingPayload) {
      executeSubmit(pendingPayload.data, pendingPayload.files, pendingPayload.shouldClose);
      setPendingPayload(null);
      setYearWarningDates([]);
    }
  };

  const handleCancelYear = () => {
    setPendingPayload(null);
    setYearWarningDates([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Recurring validation
    if (isRecurring && !isEditing && !isSettleMode) {
      if (!dueDate) {
        toast({ title: 'Preencha o Vencimento antes de ativar a recorrência.', variant: 'destructive' });
        return;
      }
      if (!isRecurringValid) {
        toast({ title: 'Preencha os campos de recorrência corretamente.', variant: 'destructive' });
        return;
      }
    }

    // Date validation
    const dateFields = [
      { value: issueDate, label: 'Emissão' },
      { value: dueDate, label: 'Vencimento' },
      { value: expectedDate, label: 'Prevista' },
      ...(date ? [{ value: date, label: 'Pagamento' }] : []),
    ];
    for (const field of dateFields) {
      if (field.value && !isValidDateString(field.value)) {
        toast({ title: `Data inválida no campo "${field.label}". Use o formato AAAA-MM-DD com valores válidos.`, variant: 'destructive' });
        return;
      }
    }

    const selectedCategory = filteredCategories.find(c => c.id === categoryId);
    const autoDescription = selectedCategory?.name || 'Movimentação';
    const paidAmountValue = parseCurrencyInput(paidAmount);

    if (isSettleMode) {
      const payload = {
        type,
        description: autoDescription,
        amount: parseCurrencyInput(amount),
        paid_amount: paidAmountValue,
        date: date || undefined,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        expected_date: expectedDate || null,
        category_id: categoryId || transaction?.category_id || null,
        bank_id: bankId || transaction?.bank_id || null,
        contact_id: contactId || transaction?.contact_id || null,
        is_paid: true,
        notes: notes || null,
      } as TransactionInsert;
      checkYearAndSubmit(payload, pendingFiles, true);
      return;
    }

    // À Prazo: save as pending
    if (isAPrazo) {
      const shouldClose = saveActionRef.current === 'close';
      const payload = {
        type,
        description: autoDescription,
        amount: parseCurrencyInput(amount),
        paid_amount: null,
        date: undefined,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        expected_date: expectedDate || null,
        category_id: categoryId || (isEditing ? transaction?.category_id : null) || null,
        bank_id: bankId || (isEditing ? transaction?.bank_id : null) || null,
        contact_id: contactId || (isEditing ? transaction?.contact_id : null) || null,
        is_paid: false,
        notes: notes || null,
      } as TransactionInsert;
      checkYearAndSubmit(payload, pendingFiles, shouldClose);
      saveActionRef.current = 'close';
      return;
    }

    // Edit mode (not settle): preserve original payment state
    if (isEditing && !isSettleMode) {
      const shouldClose = saveActionRef.current === 'close';
      const payload = {
        type,
        description: autoDescription,
        amount: parseCurrencyInput(amount),
        paid_amount: transaction?.paid_amount ?? null,
        date: transaction?.date || undefined,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        expected_date: expectedDate || null,
        category_id: categoryId || transaction?.category_id || null,
        bank_id: bankId || transaction?.bank_id || null,
        contact_id: contactId || transaction?.contact_id || null,
        is_paid: transaction?.is_paid ?? false,
        notes: notes || null,
      } as TransactionInsert;
      checkYearAndSubmit(payload, pendingFiles, shouldClose);
      saveActionRef.current = 'close';
      return;
    }

    // New transaction À Vista: always save as paid (liquidado)
    const shouldClose = saveActionRef.current === 'close';
    const amountValue = parseCurrencyInput(amount);
    const finalAmount = amountValue > 0 ? amountValue : paidAmountValue;

    const payload = {
      type,
      description: autoDescription,
      amount: finalAmount,
      paid_amount: paidAmountValue,
      date: date || undefined,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      expected_date: expectedDate || null,
      category_id: categoryId || null,
      bank_id: bankId || null,
      contact_id: contactId || null,
      is_paid: true,
      notes: notes || null,
    } as TransactionInsert;

    checkYearAndSubmit(payload, pendingFiles, shouldClose);
    saveActionRef.current = 'close';
  };

  const handleCreateCategory = (data: CategoryInsert) => {
    createCategory.mutate(data, { onSuccess: (nc) => { setCategoryId(nc.id); setCategoryDialogOpen(false); } });
  };
  const handleCreateBank = (data: BankInsert) => {
    createBank.mutate(data, { onSuccess: (nb) => { setBankId(nb.id); setBankDialogOpen(false); } });
  };
  const handleCreateContact = (data: ContactInsert) => {
    createContact.mutate({ ...data, type: 'cliente' }, { onSuccess: (nc) => { setContactId(nc.id); setContactDialogOpen(false); } });
  };

  const handleCategoryChange = (v: string) => { if (v === '__new__') setCategoryDialogOpen(true); else setCategoryId(v); };
  const handleBankChange = (v: string) => { if (v === '__new__') setBankDialogOpen(true); else setBankId(v); };
  const handleContactChange = (v: string) => { if (v === '__new__') setContactDialogOpen(true); else setContactId(v); };

  // Validation rules per mode
  const baseFormValid = isSettleMode
    ? parseCurrencyInput(paidAmount) > 0 && !!bankId && !!date
    : isAVista
      ? parseCurrencyInput(paidAmount) > 0 && !!bankId && !!date && !!categoryId && !!contactId && !!issueDate
      : parseCurrencyInput(amount) > 0 && !!categoryId && !!contactId && !!issueDate && !!dueDate && !!expectedDate;

  const isFormValid = baseFormValid && isRecurringValid;

  // Disabled states
  const structuralDisabled = isSettleMode;
  const isSaving = isLoading || bulkSaving;

  const dialogTitle = isSettleMode
    ? 'Liquidar Transação'
    : transaction ? 'Editar Transação' : 'Nova Transação';

  const submitLabel = isSettleMode ? 'Liquidar' : 'Salvar';

  // Min date for end date picker: month after due date
  const endDateMinDate = dueDate
    ? (() => {
        const d = new Date(dueDate + 'T00:00:00');
        if (isNaN(d.getTime())) return undefined;
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
        return d;
      })()
    : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-[rgba(22,22,26,0.85)] backdrop-blur-[24px] border-white/[0.08] rounded-2xl p-5">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            {/* Type Toggle */}
            <Tabs value={type} onValueChange={(v) => !structuralDisabled && setType(v as 'receita' | 'despesa')}>
              <TabsList className={`w-full h-9 ${structuralDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
                <TabsTrigger value="receita" className="flex-1 gap-1.5 text-xs h-7" disabled={structuralDisabled}>
                  <TrendingUp className="w-3.5 h-3.5" /> Receita
                </TabsTrigger>
                <TabsTrigger value="despesa" className="flex-1 gap-1.5 text-xs h-7" disabled={structuralDisabled}>
                  <TrendingDown className="w-3.5 h-3.5" /> Despesa
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Payment Condition Toggle — only for new transactions */}
            {!isEditing && !isSettleMode && (
              <Tabs value={paymentCondition} onValueChange={handlePaymentConditionChange}>
                <TabsList className="w-full h-8">
                  <TabsTrigger value="a_vista" className="flex-1 text-xs h-6">À Vista</TabsTrigger>
                  <TabsTrigger value="a_prazo" className="flex-1 text-xs h-6">À Prazo</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {/* Row 1: Cliente | Valor | Valor Recebido/Pago */}
            <div className={`grid grid-cols-1 ${isAPrazo ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
              <div className="space-y-1.5">
                <Label className="text-xs">Cliente/Fornecedor <span className="text-destructive">*</span></Label>
                <Select value={contactId} onValueChange={handleContactChange} disabled={structuralDisabled}>
                  <SelectTrigger className={`h-8 text-xs ${structuralDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__" className="text-primary font-medium text-xs">
                      <div className="flex items-center gap-1"><Plus className="w-3 h-3" /> Novo</div>
                    </SelectItem>
                    {filteredContacts.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        <div className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{c.name}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) {!isAVista && <span className="text-destructive">*</span>}</Label>
                <Input value={amount} onChange={handleAmountChange} placeholder="0,00" className="h-8 text-sm font-semibold" disabled={isSettleMode} />
              </div>
              {!isAPrazo && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {type === 'receita' ? 'Valor Recebido' : 'Valor Pago'}
                    {(isSettleMode || isAVista) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input value={paidAmount} onChange={handlePaidAmountChange} placeholder="0,00" className="h-8 text-sm" disabled={isEditing && !isSettleMode} />
                </div>
              )}
            </div>

            {/* Row 2: Evento Contábil | Conta/Banco */}
<div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Evento Contábil <span className="text-destructive">*</span></Label>
                <Select value={categoryId} onValueChange={handleCategoryChange} disabled={structuralDisabled}>
                  <SelectTrigger className={`h-8 text-xs ${structuralDisabled ? 'opacity-60 cursor-not-allowed' : !categoryId ? 'border-muted-foreground/30' : ''}`}>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__" className="text-primary font-medium text-xs">
                      <div className="flex items-center gap-1"><Plus className="w-3 h-3" /> Novo</div>
                    </SelectItem>
                    {filteredCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs">{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Conta/Banco
                  {(isSettleMode || isAVista) && <span className="text-destructive"> *</span>}
                </Label>
                <Select value={bankId} onValueChange={handleBankChange}>
                  <SelectTrigger className={`h-8 text-xs ${!bankId ? 'border-muted-foreground/30' : ''}`}>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__" className="text-primary font-medium text-xs">
                      <div className="flex items-center gap-1"><Plus className="w-3 h-3" /> Novo</div>
                    </SelectItem>
                    {activeBanks.map(bank => (
                      <SelectItem key={bank.id} value={bank.id} className="text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bank.color }} />
                          {bank.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Datas — Linha 1: Emissão | Vencimento */}
<div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Emissão <span className="text-destructive">*</span></Label>
                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-8 text-xs" disabled={isSettleMode} min="1900-01-01" max="9999-12-31" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento {(!isAVista || isRecurring) && <span className="text-destructive">*</span>}</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-xs" disabled={isSettleMode} min="1900-01-01" max="9999-12-31" />
              </div>
            </div>

            {/* Row 4: Datas — Linha 2: Prevista | Pagamento */}
<div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Prevista {!isAVista && <span className="text-destructive">*</span>}</Label>
                <Input
                  type="date"
                  value={isAVista ? '' : expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  className="h-8 text-xs"
                  disabled={isSettleMode || isAVista}
                  min="1900-01-01"
                  max="9999-12-31"
                />
                {isAVista && (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Transações À Vista não compõem o Previsto da DRE — apenas o Realizado.
                  </p>
                )}
              </div>
              {!isAPrazo && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Pagamento
                    {(isSettleMode || isAVista) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" disabled={isEditing && !isSettleMode} min="1900-01-01" max="9999-12-31" />
                </div>
              )}
            </div>


            {/* Recurring Toggle — only for new transactions */}
            {!isEditing && !isSettleMode && (
              <>
                <div className="flex items-center gap-3 py-1">
                  <Switch
                    id="recurring-toggle"
                    checked={isRecurring}
                    onCheckedChange={(checked) => {
                      setIsRecurring(checked);
                      if (!checked) {
                        setEndMode('parcelas');
                        setInstallmentCount('');
                        setEndDate(undefined);
                      }
                    }}
                  />
                  <Label htmlFor="recurring-toggle" className="text-xs flex items-center gap-1.5 cursor-pointer">
                    <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                    Recorrente / Parcelado
                  </Label>
                </div>

                {/* Recurring section with animation */}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isRecurring ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                    <RadioGroup
                      value={endMode}
                      onValueChange={(v) => setEndMode(v as 'parcelas' | 'data_final')}
                      className="space-y-3"
                    >
                      {/* Option 1: Quantidade de Parcelas */}
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="parcelas" id="mode-parcelas" />
                        <Label htmlFor="mode-parcelas" className="text-xs cursor-pointer">
                          Quantidade de Parcelas
                        </Label>
                        {endMode === 'parcelas' && (
                          <Input
                            type="number"
                            min={2}
                            value={installmentCount}
                            onChange={(e) => setInstallmentCount(e.target.value)}
                            placeholder="Nº de parcelas"
                            className="h-7 text-xs w-32"
                          />
                        )}
                      </div>

                      {/* Option 2: Data Final */}
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="data_final" id="mode-data-final" />
                        <Label htmlFor="mode-data-final" className="text-xs cursor-pointer">
                          Data Final
                        </Label>
                        {endMode === 'data_final' && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "h-7 text-xs w-40 justify-start font-normal",
                                  !endDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="w-3 h-3 mr-1" />
                                {endDate ? format(endDate, 'dd/MM/yyyy') : 'Selecione...'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={endDate}
                                onSelect={setEndDate}
                                disabled={(d) => endDateMinDate ? d < endDateMinDate : false}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </RadioGroup>

                    {/* Dynamic summary */}
                    <p className="text-sm text-muted-foreground">
                      {installmentSummary
                        ? `${installmentSummary.count} parcelas · Primeira em ${installmentSummary.firstDate} · Última em ${installmentSummary.lastDate}`
                        : '— parcelas · —'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Row 4: Anexo | Histórico side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Anexo</Label>
                <div className={isSettleMode ? 'opacity-60 pointer-events-none' : ''}>
                  <AttachmentUpload
                    compact
                    attachments={attachments}
                    pendingFiles={pendingFiles}
                    onAddFiles={(files) => setPendingFiles([...pendingFiles, ...files])}
                    onRemovePendingFile={(index) => setPendingFiles(pendingFiles.filter((_, i) => i !== index))}
                    onDeleteAttachment={(attachment) => deleteAttachment.mutate(attachment)}
                    isUploading={uploadAttachment.isPending}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Histórico</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Histórico..." rows={1} className="min-h-[36px] resize-none text-xs" disabled={isSettleMode} />
              </div>
            </div>

            {/* Row 5: Buttons */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs px-4">
                  Cancelar
                </Button>
                {isSettleMode ? (
                  <Button type="submit" size="sm" disabled={isSaving || !isFormValid} className="h-8 text-xs px-6">
                    {isSaving ? 'Salvando...' : 'Liquidar'}
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="secondary" disabled={isSaving || !isFormValid} className="h-8 text-xs px-4"
                      onClick={() => { saveActionRef.current = 'continue'; formRef.current?.requestSubmit(); }}>
                      {isSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button type="button" size="sm" disabled={isSaving || !isFormValid} className="h-8 text-xs px-4"
                      onClick={() => { saveActionRef.current = 'close'; formRef.current?.requestSubmit(); }}>
                      {isSaving ? 'Salvando...' : 'Salvar e Fechar'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <CategoryFormDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} onSubmit={handleCreateCategory} isLoading={createCategory.isPending} />
      <BankFormDialog open={bankDialogOpen} onOpenChange={setBankDialogOpen} onSubmit={handleCreateBank} isLoading={createBank.isPending} />
      <ContactFormDialog open={contactDialogOpen} onOpenChange={setContactDialogOpen} onSubmit={handleCreateContact} isLoading={createContact.isPending} />

      <AlertDialog open={yearWarningDates.length > 0} onOpenChange={(open) => { if (!open) handleCancelYear(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Atenção
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Uma ou mais datas informadas estão fora do ano corrente. Deseja realmente prosseguir com este lançamento?</p>
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
                  {yearWarningDates.map((d, i) => (
                    <p key={i} className="text-sm font-medium text-foreground">
                      {d.label} — <span className="text-destructive">{d.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelYear}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmYear}>Confirmar Lançamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
