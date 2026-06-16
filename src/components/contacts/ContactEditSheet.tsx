import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Contact, TaxRegime, useContacts } from '@/hooks/useContacts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { ContactObligationsSelector } from '@/components/fiscal/ContactObligationsSelector';
import { lookupCnpj, pickEmptyFields } from '@/lib/cnpj-lookup';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Section = 'contato' | 'endereco' | 'fiscal' | 'empresariais' | 'datas-esfera' | 'departamento-pessoal' | 'observacoes' | 'cobranca';

interface ContactEditSheetProps {
  contact: Contact;
  section: Section;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sectionTitles: Record<Section, string> = {
  contato: 'Editar Informações de Contato',
  endereco: 'Editar Endereço',
  fiscal: 'Editar Dados Fiscais',
  empresariais: 'Editar Dados Empresariais',
  'datas-esfera': 'Editar Datas por Esfera',
  'departamento-pessoal': 'Editar Departamento Pessoal',
  observacoes: 'Editar Observações',
  cobranca: 'Editar Configurações de Cobrança',
};

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function ContactEditSheet({ contact, section, open, onOpenChange }: ContactEditSheetProps) {
  const { updateContact } = useContacts();
  const { company } = useCompany();

  // Contato fields
  const [email, setEmail] = useState(contact.email || '');
  const [phone, setPhone] = useState(contact.phone || '');
  const [document, setDocument] = useState(contact.document || '');
  const [representativeLegal, setRepresentativeLegal] = useState(contact.representative_legal || '');

  // Endereço fields
  const [cep, setCep] = useState(contact.cep || '');
  const [address, setAddress] = useState(contact.address || '');
  const [addressNumber, setAddressNumber] = useState(contact.address_number || '');
  const [neighborhood, setNeighborhood] = useState(contact.neighborhood || '');
  const [city, setCity] = useState(contact.city || '');
  const [state, setState] = useState(contact.state || '');
  const [loadingCep, setLoadingCep] = useState(false);

  // Fiscal fields
  const [taxRegime, setTaxRegime] = useState<TaxRegime | ''>(contact.tax_regime || '');
  const [isActive, setIsActive] = useState(contact.is_active);
  const [responsibleId, setResponsibleId] = useState<string>(contact.responsible_id || 'none');
  const [selectedObligations, setSelectedObligations] = useState<Set<string>>(new Set());
  const [obligationsInitialized, setObligationsInitialized] = useState(false);

  // Observações fields
  const [notes, setNotes] = useState(contact.notes || '');

  // Cobrança fields
  const [boletoValue, setBoletoValue] = useState<string>(
    contact.boleto_value != null ? String(contact.boleto_value) : ''
  );
  const [boletoDueDay, setBoletoDueDay] = useState<string>(
    contact.boleto_due_day != null ? String(contact.boleto_due_day) : 'none'
  );
  const [canalEntrega, setCanalEntrega] = useState<string>(contact.canal_entrega || 'none');
  const [numeroSicoob, setNumeroSicoob] = useState<string>(
    contact.numero_cliente_sicoob != null ? String(contact.numero_cliente_sicoob) : ''
  );

  // Dados Empresariais
  const [razaoSocial, setRazaoSocial] = useState(contact.razao_social || '');
  const [nomeFantasia, setNomeFantasia] = useState(contact.nome_fantasia || '');
  const [naturezaJuridica, setNaturezaJuridica] = useState(contact.natureza_juridica || '');
  const [situacaoCadastral, setSituacaoCadastral] = useState(contact.situacao_cadastral || 'none');
  const [tipoEstabelecimento, setTipoEstabelecimento] = useState(contact.tipo_estabelecimento || 'none');
  const [statusCliente, setStatusCliente] = useState(contact.status_cliente || 'none');
  const [tipoCliente, setTipoCliente] = useState(contact.tipo_cliente || 'none');
  const [grupoEscritorio, setGrupoEscritorio] = useState(contact.grupo_escritorio || '');
  const [dataInicioContrato, setDataInicioContrato] = useState((contact.data_inicio_contrato || '').slice(0, 10));
  const [segundoEmailContato, setSegundoEmailContato] = useState(contact.segundo_email_contato || '');
  const [complemento, setComplemento] = useState(contact.complemento || '');
  const [categorias, setCategorias] = useState<string[]>(Array.isArray(contact.categorias) ? contact.categorias : []);

  // Datas por Esfera
  const [dataAberturaJunta, setDataAberturaJunta] = useState((contact.data_abertura_junta || '').slice(0, 10));
  const [dataEncerramentoJunta, setDataEncerramentoJunta] = useState((contact.data_encerramento_junta || '').slice(0, 10));
  const [dataAberturaRf, setDataAberturaRf] = useState((contact.data_abertura_rf || '').slice(0, 10));
  const [dataEncerramentoRf, setDataEncerramentoRf] = useState((contact.data_encerramento_rf || '').slice(0, 10));
  const [dataAberturaPrefeitura, setDataAberturaPrefeitura] = useState((contact.data_abertura_prefeitura || '').slice(0, 10));
  const [dataEncerramentoPrefeitura, setDataEncerramentoPrefeitura] = useState((contact.data_encerramento_prefeitura || '').slice(0, 10));
  const [dataAberturaEstado, setDataAberturaEstado] = useState((contact.data_abertura_estado || '').slice(0, 10));
  const [dataEncerramentoEstado, setDataEncerramentoEstado] = useState((contact.data_encerramento_estado || '').slice(0, 10));

  // Departamento Pessoal
  const [possuiFuncionarios, setPossuiFuncionarios] = useState(!!contact.possui_funcionarios);
  const [numeroFuncionarios, setNumeroFuncionarios] = useState<string>(
    contact.numero_funcionarios != null ? String(contact.numero_funcionarios) : ''
  );
  const [tipoCartaoPonto, setTipoCartaoPonto] = useState(contact.tipo_cartao_ponto || 'none');
  const [medicinaTrabalho, setMedicinaTrabalho] = useState(!!contact.medicina_trabalho);
  const [grupoCipa, setGrupoCipa] = useState(contact.grupo_cipa || '');
  const [registroEntradas, setRegistroEntradas] = useState(!!contact.registro_entradas);
  const [registroSaidas, setRegistroSaidas] = useState(!!contact.registro_saidas);
  const [registroIcms, setRegistroIcms] = useState(!!contact.registro_icms);
  const [inventario, setInventario] = useState(!!contact.inventario);
  const [ie, setIe] = useState(contact.ie || '');
  const [im, setIm] = useState(contact.im || '');
  const [regimeApuracao, setRegimeApuracao] = useState(contact.regime_apuracao || 'none');
  const [numeroAlvara, setNumeroAlvara] = useState(contact.numero_alvara || '');
  const [validadeAlvara, setValidadeAlvara] = useState((contact.validade_alvara || '').slice(0, 10));

  const { data: profiles } = useQuery({
    queryKey: ['profiles-active-for-contact-edit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('status_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: section === 'fiscal',
  });

  const { data: obligationsCatalog = [] } = useQuery({
    queryKey: ['fiscal-obligations-catalog'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_obligations_catalog')
        .select('id, name, is_custom')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_custom?: boolean }[];
    },
    enabled: section === 'fiscal',
  });

  const { data: contactObligations = [] } = useQuery({
    queryKey: ['client-obligations', contact.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_obligations')
        .select('obligation_id')
        .eq('contact_id', contact.id);
      if (error) throw error;
      return (data ?? []) as { obligation_id: string }[];
    },
    enabled: section === 'fiscal',
  });


  // Reset when contact or section changes
  useEffect(() => {
    setEmail(contact.email || '');
    setPhone(contact.phone || '');
    setDocument(contact.document || '');
    setRepresentativeLegal(contact.representative_legal || '');
    setCep(contact.cep || '');
    setAddress(contact.address || '');
    setAddressNumber(contact.address_number || '');
    setNeighborhood(contact.neighborhood || '');
    setCity(contact.city || '');
    setState(contact.state || '');
    setTaxRegime(contact.tax_regime || '');
    setIsActive(contact.is_active);
    setResponsibleId(contact.responsible_id || 'none');
    setNotes(contact.notes || '');
    setBoletoValue(contact.boleto_value != null ? String(contact.boleto_value) : '');
    setBoletoDueDay(contact.boleto_due_day != null ? String(contact.boleto_due_day) : 'none');
    setCanalEntrega(contact.canal_entrega || 'none');
    setNumeroSicoob(contact.numero_cliente_sicoob != null ? String(contact.numero_cliente_sicoob) : '');
    setRazaoSocial(contact.razao_social || '');
    setNomeFantasia(contact.nome_fantasia || '');
    setNaturezaJuridica(contact.natureza_juridica || '');
    setSituacaoCadastral(contact.situacao_cadastral || 'none');
    setTipoEstabelecimento(contact.tipo_estabelecimento || 'none');
    setStatusCliente(contact.status_cliente || 'none');
    setTipoCliente(contact.tipo_cliente || 'none');
    setGrupoEscritorio(contact.grupo_escritorio || '');
    setDataInicioContrato((contact.data_inicio_contrato || '').slice(0, 10));
    setSegundoEmailContato(contact.segundo_email_contato || '');
    setComplemento(contact.complemento || '');
    setCategorias(Array.isArray(contact.categorias) ? contact.categorias : []);
    setDataAberturaJunta((contact.data_abertura_junta || '').slice(0, 10));
    setDataEncerramentoJunta((contact.data_encerramento_junta || '').slice(0, 10));
    setDataAberturaRf((contact.data_abertura_rf || '').slice(0, 10));
    setDataEncerramentoRf((contact.data_encerramento_rf || '').slice(0, 10));
    setDataAberturaPrefeitura((contact.data_abertura_prefeitura || '').slice(0, 10));
    setDataEncerramentoPrefeitura((contact.data_encerramento_prefeitura || '').slice(0, 10));
    setDataAberturaEstado((contact.data_abertura_estado || '').slice(0, 10));
    setDataEncerramentoEstado((contact.data_encerramento_estado || '').slice(0, 10));
    setPossuiFuncionarios(!!contact.possui_funcionarios);
    setNumeroFuncionarios(contact.numero_funcionarios != null ? String(contact.numero_funcionarios) : '');
    setTipoCartaoPonto(contact.tipo_cartao_ponto || 'none');
    setMedicinaTrabalho(!!contact.medicina_trabalho);
    setGrupoCipa(contact.grupo_cipa || '');
    setRegistroEntradas(!!contact.registro_entradas);
    setRegistroSaidas(!!contact.registro_saidas);
    setRegistroIcms(!!contact.registro_icms);
    setInventario(!!contact.inventario);
    setIe(contact.ie || '');
    setIm(contact.im || '');
    setRegimeApuracao(contact.regime_apuracao || 'none');
    setNumeroAlvara(contact.numero_alvara || '');
    setValidadeAlvara((contact.validade_alvara || '').slice(0, 10));
    setObligationsInitialized(false);
  }, [contact, section]);

  // Initialize selected obligations once the query resolves
  useEffect(() => {
    if (section === 'fiscal' && !obligationsInitialized) {
      setSelectedObligations(new Set(contactObligations.map((o) => o.obligation_id)));
      setObligationsInitialized(true);
    }
  }, [section, contactObligations, obligationsInitialized]);

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress(data.logradouro || address);
        setNeighborhood(data.bairro || neighborhood);
        setCity(data.localidade || city);
        setState(data.uf || state);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingCep(false);
    }
  };

  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const handleDocumentBlur = async () => {
    const digits = document.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setLoadingCnpj(true);
    try {
      const data = await lookupCnpj(digits);

      // Editable fields in this section: only email/phone are visible here.
      // Fill any empty visible fields from this section first.
      if (!email && data.email) setEmail(data.email);
      if (!phone && data.phone) setPhone(data.phone);

      // Persist other empty server-side fields directly (not displayed in this section)
      const candidate = {
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia,
        address: data.address,
        address_number: data.address_number,
        complemento: data.complemento,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        cep: data.cep,
        cnae_principal: data.cnae_principal,
        cnaes_secundarios: data.cnaes_secundarios,
        natureza_juridica: data.natureza_juridica,
        situacao_cadastral: data.situacao_cadastral,
        data_abertura_receita: data.data_abertura_receita,
      };
      const toPersist = pickEmptyFields(candidate, contact as any);
      if (Object.keys(toPersist).length > 0) {
        await updateContact.mutateAsync({ id: contact.id, ...toPersist } as any);
      }

      toast.success('Dados preenchidos automaticamente');
    } catch (e) {
      toast.error('CNPJ não encontrado', { description: (e as Error).message });
    } finally {
      setLoadingCnpj(false);
    }
  };


  const syncObligations = async () => {
    if (!company?.id) return;
    const original = new Set(contactObligations.map((o) => o.obligation_id));
    const toDelete: string[] = [];
    const toInsert: string[] = [];
    original.forEach((id) => { if (!selectedObligations.has(id)) toDelete.push(id); });
    selectedObligations.forEach((id) => { if (!original.has(id)) toInsert.push(id); });

    if (toDelete.length > 0) {
      const { error } = await (supabase as any)
        .from('client_obligations')
        .delete()
        .eq('contact_id', contact.id)
        .in('obligation_id', toDelete);
      if (error) throw error;
    }
    if (toInsert.length > 0) {
      const { error } = await (supabase as any)
        .from('client_obligations')
        .insert(toInsert.map((obligation_id) => ({
          contact_id: contact.id,
          obligation_id,
          company_id: company.id,
        })));
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    let updates: Partial<Contact> = {};

    if (section === 'contato') {
      updates = { email: email || null, phone: phone || null, document: document || null, representative_legal: representativeLegal || null };
    } else if (section === 'endereco') {
      updates = { cep: cep || null, address: address || null, address_number: addressNumber || null, neighborhood: neighborhood || null, city: city || null, state: state || null };
    } else if (section === 'fiscal') {
      updates = { tax_regime: (taxRegime as TaxRegime) || null, is_active: isActive, responsible_id: responsibleId === 'none' ? null : responsibleId };
    } else if (section === 'observacoes') {
      updates = { notes: notes || null };
    } else if (section === 'cobranca') {
      const parsedValue = boletoValue.trim() === '' ? null : Number(boletoValue.replace(',', '.'));
      const parsedSicoob = numeroSicoob.trim() === '' ? null : parseInt(numeroSicoob, 10);
      updates = {
        boleto_value: parsedValue !== null && !isNaN(parsedValue) ? parsedValue : null,
        boleto_due_day: boletoDueDay === 'none' ? null : parseInt(boletoDueDay, 10),
        canal_entrega: canalEntrega === 'none' ? null : (canalEntrega as 'whatsapp' | 'email' | 'impresso' | 'whatsapp_email'),
        numero_cliente_sicoob: parsedSicoob !== null && !isNaN(parsedSicoob) ? parsedSicoob : null,
      };
    } else if (section === 'empresariais') {
      updates = {
        razao_social: razaoSocial || null,
        nome_fantasia: nomeFantasia || null,
        natureza_juridica: naturezaJuridica || null,
        situacao_cadastral: situacaoCadastral === 'none' ? null : situacaoCadastral,
        tipo_estabelecimento: tipoEstabelecimento === 'none' ? null : tipoEstabelecimento,
        status_cliente: statusCliente === 'none' ? null : statusCliente,
        tipo_cliente: tipoCliente === 'none' ? null : tipoCliente,
        grupo_escritorio: grupoEscritorio || null,
        data_inicio_contrato: dataInicioContrato || null,
        segundo_email_contato: segundoEmailContato || null,
        complemento: complemento || null,
        categorias: categorias,
      };
    } else if (section === 'datas-esfera') {
      updates = {
        data_abertura_junta: dataAberturaJunta || null,
        data_encerramento_junta: dataEncerramentoJunta || null,
        data_abertura_rf: dataAberturaRf || null,
        data_encerramento_rf: dataEncerramentoRf || null,
        data_abertura_prefeitura: dataAberturaPrefeitura || null,
        data_encerramento_prefeitura: dataEncerramentoPrefeitura || null,
        data_abertura_estado: dataAberturaEstado || null,
        data_encerramento_estado: dataEncerramentoEstado || null,
      };
    } else if (section === 'departamento-pessoal') {
      const parsedNumFunc = numeroFuncionarios.trim() === '' ? null : parseInt(numeroFuncionarios, 10);
      updates = {
        possui_funcionarios: possuiFuncionarios,
        numero_funcionarios: possuiFuncionarios && parsedNumFunc !== null && !isNaN(parsedNumFunc) ? parsedNumFunc : null,
        tipo_cartao_ponto: tipoCartaoPonto === 'none' ? null : tipoCartaoPonto,
        medicina_trabalho: medicinaTrabalho,
        grupo_cipa: grupoCipa || null,
        registro_entradas: registroEntradas,
        registro_saidas: registroSaidas,
        registro_icms: registroIcms,
        inventario: inventario,
        ie: ie || null,
        im: im || null,
        regime_apuracao: regimeApuracao === 'none' ? null : regimeApuracao,
        numero_alvara: numeroAlvara || null,
        validade_alvara: validadeAlvara || null,
      };
    }

    updateContact.mutate(
      { id: contact.id, originalContact: contact, ...updates },
      {
        onSuccess: async () => {
          if (section === 'fiscal') {
            try {
              await syncObligations();
              toast.success('Dados fiscais atualizados.');
            } catch (e: any) {
              toast.error(e?.message ?? 'Erro ao atualizar obrigações');
            }
          }
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{sectionTitles[section]}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-6">
          {section === 'contato' && (
            <>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF/CNPJ</Label>
                <div className="relative">
                  <Input
                    value={document}
                    onChange={e => setDocument(e.target.value)}
                    onBlur={handleDocumentBlur}
                    placeholder="000.000.000-00"
                    disabled={loadingCnpj}
                    className={loadingCnpj ? 'pr-9' : ''}
                  />
                  {loadingCnpj && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Representante Legal</Label>
                <Input value={representativeLegal} onChange={e => setRepresentativeLegal(e.target.value)} placeholder="Nome do representante" />
              </div>
            </>
          )}

          {section === 'endereco' && (
            <>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input
                  value={cep}
                  onChange={e => setCep(e.target.value)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  disabled={loadingCep}
                />
                {loadingCep && <p className="text-xs text-muted-foreground">Buscando CEP...</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Logradouro</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, Av..." />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={addressNumber} onChange={e => setAddressNumber(e.target.value)} placeholder="Nº" />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {BR_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {section === 'fiscal' && (
            <>
              <div className="space-y-1.5">
                <Label>Regime Tributário</Label>
                <Select value={taxRegime} onValueChange={v => setTaxRegime(v as TaxRegime)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o regime" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mei">MEI</SelectItem>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="nao_aplica">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <div>
                  <Label>Status</Label>
                  <p className="text-sm text-muted-foreground">{isActive ? 'Cliente ativo' : 'Cliente inativo'}</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <div className="space-y-1.5">
                <Label>Colaborador Responsável</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não atribuído</SelectItem>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Obrigações Fiscais</Label>
                <ContactObligationsSelector
                  options={obligationsCatalog}
                  selectedIds={selectedObligations}
                  onChange={setSelectedObligations}
                />
              </div>
            </>
          )}

          {section === 'empresariais' && (
            <>
              <div className="space-y-1.5">
                <Label>Razão Social</Label>
                <Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome Fantasia</Label>
                <Input value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} placeholder="Nome fantasia" />
              </div>
              <div className="space-y-1.5">
                <Label>Natureza Jurídica</Label>
                <Input value={naturezaJuridica} onChange={e => setNaturezaJuridica(e.target.value)} placeholder="Natureza jurídica" />
              </div>
              <div className="space-y-1.5">
                <Label>Situação Cadastral</Label>
                <Select value={situacaoCadastral} onValueChange={setSituacaoCadastral}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informada</SelectItem>
                    <SelectItem value="Ativa">Ativa</SelectItem>
                    <SelectItem value="Baixada">Baixada</SelectItem>
                    <SelectItem value="Inapta">Inapta</SelectItem>
                    <SelectItem value="Suspensa">Suspensa</SelectItem>
                    <SelectItem value="Nula">Nula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo Estabelecimento</Label>
                <Select value={tipoEstabelecimento} onValueChange={setTipoEstabelecimento}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="Matriz">Matriz</SelectItem>
                    <SelectItem value="Filial">Filial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status do Cliente</Label>
                <Select value={statusCliente} onValueChange={setStatusCliente}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                    <SelectItem value="Prospect">Prospect</SelectItem>
                    <SelectItem value="Em Processo de Abertura">Em Processo de Abertura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Cliente</Label>
                <Select value={tipoCliente} onValueChange={setTipoCliente}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="Empresa existente">Empresa existente</SelectItem>
                    <SelectItem value="Em processo de abertura">Em processo de abertura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Grupo do Escritório</Label>
                <Input value={grupoEscritorio} onChange={e => setGrupoEscritorio(e.target.value)} placeholder="Grupo" />
              </div>
              <div className="space-y-1.5">
                <Label>Data Início Contrato</Label>
                <Input type="date" value={dataInicioContrato} onChange={e => setDataInicioContrato(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Segundo E-mail de Contato</Label>
                <Input type="email" value={segundoEmailContato} onChange={e => setSegundoEmailContato(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Complemento (endereço)</Label>
                <Input value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Complemento" />
              </div>
              <div className="space-y-2">
                <Label>Categorias</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/50 p-3">
                  {[
                    { value: 'cliente', label: 'Cliente' },
                    { value: 'fornecedor', label: 'Fornecedor' },
                    { value: 'colaborador', label: 'Colaborador' },
                    { value: 'outros', label: 'Outros' },
                  ].map(opt => {
                    const checked = categorias.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setCategorias(prev =>
                              v ? Array.from(new Set([...prev, opt.value])) : prev.filter(c => c !== opt.value)
                            );
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {section === 'datas-esfera' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Abertura Junta</Label>
                <Input type="date" value={dataAberturaJunta} onChange={e => setDataAberturaJunta(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Encerramento Junta</Label>
                <Input type="date" value={dataEncerramentoJunta} onChange={e => setDataEncerramentoJunta(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Abertura RF</Label>
                <Input type="date" value={dataAberturaRf} onChange={e => setDataAberturaRf(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Encerramento RF</Label>
                <Input type="date" value={dataEncerramentoRf} onChange={e => setDataEncerramentoRf(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Abertura Prefeitura</Label>
                <Input type="date" value={dataAberturaPrefeitura} onChange={e => setDataAberturaPrefeitura(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Encerramento Prefeitura</Label>
                <Input type="date" value={dataEncerramentoPrefeitura} onChange={e => setDataEncerramentoPrefeitura(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Abertura Estado</Label>
                <Input type="date" value={dataAberturaEstado} onChange={e => setDataAberturaEstado(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Encerramento Estado</Label>
                <Input type="date" value={dataEncerramentoEstado} onChange={e => setDataEncerramentoEstado(e.target.value)} />
              </div>
            </div>
          )}

          {section === 'departamento-pessoal' && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Possui Funcionários</Label>
                <Switch checked={possuiFuncionarios} onCheckedChange={setPossuiFuncionarios} />
              </div>
              <div className="space-y-1.5">
                <Label>Nº Funcionários</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={numeroFuncionarios}
                  onChange={e => setNumeroFuncionarios(e.target.value)}
                  disabled={!possuiFuncionarios}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo Cartão Ponto</Label>
                <Select value={tipoCartaoPonto} onValueChange={setTipoCartaoPonto}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="Central">Central</SelectItem>
                    <SelectItem value="Convencional">Convencional</SelectItem>
                    <SelectItem value="Eletrônico">Eletrônico</SelectItem>
                    <SelectItem value="Espelho">Espelho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Medicina do Trabalho</Label>
                <Switch checked={medicinaTrabalho} onCheckedChange={setMedicinaTrabalho} />
              </div>
              <div className="space-y-1.5">
                <Label>Grupo CIPA</Label>
                <Input value={grupoCipa} onChange={e => setGrupoCipa(e.target.value)} placeholder="Grupo CIPA" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Registro de Entradas</Label>
                <Switch checked={registroEntradas} onCheckedChange={setRegistroEntradas} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Registro de Saídas</Label>
                <Switch checked={registroSaidas} onCheckedChange={setRegistroSaidas} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Registro ICMS</Label>
                <Switch checked={registroIcms} onCheckedChange={setRegistroIcms} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <Label>Inventário</Label>
                <Switch checked={inventario} onCheckedChange={setInventario} />
              </div>
              <div className="space-y-1.5">
                <Label>Inscrição Estadual (IE)</Label>
                <Input value={ie} onChange={e => setIe(e.target.value)} placeholder="IE" />
              </div>
              <div className="space-y-1.5">
                <Label>Inscrição Municipal (IM)</Label>
                <Input value={im} onChange={e => setIm(e.target.value)} placeholder="IM" />
              </div>
              <div className="space-y-1.5">
                <Label>Regime de Apuração</Label>
                <Select value={regimeApuracao} onValueChange={setRegimeApuracao}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                    <SelectItem value="Trimestral">Trimestral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nº Alvará</Label>
                <Input value={numeroAlvara} onChange={e => setNumeroAlvara(e.target.value)} placeholder="Número do alvará" />
              </div>
              <div className="space-y-1.5">
                <Label>Validade Alvará</Label>
                <Input type="date" value={validadeAlvara} onChange={e => setValidadeAlvara(e.target.value)} />
              </div>
            </>
          )}



          {section === 'observacoes' && (
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Anotações sobre o cliente..."
                className="min-h-[160px]"
              />
            </div>
          )}

          {section === 'cobranca' && (
            <>
              <div className="space-y-1.5">
                <Label>Valor mensal de honorários</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={boletoValue}
                    onChange={(e) => setBoletoValue(e.target.value)}
                    placeholder="0,00"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dia de vencimento</Label>
                <Select value={boletoDueDay} onValueChange={setBoletoDueDay}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não configurado</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal de entrega</Label>
                <Select value={canalEntrega} onValueChange={setCanalEntrega}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não configurado</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="impresso">Impresso</SelectItem>
                    <SelectItem value="whatsapp_email">WhatsApp + E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Nº cliente Sicoob</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={numeroSicoob}
                  onChange={(e) => setNumeroSicoob(e.target.value)}
                  placeholder="Número do beneficiário no Sisbr"
                  className="text-muted-foreground"
                />
              </div>
            </>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateContact.isPending}>
            {updateContact.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
