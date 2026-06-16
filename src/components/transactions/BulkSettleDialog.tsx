import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface BulkSettleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: (paymentDate: string) => Promise<void> | void;
  isLoading?: boolean;
}

export function BulkSettleDialog({ open, onOpenChange, count, onConfirm, isLoading }: BulkSettleDialogProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);

  useEffect(() => {
    if (open) setPaymentDate(todayStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    if (!paymentDate) return;
    await onConfirm(paymentDate);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liquidar {count} transação(ões)</DialogTitle>
          <DialogDescription>
            Informe a Data de Pagamento que será aplicada a todas as transações selecionadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label className="text-xs">Data de Pagamento <span className="text-destructive">*</span></Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            min="1900-01-01"
            max="9999-12-31"
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Valor pago/recebido será preenchido automaticamente com o valor previsto de cada transação.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!paymentDate || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Liquidar Todas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
