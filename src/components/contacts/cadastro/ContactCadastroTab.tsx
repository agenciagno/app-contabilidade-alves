import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search, Info, Save, UserPlus, Pencil, LogOut } from 'lucide-react';
import { useSuperPerfil } from '@/hooks/useSuperPerfil';
import { useContactPartners } from '@/hooks/useContactPartners';
import { useContacts } from '@/hooks/useContacts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ContactBillingCard } from '../ContactBillingCard';
import { ContactObligationsSelector } from '@/components/fiscal/ContactObligationsSelector';
import { useCompany } from '@/hooks/useCompany';
import { maskPhone } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  contactId: string;
}

const TAX_REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
  { value: 'imune', label: 'Imune' },
  { value: 'isento', label: 'Isento' },
  { value: 'nao_aplica', label: 'Pessoa Física' },
];

const STATUS_CLIENTE = ['Prospect', 'Ativo', 'Inativo', 'Suspenso', 'Encerrado'];
const PORTE_OPTIONS = ['MEI', 'ME', 'EPP', 'Médio', 'Grande'];
const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const AutofillBadge = () => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="ml-2 text-[10px]">
          <Info className="h-3 w-3 mr-1" /> Receita
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Preenchido automaticamente via Receita Federal</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

function Field({ label, children, autofill }: { label: string; children: React.ReactNode; autofill?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium flex items-center">
        {label}
        {autofill && <AutofillBadge />}
      </Label>
      {children}
    </div>
  );
}

function CnaeCard({ cnae }: { cnae: any }) {
  if (!cnae) return null;
  // BrasilAPI/cnpj.ws shape: { classe, subclasse, descricao } (sometimes 'codigo'/'text')
  const subclasse = cnae.subclasse || cnae.codigo || cnae.code || '—';
  const classe = cnae.classe || '—';
  const descricao = cnae.descricao || cnae.text || cnae.description || '—';
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-sm font-semibold">{subclasse}</p>
      <p className="text-sm text-foreground">{descricao}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Classe: {classe} · Subclasse: {subclasse}
      </p>
    </div>
  );
}

