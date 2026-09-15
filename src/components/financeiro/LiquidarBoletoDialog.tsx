import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { DsBadge, DateField } from '@/components/ds';
import { useToast } from '@/hooks/use-toast';
import type { BoletoWithContact, LancamentoCandidato } from '@/hooks/useBoletoControls';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boleto: BoletoWithContact | null;
  fetchLancamentosAbertos: (contactId: string) => Promise<LancamentoCandidato[]>;
  liquidarBoleto: {
    mutateAsync: (params: { boleto: BoletoWithContact; transactionId: string; valorPago: number; dataPagamento: string }) => Promise<void>;
    isPending: boolean;
  };
}

const fmtBRL = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd/MM/yyyy'); } catch { return s; }
};

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function LiquidarBoletoDialog({ open, onOpenChange, boleto, fetchLancamentosAbertos, liquidarBoleto }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [candidatos, setCandidatos] = useState<LancamentoCandidato[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [valorPago, setValorPago] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');

  // Único match cujo vencimento bate exato com o do boleto — pré-seleciona sem adivinhar quando
  // há mais de um lançamento em aberto pro mesmo cliente (fica pra escolha manual nesse caso).
  const matchExato = useMemo(() => {
    if (!boleto?.data_vencimento) return null;
    const exatos = candidatos.filter(c => c.due_date === boleto.data_vencimento);
    return exatos.length === 1 ? exatos[0] : null;
  }, [candidatos, boleto?.data_vencimento]);

  useEffect(() => {
    if (!open || !boleto) return;
    setLoading(true);
    setCandidatos([]);
    setSelectedId(null);
    setValorPago(String(boleto.valor_pago ?? boleto.valor ?? ''));
    setDataPagamento(boleto.data_pagamento ?? todayISO());
    fetchLancamentosAbertos(boleto.contact_id)
      .then((lista) => {
        setCandidatos(lista);
        const exatos = boleto.data_vencimento ? lista.filter(c => c.due_date === boleto.data_vencimento) : [];
        if (exatos.length === 1) setSelectedId(exatos[0].id);
      })
      .catch((e: any) => toast({ title: 'Erro ao buscar lançamentos', description: e?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, boleto?.id]);

  if (!boleto) return null;

  const valorNum = Number(valorPago.replace(',', '.'));
  const canConfirm = !!selectedId && Number.isFinite(valorNum) && valorNum > 0 && !!dataPagamento;

  const handleConfirm = async () => {
    if (!selectedId || !canConfirm) return;
    try {
      await liquidarBoleto.mutateAsync({ boleto, transactionId: selectedId, valorPago: valorNum, dataPagamento });
      onOpenChange(false);
    } catch {
      // Toast de erro já disparado pela mutation.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Liquidar boleto</DialogTitle>
          <DialogDescription>
            {boleto.contact_name} · vencimento {fmtDate(boleto.data_vencimento)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="liquidar-valor">Valor recebido</Label>
              <Input
                id="liquidar-valor"
                type="number" inputMode="decimal" step="0.01"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <DateField value={dataPagamento} onChange={setDataPagamento} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lançamento a liquidar</Label>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : candidatos.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                Nenhum lançamento em aberto encontrado para este cliente. Confira em Lançamentos se o
                título já foi liquidado por outra via, ou crie o lançamento antes de liquidar por aqui.
              </p>
            ) : (
              <RadioGroup value={selectedId ?? undefined} onValueChange={setSelectedId} className="space-y-2">
                {candidatos.map((c) => {
                  const isMatch = matchExato?.id === c.id;
                  return (
                    <label
                      key={c.id}
                      htmlFor={`lanc-${c.id}`}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/30 has-[[data-state=checked]]:border-action has-[[data-state=checked]]:bg-action/5"
                    >
                      <RadioGroupItem value={c.id} id={`lanc-${c.id}`} className="mt-0.5" />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{c.description}</span>
                          <span>{fmtBRL(c.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Vencimento {fmtDate(c.due_date)}</span>
                          {c.category_name && <span>· {c.category_name}</span>}
                          {isMatch && <DsBadge tone="ok">vencimento igual ao boleto</DsBadge>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || liquidarBoleto.isPending}>
            {liquidarBoleto.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Liquidar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
