import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}

const toISO = (d: Date | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, 'dd/MM/yyyy') : 'Opcional'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function BulkEditCalendarDialog({ open, onOpenChange, selectedIds, onDone }: Props) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [internal, setInternal] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDue(undefined);
      setInternal(undefined);
      setReason('');
    }
  }, [open]);

  const hasAny = !!due || !!internal;
  const reasonInvalid = hasAny && reason.trim().length === 0;

  const handleSave = async () => {
    if (!hasAny) {
      toast.error('Preencha pelo menos uma das datas.');
      return;
    }
    if (reasonInvalid) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = {
        override_reason: reason.trim(),
        overridden_at: new Date().toISOString(),
        overridden_by: profile?.id ?? null,
      };
      if (due) patch.adjusted_due_date_override = toISO(due);
      if (internal) patch.internal_delivery_date_override = toISO(internal);

      const { error } = await (supabase as any)
        .from('fiscal_calendar')
        .update(patch)
        .in('id', selectedIds);
      if (error) throw error;

      toast.success(`✅ ${selectedIds.length} obrigações atualizadas.`);
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {selectedIds.length} obrigações</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DateField label="Nova data de vencimento fiscal" value={due} onChange={setDue} />
          <DateField label="Nova data de entrega interna" value={internal} onChange={setInternal} />
          <div className="space-y-1.5">
            <Label>
              Motivo do ajuste {hasAny && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || reasonInvalid || !hasAny}>
            {saving ? 'Salvando...' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
