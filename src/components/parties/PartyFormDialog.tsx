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
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { maskCPFCNPJ, maskPhone, getDocumentType } from '@/lib/utils';
import { pickEmptyFields } from '@/lib/cnpj-lookup';
import type { Party, PartyInput, PartyTipo } from '@/hooks/useParties';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: PartyInput) => void;
  isLoading?: boolean;
  initial?: Party | null;
}

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function maskCep(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{5})(\d)/, '$1-$2')
    .slice(0, 9);
}

const emptyState: PartyInput = {
  tipo: 'cliente',
  nome: '',
  display_name: '',
  documento: '',
  email: '',
  telefone: '',
  whatsapp: '',
  cep: '',
  address: '',
  address_number: '',
  complemento: '',
  neighborhood: '',
  city: '',
  state: '',
  observacoes: '',
};

export function PartyFormDialog({ open, onOpenChange, onSubmit, isLoading, initial }: Props) {
  const [form, setForm] = useState<PartyInput>(emptyState);
  const [looking, setLooking] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              tipo: (initial.tipo as PartyTipo) ?? 'cliente',
              nome: initial.nome ?? '',
              display_name: initial.display_name ?? '',
              documento: initial.documento ?? '',
              email: initial.email ?? '',
              telefone: initial.telefone ?? '',
              whatsapp: initial.whatsapp ?? '',
              cep: initial.cep ?? '',
              address: initial.address ?? '',
              address_number: initial.address_number ?? '',
              complemento: initial.complemento ?? '',
              neighborhood: initial.neighborhood ?? '',
              city: initial.city ?? '',
              state: initial.state ?? '',
              observacoes: initial.observacoes ?? '',
            }
          : emptyState,
      );
    }
  }, [open, initial]);

  const set = <K extends keyof PartyInput>(k: K, v: PartyInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const documentType = getDocumentType(form.documento);

  const handleLookup = async () => {
    // Mantém letras — CNPJ alfanumérico (IN RFB 2.229/2024, novas inscrições a partir de 31/07/2026)
    const clean = (form.documento ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (clean.length !== 14) {
      toast.error('Informe um CNPJ completo (14 caracteres) para busca.');
      return;
    }
    setLooking(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: clean },
      });
      if (error) throw error;
      const d = data as {
        razao_social?: string; nome_fantasia?: string; email?: string; phone?: string;
        cep?: string; address?: string; address_number?: string; complemento?: string;
        neighborhood?: string; city?: string; state?: string;
      } | null;
      if (!d) throw new Error('Sem dados retornados.');

      const nome = d.nome_fantasia || d.razao_social;
      if (nome) set('nome', nome);

      const current = {
        email: form.email ?? '', telefone: form.telefone ?? '',
        cep: form.cep ?? '', address: form.address ?? '', address_number: form.address_number ?? '',
        complemento: form.complemento ?? '', neighborhood: form.neighborhood ?? '',
        city: form.city ?? '', state: form.state ?? '',
      };
      const incoming = {
        email: d.email || '', telefone: d.phone || '',
        cep: d.cep || '', address: d.address || '', address_number: d.address_number || '',
        complemento: d.complemento || '', neighborhood: d.neighborhood || '',
        city: d.city || '', state: d.state || '',
      };
      const fill = pickEmptyFields(incoming, current);

      if (fill.email) set('email', fill.email);
      if (fill.telefone) set('telefone', fill.telefone);
      if (fill.cep) set('cep', maskCep(fill.cep));
      if (fill.address) set('address', fill.address);
      if (fill.address_number) set('address_number', fill.address_number);
      if (fill.complemento) set('complemento', fill.complemento);
      if (fill.neighborhood) set('neighborhood', fill.neighborhood);
      if (fill.city) set('city', fill.city);
      if (fill.state) set('state', fill.state);

      toast.success('Dados preenchidos pelo CNPJ.');
    } catch (e) {
      toast.error('Não foi possível consultar o CNPJ.', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLooking(false);
    }
  };

  const handleCepBlur = async () => {
    const clean = (form.cep ?? '').replace(/\D/g, '');
    if (clean.length !== 8) return;
    setLoadingCep(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`);
      if (!response.ok) throw new Error('CEP não encontrado');
      const data = await response.json();
      set('address', data.street || form.address);
      set('neighborhood', data.neighborhood || form.neighborhood);
      set('city', data.city || form.city);
      set('state', data.state || form.state);
    } catch {
      /* silencioso — usuário completa manualmente */
    } finally {
      setLoadingCep(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error(documentType === 'CNPJ' ? 'Informe a razão social.' : 'Informe o nome.');
      return;
    }
    onSubmit({
      ...form,
      nome: form.nome.trim(),
      display_name: form.display_name?.trim() || null,
      documento: form.documento?.trim() || null,
      email: form.email?.trim() || null,
      telefone: form.telefone?.trim() || null,
      whatsapp: form.whatsapp?.trim() || null,
      cep: form.cep?.trim() || null,
      address: form.address?.trim() || null,
      address_number: form.address_number?.trim() || null,
      complemento: form.complemento?.trim() || null,
      neighborhood: form.neighborhood?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Label className="flex items-center">
                Documento (CPF/CNPJ)
                {documentType && (
                  <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                    {documentType === 'CPF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </Badge>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={form.documento ?? ''}
                  onChange={(e) => set('documento', maskCPFCNPJ(e.target.value))}
                  placeholder="CNPJ ou CPF"
                />
                {documentType !== 'CPF' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleLookup}
                    disabled={looking || (form.documento ?? '').replace(/[^0-9A-Za-z]/g, '').length < 14}
                    title="Buscar dados do CNPJ"
                  >
                    {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{documentType === 'CNPJ' ? 'Razão Social' : 'Nome'} *</Label>
              <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nome de Exibição</Label>
              <Input
                value={form.display_name ?? ''}
                onChange={(e) => set('display_name', e.target.value)}
                placeholder="Nome exibido na listagem"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone ?? ''} onChange={(e) => set('telefone', maskPhone(e.target.value))} maxLength={15} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} maxLength={15} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <div className="relative">
                <Input
                  value={form.cep ?? ''}
                  onChange={(e) => set('cep', maskCep(e.target.value))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  maxLength={9}
                  className={loadingCep ? 'pr-9' : ''}
                />
                {loadingCep && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Logradouro</Label>
              <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Rua, Av., Alameda..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.address_number ?? ''} onChange={(e) => set('address_number', e.target.value)} placeholder="Nº" />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.state ?? ''} onValueChange={(v) => set('state', v)}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
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
