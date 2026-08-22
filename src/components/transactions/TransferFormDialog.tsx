import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ds';
import { ArrowRight } from 'lucide-react';
import type { Bank } from '@/hooks/useBanks';

export interface TransferInput {
  fromBankId: string;
  toBankId: string;
  amount: number;
  date: string;
  description?: string | null;
  notes?: string | null;
}

interface TransferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: Bank[];
  onSubmit: (data: TransferInput) => void;
  isLoading?: boolean;
}

function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '');
  const cents = parseInt(numbers || '0', 10);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCurrencyInput(value: string): number {
  const numbers = value.replace(/\D/g, '');
  return parseInt(numbers || '0', 10) / 100;
}

export function TransferFormDialog({ open, onOpenChange, banks, onSubmit, isLoading }: TransferFormDialogProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromBankId, setFromBankId] = useState('');
  const [toBankId, setToBankId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const activeBanks = banks.filter((b) => b.is_active);

  useEffect(() => {
    if (!open) {
      setFromBankId(''); setToBankId(''); setAmount(''); setDate(todayStr);
      setDescription(''); setNotes('');
    }
  }, [open]);

  const amountValue = parseCurrencyInput(amount);
  const sameBank = !!fromBankId && fromBankId === toBankId;
  const isValid = !!fromBankId && !!toBankId && !sameBank && amountValue > 0 && !!date;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      fromBankId,
      toBankId,
      amount: amountValue,
      date,
      description: description.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Transferência entre contas</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-ink">Conta de origem <span className="text-destructive">*</span></Label>
              <Select value={fromBankId} onValueChange={setFromBankId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeBanks.map((b) => (
                    <SelectItem key={b.id} value={b.id} disabled={b.id === toBankId}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-ink mb-2" />
            <div className="space-y-1.5">
              <Label className="text-muted-ink">Conta de destino <span className="text-destructive">*</span></Label>
              <Select value={toBankId} onValueChange={setToBankId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeBanks.map((b) => (
                    <SelectItem key={b.id} value={b.id} disabled={b.id === fromBankId}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sameBank && (
            <p className="text-[11px] text-destructive">Origem e destino devem ser contas diferentes.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-ink">Valor (R$) <span className="text-destructive">*</span></Label>
              <Input value={amount} onChange={(e) => setAmount(formatCurrencyInput(e.target.value))} placeholder="0,00" className="font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-ink">Data <span className="text-destructive">*</span></Label>
              <DateField value={date} onChange={setDate} min="1900-01-01" max="9999-12-31" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-ink">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Transferência entre contas" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-ink">Histórico</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." rows={1} className="min-h-[40px] resize-none" />
          </div>

          <p className="text-[11px] text-muted-foreground leading-tight">
            Cria duas movimentações vinculadas (saída na origem e entrada no destino). Não entra em receita/despesa nem na DRE; ajusta o saldo de cada conta.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading ? 'Salvando...' : 'Transferir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
