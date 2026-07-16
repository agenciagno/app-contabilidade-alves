import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TaskCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { protocolNumber: string | null; completionNotes: string | null }) => void;
}

export function TaskCompletionDialog({ open, onOpenChange, onConfirm }: TaskCompletionDialogProps) {
  const { toast } = useToast();
  const [protocolNumber, setProtocolNumber] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');

  useEffect(() => {
    if (open) {
      setProtocolNumber('');
      setCompletionNotes('');
    }
  }, [open]);

  const handleConfirm = () => {
    const proto = protocolNumber.trim();
    const obs = completionNotes.trim();
    if (!proto && obs.length < 10) {
      toast({
        title: 'Informe um protocolo ou uma observação com pelo menos 10 caracteres',
        variant: 'destructive',
      });
      return;
    }
    onConfirm({ protocolNumber: proto || null, completionNotes: obs || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir tarefa</DialogTitle>
          <DialogDescription>
            Como esta tarefa não tem anexo, informe o <strong>número de protocolo</strong> e/ou
            uma <strong>observação</strong> (mínimo 10 caracteres) para justificar a conclusão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Número do protocolo (opcional)</Label>
            <Input
              value={protocolNumber}
              onChange={(e) => setProtocolNumber(e.target.value)}
              placeholder="Ex: 2.06.000.123456-7"
              maxLength={100}
            />
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="Descreva como/onde a obrigação foi cumprida..."
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se não houver protocolo, a observação precisa ter pelo menos 10 caracteres.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} className="gap-1.5">
            <CheckCircle className="w-4 h-4" /> Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
