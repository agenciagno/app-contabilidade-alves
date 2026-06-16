import { useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRightLeft, RotateCcw, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CoverageRow,
  REASON_LABELS,
  useTransferHistory,
  useRevertTransfer,
} from '@/hooks/useTemporaryTransfers';

function statusBadge(c: CoverageRow) {
  if (c.is_active) {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 animate-pulse"
      >
        Ativa
      </Badge>
    );
  }
  if (c.revert_reason) {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      >
        Revertida manualmente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      Expirada
    </Badge>
  );
}

function reasonText(c: CoverageRow) {
  return REASON_LABELS[c.reason] ?? c.reason;
}

export function TransferHistoryPanel() {
  const { data: rows = [], isLoading } = useTransferHistory();
  const revert = useRevertTransfer();
  const [confirmRow, setConfirmRow] = useState<CoverageRow | null>(null);
  const [revertReason, setRevertReason] = useState('');

  const handleRevert = async () => {
    if (!confirmRow || !revertReason.trim()) return;
    try {
      const res = await revert.mutateAsync({ coverage: confirmRow, reason: revertReason.trim() });
      toast.success(`✅ Transferência revertida. ${res.taskCount} tarefa(s) devolvidas.`);
      setConfirmRow(null);
      setRevertReason('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao reverter');
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Transferências
      </h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <Card className="bg-card border-border/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma transferência registrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const days = c.is_active
              ? differenceInCalendarDays(parseISO(c.end_date), new Date())
              : null;
            const overdue = c.is_active && days !== null && days < 0;
            return (
              <Card key={c.id} className="bg-card border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{c.absent_profile?.full_name ?? '—'}</span>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{c.covering_profile?.full_name ?? '—'}</span>
                    </div>
                    {statusBadge(c)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">Motivo: </span>
                      {reasonText(c)}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Período: </span>
                      {format(parseISO(c.start_date), 'dd/MM/yyyy')} →{' '}
                      {format(parseISO(c.end_date), 'dd/MM/yyyy')}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Clientes: </span>
                      {(c.clients_transferred ?? []).length} · {c.tasks_transferred} tarefa(s)
                    </div>
                  </div>

                  {c.is_active && days !== null && (
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          overdue ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {overdue
                          ? `Expirada há ${Math.abs(days)} dia(s) — aguardando reversão automática`
                          : days === 0
                          ? 'Expira hoje'
                          : `Expira em ${days} dia(s)`}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setConfirmRow(c);
                          setRevertReason('');
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverter agora
                      </Button>
                    </div>
                  )}

                  {!c.is_active && c.revert_reason && (
                    <p className="text-xs text-muted-foreground">
                      Revertida em{' '}
                      {c.auto_reverted_at
                        ? format(parseISO(c.auto_reverted_at), 'dd/MM/yyyy', { locale: ptBR })
                        : '—'}{' '}
                      por {c.reverted_by_profile?.full_name ?? '—'} —{' '}
                      <span className="italic">Motivo: {c.revert_reason}</span>
                    </p>
                  )}
                  {!c.is_active && !c.revert_reason && c.auto_reverted_at && (
                    <p className="text-xs text-muted-foreground">
                      Revertida automaticamente em{' '}
                      {format(parseISO(c.auto_reverted_at), 'dd/MM/yyyy', { locale: ptBR })}.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!confirmRow}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmRow(null);
            setRevertReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter transferência agora?</AlertDialogTitle>
            <AlertDialogDescription>
              {(confirmRow?.clients_transferred ?? []).length} cliente(s) voltarão imediatamente
              para {confirmRow?.absent_profile?.full_name ?? '—'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Motivo da reversão antecipada *</Label>
            <Textarea
              rows={3}
              value={revertReason}
              onChange={(e) => setRevertReason(e.target.value)}
              placeholder="Ex.: colaborador retornou antes do previsto"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revert.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevert}
              disabled={revert.isPending || !revertReason.trim()}
            >
              {revert.isPending ? 'Revertendo...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
