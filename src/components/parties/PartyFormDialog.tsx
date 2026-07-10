import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { maskCPFCNPJ } from '@/lib/utils';
import type { Party, PartyInput, PartyTipo } from '@/hooks/useParties';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: PartyInput) => void;
  isLoading?: boolean;
  initial?: Party | null;
}

const emptyState: PartyInput = {
  tipo: 'cliente',
  nome: '',
  documento: '',
  email: '',
  telefone: '',
  observacoes: '',
};

export function PartyFormDialog({ open, onOpenChange, onSubmit, isLoading, initial }: Props) {
  const [form, setForm] = useState<PartyInput>(emptyState);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              tipo: (initial.tipo as PartyTipo) ?? 'cliente',
              nome: initial.nome ?? '',
              documento: initial.documento ?? '',
              email: initial.email ?? '',
              telefone: initial.telefone ?? '',
              observacoes: initial.observacoes ?? '',
            }
          : emptyState,
      );
    }
  }, [open, initial]);

  const set = <K extends keyof PartyInput>(k: K, v: PartyInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleLookup = async () => {
    const digits = (form.documento ?? '').replace(/\D/g, '');
    if (digits.length !== 14) {
      toast.error('Informe um CNPJ com 14 dígitos para busca.');
      return;
    }
    setLooking(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: digits },
      });
      if (error) throw error;
      const d = data as { razao_social?: string; nome_fantasia?: string; email?: string; phone?: string } | null;
      if (!d) throw new Error('Sem dados retornados.');
      const nome = d.nome_fantasia || d.razao_social;
      if (nome) set('nome', nome);
      if (!form.email && d.email) set('email', d.email);
      if (!form.telefone && d.phone) set('telefone', d.phone);
      toast.success('Dados preenchidos pelo CNPJ.');
    } catch (e) {
      toast.error('Não foi possível consultar o CNPJ.', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLooking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    onSubmit({
      ...form,
      nome: form.nome.trim(),
      documento: form.documento?.trim() || null,
      email: form.email?.trim() || null,
      telefone: form.telefone?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Cliente/Fornecedor' : 'Novo Cliente/Fornecedor'}</DialogTitle>
          <DialogDescription>
            Cadastro para uso em lançamentos financeiros.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v as PartyTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Documento (CPF/CNPJ)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.documento ?? ''}
                  onChange={(e) => set('documento', maskCPFCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleLookup} disabled={looking}>
                  {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {initial ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
