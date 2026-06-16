import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactPartner, ContactPartnerInsert } from '@/hooks/useContactPartners';
import { maskCPF } from '@/lib/utils';

interface PartnerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: ContactPartner;
  contactId: string;
  onSubmit: (data: ContactPartnerInsert) => void;
  isLoading?: boolean;
}

export function PartnerFormDialog({
  open,
  onOpenChange,
  partner,
  contactId,
  onSubmit,
  isLoading,
}: PartnerFormDialogProps) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [participation, setParticipation] = useState('');

  useEffect(() => {
    if (partner) {
      setName(partner.name);
      setCpf(partner.cpf || '');
      setEmail(partner.email || '');
      setParticipation(partner.participation_percentage?.toString() || '');
    } else {
      setName('');
      setCpf('');
      setEmail('');
      setParticipation('');
    }
  }, [partner, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      contact_id: contactId,
      name: name.trim(),
      cpf: cpf.trim() || null,
      email: email.trim() || null,
      participation_percentage: parseFloat(participation) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{partner ? 'Editar Sócio' : 'Adicionar Sócio'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="partner-name">Nome <span className="text-destructive">*</span></Label>
              <Input
                id="partner-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do sócio"
                required
              />
            </div>

            <div>
              <Label htmlFor="partner-cpf">CPF</Label>
              <Input
                id="partner-cpf"
                value={cpf}
                onChange={(e) => setCpf(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>

            <div>
              <Label htmlFor="partner-participation">% Participação</Label>
              <Input
                id="partner-participation"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={participation}
                onChange={(e) => setParticipation(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="partner-email">E-mail</Label>
              <Input
                id="partner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
