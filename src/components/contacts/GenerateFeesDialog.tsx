import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/useCategories';
import { useBanks } from '@/hooks/useBanks';
import { useTransactions } from '@/hooks/useTransactions';
import { useToast } from '@/hooks/use-toast';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { createAuditLog } from '@/hooks/useAuditLog';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils';
import { addMonths, format } from 'date-fns';

interface GenerateFeesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
}

export function GenerateFeesDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
}: GenerateFeesDialogProps) {
  const { toast } = useToast();
  const { notifyBulkFeesGenerated } = useNotificationTriggers();
  const { categories } = useCategories();
  const { banks } = useBanks();
  const { createTransaction } = useTransactions();
  
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('10');
  const [numberOfMonths, setNumberOfMonths] = useState('12');
  const [categoryId, setCategoryId] = useState('');
  const [bankId, setBankId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const receitaCategories = categories.filter(c => c.type === 'receita');
  const activeBanks = banks.filter(b => b.is_active);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleGenerate = async () => {
    const parsedAmount = parseCurrencyInput(amount);
    if (parsedAmount <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    if (!categoryId || !bankId) {
      toast({ title: 'Selecione categoria e conta', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const months = parseInt(numberOfMonths) || 12;
    const day = parseInt(dayOfMonth) || 10;
    const today = new Date();
    
    try {
      for (let i = 0; i < months; i++) {
        const dueDate = addMonths(today, i);
        dueDate.setDate(Math.min(day, new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()));
        
        await createTransaction.mutateAsync({
          description: `Honorários - ${contactName} (${i + 1}/${months})`,
          amount: parsedAmount,
          type: 'receita',
          date: format(dueDate, 'yyyy-MM-dd'),
          due_date: format(dueDate, 'yyyy-MM-dd'),
          category_id: categoryId,
          bank_id: bankId,
          contact_id: contactId,
          is_paid: false,
          notes: `Honorário gerado automaticamente - Parcela ${i + 1} de ${months}`,
        });
      }

      // Create audit log for fees generation
      await createAuditLog({
        contactId,
        action: 'HONORARIO_GERADO',
        description: `${months} parcelas de ${formatCurrency(parsedAmount)} geradas`,
      });

      toast({ 
        title: 'Honorários gerados com sucesso!', 
        description: `${months} parcelas de ${formatCurrencyInput(parsedAmount.toString())} criadas.` 
      });
      notifyBulkFeesGenerated(contactName, months);
      onOpenChange(false);
      // Reset form
      setAmount('');
      setDayOfMonth('10');
      setNumberOfMonths('12');
      setCategoryId('');
      setBankId('');
    } catch (error) {
      toast({ title: 'Erro ao gerar honorários', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar Honorários Recorrentes</DialogTitle>
          <DialogDescription>
            Crie parcelas mensais para o cliente {contactName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 pt-4">
          <div>
            <Label>Valor da Parcela <span className="text-destructive">*</span></Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
              placeholder="R$ 0,00"
            />
          </div>

          <div>
            <Label>Dia do Vencimento</Label>
            <Input
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              placeholder="10"
            />
          </div>

          <div>
            <Label>Número de Meses</Label>
            <Select value={numberOfMonths} onValueChange={setNumberOfMonths}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="18">18 meses</SelectItem>
                <SelectItem value="24">24 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Categoria <span className="text-destructive">*</span></Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {receitaCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Conta/Banco <span className="text-destructive">*</span></Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {activeBanks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={isLoading || !amount || !categoryId || !bankId}
          >
            {isLoading ? 'Gerando...' : 'Gerar Parcelas'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
