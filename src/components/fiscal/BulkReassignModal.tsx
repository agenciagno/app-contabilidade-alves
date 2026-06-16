import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ProfileOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  profiles: ProfileOption[];
  onConfirm: (newResponsibleId: string, expandToMonth: boolean) => Promise<void>;
}

export function BulkReassignModal({ open, onOpenChange, count, profiles, onConfirm }: Props) {
  const [newId, setNewId] = useState<string>('');
  const [expand, setExpand] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!newId) return;
    try {
      setSubmitting(true);
      await onConfirm(newId, expand);
      onOpenChange(false);
      setNewId('');
      setExpand(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferir {count} tarefa{count === 1 ? '' : 's'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Novo responsável</Label>
            <Select value={newId} onValueChange={setNewId}>
              <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={expand} onCheckedChange={(v) => setExpand(!!v)} />
            <span className="text-sm text-muted-foreground leading-snug">
              Aplicar a todas as tarefas pendentes destes clientes no mês atual
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!newId || submitting}>Confirmar Transferência</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
