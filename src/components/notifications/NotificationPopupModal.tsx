import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePendingPopups } from '@/hooks/usePendingPopups';

// Pop-up in-app da Central de Notificações — mostra um por vez (o mais antigo primeiro),
// sempre com X pra fechar (padrão do Dialog). Fechar marca como lido; o próximo pendente
// (se houver) aparece na renderização seguinte.
export function NotificationPopupModal() {
  const { current, dismiss } = usePendingPopups();
  const navigate = useNavigate();

  if (!current) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open) dismiss(current.id);
  };

  const handleAction = () => {
    dismiss(current.id);
    if (current.action_url) navigate(current.action_url);
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          {current.body && (
            <DialogDescription className="whitespace-pre-wrap text-foreground/80">
              {current.body}
            </DialogDescription>
          )}
        </DialogHeader>
        {current.action_url && current.button_label && (
          <DialogFooter>
            <Button onClick={handleAction}>{current.button_label}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
