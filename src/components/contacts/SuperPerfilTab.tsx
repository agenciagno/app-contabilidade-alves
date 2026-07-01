import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, Info, Save, UserPlus, Pencil, LogOut } from 'lucide-react';
import { useSuperPerfil } from '@/hooks/useSuperPerfil';
import { useContactPartners } from '@/hooks/useContactPartners';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { TAX_REGIMES } from '@/constants/taxRegimes';

interface Props {
  contactId: string;
}

const STATUS_CLIENTE = ['Prospect', 'Ativo', 'Inativo', 'Encerrado'];
const TIPO_ESTABELECIMENTO = ['Matriz', 'Filial'];
const REGIME_APURACAO = ['Mensal', 'Trimestral', 'Anual'];
const TIPO_CARTAO_PONTO = ['Manual', 'Mecânico', 'Eletrônico', 'Biométrico', 'Não possui'];

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

export function SuperPerfilTab({ contactId }: Props) {
  const { data, isLoading, updateSuperPerfil, lookupCnpj } = useSuperPerfil(contactId);
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, any>>({});
  const [cnpjLoading, setCnpjLoading] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    updateSuperPerfil.mutate(form);
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
      toast({ title: 'Dados da Receita carregados' });
    } catch (e: any) {
      toast({ title: 'Falha na consulta', description: e.message, variant: 'destructive' });
    } finally {
      setCnpjLoading(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <div className="space-y-4 pb-24">
      <Tabs defaultValue="principais" className="w-full">
        <TabsList className="w-full grid grid-cols-5 gap-1">
          <TabsTrigger value="principais">Principais</TabsTrigger>
          <TabsTrigger value="endereco">Endereço & Fiscal</TabsTrigger>
          <TabsTrigger value="datas">Datas & Histórico</TabsTrigger>
          <TabsTrigger value="operacional">Operacional</TabsTrigger>
          <TabsTrigger value="socios">Sócios</TabsTrigger>
        </TabsList>

        {/* ABA 1 — Principais */}
        <TabsContent value="principais" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="CNPJ">
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
              <Field label="Natureza Jurídica" autofill>
                <Input value={form.natureza_juridica || ''} onChange={e => set('natureza_juridica', e.target.value)} />
              </Field>
              <Field label="Situação Cadastral" autofill>
                <Input value={form.situacao_cadastral || ''} onChange={e => set('situacao_cadastral', e.target.value)} />
              </Field>
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
              <Field label="Tipo de Estabelecimento">
                <Select value={form.tipo_estabelecimento || ''} onValueChange={v => set('tipo_estabelecimento', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TIPO_ESTABELECIMENTO.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tipo de Cliente">
                <Input value={form.tipo_cliente || ''} onChange={e => set('tipo_cliente', e.target.value)} />
              </Field>
              <Field label="Grupo de Escritório">
                <Input value={form.grupo_escritorio || ''} onChange={e => set('grupo_escritorio', e.target.value)} />
              </Field>
              <Field label="Representante Legal">
                <Input value={form.representative_legal || ''} onChange={e => set('representative_legal', e.target.value)} />
              </Field>
              <Field label="2º E-mail de Contato">
                <Input type="email" value={form.segundo_email_contato || ''} onChange={e => set('segundo_email_contato', e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2 — Endereço & Fiscal */}
        <TabsContent value="endereco" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP" autofill><Input value={form.cep || ''} onChange={e => set('cep', e.target.value)} /></Field>
              <Field label="Logradouro" autofill><Input value={form.address || ''} onChange={e => set('address', e.target.value)} /></Field>
              <Field label="Número" autofill><Input value={form.address_number || ''} onChange={e => set('address_number', e.target.value)} /></Field>
              <Field label="Complemento" autofill><Input value={form.complemento || ''} onChange={e => set('complemento', e.target.value)} /></Field>
              <Field label="Bairro" autofill><Input value={form.neighborhood || ''} onChange={e => set('neighborhood', e.target.value)} /></Field>
              <Field label="Cidade" autofill><Input value={form.city || ''} onChange={e => set('city', e.target.value)} /></Field>
              <Field label="UF" autofill><Input value={form.state || ''} onChange={e => set('state', e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Inscrições e Regime</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Inscrição Estadual (IE)"><Input value={form.ie || ''} onChange={e => set('ie', e.target.value)} /></Field>
              <Field label="Inscrição Municipal (IM)"><Input value={form.im || ''} onChange={e => set('im', e.target.value)} /></Field>
              <Field label="Regime de Apuração">
                <Select value={form.regime_apuracao || ''} onValueChange={v => set('regime_apuracao', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {REGIME_APURACAO.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Número do Alvará"><Input value={form.numero_alvara || ''} onChange={e => set('numero_alvara', e.target.value)} /></Field>
              <Field label="Validade do Alvará">
                <Input type="date" value={form.validade_alvara || ''} onChange={e => set('validade_alvara', e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">CNAE</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="principal">
                  <AccordionTrigger>CNAE Principal</AccordionTrigger>
                  <AccordionContent>
                    <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto">
                      {form.cnae_principal ? JSON.stringify(form.cnae_principal, null, 2) : '—'}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="secundarios">
                  <AccordionTrigger>
                    CNAEs Secundários ({Array.isArray(form.cnaes_secundarios) ? form.cnaes_secundarios.length : 0})
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto max-h-72">
                      {form.cnaes_secundarios ? JSON.stringify(form.cnaes_secundarios, null, 2) : '—'}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3 — Datas & Histórico */}
        <TabsContent value="datas" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Datas de Abertura</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Início do Contrato">
                <Input type="date" value={form.data_inicio_contrato || ''} onChange={e => set('data_inicio_contrato', e.target.value)} />
              </Field>
              <Field label="Abertura Receita Federal" autofill>
                <Input type="date" value={form.data_abertura_receita || ''} onChange={e => set('data_abertura_receita', e.target.value)} />
              </Field>
              <Field label="Abertura Junta Comercial">
                <Input type="date" value={form.data_abertura_junta || ''} onChange={e => set('data_abertura_junta', e.target.value)} />
              </Field>
              <Field label="Abertura RF (Alt.)">
                <Input type="date" value={form.data_abertura_rf || ''} onChange={e => set('data_abertura_rf', e.target.value)} />
              </Field>
              <Field label="Abertura Estado">
                <Input type="date" value={form.data_abertura_estado || ''} onChange={e => set('data_abertura_estado', e.target.value)} />
              </Field>
              <Field label="Abertura Prefeitura">
                <Input type="date" value={form.data_abertura_prefeitura || ''} onChange={e => set('data_abertura_prefeitura', e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Datas de Encerramento</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Encerramento Junta">
                <Input type="date" value={form.data_encerramento_junta || ''} onChange={e => set('data_encerramento_junta', e.target.value)} />
              </Field>
              <Field label="Encerramento Receita Federal">
                <Input type="date" value={form.data_encerramento_rf || ''} onChange={e => set('data_encerramento_rf', e.target.value)} />
              </Field>
              <Field label="Encerramento Prefeitura">
                <Input type="date" value={form.data_encerramento_prefeitura || ''} onChange={e => set('data_encerramento_prefeitura', e.target.value)} />
              </Field>
              <Field label="Encerramento Estado">
                <Input type="date" value={form.data_encerramento_estado || ''} onChange={e => set('data_encerramento_estado', e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 4 — Operacional */}
        <TabsContent value="operacional" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pessoal & RH</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Possui Funcionários</Label>
                <Switch
                  checked={!!form.possui_funcionarios}
                  onCheckedChange={v => set('possui_funcionarios', v)}
                />
              </div>
              <Field label="Número de Funcionários">
                <Input
                  type="number"
                  min={0}
                  value={form.numero_funcionarios ?? ''}
                  onChange={e => set('numero_funcionarios', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                  disabled={!form.possui_funcionarios}
                />
              </Field>
              <Field label="Tipo de Cartão Ponto">
                <Select value={form.tipo_cartao_ponto || ''} onValueChange={v => set('tipo_cartao_ponto', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TIPO_CARTAO_PONTO.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Medicina do Trabalho</Label>
                <Switch
                  checked={!!form.medicina_trabalho}
                  onCheckedChange={v => set('medicina_trabalho', v)}
                />
              </div>
              <Field label="Grupo CIPA">
                <Input value={form.grupo_cipa || ''} onChange={e => set('grupo_cipa', e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Obrigações Fiscais</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['registro_entradas', 'Registro de Entradas'],
                ['registro_saidas', 'Registro de Saídas'],
                ['registro_icms', 'Registro de ICMS'],
                ['inventario', 'Inventário'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label>{label}</Label>
                  <Switch
                    checked={!!form[key]}
                    onCheckedChange={v => set(key, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 5 — Sócios */}
        <TabsContent value="socios" className="mt-6">
          <SociosSection contactId={contactId} />
        </TabsContent>
      </Tabs>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur p-3 flex justify-end">
        <Button onClick={handleSave} disabled={updateSuperPerfil.isPending} size="lg">
          {updateSuperPerfil.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

// ============ Sócios ============
function SociosSection({ contactId }: { contactId: string }) {
  const { partners, isLoading, totalParticipation, deletePartner } = useContactPartners(contactId);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (showInactive) return partners as any[];
    return (partners as any[]).filter(p => p.ativo !== false);
  }, [partners, showInactive]);

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

      <PartnerDialogV2
        open={open}
        onOpenChange={setOpen}
        contactId={contactId}
        partner={editing}
      />
    </Card>
  );
}

function PartnerDialogV2({
  open, onOpenChange, contactId, partner,
}: { open: boolean; onOpenChange: (v: boolean) => void; contactId: string; partner: any | null }) {
  const { createPartner, updatePartner } = useContactPartners(contactId);
  const { toast } = useToast();
  const [f, setF] = useState<any>({});

  useEffect(() => {
    setF(partner || {
      name: '', cpf: '', email: '', participation_percentage: 0,
      rg: '', whatsapp: '', endereco: '', data_entrada: '', data_saida: '',
    });
  }, [partner, open]);

  const handleSave = async () => {
    if (!f.name) { toast({ title: 'Nome é obrigatório', variant: 'destructive' }); return; }
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
    } catch {}
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
