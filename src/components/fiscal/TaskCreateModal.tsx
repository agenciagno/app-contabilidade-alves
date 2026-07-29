import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

interface TaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: { id: string; name: string; responsible_id?: string | null }[];
  profiles: { id: string; full_name: string | null }[];
  onSubmit: (data: {
    contact_id: string | null;
    responsible_id: string | null;
    titles: string[];
    description: string | null;
    due_date: string;
  }) => void;
  isLoading?: boolean;
}

export function TaskCreateModal({ open, onOpenChange, contacts, profiles, onSubmit, isLoading }: TaskCreateModalProps) {
  const [contactId, setContactId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [checklistItems, setChecklistItems] = useState<string[]>([]);

  const handleContactChange = (id: string) => {
    setContactId(id);
    const contact = contacts.find(c => c.id === id);
    if (contact?.responsible_id) {
      setResponsibleId(contact.responsible_id);
    }
  };

  const addChecklistItem = () => setChecklistItems((prev) => [...prev, '']);
  const updateChecklistItem = (idx: number, value: string) =>
    setChecklistItems((prev) => prev.map((v, i) => (i === idx ? value : v)));
  const removeChecklistItem = (idx: number) =>
    setChecklistItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extraTitles = checklistItems.map((t) => t.trim()).filter(Boolean);
    onSubmit({
      contact_id: contactId || null,
      responsible_id: responsibleId || null,
      titles: [title.trim(), ...extraTitles],
      description: description.trim() || null,
      due_date: dueDate,
    });
    setContactId('');
    setResponsibleId('');
    setTitle('');
    setDescription('');
    setDueDate('');
    setChecklistItems([]);
    onOpenChange(false);
  };

  const isValid = title.trim() && dueDate && responsibleId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Cliente</Label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente (opcional)" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tarefa <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: DCTF, ECD, ECF..." />
          </div>

          <div>
            <Label>Responsável <span className="text-destructive">*</span></Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Data de Vencimento <span className="text-destructive">*</span></Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Descrição opcional" />
          </div>

          <div>
            <Label>Checklist (opcional)</Label>
            <div className="space-y-2 mt-1">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={e => updateChecklistItem(idx, e.target.value)}
                    placeholder={`Item do checklist`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeChecklistItem(idx)}
                    aria-label="Remover item"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addChecklistItem}>
                <Plus className="w-3.5 h-3.5" /> Adicionar item ao checklist
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!isValid || isLoading}>{isLoading ? 'Salvando...' : 'Criar Tarefa'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
