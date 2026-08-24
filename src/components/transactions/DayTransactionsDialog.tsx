import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, CircleDollarSign, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DayTransactionRow {
  id: string;
  description: string;
  contact?: { name: string } | null;
  type: 'receita' | 'despesa';
  displayAmount: number;
  status: 'pago' | 'pendente' | 'vencido';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const STATUS_BADGE: Record<DayTransactionRow['status'], { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-ok text-white hover:bg-ok' },
  vencido: { label: 'Vencido', className: 'bg-danger text-white hover:bg-danger' },
  pendente: { label: 'Pendente', className: 'border-warn text-warn' },
};

interface DayTransactionsDialogProps {
  /** yyyy-MM-dd do dia clicado no "+N"; null = fechado. */
  dateKey: string | null;
  rows: DayTransactionRow[];
  onOpenChange: (open: boolean) => void;
  onEdit: (row: DayTransactionRow) => void;
  onSettle: (row: DayTransactionRow) => void;
  onDelete: (row: DayTransactionRow) => void;
}

/**
 * Aberto pelo "+N" do calendário — lista todas as transações do dia (o
 * calendário só mostra 3 por célula). Cada linha já traz as 3 ações inline
 * (Editar/Liquidar/Excluir), sem passo intermediário: aqui tem espaço pra
 * isso, diferente da pílula do calendário (24/08/2026).
 */
export function DayTransactionsDialog({
  dateKey, rows, onOpenChange, onEdit, onSettle, onDelete,
}: DayTransactionsDialogProps) {
  const title = dateKey
    ? format(new Date(dateKey + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : '';

  return (
    <Dialog open={!!dateKey} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{title}</DialogTitle>
          <DialogDescription>{rows.length} transação(ões) neste dia.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border">
          {rows.map(row => (
            <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.contact?.name ?? row.description}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn('text-xs font-semibold', row.type === 'receita' ? 'text-ok' : 'text-danger')}>
                    {formatCurrency(row.displayAmount)}
                  </span>
                  <Badge className={cn('text-[10px]', STATUS_BADGE[row.status].className)} variant={row.status === 'pendente' ? 'outline' : 'default'}>
                    {STATUS_BADGE[row.status].label}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={() => onEdit(row)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-ok/10" onClick={() => onSettle(row)}>
                  <CircleDollarSign className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10" onClick={() => onDelete(row)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
