import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  FiscalCalendarEffectiveRow,
  useSaveOverride,
  useRemoveOverride,
} from '@/hooks/useFiscalCalendar';
import { useProfile } from '@/hooks/useProfile';

interface Props {
  row: FiscalCalendarEffectiveRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toDate = (s: string | null) => (s ? parseISO(s) : undefined);
const toISO = (d: Date | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

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
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !value && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? format(value, 'dd/MM/yyyy') : 'Selecionar...'}
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
        {value && (
          <Button variant="ghost" size="icon" onClick={() => onChange(undefined)} title="Limpar">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function FiscalObligationOverrideDialog({ row, open, onOpenChange }: Props) {
  const { profile } = useProfile();
  const save = useSaveOverride();
  const remove = useRemoveOverride();

  const [dueOverride, setDueOverride] = useState<Date | undefined>(undefined);
  const [intOverride, setIntOverride] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');

  // Reset when row changes
  const rowKey = row?.id;
  const [lastKey, setLastKey] = useState<string | undefined>(undefined);
  if (rowKey !== lastKey) {
    setLastKey(rowKey);
    setDueOverride(toDate(row?.adjusted_due_date_override ?? null));
    setIntOverride(toDate(row?.internal_delivery_date_override ?? null));
    setReason(row?.override_reason ?? '');
  }

  if (!row) return null;

  const hasAnyOverride = !!dueOverride || !!intOverride;
  const reasonRequired = hasAnyOverride && reason.trim().length === 0;
  const hasExistingOverride =
    !!row.adjusted_due_date_override || !!row.internal_delivery_date_override;

  const handleSave = async () => {
    await save.mutateAsync({
      id: row.id,
      adjusted_due_date_override: toISO(dueOverride),
      internal_delivery_date_override: toISO(intOverride),
      override_reason: hasAnyOverride ? reason.trim() : null,
      overridden_by: profile?.id ?? null,
    });
    onOpenChange(false);
  };

  const handleRemove = async () => {
    await remove.mutateAsync(row.id);
    onOpenChange(false);
  };

  const title = row.fiscal_obligations_catalog?.name ?? 'Obrigação';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar Datas — {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Vencimento calculado automaticamente: </span>
              <strong>{row.adjusted_due_date ? format(parseISO(row.adjusted_due_date), 'dd/MM/yyyy') : '—'}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Entrega interna calculada: </span>
              <strong>{row.internal_delivery_date ? format(parseISO(row.internal_delivery_date), 'dd/MM/yyyy') : '—'}</strong>
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium">Ajuste manual</p>

          <DateField
            label="Nova data de vencimento fiscal"
            value={dueOverride}
            onChange={setDueOverride}
          />
          <DateField
            label="Nova data de entrega interna"
            value={intOverride}
            onChange={setIntOverride}
          />

          <div className="space-y-1.5">
            <Label>
              Motivo do ajuste {hasAnyOverride && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {hasExistingOverride && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={remove.isPending}
            >
              Remover Ajuste
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={reasonRequired || save.isPending}
          >
            {save.isPending ? 'Salvando...' : 'Salvar Ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
