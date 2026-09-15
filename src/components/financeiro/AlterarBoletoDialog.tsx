import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ds';
import type { BoletoWithContact } from '@/hooks/useBoletoControls';

type AlterarParams =
  | { boleto: BoletoWithContact; campo: 'prorrogacaoVencimento'; dataVencimento: string }
  | { boleto: BoletoWithContact; campo: 'valorNominal'; valor: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boleto: BoletoWithContact | null;
  // 'prorrogacaoVencimento' e 'valorNominal' são objetos de alteração mutuamente exclusivos na
  // API do Sicoob (só 1 por chamada) — por isso o campo já vem fixo por instância do dialog.
  campo: 'prorrogacaoVencimento' | 'valorNominal';
  alterarBoleto: {
    mutateAsync: (params: AlterarParams) => Promise<void>;
    isPending: boolean;
  };
}

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd/MM/yyyy'); } catch { return s; }
};

export function AlterarBoletoDialog({ open, onOpenChange, boleto, campo, alterarBoleto }: Props) {
  const [dataVencimento, setDataVencimento] = useState('');
  const [valor, setValor] = useState('');

  useEffect(() => {
    if (!open || !boleto) return;
    setDataVencimento(boleto.data_vencimento ?? '');
    setValor(String(boleto.valor ?? ''));
  }, [open, boleto?.id]);

  if (!boleto) return null;

  const valorNum = Number(valor.replace(',', '.'));
  const canConfirm = campo === 'prorrogacaoVencimento' ? !!dataVencimento : (Number.isFinite(valorNum) && valorNum > 0);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    try {
      if (campo === 'prorrogacaoVencimento') {
        await alterarBoleto.mutateAsync({ boleto, campo, dataVencimento });
      } else {
        await alterarBoleto.mutateAsync({ boleto, campo, valor: valorNum });
      }
      onOpenChange(false);
    } catch {
      // Toast de erro já disparado pela mutation.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{campo === 'prorrogacaoVencimento' ? 'Prorrogar vencimento' : 'Alterar valor'}</DialogTitle>
          <DialogDescription>
            {boleto.contact_name} · vencimento atual {fmtDate(boleto.data_vencimento)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {campo === 'prorrogacaoVencimento' ? (
            <>
              <Label>Novo vencimento</Label>
              <DateField value={dataVencimento} onChange={setDataVencimento} />
            </>
          ) : (
            <>
              <Label htmlFor="alterar-valor">Novo valor</Label>
              <Input
                id="alterar-valor"
                type="number" inputMode="decimal" step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || alterarBoleto.isPending}>
            {alterarBoleto.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Confirmar no Sicoob
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
