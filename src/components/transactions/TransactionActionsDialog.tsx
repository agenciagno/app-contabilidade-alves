import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, CircleDollarSign, Trash2 } from 'lucide-react';

export interface TransactionActionsTarget {
  id: string;
  description: string;
  contact?: { name: string } | null;
}

interface TransactionActionsDialogProps {
  transaction: TransactionActionsTarget | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onSettle: () => void;
  onDelete: () => void;
}

/**
 * Escolha de ação ao clicar numa transação no Pagar/Receber (lista e
 * calendário) — mesmas 3 ações de Lançamentos (Editar/Liquidar/Excluir), só
 * que aqui como um passo de escolha em vez de botões inline: a linha da
 * tabela e a pilula do calendário não têm espaço pra 3 ícones (24/08/2026).
 */
export function TransactionActionsDialog({
  transaction, onOpenChange, onEdit, onSettle, onDelete,
}: TransactionActionsDialogProps) {
  return (
    <Dialog open={!!transaction} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">
            {transaction?.contact?.name ?? transaction?.description ?? 'Transação'}
          </DialogTitle>
          <DialogDescription>O que você quer fazer com esta transação?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="outline" className="justify-start" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" /> Editar
          </Button>
          <Button variant="outline" className="justify-start" onClick={onSettle}>
            <CircleDollarSign className="w-4 h-4 mr-2" /> Liquidar
          </Button>
          <Button
            variant="outline"
            className="justify-start text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Excluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
