import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Zap } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { PreviewItem, PreviewResponse, GenerateResult } from '@/hooks/useBoletoControls';

const fmtBRL = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd/MM/yyyy'); } catch { return s; }
};

type Step = 'loading' | 'list' | 'running' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchPreview: () => Promise<PreviewResponse>;
  generateBoletos: (
    contactIds: string[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<GenerateResult[]>;
}

function isEligible(i: PreviewItem) {
  return !i.already_generated && i.missing_fields.length === 0;
}

export function BoletoGenerationDialog({
  open, onOpenChange, fetchPreview, generateBoletos,
}: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<GenerateResult[]>([]);

  // Carrega o preview ao abrir
  useEffect(() => {
    if (!open) return;
    setStep('loading');
    setError(null);
    setPreview(null);
    setResults([]);
    setProgress({ done: 0, total: 0 });
    fetchPreview()
      .then((data) => {
        setPreview(data);
        setSelected(new Set(data.items.filter(isEligible).map((i) => i.contact_id)));
        setStep('list');
      })
      .catch((e) => {
        setError(e?.message || 'Erro ao carregar o preview');
        setStep('list');
      });
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const eligibleItems = preview?.items.filter(isEligible) ?? [];
  const allEligibleSelected = eligibleItems.length > 0 && eligibleItems.every((i) => selected.has(i.contact_id));
  const toggleAll = () =>
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleItems.map((i) => i.contact_id)));

  const runGeneration = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setStep('running');
    setProgress({ done: 0, total: ids.length });
    try {
      const res = await generateBoletos(ids, (done, total) => setProgress({ done, total }));
      setResults(res);
      setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Falha na geração');
      setResults([]);
      setStep('done');
    }
  };

  const okCount = results.filter((r) => r.status === 'ok').length;
  const errCount = results.filter((r) => r.status === 'error').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;
  const problems = results.filter((r) => r.status !== 'ok');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (step !== 'running') onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Gerar boletos
          </DialogTitle>
          {step === 'list' && preview && (
            <DialogDescription>
              Emissão {fmtDate(preview.data_emissao)}. Vencimento conforme o dia configurado no perfil de cada
              cliente. Revise a lista e desmarque quem não deve receber boleto.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* LOADING */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Carregando clientes elegíveis…</span>
          </div>
        )}

        {/* LIST */}
        {step === 'list' && (
          error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <span className="font-medium">Não foi possível carregar</span>
              <span className="text-sm text-muted-foreground">{error}</span>
            </div>
          ) : preview && (
            <>
              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox checked={allEligibleSelected} onCheckedChange={toggleAll} />
                  <span>Selecionar todos os elegíveis</span>
                </label>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{selected.size}</strong> selecionados ·{' '}
                  {preview.elegiveis} elegíveis · {preview.total} no total
                </span>
              </div>

              <div className="border rounded-md overflow-y-auto min-h-[200px] max-h-[50vh]">
                <div className="divide-y">
                  {preview.items.map((i) => {
                    const eligible = isEligible(i);
                    return (
                      <div
                        key={i.contact_id}
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${eligible ? '' : 'opacity-60'}`}
                      >
                        <Checkbox
                          checked={selected.has(i.contact_id)}
                          disabled={!eligible}
                          onCheckedChange={() => eligible && toggle(i.contact_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{i.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtBRL(i.valor)} · vence {fmtDate(i.data_vencimento)} · {i.canal_entrega ?? 'sem canal'}
                          </div>
                        </div>
                        {i.already_generated && (
                          <Badge variant="outline" className="shrink-0">Já gerado</Badge>
                        )}
                        {!i.already_generated && i.missing_fields.length > 0 && (
                          <Badge className="shrink-0 bg-destructive/15 text-destructive border-destructive/30">
                            Falta: {i.missing_fields.join(', ')}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={runGeneration} disabled={selected.size === 0} className="gap-2">
                  <Zap className="h-4 w-4" />
                  Gerar {selected.size} {selected.size === 1 ? 'boleto' : 'boletos'}
                </Button>
              </DialogFooter>
            </>
          )
        )}

        {/* RUNNING */}
        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Gerando boletos no Sicoob…</p>
              <p className="text-sm text-muted-foreground">{progress.done} de {progress.total}</p>
            </div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="w-64" />
            <p className="text-xs text-muted-foreground">Não feche esta janela.</p>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <>
            {error ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="font-medium">A geração foi interrompida</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                {okCount > 0 && <p className="text-sm">{okCount} boleto(s) chegaram a ser gerados antes da falha.</p>}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-6 py-4">
                  <Stat icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Gerados" value={okCount} />
                  <Stat icon={<XCircle className="h-5 w-5 text-destructive" />} label="Com erro" value={errCount} />
                  <Stat icon={<MinusCircle className="h-5 w-5 text-muted-foreground" />} label="Ignorados" value={skipCount} />
                </div>
                {problems.length > 0 && (
                  <div className="border rounded-md overflow-y-auto max-h-[38vh]">
                    <div className="divide-y">
                      {problems.map((r) => (
                        <div key={r.contact_id} className="flex items-start gap-3 px-3 py-2 text-sm">
                          {r.status === 'error'
                            ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            : <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.name ?? r.contact_id}</div>
                            <div className="text-xs text-muted-foreground">{r.message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 text-2xl font-bold">{icon}{value}</div>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}
