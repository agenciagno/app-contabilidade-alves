import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Search, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collaborator } from '@/hooks/useCollaboratorCoverage';
import {
  useAbsentProfileClients,
  useCreateTemporaryTransfer,
  REASON_LABELS,
} from '@/hooks/useTemporaryTransfers';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCollaborators: Collaborator[];
  destinationCollaborators: Collaborator[];
}

const REASONS = ['ferias', 'licenca_medica', 'afastamento', 'redistribuicao', 'outro'] as const;

export function TransferTemporaryModal({
  open,
  onOpenChange,
  sourceCollaborators,
  destinationCollaborators,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [absentId, setAbsentId] = useState('');
  const [coveringId, setCoveringId] = useState('');
  const [reason, setReason] = useState<string>('ferias');
  const [customReason, setCustomReason] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const { data: clients = [], isLoading: clientsLoading } = useAbsentProfileClients(
    step >= 2 ? absentId : null,
  );
  const createMutation = useCreateTemporaryTransfer();

  const reset = () => {
    setStep(1);
    setAbsentId('');
    setCoveringId('');
    setReason('ferias');
    setCustomReason('');
    setStartDate(new Date());
    setEndDate(undefined);
    setNotes('');
    setSearch('');
    setSelectedClientIds(new Set());
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const nameOf = (list: Collaborator[], id: string) =>
    list.find((c) => c.id === id)?.full_name || list.find((c) => c.id === id)?.email || '—';
  const absentName = absentId ? nameOf(sourceCollaborators, absentId) : '';
  const coveringName = coveringId ? nameOf(destinationCollaborators, coveringId) : '';

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => (c.name ?? '').toLowerCase().includes(q));
  }, [clients, search]);

  const allFilteredSelected =
    filteredClients.length > 0 && filteredClients.every((c) => selectedClientIds.has(c.id));

  const toggleAllFiltered = () => {
    const next = new Set(selectedClientIds);
    if (allFilteredSelected) filteredClients.forEach((c) => next.delete(c.id));
    else filteredClients.forEach((c) => next.add(c.id));
    setSelectedClientIds(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedClientIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedClientIds(next);
  };

  const step1Valid =
    !!absentId &&
    !!coveringId &&
    absentId !== coveringId &&
    !!startDate &&
    !!endDate &&
    endDate > startDate &&
    (reason !== 'outro' || customReason.trim().length > 0);
  const step2Valid = selectedClientIds.size > 0;

  const submit = async () => {
    if (!step1Valid || !step2Valid || !startDate || !endDate) return;
    try {
      const finalReason = reason === 'outro' ? customReason.trim() : reason;
      const res = await createMutation.mutateAsync({
        absent_profile_id: absentId,
        covering_profile_id: coveringId,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        reason: finalReason,
        notes: notes.trim() || null,
        client_ids: Array.from(selectedClientIds),
        absent_name: absentName,
        covering_name: coveringName,
      });
      toast.success(
        `✅ ${selectedClientIds.size} cliente(s) e ${res.taskCount} tarefa(s) transferidos temporariamente.`,
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao criar transferência temporária.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Transferência Temporária — Etapa {step} de 3</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Colaborador ausente</Label>
                  <Select value={absentId} onValueChange={setAbsentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceCollaborators.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name || c.email}
                        </SelectItem>
                      ))}
                      {sourceCollaborators.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nenhum colaborador com clientes.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Colaborador substituto</Label>
                  <Select value={coveringId} onValueChange={setCoveringId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationCollaborators
                        .filter((c) => c.id !== absentId)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name || c.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reason === 'outro' && (
                  <Input
                    placeholder="Descreva o motivo"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !startDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de expiração</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !endDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(d) => (startDate ? d <= startDate : false)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observações (opcional)</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhes adicionais sobre esta cobertura"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {clientsLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : filteredClients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {clients.length === 0
                    ? 'Este colaborador não possui clientes ativos.'
                    : 'Nenhum cliente encontrado.'}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 border border-border/50 rounded-md bg-muted/30">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                    />
                    <span className="text-sm font-medium">
                      Selecionar todos ({filteredClients.length})
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {selectedClientIds.size} selecionado(s)
                    </span>
                  </div>
                  <ScrollArea className="h-[320px] border border-border/50 rounded-md">
                    <div className="divide-y divide-border/40">
                      {filteredClients.map((c) => {
                        const checked = selectedClientIds.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer"
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleOne(c.id)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.name ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.obligations_count} obrigação(ões) ativa(s)
                              </p>
                            </div>
                            {c.tax_regime && (
                              <Badge variant="outline" className="text-[10px]">
                                {c.tax_regime}
                              </Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          )}

          {step === 3 && startDate && endDate && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
                <p className="text-base">
                  Transferir <span className="font-semibold">{selectedClientIds.size} cliente(s)</span>{' '}
                  de <span className="font-semibold text-foreground">{absentName}</span> para{' '}
                  <span className="font-semibold text-foreground">{coveringName}</span>
                </p>
                <div className="text-sm text-muted-foreground space-y-1 pt-1">
                  <p>
                    <span className="font-medium text-foreground">Motivo:</span>{' '}
                    {reason === 'outro' ? customReason : REASON_LABELS[reason]}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Período:</span>{' '}
                    {format(startDate, 'dd/MM/yyyy')} até {format(endDate, 'dd/MM/yyyy')}
                  </p>
                  {notes && (
                    <p>
                      <span className="font-medium text-foreground">Observações:</span> {notes}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground pt-2">
                  As tarefas pendentes e em andamento serão reassignadas automaticamente.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-900 dark:text-yellow-200">
                  Na data de expiração ({format(endDate, 'dd/MM/yyyy')}), os clientes e tarefas
                  voltarão automaticamente para <span className="font-semibold">{absentName}</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={createMutation.isPending}
            >
              Voltar
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
            >
              Próximo
            </Button>
          )}
          {step === 3 && (
            <Button onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Transferindo...' : 'Confirmar Transferência'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
