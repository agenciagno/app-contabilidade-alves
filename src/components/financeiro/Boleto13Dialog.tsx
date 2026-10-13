import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Gift, Lock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SearchField } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { statusPedeAviso } from '@/constants/statusCliente';
import { cn } from '@/lib/utils';
import type {
  Preview13Item, Preview13Response, Parcela13Opcao, GenerateResult,
} from '@/hooks/useBoletoControls';

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
  fetchPreview13: (parcela: number) => Promise<Preview13Response>;
  generateBoletos13: (
    parcela: number,
    contactIds: string[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<GenerateResult[]>;
}

export function Boleto13Dialog({ open, onOpenChange, fetchPreview13, generateBoletos13 }: Props) {
  const [parcela, setParcela] = useState(1);
  const [opcoes, setOpcoes] = useState<Parcela13Opcao[]>([]);
  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<Preview13Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [search, setSearch] = useState('');
  // Situação do cliente (Status do Cliente): Suspensa/Inapta ainda recebem boleto, mas pedem aviso.
  const [situacao, setSituacao] = useState<Map<string, string>>(new Map());

  // Reabrir volta pra 1ª parcela.
  useEffect(() => {
    if (open) setParcela(1);
  }, [open]);

  // Carrega o preview ao abrir e ao trocar de parcela.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setStep('loading');
    setError(null);
    setPreview(null);
    setResults([]);
    setProgress({ done: 0, total: 0 });
    setSearch('');
    setSituacao(new Map());
    fetchPreview13(parcela)
      .then((data) => {
        if (cancelado) return;
        setPreview(data);
        setOpcoes(data.parcelas);
        setSelected(new Set(data.items.filter((i) => !i.bloqueio).map((i) => i.contact_id)));
        setStep('list');
        const ids = data.items.map((i) => i.contact_id);
        if (ids.length) {
          supabase.from('contacts').select('id,status_cliente').in('id', ids).then(({ data: rows }) => {
            if (cancelado) return;
            setSituacao(new Map((rows ?? []).filter((r) => statusPedeAviso(r.status_cliente)).map((r) => [r.id, r.status_cliente as string])));
          });
        }
      })
      .catch((e) => {
        if (cancelado) return;
        setError(e?.message || 'Erro ao carregar o 13º');
        setStep('list');
      });
    return () => { cancelado = true; };
  }, [open, parcela]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const eligibleItems = preview?.items.filter((i) => !i.bloqueio) ?? [];
  const allEligibleSelected = eligibleItems.length > 0 && eligibleItems.every((i) => selected.has(i.contact_id));
  const toggleAll = () =>
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleItems.map((i) => i.contact_id)));

  // Busca filtra só o que é exibido; "Selecionar todos" continua valendo pra lista inteira.
  const term = search.trim().toLowerCase();
  const visibleItems = term
    ? (preview?.items ?? []).filter((i) => `${i.name ?? ''} ${i.document ?? ''}`.toLowerCase().includes(term))
    : preview?.items ?? [];

  const selectedTotal = eligibleItems
    .filter((i) => selected.has(i.contact_id))
    .reduce((s, i) => s + (i.valor ?? 0), 0);

  const runGeneration = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setStep('running');
    setProgress({ done: 0, total: ids.length });
    try {
      const res = await generateBoletos13(parcela, ids, (done, total) => setProgress({ done, total }));
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

  const parcelaAtual = opcoes.find((p) => p.numero === parcela);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (step !== 'running') onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-action" />
            Gerar boletos do 13º honorário
          </DialogTitle>
          {step === 'list' && preview && (
            <DialogDescription>
              Emissão {fmtDate(preview.data_emissao)}. O valor de cada boleto é o do lançamento
              “Honorários Contábeis 13º” do cliente. Multa de 2% e juros de 0,07%/dia depois do vencimento.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Parcela: a 2ª fica visível e travada até ser liberada */}
        {opcoes.length > 0 && step !== 'running' && step !== 'done' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opcoes.map((p) => {
              const ativa = p.numero === parcela;
              return (
                <button
                  key={p.numero}
                  type="button"
                  disabled={!p.liberada}
                  onClick={() => p.liberada && setParcela(p.numero)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    ativa ? 'border-action bg-action/5' : 'border-line bg-paper',
                    p.liberada ? 'hover:bg-bg-2' : 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="font-medium text-ink">
                    {p.rotulo} - Vencimento {fmtDate(p.vencimento)}
                  </div>
                  {!p.liberada && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-ink">
                      <Lock className="h-3 w-3" /> Bloqueada por enquanto
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* LOADING */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-ink">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Carregando clientes com o 13º lançado…</span>
          </div>
        )}

        {/* LIST */}
        {step === 'list' && (
          error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-danger">
              <AlertTriangle className="h-8 w-8" />
              <span className="font-medium">Não foi possível carregar</span>
              <span className="text-sm text-muted-ink">{error}</span>
            </div>
          ) : preview && (
            <>
              <div
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                  preview.vencimento_passou || !preview.desconto_vigente
                    ? 'border-warn/40 bg-warn/10 text-warn'
                    : 'border-line bg-bg-2 text-ink',
                )}
              >
                {(preview.vencimento_passou || !preview.desconto_vigente) && (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  {preview.vencimento_passou ? (
                    <>O vencimento {fmtDate(preview.data_vencimento)} já passou — não é possível gerar esta parcela.</>
                  ) : preview.desconto_vigente ? (
                    <>
                      Desconto de {String(preview.desconto_percentual).replace('.', ',')}% para pagamento até{' '}
                      <strong>{fmtDate(preview.desconto_ate)}</strong>. Vencimento{' '}
                      <strong>{fmtDate(preview.data_vencimento)}</strong>.
                    </>
                  ) : (
                    <>
                      O prazo do desconto ({fmtDate(preview.desconto_ate)}) já passou: os boletos saem{' '}
                      <strong>sem desconto</strong>. Vencimento {fmtDate(preview.data_vencimento)}.
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox checked={allEligibleSelected} onCheckedChange={toggleAll} />
                  <span>Selecionar todos os elegíveis</span>
                </label>
                <span className="text-muted-ink">
                  <strong className="text-ink">{selected.size}</strong> selecionados ({fmtBRL(selectedTotal)}) ·{' '}
                  {preview.elegiveis} elegíveis · {preview.total} no total
                </span>
              </div>

              <SearchField
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                wrapperClassName="w-full"
              />

              <div className="border border-line rounded-lg overflow-y-auto min-h-[200px] max-h-[44vh]">
                <div className="divide-y divide-line-2">
                  {visibleItems.length === 0 && (
                    <div className="px-3 py-8 text-center text-sm text-muted-ink">
                      {term
                        ? `Nenhum cliente encontrado para "${search}"`
                        : 'Nenhum cliente com o lançamento do 13º nesta parcela.'}
                    </div>
                  )}
                  {visibleItems.map((i: Preview13Item) => {
                    const eligible = !i.bloqueio;
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
                          <div className="font-medium truncate text-ink">{i.name ?? '—'}</div>
                          <div className="text-xs text-muted-ink">
                            {fmtBRL(i.valor)} · vence {fmtDate(i.data_vencimento)} · {i.canal_entrega ?? 'sem canal'}
                          </div>
                        </div>
                        {situacao.has(i.contact_id) && (
                          <Badge variant="outline" className="shrink-0 border-warn/40 bg-warn/10 text-warn">{situacao.get(i.contact_id)}</Badge>
                        )}
                        {i.bloqueio && (
                          <Badge
                            variant={i.bloqueio.startsWith('Falta') ? 'destructive' : 'outline'}
                            className="shrink-0"
                          >
                            {i.bloqueio}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const comAviso = preview.items.filter((i) => selected.has(i.contact_id) && situacao.has(i.contact_id));
                if (!comAviso.length) return null;
                return (
                  <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <strong>{comAviso.length} {comAviso.length === 1 ? 'cliente selecionado está' : 'clientes selecionados estão'} com situação especial.</strong>{' '}
                      {comAviso.map((i) => `${i.name} (${situacao.get(i.contact_id)})`).join(' · ')}. Confirme se o boleto deve sair, ou desmarque.
                    </div>
                  </div>
                );
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button
                  onClick={runGeneration}
                  disabled={selected.size === 0 || preview.vencimento_passou}
                  className="gap-2"
                >
                  <Gift className="h-4 w-4" />
                  Gerar {selected.size} {selected.size === 1 ? 'boleto' : 'boletos'} · {fmtBRL(selectedTotal)}
                </Button>
              </DialogFooter>
            </>
          )
        )}

        {/* RUNNING */}
        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-action" />
            <div className="text-center">
              <p className="font-medium text-ink">
                Gerando boletos do 13º{parcelaAtual ? ` (${parcelaAtual.rotulo})` : ''} no Sicoob…
              </p>
              <p className="text-sm text-muted-ink">{progress.done} de {progress.total}</p>
            </div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="w-64" />
            <p className="text-xs text-muted-ink">Não feche esta janela.</p>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <>
            {error ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <AlertTriangle className="h-8 w-8 text-danger" />
                <p className="font-medium text-ink">A geração foi interrompida</p>
                <p className="text-sm text-muted-ink">{error}</p>
                <p className="text-sm text-muted-ink">
                  Reabra a janela: quem já teve boleto gerado aparece como “Já gerado” e não duplica.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-6 py-4">
                  <Stat icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Gerados" value={okCount} />
                  <Stat icon={<XCircle className="h-5 w-5 text-danger" />} label="Com erro" value={errCount} />
                  <Stat icon={<MinusCircle className="h-5 w-5 text-muted-ink" />} label="Ignorados" value={skipCount} />
                </div>
                {problems.length > 0 && (
                  <div className="border border-line rounded-lg overflow-y-auto max-h-[38vh]">
                    <div className="divide-y divide-line-2">
                      {problems.map((r) => (
                        <div key={r.contact_id} className="flex items-start gap-3 px-3 py-2 text-sm">
                          {r.status === 'error'
                            ? <XCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                            : <MinusCircle className="h-4 w-4 text-muted-ink shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <div className="font-medium truncate text-ink">{r.name ?? r.contact_id}</div>
                            <div className="text-xs text-muted-ink">{r.message}</div>
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
      <div className="flex items-center gap-2 text-h3-section text-ink">{icon}{value}</div>
      <span className="text-xs text-muted-ink uppercase tracking-wide">{label}</span>
    </div>
  );
}
