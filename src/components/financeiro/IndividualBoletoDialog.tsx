import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Loader2, AlertTriangle, CheckCircle2, XCircle, Zap, ChevronLeft,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { DateField } from '@/components/ds';
import type { PreviewItem, PreviewResponse } from '@/hooks/useBoletoControls';

type Step = 'loading' | 'pick' | 'form' | 'result';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchPreview: () => Promise<PreviewResponse>;
  generateSingleBoleto: (
    contactId: string,
    valor: number,
    dataVencimento: string,
  ) => Promise<{ ok: true; name: string | null; nosso_numero: number | null; pdf: boolean }>;
}

const fmtBRL = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function IndividualBoletoDialog({
  open, onOpenChange, fetchPreview, generateSingleBoleto,
}: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PreviewItem | null>(null);
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string | null; nossoNumero: number | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('loading');
    setLoadError(null);
    setSelectedItem(null);
    setValor('');
    setVencimento(null);
    setError(null);
    setResult(null);
    fetchPreview()
      .then((data) => {
        setItems([...data.items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')));
        setStep('pick');
      })
      .catch((e) => {
        setLoadError(e?.message || 'Erro ao carregar clientes');
        setStep('pick');
      });
  }, [open]);

  const pickItem = (i: PreviewItem) => {
    setSelectedItem(i);
    setValor(i.valor != null ? String(i.valor) : '');
    setVencimento(i.data_vencimento ? parseISO(i.data_vencimento) : null);
    setError(null);
    setStep('form');
  };

  const canSubmit =
    !!selectedItem &&
    selectedItem.missing_fields.length === 0 &&
    !!valor && Number(valor.replace(',', '.')) > 0 &&
    !!vencimento;

  const handleGenerate = async () => {
    if (!selectedItem || !vencimento) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await generateSingleBoleto(
        selectedItem.contact_id,
        Number(valor.replace(',', '.')),
        format(vencimento, 'yyyy-MM-dd'),
      );
      setResult({ name: res.name ?? selectedItem.name, nossoNumero: res.nosso_numero });
      setStep('result');
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar boleto');
      setStep('result');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-action" />
            Boleto avulso
          </DialogTitle>
          {step === 'pick' && (
            <DialogDescription>
              Busque o cliente para gerar um boleto individual, fora do ciclo mensal — valor e vencimento escolhidos na hora.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* LOADING */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-ink">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Carregando clientes…</span>
          </div>
        )}

        {/* PICK */}
        {step === 'pick' && (
          loadError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-danger">
              <AlertTriangle className="h-8 w-8" />
              <span className="font-medium">Não foi possível carregar</span>
              <span className="text-sm text-muted-ink">{loadError}</span>
            </div>
          ) : (
            <Command className="border border-line rounded-lg">
              <CommandInput placeholder="Nome ou CPF/CNPJ..." />
              <CommandList className="max-h-[50vh]">
                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                <CommandGroup>
                  {items.map((i) => (
                    <CommandItem
                      key={i.contact_id}
                      value={`${i.name} ${i.document ?? ''}`}
                      onSelect={() => pickItem(i)}
                      className="flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-ink">{i.name}</div>
                        <div className="text-xs text-muted-ink">{i.document || 'sem documento'}</div>
                      </div>
                      {i.missing_fields.length > 0 && (
                        <Badge variant="destructive" className="shrink-0">
                          Dados incompletos
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )
        )}

        {/* FORM */}
        {step === 'form' && selectedItem && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStep('pick')}
              className="text-xs text-muted-ink hover:text-ink flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Trocar cliente
            </button>

            <div className="rounded-md bg-bg-2 p-3">
              <p className="font-medium text-ink">{selectedItem.name}</p>
              <p className="text-xs text-muted-ink">{selectedItem.document || 'sem documento'}</p>
            </div>

            {selectedItem.missing_fields.length > 0 ? (
              <div className="flex items-start gap-2 text-sm text-danger bg-danger-soft border border-danger rounded-md p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Dados incompletos no cadastro: {selectedItem.missing_fields.join(', ')}. Complete o cadastro do
                  cliente antes de gerar.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-2">Valor</label>
                  <Input
                    type="number" inputMode="decimal" step="0.01" min="0.01"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-2">Vencimento</label>
                  <DateField
                    value={vencimento ? format(vencimento, 'yyyy-MM-dd') : ''}
                    onChange={(iso) => setVencimento(iso ? new Date(`${iso}T00:00:00`) : null)}
                  />
                </div>
              </div>
            )}

            {valor && Number(valor.replace(',', '.')) > 0 && (
              <p className="text-xs text-muted-ink">Valor do boleto: {fmtBRL(Number(valor.replace(',', '.')))}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleGenerate} disabled={!canSubmit || submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Gerar boleto
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* RESULT */}
        {step === 'result' && (
          <>
            {error ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <XCircle className="h-8 w-8 text-danger" />
                <p className="font-medium text-ink">Não foi possível gerar</p>
                <p className="text-sm text-muted-ink">{error}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
                <p className="font-medium text-ink">Boleto gerado</p>
                <p className="text-sm text-muted-ink">
                  {result?.name}{result?.nossoNumero ? ` · nosso número ${result.nossoNumero}` : ''}
                </p>
              </div>
            )}
            <DialogFooter>
              {error && (
                <Button variant="outline" onClick={() => setStep('form')}>Voltar</Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
