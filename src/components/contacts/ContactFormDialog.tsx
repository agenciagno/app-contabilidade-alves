import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Contact, ContactInsert } from '@/hooks/useContacts';
import { maskCPFCNPJ, maskPhone, unmaskPhone, getDocumentType } from '@/lib/utils';
import { Search, Loader2 } from 'lucide-react';
import { lookupCnpj, pickEmptyFields } from '@/lib/cnpj-lookup';
import { useToast } from '@/hooks/use-toast';
import { PORTE_OPTIONS } from '@/constants/porte';

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
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [complemento, setComplemento] = useState('');
  // Campos exclusivos de Pessoa Jurídica (mesmo conjunto da aba Identificação do Super Perfil)
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [porte, setPorte] = useState('');
  const [tipoEstabelecimento, setTipoEstabelecimento] = useState('');
  const [representativeLegal, setRepresentativeLegal] = useState('');
  const [naturezaJuridica, setNaturezaJuridica] = useState('');
  const [dataAberturaReceita, setDataAberturaReceita] = useState('');
  const [situacaoCadastral, setSituacaoCadastral] = useState('');

  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [addressFieldsLocked, setAddressFieldsLocked] = useState(false);
  const [cnaeExtras, setCnaeExtras] = useState<Record<string, any>>({});
  const { toast } = useToast();

  // Só assume o layout de PJ quando o CNPJ estiver completo (14 caracteres) — documento vazio ou
  // parcial mantém o formulário enxuto de hoje (Nome + contato), sem exigir Razão Social à toa.
  const documentType = getDocumentType(document);
  const showPJFields = documentType === 'CNPJ';

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setDocument(contact.document || '');
      setDisplayName(contact.display_name || '');
      setEmail(contact.email || '');
      setPhone(maskPhone(contact.phone || ''));
      setWhatsapp(maskPhone(contact.whatsapp || ''));

      setCep(contact.cep || '');
      setAddress(contact.address || '');
      setAddressNumber(contact.address_number || '');
      setComplemento(contact.complemento || '');
      setNeighborhood(contact.neighborhood || '');
      setCity(contact.city || '');
      setState(contact.state || '');

      setRazaoSocial(contact.razao_social || '');
      setNomeFantasia(contact.nome_fantasia || '');
      setPorte(contact.porte || '');
      setTipoEstabelecimento(contact.tipo_estabelecimento || '');
      setRepresentativeLegal(contact.representative_legal || '');
      setNaturezaJuridica(contact.natureza_juridica || '');
      setDataAberturaReceita(contact.data_abertura_receita || '');
      setSituacaoCadastral(contact.situacao_cadastral || '');
      setCnaeExtras({
        cnae_principal: contact.cnae_principal ?? null,
        cnaes_secundarios: contact.cnaes_secundarios ?? null,
      });
    } else {
      setName('');
      setDocument('');
      setDisplayName('');
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
      setRazaoSocial('');
      setNomeFantasia('');
      setPorte('');
      setTipoEstabelecimento('');
      setRepresentativeLegal('');
      setNaturezaJuridica('');
      setDataAberturaReceita('');
      setSituacaoCadastral('');
      setCnaeExtras({});
    }
  }, [contact, open]);

  const runCnpjLookup = async (opts: { silentIfShort?: boolean } = {}) => {
    // Mantém letras — CNPJ alfanumérico (IN RFB 2.229/2024, novas inscrições a partir de 31/07/2026)
    const cleanDoc = document.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

    if (cleanDoc.length !== 14) {
      if (opts.silentIfShort) return;
      toast({
        title: 'CNPJ inválido',
        description: 'Digite um CNPJ completo (14 caracteres) para buscar',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingCnpj(true);
    setAddressFieldsLocked(true);

    try {
      const data = await lookupCnpj(cleanDoc);

      const current = {
        razao_social: razaoSocial, nome_fantasia: nomeFantasia,
        natureza_juridica: naturezaJuridica, situacao_cadastral: situacaoCadastral,
        data_abertura_receita: dataAberturaReceita,
        email, phone, cep, address, address_number: addressNumber,
        complemento, neighborhood, city, state,
      };
      const incoming = {
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        natureza_juridica: data.natureza_juridica || '',
        situacao_cadastral: data.situacao_cadastral || '',
        data_abertura_receita: data.data_abertura_receita || '',
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

      if (fill.razao_social) setRazaoSocial(fill.razao_social);
      if (fill.nome_fantasia) setNomeFantasia(fill.nome_fantasia);
      if (fill.natureza_juridica) setNaturezaJuridica(fill.natureza_juridica);
      if (fill.situacao_cadastral) setSituacaoCadastral(fill.situacao_cadastral);
      if (fill.data_abertura_receita) setDataAberturaReceita(fill.data_abertura_receita);
      if (fill.email) setEmail(fill.email);
      if (fill.phone) setPhone(maskPhone(fill.phone));
      if (fill.cep) setCep(maskCep(fill.cep));
      if (fill.address) setAddress(fill.address);
      if (fill.address_number) setAddressNumber(fill.address_number);
      if (fill.complemento) setComplemento(fill.complemento);
      if (fill.neighborhood) setNeighborhood(fill.neighborhood);
      if (fill.city) setCity(fill.city);
      if (fill.state) setState(fill.state);

      // CNAE não aparece neste modal (só na aba Fiscal do Super Perfil) — segue no payload calado
      setCnaeExtras({
        cnae_principal: data.cnae_principal ?? null,
        cnaes_secundarios: data.cnaes_secundarios ?? null,
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

    // PJ nova: deriva o nome canônico de Nome Fantasia/Razão Social (não há campo "Nome" para PJ).
    // PJ em edição: preserva o name já existente (nada aqui o altera, evita sobrescrever à toa).
    const resolvedName = (showPJFields && !contact)
      ? (nomeFantasia.trim() || razaoSocial.trim())
      : name.trim();

    const basePayload: any = {
      name: resolvedName,
      type: contact?.type || 'cliente',
      document: document.trim() || null,
      tax_regime: null,
      email: email.trim() || null,
      phone: unmaskPhone(phone) || null,
      whatsapp: unmaskPhone(whatsapp) || null,
      display_name: displayName.trim() || null,
      cep: cep.trim() || null,
      address: address.trim() || null,
      address_number: addressNumber.trim() || null,
      complemento: complemento.trim() || null,
      neighborhood: neighborhood.trim() || null,
      city: city.trim() || null,
      state: state || null,
      is_active: true,
      ...cnaeExtras,
    };

    // Campos de PJ só entram no payload quando o formulário de PJ está em uso — assim, editar um
    // contato como PF nunca apaga dados de PJ que já existiam (a coluna simplesmente não é tocada).
    const pjPayload = showPJFields ? {
      razao_social: razaoSocial.trim() || null,
      nome_fantasia: nomeFantasia.trim() || null,
      porte: porte || null,
      tipo_estabelecimento: tipoEstabelecimento || null,
      representative_legal: representativeLegal.trim() || null,
      natureza_juridica: naturezaJuridica.trim() || null,
      data_abertura_receita: dataAberturaReceita || null,
      situacao_cadastral: situacaoCadastral || null,
    } : {};

    onSubmit({ ...basePayload, ...pjPayload } as any);
  };

  const isFormValid = showPJFields ? (razaoSocial.trim() || nomeFantasia.trim()) : name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar Cliente/Fornecedor' : 'Novo Cliente/Fornecedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Linha 1: CPF/CNPJ */}
            <div className="col-span-3">
              <Label htmlFor="document" className="flex items-center">
                CPF/CNPJ
                {documentType && (
                  <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                    {documentType === 'CPF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </Badge>
                )}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="document"
                    value={document}
                    onChange={(e) => setDocument(maskCPFCNPJ(e.target.value))}
                    onBlur={handleDocumentBlur}
                    placeholder="CNPJ ou CPF"
                    maxLength={18}
                    className={isFetchingCnpj ? 'pr-9' : ''}
                  />
                  {isFetchingCnpj && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {documentType !== 'CPF' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleFetchCnpj}
                    disabled={isFetchingCnpj || document.replace(/[^0-9A-Za-z]/g, '').length < 14}
                    title="Buscar dados do CNPJ"
                  >
                    {isFetchingCnpj ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Linha 2: Nome (PF) ou Razão Social + Nome Fantasia (PJ) */}
            {showPJFields ? (
              <>
                <div className="col-span-3 sm:col-span-2">
                  <Label htmlFor="razao-social">Razão Social <span className="text-destructive">*</span></Label>
                  <Input
                    id="razao-social"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Razão social"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Label htmlFor="nome-fantasia">Nome Fantasia</Label>
                  <Input
                    id="nome-fantasia"
                    value={nomeFantasia}
                    onChange={(e) => setNomeFantasia(e.target.value)}
                    placeholder="Nome fantasia"
                  />
                </div>
              </>
            ) : (
              <div className="col-span-3">
                <Label htmlFor="name">Nome <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do cliente ou fornecedor"
                  required
                />
              </div>
            )}

            {/* Linha 3: Nome de Exibição */}
            <div className="col-span-3">
              <Label htmlFor="display-name">Nome de Exibição</Label>
              <Input
                id="display-name"
                value={displayName || nomeFantasia}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nome exibido na listagem de contatos"
              />
            </div>

            {/* Campos exclusivos de PJ */}
            {showPJFields && (
              <>
                <div>
                  <Label htmlFor="porte">Porte</Label>
                  <Select value={porte} onValueChange={setPorte}>
                    <SelectTrigger id="porte"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {PORTE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="tipo-estabelecimento">Tipo de Estabelecimento</Label>
                  <Select value={tipoEstabelecimento} onValueChange={setTipoEstabelecimento}>
                    <SelectTrigger id="tipo-estabelecimento"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Matriz">Matriz</SelectItem>
                      <SelectItem value="Filial">Filial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label htmlFor="representative-legal">Representante Legal</Label>
                  <Input
                    id="representative-legal"
                    value={representativeLegal}
                    onChange={(e) => setRepresentativeLegal(e.target.value)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Label htmlFor="natureza-juridica">Natureza Jurídica</Label>
                  <Input
                    id="natureza-juridica"
                    value={naturezaJuridica}
                    onChange={(e) => setNaturezaJuridica(e.target.value)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label htmlFor="situacao-cadastral">Situação na Receita Federal</Label>
                  <Input id="situacao-cadastral" value={situacaoCadastral} readOnly className="bg-muted/40" />
                </div>
              </>
            )}

            {/* E-mail + Telefone + WhatsApp */}
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
                  placeholder="(XX) XXXXX-XXXX"
                  maxLength={15}
                />
              </div>
              <div>
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                  placeholder="(XX) XXXXX-XXXX"
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

            {/* Linha 4b: Número + Complemento */}
            <div className="col-span-3 grid grid-cols-2 gap-4">
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
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  disabled={addressFieldsLocked}
                />
              </div>
            </div>

            {/* Linha 4c: Bairro + Cidade + Estado */}
            <div className="col-span-3 grid grid-cols-3 gap-4">
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
