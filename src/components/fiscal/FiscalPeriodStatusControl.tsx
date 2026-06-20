import { useMemo, useState } from 'react';
import { Lock, LockOpen, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import {
  useFiscalPeriodStatus,
  useClosePeriod,
  useReopenPeriod,
} from '@/hooks/useFiscalPeriodStatus';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function usePeriodTaskSummary(year: number, month: number) {
  const { company } = useCompany();
  const companyId = (company as any)?.id;
  return useQuery({
    queryKey: ['fiscal-period-summary', companyId, year, month],
    enabled: !!companyId,
    queryFn: async () => {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('status, due_date')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month);
      if (error) throw error;
      let concluidas = 0, pendentes = 0, atrasadas = 0;
      (data ?? []).forEach((t: any) => {
        if (t.status === 'concluido') concluidas++;
        else {
          pendentes++;
          if (t.due_date && t.due_date < todayIso) atrasadas++;
        }
      });
      return { concluidas, pendentes, atrasadas, total: (data ?? []).length };
    },
  });
}

export function FiscalPeriodStatusControl({ year, month }: { year: number; month: number }) {
  const { isAdmin, isSuperAdmin } = useUserRole();
  const { data: status } = useFiscalPeriodStatus(year, month);
  const close = useClosePeriod();
  const reopen = useReopenPeriod();

  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: summary } = usePeriodTaskSummary(year, month);

  const isClosed = status?.status === 'closed';
  const periodLabel = useMemo(() => `${MONTHS[month - 1]}/${year}`, [year, month]);

  const canClose = (isAdmin || isSuperAdmin) && !isClosed;
  const canReopen = isSuperAdmin && isClosed;

  const handleClose = () => {
    close.mutate({ year, month }, { onSuccess: () => setCloseOpen(false) });
  };

  const handleReopen = () => {
    if (reason.trim().length < 10) return;
    reopen.mutate(
      { year, month, reason: reason.trim() },
      {
        onSuccess: () => {
          setReopenOpen(false);
          setReason('');
        },
      }
    );
  };

  return (
    <>
      {isClosed ? (
        <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-muted-foreground/30">
          <Lock className="h-3 w-3" /> Encerrado
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          Aberto
        </Badge>
      )}

      {canClose && (
        <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)}>
          <Lock className="h-4 w-4" /> Encerrar Competência
        </Button>
      )}

      {canReopen && (
        <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
          <LockOpen className="h-4 w-4" /> Reabrir Competência
        </Button>
      )}

      {/* Close dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar competência {periodLabel}?</DialogTitle>
            <DialogDescription>
              Ao encerrar, as tarefas deste período ficarão bloqueadas para edição.
              Apenas super_admin pode reabrir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground mb-1">Resumo do período</p>
              <p>
                <span className="font-medium text-emerald-600">{summary?.concluidas ?? 0}</span> concluídas,{' '}
                <span className="font-medium text-blue-600">{summary?.pendentes ?? 0}</span> pendentes,{' '}
                <span className="font-medium text-red-600">{summary?.atrasadas ?? 0}</span> atrasadas
              </p>
            </div>

            {(summary?.atrasadas ?? 0) > 0 && (
              <Alert className="bg-yellow-500/10 border-yellow-500/40">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription>
                  Atenção: existem {summary?.atrasadas} tarefa(s) atrasada(s) neste período.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
            <Button onClick={handleClose} disabled={close.isPending}>
              <Lock className="h-4 w-4" /> Encerrar competência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog */}
      <Dialog
        open={reopenOpen}
        onOpenChange={(o) => {
          setReopenOpen(o);
          if (!o) setReason('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir competência {periodLabel}</DialogTitle>
            <DialogDescription>
              Informe o motivo da reabertura (mínimo 10 caracteres).
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da reabertura..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/10 caracteres mínimos
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleReopen}
              disabled={reason.trim().length < 10 || reopen.isPending}
            >
              <LockOpen className="h-4 w-4" /> Reabrir competência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
