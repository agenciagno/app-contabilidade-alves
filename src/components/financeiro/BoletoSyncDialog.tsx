import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SyncContact, OrphanSyncSummary } from '@/hooks/useBoletoControls';

type Step = 'running' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listSyncContacts: () => Promise<SyncContact[]>;
  findOrphanBoletos: (
    contactIds: string[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<OrphanSyncSummary>;
}

export function BoletoSyncDialog({ open, onOpenChange, listSyncContacts, findOrphanBoletos }: Props) {
  const [step, setStep] = useState<Step>('running');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<OrphanSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('running');
    setError(null);
    setSummary(null);
    setProgress({ done: 0, total: 0 });

    (async () => {
      try {
        const contacts = await listSyncContacts();
        setProgress({ done: 0, total: contacts.length });
        const result = await findOrphanBoletos(
          contacts.map((c) => c.contact_id),
          (done, total) => setProgress({ done, total }),
        );
        setSummary(result);
        setStep('done');
      } catch (e: any) {
        setError(e?.message || 'Falha ao sincronizar com o Sicoob');
        setStep('done');
      }
    })();
  }, [open]);

  const problems = summary?.details.filter((d) => d.status === 'error') ?? [];
  const withOrphans = summary?.details.filter((d) => d.orfaos > 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (step !== 'running') onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Sincronizar com o Sicoob
          </DialogTitle>
          {step === 'running' && (
            <DialogDescription>
              Consultando os boletos registrados no Sicoob por CPF/CNPJ de cada cliente, pra achar o que existe
              lá mas não está na sua tabela.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Consultando clientes…</p>
              <p className="text-sm text-muted-foreground">{progress.done} de {progress.total}</p>
            </div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="w-64" />
          </div>
        )}

        {step === 'done' && (
          <>
            {error ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="font-medium">A sincronização foi interrompida</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : summary && (
              <>
                <div className="flex items-center justify-center gap-6 py-4">
                  <Stat label="Clientes consultados" value={summary.contactsScanned} />
                  <Stat label="Boletos no Sicoob" value={summary.totalEncontrados} />
                  <Stat
                    label="Órfãos adicionados"
                    value={summary.totalOrfaos}
                    icon={summary.totalOrfaos > 0 ? <CheckCircle2 className="h-5 w-5 text-success" /> : undefined}
                  />
                  {summary.errors > 0 && (
                    <Stat label="Com erro" value={summary.errors} icon={<XCircle className="h-5 w-5 text-destructive" />} />
                  )}
                </div>

                {summary.totalOrfaos === 0 && problems.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nada de novo — sua tabela já reflete o que está registrado no Sicoob.
                  </p>
                )}

                {(withOrphans.length > 0 || problems.length > 0) && (
                  <div className="border rounded-md overflow-y-auto max-h-[40vh]">
                    <div className="divide-y">
                      {withOrphans.map((d) => (
                        <div key={d.contact_id} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {d.orfaos} boleto(s) adicionado(s) à tabela
                            </div>
                          </div>
                        </div>
                      ))}
                      {problems.map((d) => (
                        <div key={d.contact_id} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.name ?? d.contact_id}</div>
                            <div className="text-xs text-muted-foreground">{d.message}</div>
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

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 text-2xl font-bold">{icon}{value}</div>
      <span className="text-xs text-muted-foreground uppercase tracking-wide text-center">{label}</span>
    </div>
  );
}
