import { useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Loader2, CalendarIcon } from 'lucide-react';

type FieldOption = 'contact_id' | 'category_id' | 'bank_id' | 'due_date' | 'expected_date';

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  contacts: Array<{ id: string; name: string; is_active: boolean }>;
  categories: Array<{ id: string; name: string; type: string }>;
  banks: Array<{ id: string; name: string; is_active: boolean }>;
  onSuccess: () => void;
}

export function BulkEditDialog({
  open, onOpenChange, selectedIds, contacts, categories, banks, onSuccess
}: BulkEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [field, setField] = useState<FieldOption | ''>('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  const resetState = () => {
    setField('');
    setNewValue('');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!field || !newValue) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('transactions')
        .update({ [field]: newValue })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ title: `${selectedIds.length} transação(ões) atualizada(s) com sucesso!` });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      handleOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar transações', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const activeContacts = contacts.filter(c => c.is_active);
  const activeBanks = banks.filter(b => b.is_active);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {selectedIds.length} transação(ões)</DialogTitle>
          <DialogDescription>Selecione o campo e o novo valor para aplicar em lote.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Qual campo deseja alterar?</Label>
            <Select value={field || 'placeholder'} onValueChange={(v) => { setField(v as FieldOption); setNewValue(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o campo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder" disabled>Selecione o campo</SelectItem>
                <SelectItem value="contact_id">Cliente / Fornecedor</SelectItem>
                <SelectItem value="category_id">Evento Contábil</SelectItem>
                <SelectItem value="bank_id">Conta / Banco</SelectItem>
                <SelectItem value="due_date">Data de Vencimento</SelectItem>
                <SelectItem value="expected_date">Data Prevista</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {field === 'contact_id' && (
            <div className="space-y-2">
              <Label>Novo Cliente / Fornecedor</Label>
              <Select value={newValue || 'placeholder'} onValueChange={setNewValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Selecione o cliente</SelectItem>
                  {activeContacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {field === 'category_id' && (
            <div className="space-y-2">
              <Label>Novo Evento Contábil</Label>
              <Select value={newValue || 'placeholder'} onValueChange={setNewValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Selecione o evento</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {field === 'bank_id' && (
            <div className="space-y-2">
              <Label>Nova Conta / Banco</Label>
              <Select value={newValue || 'placeholder'} onValueChange={setNewValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o banco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Selecione o banco</SelectItem>
                  {activeBanks.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(field === 'due_date' || field === 'expected_date') && (
            <div className="space-y-2">
              <Label>{field === 'due_date' ? 'Nova Data de Vencimento' : 'Nova Data Prevista'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !newValue && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newValue ? format(new Date(`${newValue}T00:00:00`), 'dd/MM/yyyy') : 'Selecione a data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newValue ? new Date(`${newValue}T00:00:00`) : undefined}
                    onSelect={(d) => d && setNewValue(toISO(d))}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!field || !newValue || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
