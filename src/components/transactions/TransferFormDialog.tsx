import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
      <DialogContent className="sm:max-w-[520px] bg-[rgba(22,22,26,0.85)] backdrop-blur-[24px] border-white/[0.08] rounded-2xl p-5">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base">Transferência entre contas</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Conta de origem <span className="text-destructive">*</span></Label>
              <Select value={fromBankId} onValueChange={setFromBankId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeBanks.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs" disabled={b.id === toBankId}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground mb-2" />
            <div className="space-y-1.5">
              <Label className="text-xs">Conta de destino <span className="text-destructive">*</span></Label>
              <Select value={toBankId} onValueChange={setToBankId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeBanks.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs" disabled={b.id === fromBankId}>
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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) <span className="text-destructive">*</span></Label>
              <Input value={amount} onChange={(e) => setAmount(formatCurrencyInput(e.target.value))} placeholder="0,00" className="h-8 text-sm font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data <span className="text-destructive">*</span></Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" min="1900-01-01" max="9999-12-31" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Transferência entre contas" className="h-8 text-xs" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Histórico</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." rows={1} className="min-h-[36px] resize-none text-xs" />
          </div>

          <p className="text-[10px] text-muted-foreground leading-tight">
            Cria duas movimentações vinculadas (saída na origem e entrada no destino). Não entra em receita/despesa nem na DRE; ajusta o saldo de cada conta.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs px-4">Cancelar</Button>
            <Button type="submit" size="sm" disabled={!isValid || isLoading} className="h-8 text-xs px-6">
              {isLoading ? 'Salvando...' : 'Transferir'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