export function ContactCadastroTab({ contactId }: Props) {
  const { data, isLoading, updateSuperPerfil, lookupCnpj } = useSuperPerfil(contactId);
  const [form, setForm] = useState<Record<string, any>>({});
  const [cnpjLoading, setCnpjLoading] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const saveSection = (keys: string[]) => {
    const payload: Record<string, any> = {};
    keys.forEach(k => { payload[k] = form[k] ?? null; });
    updateSuperPerfil.mutate(payload);
  };

  const handleCnpjLookup = async () => {
    if (!form.document) return;
    setCnpjLoading(true);
    try {
      const r = await lookupCnpj(form.document);
      setForm(prev => ({
        ...prev,
        razao_social: r.razao_social ?? prev.razao_social,
        nome_fantasia: r.nome_fantasia ?? prev.nome_fantasia,
        natureza_juridica: r.natureza_juridica ?? prev.natureza_juridica,
        situacao_cadastral: r.situacao_cadastral ?? prev.situacao_cadastral,
        data_abertura_receita: r.data_abertura_receita ?? prev.data_abertura_receita,
        cep: r.cep ?? prev.cep,
        address: r.address ?? prev.address,
        address_number: r.address_number ?? prev.address_number,
        complemento: r.complemento ?? prev.complemento,
        neighborhood: r.neighborhood ?? prev.neighborhood,
        city: r.city ?? prev.city,
        state: r.state ?? prev.state,
        cnae_principal: r.cnae_principal ?? prev.cnae_principal,
        cnaes_secundarios: r.cnaes_secundarios ?? prev.cnaes_secundarios,
      }));
      toast.success('Dados da Receita carregados');
    } catch (e: any) {
      toast.error(e.message || 'Falha na consulta');
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleCepBlur = async () => {
    const clean = (form.cep || '').replace(/\D/g, '');
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setForm(prev => ({
          ...prev,
          address: d.logradouro || prev.address,
          neighborhood: d.bairro || prev.neighborhood,
          city: d.localidade || prev.city,
          state: d.uf || prev.state,
        }));
      }
    } catch { /* silent */ }
  };

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <Tabs defaultValue="identificacao" className="w-full">
      <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 gap-1">
        <TabsTrigger value="identificacao">Identificação</TabsTrigger>
        <TabsTrigger value="endereco">Endereço</TabsTrigger>
        <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
        <TabsTrigger value="operacional">Operacional</TabsTrigger>
        <TabsTrigger value="socios">Sócios</TabsTrigger>
      </TabsList>

      {/* IDENTIFICAÇÃO & CONTATOS */}
      <TabsContent value="identificacao" className="mt-6 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação & Contatos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="CNPJ / CPF">
              <div className="flex gap-2">
                <Input value={form.document || ''} onChange={e => set('document', e.target.value)} />
                <Button type="button" variant="outline" size="icon" onClick={handleCnpjLookup} disabled={cnpjLoading}>
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </Field>
            <Field label="Razão Social" autofill>
              <Input value={form.razao_social || ''} onChange={e => set('razao_social', e.target.value)} />
            </Field>
            <Field label="Nome Fantasia" autofill>
              <Input value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)} />
            </Field>
            <Field label="Nome de Exibição">
              <Select
                value={
                  form.display_name && form.display_name === (form.razao_social || '')
                    ? 'razao_social'
                    : 'nome_fantasia'
                }
                onValueChange={(v) => {
                  const novo = v === 'razao_social' ? (form.razao_social || '') : (form.nome_fantasia || '');
                  set('display_name', novo || null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nome_fantasia">Nome Fantasia</SelectItem>
                  <SelectItem value="razao_social">Razão Social</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Este é o nome exibido na listagem de contatos
              </p>
            </Field>
            <Field label="Porte">
              <Select value={form.porte || ''} onValueChange={v => set('porte', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PORTE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de Estabelecimento">
              <Select value={form.tipo_estabelecimento || ''} onValueChange={v => set('tipo_estabelecimento', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Matriz">Matriz</SelectItem>
                  <SelectItem value="Filial">Filial</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Representante Legal">
              <Input value={form.representative_legal || ''} onChange={e => set('representative_legal', e.target.value)} />
            </Field>
            <Field label="Natureza Jurídica" autofill>
              <Input value={form.natureza_juridica || ''} onChange={e => set('natureza_juridica', e.target.value)} />
            </Field>
            <Field label="Data de Abertura / Fundação" autofill>
              <Input type="date" value={form.data_abertura_receita || ''} onChange={e => set('data_abertura_receita', e.target.value)} />
            </Field>
            <Field label="Situação na Receita Federal" autofill>
              <Input value={form.situacao_cadastral || ''} readOnly className="bg-muted/40" />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
            </Field>
            <Field label="Telefone">
              <Input value={form.phone || ''} onChange={e => set('phone', maskPhone(e.target.value))} />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={form.whatsapp || ''}
                onChange={e => set('whatsapp', maskPhone(e.target.value))}
                placeholder="(XX) XXXXX-XXXX"
              />
            </Field>
            <Field label="Segundo E-mail">
              <Input type="email" value={form.segundo_email_contato || ''} onChange={e => set('segundo_email_contato', e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Observações Gerais">
                <Textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={() => saveSection([
            'document', 'razao_social', 'nome_fantasia', 'display_name', 'porte', 'natureza_juridica',
            'data_abertura_receita', 'situacao_cadastral', 'email', 'phone', 'whatsapp', 'notes',
            'cnae_principal', 'cnaes_secundarios',
            'tipo_estabelecimento', 'representative_legal', 'segundo_email_contato',
          ])} disabled={updateSuperPerfil.isPending}>
            {updateSuperPerfil.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </TabsContent>

      {/* ENDEREÇO */}
      <TabsContent value="endereco" className="mt-6 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="CEP" autofill>
              <Input value={form.cep || ''} onChange={e => set('cep', e.target.value)} onBlur={handleCepBlur} />
            </Field>
            <Field label="Logradouro" autofill>
              <Input value={form.address || ''} onChange={e => set('address', e.target.value)} />
            </Field>
            <Field label="Número" autofill>
              <Input value={form.address_number || ''} onChange={e => set('address_number', e.target.value)} />
            </Field>
            <Field label="Complemento" autofill>
              <Input value={form.complemento || ''} onChange={e => set('complemento', e.target.value)} />
            </Field>
            <Field label="Bairro" autofill>
              <Input value={form.neighborhood || ''} onChange={e => set('neighborhood', e.target.value)} />
            </Field>
            <Field label="Cidade" autofill>
              <Input value={form.city || ''} onChange={e => set('city', e.target.value)} />
            </Field>
            <Field label="Estado (UF)" autofill>
              <Select value={form.state || ''} onValueChange={v => set('state', v)}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {BR_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={() => saveSection([
            'cep', 'address', 'address_number', 'complemento', 'neighborhood', 'city', 'state',
          ])} disabled={updateSuperPerfil.isPending}>
            {updateSuperPerfil.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </TabsContent>

      {/* FISCAL */}
      <TabsContent value="fiscal" className="mt-6 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Regime e Inscrições</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Regime Tributário">
              <Select value={form.tax_regime || ''} onValueChange={v => set('tax_regime', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TAX_REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status do Cliente">
              <Select value={form.status_cliente || ''} onValueChange={v => set('status_cliente', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STATUS_CLIENTE.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Inscrição Municipal (IM)"><Input value={form.im || ''} onChange={e => set('im', e.target.value)} /></Field>
            <Field label="Inscrição Estadual (IE)"><Input value={form.ie || ''} onChange={e => set('ie', e.target.value)} /></Field>
            <Field label="Regime de Apuração">
              <Select value={form.regime_apuracao || ''} onValueChange={v => set('regime_apuracao', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                  <SelectItem value="Trimestral">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nº Alvará">
              <Input value={form.numero_alvara || ''} onChange={e => set('numero_alvara', e.target.value)} />
            </Field>
            <Field label="Validade Alvará">
              <Input type="date" value={form.validade_alvara || ''} onChange={e => set('validade_alvara', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">CNAE (Receita Federal)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">CNAE Principal</p>
              {form.cnae_principal ? (
                <CnaeCard cnae={form.cnae_principal} />
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                CNAEs Secundários ({Array.isArray(form.cnaes_secundarios) ? form.cnaes_secundarios.length : 0})
              </p>
              {Array.isArray(form.cnaes_secundarios) && form.cnaes_secundarios.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {form.cnaes_secundarios.map((c: any, i: number) => (
                    <CnaeCard key={i} cnae={c} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Registros e Livros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'registro_entradas', label: 'Registro de Entradas' },
              { key: 'registro_saidas', label: 'Registro de Saídas' },
              { key: 'registro_icms', label: 'Registro ICMS' },
              { key: 'inventario', label: 'Inventário' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">{item.label}</Label>
                <Switch checked={!!form[item.key]} onCheckedChange={v => set(item.key, v)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <ObligationsSection contactId={contactId} />

        <div className="flex justify-end">
          <Button onClick={() => saveSection([
            'tax_regime', 'status_cliente', 'im', 'ie',
            'regime_apuracao', 'numero_alvara', 'validade_alvara',
            'registro_entradas', 'registro_saidas', 'registro_icms', 'inventario',
          ])} disabled={updateSuperPerfil.isPending}>
            {updateSuperPerfil.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </TabsContent>

      {/* OPERACIONAL */}
      <TabsContent value="operacional" className="mt-6 space-y-4">
        <OperacionalSection
          form={form}
          set={set}
          onSave={() => saveSection([
            'responsible_id', 'categorias',
            'data_inicio_contrato', 'data_saida_cliente',
            'data_abertura_junta', 'data_encerramento_junta',
            'data_abertura_rf', 'data_encerramento_rf',
            'data_abertura_prefeitura', 'data_encerramento_prefeitura',
            'data_abertura_estado', 'data_encerramento_estado',
            'possui_funcionarios', 'numero_funcionarios', 'tipo_cartao_ponto',
            'medicina_trabalho', 'grupo_cipa',
          ])}
          isPending={updateSuperPerfil.isPending}
          contactId={contactId}
        />
      </TabsContent>

      {/* SÓCIOS */}
      <TabsContent value="socios" className="mt-6">
        <SociosSection contactId={contactId} />
      </TabsContent>
    </Tabs>
  );
}

// ============ Obrigações Fiscais ============
function ObligationsSection({ contactId }: { contactId: string }) {
  const { company } = useCompany();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['fiscal-obligations-catalog'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_obligations_catalog')
        .select('id, name, is_custom')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_custom?: boolean }[];
    },
  });

  const { data: contactObligations = [] } = useQuery({
    queryKey: ['client-obligations', contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_obligations')
        .select('obligation_id')
        .eq('contact_id', contactId);
      if (error) throw error;
      return (data ?? []) as { obligation_id: string }[];
    },
  });

  useEffect(() => {
    if (!initialized && contactObligations.length >= 0) {
      setSelected(new Set(contactObligations.map(o => o.obligation_id)));
      setInitialized(true);
    }
  }, [contactObligations, initialized]);

  const handleSave = async () => {
    if (!company?.id) return;
    try {
      const original = new Set(contactObligations.map(o => o.obligation_id));
      const toDelete: string[] = [];
      const toInsert: string[] = [];
      original.forEach(id => { if (!selected.has(id)) toDelete.push(id); });
      selected.forEach(id => { if (!original.has(id)) toInsert.push(id); });

      if (toDelete.length) {
        const { error } = await (supabase as any)
          .from('client_obligations').delete()
          .eq('contact_id', contactId).in('obligation_id', toDelete);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await (supabase as any)
          .from('client_obligations').insert(
            toInsert.map(obligation_id => ({ contact_id: contactId, obligation_id, company_id: company.id }))
          );
        if (error) throw error;
      }
      toast.success('Obrigações fiscais atualizadas');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar obrigações');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Obrigações Fiscais</CardTitle>
        <Button size="sm" variant="outline" onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar obrigações
        </Button>
      </CardHeader>
      <CardContent>
        <ContactObligationsSelector
          options={catalog}
          selectedIds={selected}
          onChange={setSelected}
        />
      </CardContent>
    </Card>
  );
}

// ============ Operacional ============
function OperacionalSection({
  form, set, onSave, isPending, contactId,
}: {
  form: Record<string, any>;
  set: (k: string, v: any) => void;
  onSave: () => void;
  isPending: boolean;
  contactId: string;
}) {
  const { contacts } = useContacts();
  const contact = contacts.find(c => c.id === contactId);

  const { data: profiles } = useQuery({
    queryKey: ['profiles-active-cadastro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('status_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const categoriasDisponiveis = ['cliente', 'fornecedor', 'colaborador', 'outros'];
  const toggleCategoria = (cat: string) => {
    const current: string[] = form.categorias || ['outros'];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    set('categorias', next.length ? next : ['outros']);
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Responsável & Categorias</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Colaborador Responsável">
            <Select value={form.responsible_id || 'none'} onValueChange={v => set('responsible_id', v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não atribuído</SelectItem>
                {profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Categorias (controle de acesso)">
            <div className="flex flex-wrap gap-2">
              {categoriasDisponiveis.map(cat => {
                const active = (form.categorias || ['outros']).includes(cat);
                return (
                  <Badge
                    key={cat}
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleCategoria(cat)}
                  >
                    {cat}
                  </Badge>
                );
              })}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datas do Relacionamento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Data de entrada como cliente">
            <Input type="date" value={form.data_inicio_contrato || ''} onChange={e => set('data_inicio_contrato', e.target.value)} />
          </Field>
          <Field label="Data de saída / encerramento">
            <Input type="date" value={form.data_saida_cliente || ''} onChange={e => set('data_saida_cliente', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datas por Esfera</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-xs text-muted-foreground">Esfera</th>
                  <th className="text-left py-2 pr-3 font-medium text-xs text-muted-foreground">Abertura</th>
                  <th className="text-left py-2 font-medium text-xs text-muted-foreground">Encerramento</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Junta Comercial', open: 'data_abertura_junta', close: 'data_encerramento_junta' },
                  { label: 'Receita Federal', open: 'data_abertura_rf', close: 'data_encerramento_rf' },
                  { label: 'Prefeitura', open: 'data_abertura_prefeitura', close: 'data_encerramento_prefeitura' },
                  { label: 'Estado', open: 'data_abertura_estado', close: 'data_encerramento_estado' },
                ].map(row => (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2 pr-3">
                      <Input type="date" value={form[row.open] || ''} onChange={e => set(row.open, e.target.value)} />
                    </td>
                    <td className="py-2">
                      <Input type="date" value={form[row.close] || ''} onChange={e => set(row.close, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Departamento Pessoal</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-sm">Possui Funcionários</Label>
            <Switch checked={!!form.possui_funcionarios} onCheckedChange={v => set('possui_funcionarios', v)} />
          </div>
          {form.possui_funcionarios === true && (
            <Field label="Nº Funcionários">
              <Input type="number" value={form.numero_funcionarios ?? ''} onChange={e => set('numero_funcionarios', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
          )}
          <Field label="Tipo Cartão Ponto">
            <Select value={form.tipo_cartao_ponto || ''} onValueChange={v => set('tipo_cartao_ponto', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Central">Central</SelectItem>
                <SelectItem value="Convencional">Convencional</SelectItem>
                <SelectItem value="Eletrônico">Eletrônico</SelectItem>
                <SelectItem value="Espelho">Espelho</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-sm">Medicina do Trabalho</Label>
            <Switch checked={!!form.medicina_trabalho} onCheckedChange={v => set('medicina_trabalho', v)} />
          </div>
          <Field label="Grupo CIPA">
            <Input value={form.grupo_cipa || ''} onChange={e => set('grupo_cipa', e.target.value)} />
          </Field>
        </CardContent>
      </Card>


      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {contact && <ContactBillingCard contact={contact} />}
    </>
  );
}

// ============ Sócios ============
function SociosSection({ contactId }: { contactId: string }) {
  const { partners, isLoading, totalParticipation } = useContactPartners(contactId);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = (partners as any[]).filter(p => showInactive ? true : p.ativo !== false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Quadro Societário</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Participação total: <strong>{totalParticipation.toFixed(2)}%</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Mostrar inativos</Label>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Adicionar sócio
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum sócio cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {p.ativo === false && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.cpf || '—'} · {p.participation_percentage || 0}%
                    {p.data_entrada && ` · Entrada: ${p.data_entrada}`}
                    {p.data_saida && ` · Saída: ${p.data_saida}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!p.data_saida && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Marcar saída"
                      onClick={async () => {
                        await supabase.from('contact_partners')
                          .update({ data_saida: new Date().toISOString().slice(0, 10) })
                          .eq('id', p.id);
                        window.location.reload();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PartnerDialogV2 open={open} onOpenChange={setOpen} contactId={contactId} partner={editing} />
    </Card>
  );
}

function PartnerDialogV2({
  open, onOpenChange, contactId, partner,
}: { open: boolean; onOpenChange: (v: boolean) => void; contactId: string; partner: any | null }) {
  const { createPartner, updatePartner } = useContactPartners(contactId);
  const [f, setF] = useState<any>({});

  useEffect(() => {
    setF(partner || {
      name: '', cpf: '', email: '', participation_percentage: 0,
      rg: '', whatsapp: '', endereco: '', data_entrada: '', data_saida: '',
    });
  }, [partner, open]);

  const handleSave = async () => {
    if (!f.name) { toast.error('Nome é obrigatório'); return; }
    const payload: any = {
      name: f.name,
      cpf: f.cpf || null,
      email: f.email || null,
      participation_percentage: Number(f.participation_percentage) || 0,
      rg: f.rg || null,
      whatsapp: f.whatsapp || null,
      endereco: f.endereco || null,
      data_entrada: f.data_entrada || null,
      data_saida: f.data_saida || null,
    };
    try {
      if (partner?.id) {
        await updatePartner.mutateAsync({ id: partner.id, ...payload } as any);
      } else {
        await createPartner.mutateAsync({ ...payload, contact_id: contactId } as any);
      }
      onOpenChange(false);
    } catch { /* toast handled in hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner ? 'Editar Sócio' : 'Adicionar Sócio'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <Field label="Nome *"><Input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="CPF"><Input value={f.cpf || ''} onChange={e => setF({ ...f, cpf: e.target.value })} /></Field>
          <Field label="RG"><Input value={f.rg || ''} onChange={e => setF({ ...f, rg: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="WhatsApp"><Input value={f.whatsapp || ''} onChange={e => setF({ ...f, whatsapp: e.target.value })} /></Field>
          <Field label="Participação (%)">
            <Input type="number" step="0.01" value={f.participation_percentage ?? 0}
              onChange={e => setF({ ...f, participation_percentage: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Endereço">
              <Textarea rows={2} value={f.endereco || ''} onChange={e => setF({ ...f, endereco: e.target.value })} />
            </Field>
          </div>
          <Field label="Data de Entrada">
            <Input type="date" value={f.data_entrada || ''} onChange={e => setF({ ...f, data_entrada: e.target.value })} />
          </Field>
          <Field label="Data de Saída">
            <Input type="date" value={f.data_saida || ''} onChange={e => setF({ ...f, data_saida: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
