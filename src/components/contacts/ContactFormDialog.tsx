import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Contact, ContactInsert } from '@/hooks/useContacts';
import { maskCPFCNPJ, maskPhone, unmaskPhone } from '@/lib/utils';
import { Search, Loader2 } from 'lucide-react';
import { lookupCnpj, pickEmptyFields } from '@/lib/cnpj-lookup';
import { useToast } from '@/hooks/use-toast';

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
  onSubmit: (data: ContactInsert) => void;
  isLoading?: boolean;
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

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSubmit,
  isLoading,
}: ContactFormDialogProps) {
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [addressFieldsLocked, setAddressFieldsLocked] = useState(false);
  const [complemento, setComplemento] = useState('');
  const [cnpjExtras, setCnpjExtras] = useState<Record<string, any>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setDocument(contact.document || '');
      setEmail(contact.email || '');
      setPhone(maskPhone(contact.phone || ''));
      setWhatsapp(maskPhone((contact as any).whatsapp || ''));

      setCep(contact.cep || '');
      setAddress(contact.address || '');
      setAddressNumber(contact.address_number || '');
      setComplemento((contact as any).complemento || '');
      setNeighborhood(contact.neighborhood || '');
      setCity(contact.city || '');
      setState(contact.state || '');
      setNotes(contact.notes || '');
    } else {
      setName('');
      setDocument('');
      setEmail('');
      setPhone('');
      setWhatsapp('');
      setCep('');
      setAddress('');
      setAddressNumber('');
      setComplemento('');
      setNeighborhood('');
      setCity('');
      setState('');
      setNotes('');
    }
    setCnpjExtras({});
  }, [contact, open]);

  const runCnpjLookup = async (opts: { silentIfShort?: boolean } = {}) => {
    const cleanDoc = document.replace(/\D/g, '');

    if (cleanDoc.length !== 14) {
      if (opts.silentIfShort) return;
      toast({
        title: 'CNPJ inválido',
        description: 'Digite um CNPJ completo (14 dígitos) para buscar',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingCnpj(true);
    setAddressFieldsLocked(true);

    try {
      const data = await lookupCnpj(cleanDoc);

      const current = {
        name, email, phone, cep, address, address_number: addressNumber,
        complemento, neighborhood, city, state,
      };
      const incoming = {
        name: data.nome_fantasia || data.razao_social || '',
        email: data.email || '',
        phone: data.phone || '',
        cep: data.cep || '',
        address: data.address || '',
        address_number: data.address_number || '',
        complemento: data.complemento || '',
        neighborhood: data.neighborhood || '',
        city: data.city || '',
        state: data.state || '',
      };
      const fill = pickEmptyFields(incoming, current);

      if (fill.name) setName(fill.name);
      if (fill.email) setEmail(fill.email);
      if (fill.phone) setPhone(maskPhone(fill.phone));
      if (fill.cep) setCep(maskCep(fill.cep));
      if (fill.address) setAddress(fill.address);
      if (fill.address_number) setAddressNumber(fill.address_number);
      if (fill.complemento) setComplemento(fill.complemento);
      if (fill.neighborhood) setNeighborhood(fill.neighborhood);
      if (fill.city) setCity(fill.city);
      if (fill.state) setState(fill.state);

      // Structured fields not bound to inputs — keep them for the submit payload
      setCnpjExtras({
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia,
        cnae_principal: data.cnae_principal,
        cnaes_secundarios: data.cnaes_secundarios,
        natureza_juridica: data.natureza_juridica,
        situacao_cadastral: data.situacao_cadastral,
        data_abertura_receita: data.data_abertura_receita,
      });

      toast({
        title: 'Dados preenchidos automaticamente',
        description: 'Confira as informações e complete os campos restantes.',
      });
    } catch (error) {
      toast({
        title: 'CNPJ não encontrado',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingCnpj(false);
      setAddressFieldsLocked(false);
    }
  };

  const handleFetchCnpj = () => runCnpjLookup();
  const handleDocumentBlur = () => runCnpjLookup({ silentIfShort: true });



  const handleFetchCep = async () => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) return;

    setIsLoadingCep(true);

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);

      if (!response.ok) {
        throw new Error('CEP não encontrado');
      }

      const data = await response.json();

      setAddress(data.street || '');
      setNeighborhood(data.neighborhood || '');
      setCity(data.city || '');
      setState(data.state || '');

      setTimeout(() => {
        window.document.getElementById('address-number')?.focus();
      }, 50);
    } catch {
      toast({
        title: 'CEP não encontrado',
        description: 'Não conseguimos localizar este CEP. Por favor, preencha o endereço manualmente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      type: contact?.type || 'cliente',
      document: document.trim() || null,
      tax_regime: null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      cep: cep.trim() || null,
      address: address.trim() || null,
      address_number: addressNumber.trim() || null,
      complemento: complemento.trim() || null,
      neighborhood: neighborhood.trim() || null,
      city: city.trim() || null,
      state: state || null,
      notes: notes.trim() || null,
      is_active: true,
      representative_legal: null,
      ...cnpjExtras,
    } as any);
  };

  const isFormValid = name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar Cliente/Fornecedor' : 'Novo Cliente/Fornecedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Linha 1: CPF/CNPJ */}
            <div className="col-span-3">
              <Label htmlFor="document">CPF/CNPJ</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="document"
                    value={document}
                    onChange={(e) => setDocument(maskCPFCNPJ(e.target.value))}
                    onBlur={handleDocumentBlur}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className={isFetchingCnpj ? 'pr-9' : ''}
                  />
                  {isFetchingCnpj && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleFetchCnpj}
                  disabled={isFetchingCnpj || document.replace(/\D/g, '').length < 14}
                  title="Buscar dados do CNPJ"
                >
                  {isFetchingCnpj ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Linha 2: Nome */}
            <div className="col-span-3">
              <Label htmlFor="name">Nome do Cliente/Fornecedor <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do cliente ou fornecedor"
                required
              />
            </div>

            {/* Linha 3: E-mail + Telefone + WhatsApp */}
            <div className="col-span-3 grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
              <div>
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
            </div>

            {/* Linha 4a: CEP + Logradouro */}
            <div className="col-span-3 grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="cep">CEP</Label>
                <div className="relative">
                  <Input
                    id="cep"
                    value={cep}
                    onChange={(e) => setCep(maskCep(e.target.value))}
                    onBlur={handleFetchCep}
                    placeholder="00000-000"
                    maxLength={9}
                    className={isLoadingCep ? 'pr-9' : ''}
                  />
                  {isLoadingCep && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <Label htmlFor="address">Logradouro</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, Av., Alameda..."
                  disabled={addressFieldsLocked}
                />
              </div>
            </div>

            {/* Linha 4b: Número + Bairro + Cidade + Estado */}
            <div className="col-span-3 grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="address-number">Número</Label>
                <Input
                  id="address-number"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  placeholder="Nº"
                  disabled={addressFieldsLocked}
                />
              </div>
              <div>
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Bairro"
                  disabled={addressFieldsLocked}
                />
              </div>
              <div>
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Cidade"
                  disabled={addressFieldsLocked}
                />
              </div>
              <div>
                <Label htmlFor="state">Estado</Label>
                <Select value={state} onValueChange={setState} disabled={addressFieldsLocked}>
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 5: Observações */}
            <div className="col-span-3">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações adicionais"
                rows={1}
                className="min-h-[40px] resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !isFormValid}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
