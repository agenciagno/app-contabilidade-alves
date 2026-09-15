import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimentacaoSync: {
    mutateAsync: (params: { dataInicial: string; dataFinal: string }) => Promise<unknown>;
    isPending: boolean;
  };
}

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const yesterdayISO = () => format(addDays(new Date(), -1), 'yyyy-MM-dd');

// Consulta em lote (Movimentação/Liquidação) — reforço/backfill pro webhook: preenche
// valor_pago/data_pagamento de boletos já PAGO direto do Sicoob, sem depender do webhook ter
// pego a notificação. Período máximo de 2 dias por chamada — limite real da API.
export function MovimentacaoSyncDialog({ open, onOpenChange, movimentacaoSync }: Props) {
  const [dataInicial, setDataInicial] = useState(yesterdayISO());
  const [dataFinal, setDataFinal] = useState(todayISO());

  const dias = (new Date(dataFinal).getTime() - new Date(dataInicial).getTime()) / 86400000;
  const periodoValido = dataInicial && dataFinal && dias >= 0 && dias <= 2;

  const handleConfirm = async () => {
    if (!periodoValido) return;
    try {
      await movimentacaoSync.mutateAsync({ dataInicial, dataFinal });
      onOpenChange(false);
    } catch {
      // Toast de erro já disparado pela mutation.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Buscar histórico de pagamento no Sicoob</DialogTitle>
          <DialogDescription>
            Consulta direto na carteira do Sicoob (Movimentação) e preenche valor pago/data de
            pagamento dos boletos já marcados como pagos. Período máximo de 2 dias.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>De</Label>
            <DateField value={dataInicial} onChange={setDataInicial} />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <DateField value={dataFinal} onChange={setDataFinal} />
          </div>
        </div>
        {!periodoValido && (dataInicial && dataFinal) && (
          <p className="text-xs text-danger">Período inválido — no máximo 2 dias, com "Até" depois de "De".</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!periodoValido || movimentacaoSync.isPending}>
            {movimentacaoSync.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Buscar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
