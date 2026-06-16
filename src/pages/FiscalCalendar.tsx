import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUserRole } from '@/hooks/useUserRole';
import {
  useFiscalCalendar,
  useCalculateCalendar,
  useConfirmMonthlyTasks,
  useRollbackMonthlyTasks,
  loadLaunchMeta,
  clearLaunchMeta,
  FiscalCalendarEffectiveRow,
} from '@/hooks/useFiscalCalendar';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { FiscalObligationOverrideDialog } from '@/components/fiscal/FiscalObligationOverrideDialog';
import { BulkEditCalendarDialog } from '@/components/fiscal/BulkEditCalendarDialog';
import { CustomObligationDialog, CustomObligationInitial } from '@/components/fiscal/CustomObligationDialog';
import { CalendarLaunchPreview } from '@/components/fiscal/CalendarLaunchPreview';
import { CalendarConflictMap } from '@/components/fiscal/CalendarConflictMap';
import { IbsCbsSection, isRtRow } from '@/components/fiscal/IbsCbsSection';
import { RtChecklistDialog } from '@/components/fiscal/RtChecklistDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';


const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const YEARS = [2025, 2026, 2027];

type Phase = 'idle' | 'calculated' | 'launched';
const phaseKey = (y: number, m: number) => `fiscal-calendar-phase:${y}-${m}`;

