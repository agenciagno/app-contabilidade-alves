import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Collaborator } from '@/hooks/useCollaboratorCoverage';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborators: Collaborator[];
  currentProfileId: string | null;
  onConfirm: (input: {
    absent_profile_id: string;
    covering_profile_id: string;
    start_date: string;
    end_date: string | null;
    reason: string;
    created_by: string | null;
  }) => Promise<void>;
}

const REASONS = [
  { value: 'ferias', label: 'Férias' },
  { value: 'licenca_medica', label: 'Licença médica' },
  { value: 'licenca_maternidade', label: 'Licença maternidade' },
  { value: 'outros', label: 'Outros' },
];

export function CoverageCreateModal({ open, onOpenChange, collaborators, currentProfileId, onConfirm }: Props) {
  const [absent, setAbsent] = useState<string>('');
  const [covering, setCovering] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState<string>('ferias');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAbsent('');
    setCovering('');
    setStartDate(new Date());
    setEndDate(undefined);
    setReason('ferias');
  };

  const handleSubmit = async () => {
    if (!absent || !covering || !startDate) {
      toast.error('Preencha colaborador ausente, cobertura e data de início.');
      return;
    }
    if (absent === covering) {
      toast.error('O colaborador que cobre deve ser diferente do ausente.');
      return;
    }
    try {
      setSubmitting(true);
      const absentName = collaborators.find((c) => c.id === absent)?.full_name ?? 'colaborador';
      const coveringName = collaborators.find((c) => c.id === covering)?.full_name ?? 'colaborador';
      await onConfirm({
        absent_profile_id: absent,
        covering_profile_id: covering,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
        reason,
        created_by: currentProfileId,
      });
      toast.success(`Cobertura criada. Tarefas de ${absentName} foram transferidas para ${coveringName}.`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao criar cobertura.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Cobertura</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Colaborador ausente</Label>
            <Select value={absent} onValueChange={setAbsent}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Colaborador que cobre</Label>
            <Select value={covering} onValueChange={setCovering}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {collaborators.filter((c) => c.id !== absent).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start gap-2', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="w-4 h-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Término (opcional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start gap-2', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="w-4 h-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Indefinido'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>Criar cobertura</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
