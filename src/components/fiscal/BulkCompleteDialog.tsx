import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, FileUp, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type CompletionType = 'attachment' | 'protocol' | 'transmitted';

type PendingTask = {
  id: string;
  contact_id: string;
  status: string;
  contact_name: string;
  contact_document: string | null;
  obligation_id: string | null;
  obligation_name: string;
  competence_year: number;
  competence_month: number;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  year: number;
  month: number;
}

const MONTH_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const onlyDigits = (s: string) => s.replace(/\D/g, '');

const extractCnpjFromFilename = (name: string): string | null => {
  const digits = onlyDigits(name);
  // try to find a 14-digit chunk
  const m = digits.match(/(\d{14})/);
  return m ? m[1] : null;
};

export function BulkCompleteDialog({ open, onOpenChange, companyId, year, month }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [obligationId, setObligationId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completionType, setCompletionType] = useState<CompletionType>('attachment');
  const [protocol, setProtocol] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({}); // fileName -> contact_id
  const [markCompleted, setMarkCompleted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setStep(1);
    setObligationId('');
    setSelectedIds(new Set());
    setCompletionType('attachment');
    setProtocol('');
    setNotes('');
    setFiles([]);
    setManualMatches({});
    setMarkCompleted(true);
    setProgress(0);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // Fetch all pending tasks for the period
  const pendingQ = useQuery({
    queryKey: ['bulk-complete-pending', companyId, year, month],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('id, contact_id, status, obligation_id, competence_year, competence_month, contacts(name, document), fiscal_obligations_catalog(name)')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .neq('status', 'concluido');
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        contact_id: t.contact_id,
        status: t.status,
        obligation_id: t.obligation_id,
        competence_year: t.competence_year,
        competence_month: t.competence_month,
        contact_name: t.contacts?.name ?? '—',
        contact_document: t.contacts?.document ?? null,
        obligation_name: t.fiscal_obligations_catalog?.name ?? 'Sem obrigação',
      })) as PendingTask[];
    },
  });

  // Group by obligation for the select
  const obligationGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    (pendingQ.data ?? []).forEach((t) => {
      const key = t.obligation_id ?? '__none__';
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { id: key, name: t.obligation_name, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingQ.data]);

  const tasksForObligation = useMemo(() => {
    if (!obligationId) return [];
    return (pendingQ.data ?? []).filter(
      (t) => (t.obligation_id ?? '__none__') === obligationId,
    );
  }, [pendingQ.data, obligationId]);

  const selectedTasks = useMemo(
    () => tasksForObligation.filter((t) => selectedIds.has(t.id)),
    [tasksForObligation, selectedIds],
  );

  // File <-> task matching by CNPJ
  const fileMatches = useMemo(() => {
    const auto: Record<string, string> = {}; // fileName -> task.id
    const unmatched: File[] = [];
    files.forEach((f) => {
      const cnpj = extractCnpjFromFilename(f.name);
      let taskId: string | undefined;
      if (cnpj) {
        const match = selectedTasks.find(
          (t) => t.contact_document && onlyDigits(t.contact_document) === cnpj,
        );
        if (match) taskId = match.id;
      }
      if (taskId) auto[f.name] = taskId;
      else if (manualMatches[f.name]) auto[f.name] = manualMatches[f.name];
      else unmatched.push(f);
    });
    return { auto, unmatched };
  }, [files, selectedTasks, manualMatches]);

  // task.id -> file
  const taskFileMap = useMemo(() => {
    const map: Record<string, File> = {};
    files.forEach((f) => {
      const tid = fileMatches.auto[f.name];
      if (tid) map[tid] = f;
    });
    return map;
  }, [files, fileMatches]);

  const tasksWithoutFile = useMemo(
    () => selectedTasks.filter((t) => !taskFileMap[t.id]),
    [selectedTasks, taskFileMap],
  );

  // ===== Step navigation =====
  const canGoStep2 = !!obligationId && selectedIds.size > 0;
  const canGoStep3 = () => {
    if (completionType === 'protocol') return protocol.trim().length > 0;
    return true;
  };

  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(tasksForObligation.map((t) => t.id)));
    else setSelectedIds(new Set());
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ===== Execute =====
  const execute = async () => {
    if (!companyId) return;
    setSubmitting(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;
    const total = selectedTasks.length;

    for (let i = 0; i < selectedTasks.length; i++) {
      const task = selectedTasks[i];
      try {
        const updates: Record<string, any> = {
          completion_type: completionType,
          updated_at: new Date().toISOString(),
        };
        if (markCompleted) {
          updates.status = 'concluido';
          updates.completed_at = new Date().toISOString();
        }
        if (completionType === 'attachment') {
          const file = taskFileMap[task.id];
          if (file) {
            const path = `fiscal/${companyId}/${task.id}/${Date.now()}_${file.name}`;
            const { error: upErr } = await supabase.storage
              .from('transaction-attachments')
              .upload(path, file);
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage
              .from('transaction-attachments')
              .getPublicUrl(path);
            updates.attachment_url = urlData.publicUrl;
          }
        } else if (completionType === 'protocol') {
          updates.protocol_number = protocol.trim();
        } else if (completionType === 'transmitted') {
          updates.completion_notes = notes.trim() || null;
        }

        const { error } = await (supabase as any)
          .from('fiscal_tasks')
          .update(updates)
          .eq('id', task.id);
        if (error) throw error;
        ok += 1;
      } catch (e: any) {
        console.error('Bulk complete error', task.id, e);
        fail += 1;
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setSubmitting(false);
    if (ok > 0) toast.success(`${ok} tarefa${ok === 1 ? '' : 's'} concluída${ok === 1 ? '' : 's'} em lote`);
    if (fail > 0) toast.error(`${fail} falha${fail === 1 ? '' : 's'} ao processar`);
    qc.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    qc.invalidateQueries({ queryKey: ['bulk-complete-pending'] });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Concluir em Lote — Passo {step} de 3</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Obrigação</Label>
                {pendingQ.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : obligationGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente nesta competência.</p>
                ) : (
                  <Select value={obligationId} onValueChange={(v) => { setObligationId(v); setSelectedIds(new Set()); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma obrigação" /></SelectTrigger>
                    <SelectContent>
                      {obligationGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} — {MONTH_LABEL[month - 1]}/{year} ({g.count} pendente{g.count === 1 ? '' : 's'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {obligationId && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="bulk-all"
                      checked={tasksForObligation.length > 0 && selectedIds.size === tasksForObligation.length}
                      onCheckedChange={(v) => toggleAll(!!v)}
                    />
                    <Label htmlFor="bulk-all" className="cursor-pointer">
                      Selecionar todos ({tasksForObligation.length})
                    </Label>
                    <span className="ml-auto text-muted-foreground">
                      {selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="border rounded-md max-h-[360px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>CNPJ</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasksForObligation.map((t) => (
                          <TableRow key={t.id} className="cursor-pointer" onClick={() => toggleOne(t.id)}>
                            <TableCell>
                              <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleOne(t.id)} />
                            </TableCell>
                            <TableCell className="font-medium">{t.contact_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.contact_document ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{t.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de conclusão</Label>
                <RadioGroup value={completionType} onValueChange={(v) => setCompletionType(v as CompletionType)}>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="attachment" id="ct-att" className="mt-1" />
                    <Label htmlFor="ct-att" className="font-normal cursor-pointer">Anexar comprovantes</Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="protocol" id="ct-prot" className="mt-1" />
                    <Label htmlFor="ct-prot" className="font-normal cursor-pointer">Informar protocolo</Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="transmitted" id="ct-trans" className="mt-1" />
                    <Label htmlFor="ct-trans" className="font-normal cursor-pointer">Marcar como transmitidos</Label>
                  </div>
                </RadioGroup>
              </div>

              {completionType === 'attachment' && (
                <div className="space-y-3">
                  <div className="border-2 border-dashed rounded-md p-4 text-center">
                    <Input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const incoming = Array.from(e.target.files ?? []);
                        setFiles((prev) => [...prev, ...incoming]);
                        e.target.value = '';
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      O CNPJ é extraído do nome do arquivo para vincular automaticamente.
                    </p>
                  </div>

                  {selectedTasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Vinculação por cliente</p>
                      <div className="border rounded-md max-h-[180px] overflow-y-auto divide-y">
                        {selectedTasks.map((t) => {
                          const file = taskFileMap[t.id];
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-2 text-sm px-3 py-2">
                              <span className="truncate">{t.contact_name}</span>
                              {file ? (
                                <span className="flex items-center gap-1.5 text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[220px]">{file.name}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-yellow-700">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Sem comprovante
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {fileMatches.unmatched.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Vincular manualmente</p>
                      <div className="border rounded-md divide-y">
                        {fileMatches.unmatched.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate flex-1">{f.name}</span>
                            <Select
                              value={manualMatches[f.name] ?? ''}
                              onValueChange={(v) => setManualMatches((prev) => ({ ...prev, [f.name]: v }))}
                            >
                              <SelectTrigger className="w-[220px] h-8"><SelectValue placeholder="Escolher cliente" /></SelectTrigger>
                              <SelectContent>
                                {selectedTasks.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.contact_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {completionType === 'protocol' && (
                <div className="space-y-1.5">
                  <Label>Número do protocolo (aplicado a todas as tarefas)</Label>
                  <Input value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="Ex: 2026.06.0001234" />
                </div>
              )}

              {completionType === 'transmitted' && (
                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opcional" />
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border rounded-md max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>{completionType === 'attachment' ? 'Arquivo' : completionType === 'protocol' ? 'Protocolo' : 'Observação'}</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTasks.map((t) => {
                      let detail: React.ReactNode = '—';
                      if (completionType === 'attachment') {
                        const f = taskFileMap[t.id];
                        detail = f ? f.name : <span className="text-yellow-700">Sem comprovante</span>;
                      } else if (completionType === 'protocol') {
                        detail = protocol || '—';
                      } else if (completionType === 'transmitted') {
                        detail = notes || '—';
                      }
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.contact_name}</TableCell>
                          <TableCell className="text-sm">{detail}</TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                              {markCompleted ? 'Concluir' : 'Atualizar'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="mark-done" checked={markCompleted} onCheckedChange={(v) => setMarkCompleted(!!v)} />
                <Label htmlFor="mark-done" className="cursor-pointer">Marcar como Concluído</Label>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>{selectedTasks.length}</strong> tarefa{selectedTasks.length === 1 ? '' : 's'} serão {markCompleted ? 'concluídas' : 'atualizadas'}.
              </p>

              {submitting && <Progress value={progress} className="h-2" />}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {step > 1 && !submitting && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Voltar</Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !canGoStep2) || (step === 2 && !canGoStep3())}
            >
              Avançar
            </Button>
          )}
          {step === 3 && (
            <Button onClick={execute} disabled={submitting || selectedTasks.length === 0}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar conclusão em lote
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
