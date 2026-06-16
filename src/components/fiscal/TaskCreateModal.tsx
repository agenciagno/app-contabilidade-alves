import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: { id: string; name: string; responsible_id?: string | null }[];
  profiles: { id: string; full_name: string | null }[];
  onSubmit: (data: {
    contact_id: string;
    responsible_id: string | null;
    title: string;
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

  const handleContactChange = (id: string) => {
    setContactId(id);
    const contact = contacts.find(c => c.id === id);
    if (contact?.responsible_id) {
      setResponsibleId(contact.responsible_id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      contact_id: contactId,
      responsible_id: responsibleId || null,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate,
    });
    setContactId('');
    setResponsibleId('');
    setTitle('');
    setDescription('');
    setDueDate('');
    onOpenChange(false);
  };

  const isValid = contactId && title.trim() && dueDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tarefa Fiscal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Obrigação <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: DCTF, ECD, ECF..." />
          </div>

          <div>
            <Label>Responsável</Label>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!isValid || isLoading}>{isLoading ? 'Salvando...' : 'Criar Tarefa'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
