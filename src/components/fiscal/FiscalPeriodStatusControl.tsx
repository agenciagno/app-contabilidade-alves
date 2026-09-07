import { useMemo, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
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
import { useUserRole } from '@/hooks/useUserRole';
import {
  useFiscalPeriodStatus,
  useReopenPeriod,
} from '@/hooks/useFiscalPeriodStatus';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function FiscalPeriodStatusControl({ year, month }: { year: number; month: number }) {
  const { isSuperAdmin } = useUserRole();
  const { data: status } = useFiscalPeriodStatus(year, month);
  const reopen = useReopenPeriod();

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isClosed = status?.status === 'closed';
  const periodLabel = useMemo(() => `${MONTHS[month - 1]}/${year}`, [year, month]);

  const canReopen = isSuperAdmin && isClosed;

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
        <Badge variant="outline" className="gap-1 bg-ok/10 text-ok dark:text-ok border-ok/30">
          Aberto
        </Badge>
      )}

      {canReopen && (
        <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
          <LockOpen className="h-4 w-4" /> Reabrir Competência
        </Button>
      )}

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