export default function FiscalCalendar() {
  const { isAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const qc = useQueryClient();
  const { company } = useCompany();
  const { profile, userName } = useProfile();
  const companyId = company?.id ?? '';

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [phase, setPhase] = useState<Phase>('idle');
  const { data: rows, isLoading } = useFiscalCalendar(year, month, phase !== 'idle');
  const calculate = useCalculateCalendar();
  const confirm = useConfirmMonthlyTasks();
  const rollback = useRollbackMonthlyTasks();

  // Preview gate
  const [previewReviewed, setPreviewReviewed] = useState(false);

  // Lock / launch metadata
  const [launchMeta, setLaunchMeta] = useState<ReturnType<typeof loadLaunchMeta>>(null);
  const [locked, setLocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  // RT checklist
  const [rtChecklistOpen, setRtChecklistOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(phaseKey(year, month));
      const p = (stored as Phase) ?? 'idle';
      setPhase(p);
      if (companyId) {
        const meta = loadLaunchMeta(companyId, year, month);
        setLaunchMeta(meta);
        setLocked(p === 'launched' && !!meta);
      } else {
        setLaunchMeta(null);
        setLocked(p === 'launched');
      }
    } catch {
      setPhase('idle');
      setLaunchMeta(null);
      setLocked(false);
    }
    setPreviewReviewed(false);
  }, [year, month, companyId]);

  const setPhasePersist = (next: Phase) => {
    setPhase(next);
    try {
      sessionStorage.setItem(phaseKey(year, month), next);
    } catch {}
    if (next === 'launched' && companyId) {
      setLaunchMeta(loadLaunchMeta(companyId, year, month));
      setLocked(true);
    } else if (next === 'calculated') {
      setLocked(false);
    }
  };

  const handleMonthChange = (v: string) => {
    setPhasePersist('idle');
    setMonth(Number(v));
    setSelected(new Set());
  };
  const handleYearChange = (v: string) => {
    setPhasePersist('idle');
    setYear(Number(v));
    setSelected(new Set());
  };

  const [editing, setEditing] = useState<FiscalCalendarEffectiveRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<FiscalCalendarEffectiveRow | null>(null);

  // custom obligation dialog
  const [customOpen, setCustomOpen] = useState(false);
  const [customInitial, setCustomInitial] = useState<CustomObligationInitial | null>(null);
  const [obligationToDelete, setObligationToDelete] = useState<{ id: string; name: string } | null>(null);

  const sorted = useMemo(() => rows ?? [], [rows]);

  // Reset selection when rows change set
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(sorted.map((r) => r.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next;
    });
  }, [sorted]);

  if (roleLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/fiscal/tarefas" replace />;

  const fmt = (s: string | null) => (s ? format(parseISO(s), 'dd/MM/yyyy') : '—');

  const handleCalculate = () => {
    calculate.mutate({ year, month }, { onSuccess: () => setPhasePersist('calculated') });
  };
  const handleConfirm = () => {
    confirm.mutate(
      { year, month, companyId, launchedBy: userName },
      { onSuccess: () => setPhasePersist('launched') },
    );
  };
  const handleUnlock = () => {
    if (!profile) return;
    setLocked(false);
    setUnlockOpen(false);
    toast.success('Calendário desbloqueado para edição.');
    // Annotate every overridden row with audit reason; rows without override stay untouched
    const today = format(new Date(), 'dd/MM/yyyy');
    const reason = `Calendário desbloqueado por ${userName} em ${today}`;
    // We append the reason to future overrides via dialog default; store on launchMeta for UI display
    setLaunchMeta((prev) => (prev ? { ...prev, launched_by: prev.launched_by } : prev));
    // Best-effort: bump rows that already have override to capture the reason in their audit field
    (async () => {
      try {
        const ids = sorted.filter((r) => !!r.adjusted_due_date_override).map((r) => r.id);
        if (ids.length > 0) {
          await (supabase as any)
            .from('fiscal_calendar')
            .update({ override_reason: reason })
            .in('id', ids);
          qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
        }
      } catch {}
    })();
  };
  const handleRollback = () => {
    if (!companyId) return;
    rollback.mutate(
      { year, month, companyId },
      {
        onSuccess: () => {
          setPhasePersist('calculated');
          setLaunchMeta(null);
          setLocked(false);
          setRollbackOpen(false);
        },
      },
    );
  };

  const editingDisabled = phase === 'launched' && locked;


  const allChecked = sorted.length > 0 && selected.size === sorted.length;
  const someChecked = selected.size > 0 && selected.size < sorted.length;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
      setLastIdx(null);
    } else {
      setSelected(new Set(sorted.map((r) => r.id)));
    }
  };

  const handleRowCheckbox = (idx: number, e: React.MouseEvent) => {
    const id = sorted[idx].id;
    const next = new Set(selected);
    if (e.shiftKey && lastIdx !== null) {
      const [s, eIdx] = lastIdx < idx ? [lastIdx, idx] : [idx, lastIdx];
      for (let i = s; i <= eIdx; i++) next.add(sorted[i].id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
    setLastIdx(idx);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    try {
      const { error } = await (supabase as any)
        .from('fiscal_calendar')
        .delete()
        .in('id', ids);
      if (error) throw error;
      toast.success(`✅ ${ids.length} entrada(s) excluída(s).`);
      setSelected(new Set());
      setLastIdx(null);
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao excluir');
    } finally {
      setBulkDeleteOpen(false);
    }
  };

  const handleDeleteRow = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('fiscal_calendar').delete().eq('id', id);
      if (error) throw error;
      toast.success('✅ Obrigação removida do calendário.');
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao excluir');
    } finally {
      setRowToDelete(null);
    }
  };

  const COL_COUNT = 7;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Calendário Fiscal</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => { setCustomInitial(null); setCustomOpen(true); }}
            disabled={editingDisabled}
          >
            <Plus className="h-4 w-4" /> Nova Obrigação
          </Button>

          <Button variant="outline" onClick={() => setRtChecklistOpen(true)}>
            <ClipboardCheck className="h-4 w-4" /> Checklist RT
          </Button>

          {phase === 'idle' && (
            <Button onClick={handleCalculate} disabled={calculate.isPending}>
              {calculate.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</>
              ) : (
                <><Zap className="h-4 w-4" /> Calcular Calendário</>
              )}
            </Button>
          )}

          {phase === 'calculated' && (
            <Button
              onClick={handleConfirm}
              disabled={confirm.isPending || !previewReviewed}
              className="bg-emerald-600 hover:bg-emerald-700"
              title={!previewReviewed ? 'Marque "Revisei a distribuição" para liberar o lançamento' : undefined}
            >
              {confirm.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Lançando...</>
              ) : (
                <><Rocket className="h-4 w-4" /> Lançar Tarefas</>
              )}
            </Button>
          )}

          {phase === 'launched' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 px-3 py-1.5">
                {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                {launchMeta
                  ? `Lançado em ${format(parseISO(launchMeta.launched_at), "dd/MM/yyyy 'às' HH:mm")} por ${launchMeta.launched_by}`
                  : 'Tarefas lançadas'}
              </Badge>
              {locked ? (
                <Button size="sm" variant="outline" onClick={() => setUnlockOpen(true)}>
                  <LockOpen className="h-4 w-4" /> Desbloquear
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setLocked(true); toast.info('Calendário bloqueado.'); }}>
                  <Lock className="h-4 w-4" /> Rebloquear
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setRollbackOpen(true)}
                disabled={rollback.isPending}
              >
                {rollback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Desfazer lançamento
              </Button>
            </div>
          )}
        </div>
      </div>


      {phase === 'calculated' && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
          <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-foreground">
            Calendário calculado. Revise o preview de distribuição abaixo e clique em <strong>Lançar Tarefas</strong> para criar as tarefas no Kanban.
          </p>
        </div>
      )}

      {phase === 'calculated' && sorted.length > 0 && (
        <CalendarLaunchPreview
          rows={sorted}
          reviewed={previewReviewed}
          onReviewedChange={setPreviewReviewed}
        />
      )}

      {phase !== 'idle' && sorted.length > 0 && (
        <CalendarConflictMap rows={sorted} year={year} month={month} />
      )}

      {selected.size > 0 && !editingDisabled && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} obrigação(ões) selecionada(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar selecionados
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Excluir selecionados
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setLastIdx(null); }}>
              <X className="h-4 w-4" /> Desmarcar tudo
            </Button>
          </div>
        </div>
      )}


      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                  disabled={editingDisabled}
                />
              </TableHead>

              <TableHead>Obrigação</TableHead>
              <TableHead>Regime</TableHead>
              <TableHead>Vencimento Fiscal</TableHead>
              <TableHead>Entrega Interna</TableHead>
              <TableHead>Override</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phase === 'idle' ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <CalendarRange className="h-10 w-10 opacity-40" />
                    <p>Clique em <strong>Calcular Calendário</strong> para visualizar as obrigações do período.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: COL_COUNT }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="text-center py-10 text-muted-foreground">
                  Nenhuma obrigação encontrada para o período
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r, idx) => {
                const cat = r.fiscal_obligations_catalog;
                const isOverridden = !!r.adjusted_due_date_override;
                const isChecked = selected.has(r.id);
                const isCustom = !!cat?.is_custom;
                return (
                  <TableRow key={r.id} data-state={isChecked ? 'selected' : undefined}>
                    <TableCell>
                      <div
                        onClick={(e) => !editingDisabled && handleRowCheckbox(idx, e)}
                        className={'inline-flex ' + (editingDisabled ? 'opacity-40 pointer-events-none' : '')}
                      >
                        <Checkbox checked={isChecked} aria-label="Selecionar linha" disabled={editingDisabled} />
                      </div>
                    </TableCell>

                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{cat?.name ?? '—'}</span>
                        {isCustom && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0"
                          >
                            <Sparkles className="h-3 w-3" /> Personalizada
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cat?.applies_to ?? []).map((t) => (
                          <Badge key={t} variant="outline">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{fmt(r.adjusted_due_date)}</TableCell>
                    <TableCell>{fmt(r.internal_delivery_date)}</TableCell>
                    <TableCell>
                      {isOverridden ? (
                        <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20 border-yellow-500/30">
                          Ajustado
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/20 border-green-500/30">
                          Automático
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditing(r); setDialogOpen(true); }}
                          title="Editar override"
                          disabled={editingDisabled}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {isCustom && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={editingDisabled}
                              onClick={() => {
                                setCustomInitial({
                                  id: cat!.id,
                                  name: cat!.name,
                                  description: cat!.description ?? '',
                                  applies_to: cat!.applies_to ?? [],
                                  due_rule: cat!.due_rule ?? null,
                                  holiday_adjustment: cat!.holiday_adjustment ?? 'prev_business_day',
                                });
                                setCustomOpen(true);
                              }}
                              title="Editar obrigação personalizada"
                              className="text-amber-600 hover:text-amber-700"
                            >
                              <Sparkles className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={editingDisabled}
                              onClick={() => setObligationToDelete({ id: cat!.id, name: cat!.name })}
                              title="Excluir obrigação personalizada"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={editingDisabled}
                          onClick={() => setRowToDelete(r)}
                          title="Excluir entrada do mês"
                          className="text-destructive hover:text-destructive"
                        >

                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {phase !== 'idle' && sorted.length > 0 && (
        <IbsCbsSection
          rows={sorted}
          disabled={editingDisabled}
          onNewRtObligation={() => {
            setCustomInitial({
              name: '',
              description: '[RT] ',
              applies_to: [],
              due_rule: null,
              holiday_adjustment: 'prev_business_day',
            });
            setCustomOpen(true);
          }}
        />
      )}


      <FiscalObligationOverrideDialog
        row={editing}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
      />

      <BulkEditCalendarDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedIds={Array.from(selected)}
        onDone={() => { setSelected(new Set()); setLastIdx(null); }}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} entrada(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selected.size} entrada(s) do calendário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rowToDelete} onOpenChange={(o) => !o && setRowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir entrada</AlertDialogTitle>
            <AlertDialogDescription>
              {rowToDelete && (
                <>Excluir a entrada "{rowToDelete.fiscal_obligations_catalog?.name ?? '—'}" do calendário de {String(month).padStart(2, '0')}/{year}?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rowToDelete && handleDeleteRow(rowToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomObligationDialog
        open={customOpen}
        onOpenChange={(o) => { setCustomOpen(o); if (!o) setCustomInitial(null); }}
        initial={customInitial}
      />

      <AlertDialog open={!!obligationToDelete} onOpenChange={(o) => !o && setObligationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obrigação personalizada</AlertDialogTitle>
            <AlertDialogDescription>
              {obligationToDelete && (
                <>Excluir definitivamente a obrigação personalizada "{obligationToDelete.name}"? Esta ação removerá a obrigação de todos os meses e contatos vinculados.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!obligationToDelete) return;
                try {
                  const { error } = await (supabase as any)
                    .from('fiscal_obligations_catalog')
                    .delete()
                    .eq('id', obligationToDelete.id)
                    .eq('is_custom', true);
                  if (error) throw error;
                  toast.success('✅ Obrigação personalizada excluída.');
                  qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
                  qc.invalidateQueries({ queryKey: ['fiscal-obligations-catalog'] });
                } catch (e: any) {
                  toast.error(e?.message ?? 'Erro ao excluir');
                } finally {
                  setObligationToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desbloquear calendário</AlertDialogTitle>
            <AlertDialogDescription>
              Editar o calendário após o lançamento pode causar inconsistências com as tarefas já geradas. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlock}>Desbloquear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai DELETAR até {launchMeta?.task_ids.length ?? 0} tarefa(s) geradas automaticamente para {String(month).padStart(2, '0')}/{year}. Tarefas editadas manualmente ou com status diferente de "A Fazer" serão preservadas. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRollback}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RtChecklistDialog open={rtChecklistOpen} onOpenChange={setRtChecklistOpen} />
    </div>
  );
}

