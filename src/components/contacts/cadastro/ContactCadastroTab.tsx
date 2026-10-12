import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabsContent } from '@/components/ui/tabs';
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Search, Info, Save, UserPlus, Pencil, LogOut, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { useSuperPerfil } from '@/hooks/useSuperPerfil';
import { useContactPartners } from '@/hooks/useContactPartners';
import { useContacts } from '@/hooks/useContacts';
import { useContactDependencies } from '@/hooks/useContactDependencies';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { ContactObligationsSelector } from '@/components/fiscal/ContactObligationsSelector';
import { ClienteTarefasStatus } from './ClienteTarefasStatus';
import { useCompany } from '@/hooks/useCompany';
import { maskPhone, maskCPF, maskCPFCNPJ, getDocumentType } from '@/lib/utils';
import { toast } from 'sonner';
import { TAX_REGIMES } from '@/constants/taxRegimes';
import { PORTE_OPTIONS } from '@/constants/porte';
import { RESPONSIBLE_FIELDS } from '@/constants/responsibleFields';
import { STATUS_CLIENTE, STATUS_AJUDA, statusEhInativo, statusPedeAviso } from '@/constants/statusCliente';
import { useStatusPeriodos, useTarefasDispensadas, ORIGEM_PERIODO_LABEL, StatusPeriodo } from '@/hooks/useStatusPeriodos';
import { getContactStatusTone } from '@/lib/contact-display';
import { DsBadge } from '@/components/ds';
import { format, parseISO } from 'date-fns';
import { SETORES_ATUACAO, getSegmentos, inferRamoFromCnaeDescricao } from '@/constants/ramoAtuacao';

interface Props {
  contactId: string;
}

// Box "Datas" do Operacional (12/10/2026). Abertura e Baixa já existiam no banco (`data_encerramento_*` é a Baixa);
// Paralisação, Início do Fiscal/Pessoal e Balanço de Abertura vieram na migration 20261012120000.
const ESFERAS_DATAS = [
  { label: 'Junta / Cartório', sufixo: 'junta' },
  { label: 'Receita Federal', sufixo: 'rf' },
  { label: 'Prefeitura', sufixo: 'prefeitura' },
  { label: 'Estado', sufixo: 'estado' },
] as const;

const DATAS_GRUPOS: { titulo: string; ajuda?: string; campos: { key: string; label: string }[] }[] = [
  { titulo: 'Abertura', ajuda: 'Quando a empresa foi registrada em cada órgão.', campos: ESFERAS_DATAS.map(e => ({ key: `data_abertura_${e.sufixo}`, label: e.label })) },
  { titulo: 'Baixa', ajuda: 'Quando a empresa foi encerrada em cada órgão.', campos: ESFERAS_DATAS.map(e => ({ key: `data_encerramento_${e.sufixo}`, label: e.label })) },
  { titulo: 'Paralisação', ajuda: 'Quando a empresa parou as atividades em cada órgão.', campos: ESFERAS_DATAS.map(e => ({ key: `data_paralisacao_${e.sufixo}`, label: e.label })) },
  {
    titulo: 'Outras',
    ajuda: 'Contrato com a Contabilidade e datas de início de cada área.',
    campos: [
      { key: 'data_inicio_contrato', label: 'Início do contrato' },
      { key: 'data_saida_cliente', label: 'Fim do contrato' },
      { key: 'data_inicio_fiscal', label: 'Início do Fiscal' },
      { key: 'data_inicio_pessoal', label: 'Início do Pessoal' },
      { key: 'data_balanco_abertura', label: 'Balanço de abertura' },
    ],
  },
];
const DATAS_KEYS = DATAS_GRUPOS.flatMap(g => g.campos.map(c => c.key));

function EmBreveAba({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed">
      <div className="max-w-md space-y-3 px-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold">Em breve.</h3>
          <p className="text-sm text-muted-foreground">{texto}</p>
        </div>
      </div>
    </div>
  );
}

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

function PersonTypeBadge({ type }: { type: 'CPF' | 'CNPJ' | null }) {
  if (!type) return null;
  return (
    <Badge variant="outline" className="ml-2 text-[10px] font-normal">
      {type === 'CPF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
    </Badge>
  );
}

function Field({ label, children, autofill }: { label: React.ReactNode; children: React.ReactNode; autofill?: boolean }) {
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
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>({});
  const [cnpjLoading, setCnpjLoading] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const documentType = getDocumentType(form.document);
  const isPessoaFisica = documentType === 'CPF';

  // Autorização por sub-aba do Super Perfil — mesma regra pra Colaborador e Cliente Externo.
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const canViewSub = (subKey: string) =>
    isModuleVisible('perfil_cliente') && isSubItemVisible('perfil_cliente', subKey);
  const canViewIdentificacao = canViewSub('perfil_cliente_identificacao');
  const canViewFiscalTab = !isPessoaFisica && canViewSub('perfil_cliente_fiscal');
  const canViewPessoal = canViewSub('perfil_cliente_pessoal');
  const canViewContabil = canViewSub('perfil_cliente_contabil');
  const canViewOperacional = canViewSub('perfil_cliente_operacional');
  const canViewSocios = !isPessoaFisica && canViewSub('perfil_cliente_socios');

  const saveSection = (keys: string[]) => {
    const payload: Record<string, any> = {};
    keys.forEach(k => { payload[k] = form[k] ?? null; });
    updateSuperPerfil.mutate(payload);
  };

  const {
    catalog: obligationsCatalog,
    selected: selectedObligations,
    setSelected: setSelectedObligations,
    sync: syncObligations,
  } = useContactObligations(contactId, !isPessoaFisica);

  const [savingFiscal, setSavingFiscal] = useState(false);
  const saveFiscalSection = async () => {
    setSavingFiscal(true);
    try {
      await updateSuperPerfil.mutateAsync({
        tax_regime: form.tax_regime ?? null,
        im: form.im ?? null,
        ie: form.ie ?? null,
        setor_atuacao: form.setor_atuacao ?? null,
        segmento_atuacao: form.segmento_atuacao ?? null,
        recebe_das_ca: !!form.recebe_das_ca,
        recebe_guia_dctfweb_ca: !!form.recebe_guia_dctfweb_ca,
      });
    } finally {
      setSavingFiscal(false);
    }
  };

  const [savingOperacional, setSavingOperacional] = useState(false);
  const saveOperacionalSection = async () => {
    setSavingOperacional(true);
    try {
      await updateSuperPerfil.mutateAsync({
        responsible_id: form.responsible_id ?? null,
        dp_responsible_id: form.dp_responsible_id ?? null,
        financeiro_responsible_id: form.financeiro_responsible_id ?? null,
        contabil_responsible_id: form.contabil_responsible_id ?? null,
        comercial_responsible_id: form.comercial_responsible_id ?? null,
        categorias: form.categorias ?? null,
        status_cliente: form.status_cliente ?? null,
        // Data e motivo do status entram na MESMA atualização da troca; o trigger do banco abre/fecha o período.
        status_cliente_desde: form.status_cliente_desde || null,
        status_cliente_motivo: form.status_cliente_motivo || null,
        ...Object.fromEntries(DATAS_KEYS.map(k => [k, form[k] || null])),
      });
      queryClient.invalidateQueries({ queryKey: ['cliente-status-periodos', contactId] });
    } catch {
      setSavingOperacional(false);
      return; // updateSuperPerfil já mostra o toast de erro
    }
    try {
      const result = await syncObligations();
      if (result && (result.removed > 0 || result.created > 0 || result.preserved > 0)) {
        const parts: string[] = [];
        if (result.removed > 0) parts.push(`${result.removed} tarefa(s) removida(s)`);
        if (result.created > 0) {
          const now = new Date();
          parts.push(`${result.created} lançada(s) para ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`);
        }
        if (result.preserved > 0) parts.push(`${result.preserved} em andamento preservada(s) — revise manualmente`);
        toast.success(`Obrigações atualizadas — ${parts.join(', ')}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar tarefas');
    } finally {
      setSavingOperacional(false);
    }
  };

  const handleCnpjLookup = async () => {
    if (documentType !== 'CNPJ') return;
    setCnpjLoading(true);
    try {
      const r = await lookupCnpj(form.document);
      const inferred = !form.setor_atuacao
        ? inferRamoFromCnaeDescricao(r.cnae_principal?.descricao)
        : null;
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
        setor_atuacao: inferred?.setor ?? prev.setor_atuacao,
        segmento_atuacao: inferred?.segmento ?? prev.segmento_atuacao,
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
    <>
      {/* CADASTRO (Identificação & Contatos + Endereço + Observações Gerais) */}
      {canViewIdentificacao && (
      <TabsContent value="cadastro" className="mt-6 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação & Contatos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={<>CNPJ / CPF<PersonTypeBadge type={documentType} /></>}>
              <div className="flex gap-2">
                <Input
                  value={form.document || ''}
                  onChange={e => set('document', maskCPFCNPJ(e.target.value))}
                  placeholder="CNPJ ou CPF"
                />
                {documentType !== 'CPF' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCnpjLookup}
                    disabled={cnpjLoading || documentType !== 'CNPJ'}
                    title="Buscar dados do CNPJ"
                  >
                    {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </Field>
            {isPessoaFisica ? (
              <Field label="Nome">
                <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
              </Field>
            ) : (
              <>
                <Field label="Razão Social" autofill>
                  <Input value={form.razao_social || ''} onChange={e => set('razao_social', e.target.value)} />
                </Field>
                <Field label="Nome Fantasia" autofill>
                  <Input value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Nome de Exibição">
              <Input
                value={form.display_name ?? form.nome_fantasia ?? ''}
                onChange={e => set('display_name', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Preenchido automaticamente com o Nome Fantasia — edite livremente. É o nome exibido na listagem de contatos.
              </p>
            </Field>
            {!isPessoaFisica && (
              <>
                <Field label="Porte">
                  <Select value={form.porte || ''} onValueChange={v => set('porte', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {PORTE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
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
              </>
            )}
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
          </CardContent>
        </Card>
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

        <Card>
          <CardHeader><CardTitle className="text-base">Observações Gerais</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => saveSection([
            'document', 'name', 'razao_social', 'nome_fantasia', 'display_name', 'porte', 'natureza_juridica',
            'data_abertura_receita', 'situacao_cadastral', 'email', 'phone', 'whatsapp', 'notes',
            'cnae_principal', 'cnaes_secundarios',
            'representative_legal',
            'cep', 'address', 'address_number', 'complemento', 'neighborhood', 'city', 'state',
          ])} disabled={updateSuperPerfil.isPending}>
            {updateSuperPerfil.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </TabsContent>
      )}

      {/* SOCIETÁRIO (só PJ) — saiu da aba Cadastro em 12/10/2026 */}
      {canViewSocios && (
        <TabsContent value="societario" className="mt-6 space-y-4">
          <SociosSection contactId={contactId} />
        </TabsContent>
      )}

      {/* FISCAL (só PJ) */}
      {canViewFiscalTab && (
        <TabsContent value="fiscal" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Regime e Inscrições</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Regime Tributário">
                <Select value={form.tax_regime || '_ausente'} onValueChange={v => set('tax_regime', v === '_ausente' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_ausente">Ausente / Não informado</SelectItem>
                    {TAX_REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Inscrição Municipal (IM)"><Input value={form.im || ''} onChange={e => set('im', e.target.value)} /></Field>
              <Field label="Inscrição Estadual (IE)"><Input value={form.ie || ''} onChange={e => set('ie', e.target.value)} /></Field>
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
            <CardHeader><CardTitle className="text-base">Ramo de Atuação</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Setor">
                <Select
                  value={form.setor_atuacao || ''}
                  onValueChange={v => { set('setor_atuacao', v); set('segmento_atuacao', null); }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {SETORES_ATUACAO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Segmento">
                <Select
                  value={form.segmento_atuacao || ''}
                  onValueChange={v => set('segmento_atuacao', v)}
                  disabled={!form.setor_atuacao}
                >
                  <SelectTrigger><SelectValue placeholder={form.setor_atuacao ? 'Selecione' : 'Escolha o setor primeiro'} /></SelectTrigger>
                  <SelectContent>
                    {getSegmentos(form.setor_atuacao).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.cnae_principal}
                  onClick={() => {
                    const inferred = inferRamoFromCnaeDescricao(form.cnae_principal?.descricao || form.cnae_principal?.text || form.cnae_principal?.description);
                    if (!inferred) { toast.error('Não foi possível sugerir a partir deste CNAE'); return; }
                    set('setor_atuacao', inferred.setor);
                    set('segmento_atuacao', inferred.segmento);
                  }}
                >
                  Sugerir pelo CNAE
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rodada 5 do Monitoramento (09/10/2026): quem entra no lote de guias e na lista "Conferir e enviar". */}
          <Card>
            <CardHeader><CardTitle className="text-base">Guias mensais da CA</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">Recebe o DAS do Simples pela CA</span>
                  <span className="block text-xs text-muted-foreground">Entra no "Gerar DAS" em lote e na lista para conferir e enviar por e-mail.</span>
                </span>
                <Switch checked={!!form.recebe_das_ca} onCheckedChange={(v) => set('recebe_das_ca', v)} />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">Recebe a guia da DCTFWeb pela CA</span>
                  <span className="block text-xs text-muted-foreground">Entra no "Gerar guia" em lote e na lista para conferir e enviar por e-mail.</span>
                </span>
                <Switch checked={!!form.recebe_guia_dctfweb_ca} onCheckedChange={(v) => set('recebe_guia_dctfweb_ca', v)} />
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveFiscalSection} disabled={savingFiscal}>
              {savingFiscal ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </TabsContent>
      )}

      {/* PESSOAL — em breve */}
      {canViewPessoal && (
        <TabsContent value="pessoal" className="mt-6">
          <EmBreveAba texto="O Departamento Pessoal deste cliente ainda está em construção." />
        </TabsContent>
      )}

      {/* CONTÁBIL — em breve (12/10/2026) */}
      {canViewContabil && (
        <TabsContent value="contabil" className="mt-6">
          <EmBreveAba texto="A área contábil deste cliente ainda está em construção." />
        </TabsContent>
      )}

      {/* OPERACIONAL */}
      {canViewOperacional && (
      <TabsContent value="operacional" className="mt-6 space-y-4">
        <OperacionalSection
          form={form}
          original={data ?? {}}
          set={set}
          onSave={saveOperacionalSection}
          isPending={savingOperacional}
          contactId={contactId}
          isPessoaFisica={isPessoaFisica}
          obligationsCatalog={obligationsCatalog}
          selectedObligations={selectedObligations}
          setSelectedObligations={setSelectedObligations}
        />
      </TabsContent>
      )}
    </>
  );
}

// ============ Tarefas (obrigações fiscais) ============
// Estado + sync ficam num hook (não num componente com botão próprio) para que o
// salvamento aconteça junto com o resto da aba Operacional, num único botão "Salvar" —
// dois botões "Salvar" adjacentes e mal identificados levavam a edições perdidas
// (usuário clicava no botão errado e as tarefas nunca eram persistidas).
function useContactObligations(contactId: string, enabled: boolean) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['fiscal-obligations-catalog'],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_obligations_catalog')
        .select('id, name, is_custom')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_custom?: boolean }[];
    },
  });

  const { data: contactObligations = [], isSuccess: obligationsLoaded } = useQuery({
    queryKey: ['client-obligations', contactId],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_obligations')
        .select('obligation_id')
        .eq('contact_id', contactId);
      if (error) throw error;
      return (data ?? []) as { obligation_id: string }[];
    },
  });

  // `contactObligations` começa como [] (valor padrão do useQuery) antes da consulta
  // real responder — só inicializamos `selected` a partir dela quando a query de fato
  // carregou (isSuccess), senão o box nasce marcado como vazio e um "Salvar" precoce
  // apagaria as tarefas já salvas no banco.
  useEffect(() => {
    if (!initialized && obligationsLoaded) {
      setSelected(new Set(contactObligations.map(o => o.obligation_id)));
      setInitialized(true);
    }
  }, [contactObligations, initialized, obligationsLoaded]);

  // Trocar as obrigações aqui não pode deixar o Kanban desatualizado: obrigação
  // removida some (só cards intocados, nunca tarefa em andamento ou concluída) e obrigação
  // nova já lança o card do mês, se o mês já foi aprovado no Calendário Fiscal.
  const sync = async () => {
    if (!company?.id || !initialized) return { removed: 0, preserved: 0, created: 0 };
    const original = new Set(contactObligations.map(o => o.obligation_id));
    const toDelete: string[] = [];
    const toInsert: string[] = [];
    original.forEach(id => { if (!selected.has(id)) toDelete.push(id); });
    selected.forEach(id => { if (!original.has(id)) toInsert.push(id); });

    // 1) Grava a mudança de obrigações do cliente.
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

    // 2) Atualiza o card pelas regras do banco (fiscal_cliente_tarefas): só mês já aprovado no Calendário Fiscal; cria o que falta,
    //    remove só card intocado de obrigação tirada e acerta datas. Nunca mexe em tarefa em andamento ou concluída.
    let removed = 0;
    let preserved = 0;
    let created = 0;
    if (toDelete.length || toInsert.length) {
      const { data, error } = await (supabase as any).rpc('fiscal_cliente_tarefas', { p_contact_id: contactId, p_aplicar: true });
      if (error) throw error;
      removed = data?.removidas ?? 0;
      created = data?.criadas ?? 0;
      preserved = data?.preservadas ?? 0;
    }

    await queryClient.invalidateQueries({ queryKey: ['client-obligations', contactId] });
    await queryClient.invalidateQueries({ queryKey: ['fiscal-cliente-tarefas', contactId] });
    if (removed > 0 || created > 0) {
      await queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    }
    return { removed, preserved, created };
  };

  return { catalog, selected, setSelected, sync };
}

// ============ Operacional ============
function OperacionalSection({
  form, original, set, onSave, isPending, contactId, isPessoaFisica,
  obligationsCatalog, selectedObligations, setSelectedObligations,
}: {
  form: Record<string, any>;
  /** Ficha como está salva no banco (a troca de status é comparada com ela). */
  original: Record<string, any>;
  set: (k: string, v: any) => void;
  onSave: () => void;
  isPending: boolean;
  contactId: string;
  isPessoaFisica: boolean;
  obligationsCatalog: { id: string; name: string; is_custom?: boolean }[];
  selectedObligations: Set<string>;
  setSelectedObligations: (s: Set<string>) => void;
}) {
  const { contacts, deleteContact } = useContacts();
  const contact = contacts.find(c => c.id === contactId);
  const navigate = useNavigate();
  const { data: dependencies, isLoading: loadingDependencies } = useContactDependencies(contactId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const canViewSub = (subKey: string) =>
    isModuleVisible('perfil_cliente') && isSubItemVisible('perfil_cliente', subKey);
  const canDeleteContact = canViewSub('perfil_cliente_operacional_excluir');

  const handleDelete = () => {
    deleteContact.mutate(contactId, { onSuccess: () => navigate('/contatos') });
  };

  const { data: profiles } = useTeamProfiles();

  const hoje = format(new Date(), 'yyyy-MM-dd');
  const trocouStatus = (form.status_cliente || '') !== (original.status_cliente || '');
  const mudarStatus = (v: string) => {
    if (!v) return; // Radix dispara onValueChange('') espúrio
    set('status_cliente', v);
    if (v === (original.status_cliente || '')) {
      // Voltou ao status salvo: devolve a data e o motivo que já valiam.
      set('status_cliente_desde', original.status_cliente_desde ?? '');
      set('status_cliente_motivo', original.status_cliente_motivo ?? '');
    } else {
      set('status_cliente_desde', hoje);
      set('status_cliente_motivo', '');
    }
  };
  const efeitoDoStatus = statusEhInativo(form.status_cliente)
    ? 'Cliente inativo: sem tarefas, boletos, avisos nem Serpro.'
    : statusPedeAviso(form.status_cliente)
      ? 'Fora do Ativo: não recebe novas tarefas nem consulta no Serpro. Os boletos continuam, com aviso.'
      : 'Volta a receber tarefas e consulta no Serpro a partir desta data.';

  const categoriasDisponiveis = ['cliente', 'fornecedor', 'colaborador', 'outros'];
  const toggleCategoria = (cat: string) => {
    const current: string[] = form.categorias || ['outros'];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    set('categorias', next.length ? next : ['outros']);
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Responsáveis por setor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Status do Cliente">
            <Select value={form.status_cliente || ''} onValueChange={mudarStatus}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {STATUS_CLIENTE.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">{STATUS_AJUDA}</p>
            {trocouStatus && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-warn/40 bg-warn/10 p-3 sm:grid-cols-2">
                <p className="text-sm text-warn sm:col-span-2">
                  <strong>
                    Status vai mudar de {original.status_cliente || 'sem status'} para {form.status_cliente}.
                  </strong>{' '}
                  {efeitoDoStatus} Informe desde quando e salve para registrar o período.
                </p>
                <Field label="Desde quando?">
                  <Input
                    type="date"
                    max={hoje}
                    value={form.status_cliente_desde || ''}
                    onChange={e => set('status_cliente_desde', e.target.value)}
                  />
                </Field>
                <Field label="Motivo (opcional)">
                  <Input
                    value={form.status_cliente_motivo || ''}
                    onChange={e => set('status_cliente_motivo', e.target.value)}
                    placeholder="Ex.: inadimplência, inaptidão por omissão"
                  />
                </Field>
              </div>
            )}
          </Field>
          {RESPONSIBLE_FIELDS.map(rf => (
            <Field key={rf.key} label={rf.label}>
              <Select value={form[rf.key] || 'none'} onValueChange={v => set(rf.key, v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ))}
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
        <CardHeader><CardTitle className="text-base">Datas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SituacaoClientePanel contactId={contactId} form={form} set={set} original={original} trocouStatus={trocouStatus} hoje={hoje} />
          {DATAS_GRUPOS.map(grupo => (
            <section key={grupo.titulo} className="rounded-lg border border-line bg-paper p-4">
              <header className="mb-4 border-b border-line pb-2">
                <h4 className="text-sm font-semibold text-ink">{grupo.titulo}</h4>
                {grupo.ajuda && <p className="text-meta text-muted-ink">{grupo.ajuda}</p>}
              </header>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {grupo.campos.map(c => (
                  <Field key={c.key} label={c.label}>
                    <Input type="date" value={form[c.key] || ''} onChange={e => set(c.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      {!isPessoaFisica && (
        <Card>
          <CardHeader><CardTitle className="text-base">Tarefas</CardTitle></CardHeader>
          <CardContent>
            <ContactObligationsSelector
              options={obligationsCatalog}
              selectedIds={selectedObligations}
              onChange={setSelectedObligations}
            />
            <ClienteTarefasStatus contactId={contactId} />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {canDeleteContact && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-base text-destructive">Zona de Risco</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
              <div>
                <p className="text-sm font-medium">Excluir contato</p>
                <p className="text-xs text-muted-foreground">Remove {contact?.name || 'este contato'} permanentemente.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canDeleteContact && (
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Esta ação não pode ser desfeita. O contato será removido permanentemente.</p>
                {loadingDependencies ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando vínculos...
                  </div>
                ) : dependencies?.hasDependencies && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
                    <p className="font-medium text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Atenção: este contato possui vínculos
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                      {dependencies.transactionCount > 0 && (
                        <li>{dependencies.transactionCount} transação(ões) financeira(s)</li>
                      )}
                      {dependencies.recurringCount > 0 && (
                        <li>{dependencies.recurringCount} conta(s) recorrente(s)</li>
                      )}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Ao excluir, os registros vinculados permanecerão sem associação a este contato.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={loadingDependencies}>
              {dependencies?.hasDependencies ? 'Excluir mesmo assim' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </>
  );
}

// ============ Situação do cliente (períodos de status) ============
// Só o histórico (pedido de Gabriel, 12/10/2026): uma linha por período, "Status: de X até Y". O Ativo que nunca teve troca
// puxa o início do contrato; a data do período vigente se ajusta na própria linha.
const fmtData = (d: string) => format(parseISO(d), 'dd/MM/yyyy');

function faixaDoPeriodo(p: StatusPeriodo, inicio: string | null) {
  if (inicio && p.fim) return `de ${fmtData(inicio)} até ${fmtData(p.fim)}`;
  if (inicio) return `desde ${fmtData(inicio)}`;
  if (p.fim) return `até ${fmtData(p.fim)}`;
  return 'data de início não informada';
}

function SituacaoClientePanel({
  contactId, form, set, original, trocouStatus, hoje,
}: {
  contactId: string;
  form: Record<string, any>;
  set: (k: string, v: any) => void;
  original: Record<string, any>;
  trocouStatus: boolean;
  hoje: string;
}) {
  const { data: periodos = [], isLoading } = useStatusPeriodos(contactId);
  const { data: dispensadas = [] } = useTarefasDispensadas(contactId);
  const [ajustando, setAjustando] = useState(false);
  const dispensadasPorPeriodo = useMemo(() => {
    const m = new Map<string, typeof dispensadas>();
    dispensadas.forEach(d => { if (d.periodo_id) m.set(d.periodo_id, [...(m.get(d.periodo_id) ?? []), d]); });
    return m;
  }, [dispensadas]);
  const inicioContrato: string | null = original.data_inicio_contrato || null;

  return (
    <section className="rounded-lg border border-line bg-paper p-4 lg:col-span-2">
      <header className="mb-4 border-b border-line pb-2">
        <h4 className="text-sm font-semibold text-ink">Situação do cliente</h4>
        <p className="text-meta text-muted-ink">
          Histórico de quando o cliente esteve Ativo e fora do Ativo. Fora do Ativo não geramos tarefas nem consultamos o Serpro; o que ficou sem entrega nesse intervalo se explica por aqui.
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : periodos.length === 0 ? (
        <p className="text-sm text-muted-ink">Nenhum período registrado.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {periodos.map(p => {
            const apagadas = dispensadasPorPeriodo.get(p.id) ?? [];
            const vigente = !p.fim;
            // Ativo desde sempre (linha de partida, sem troca): mostra o início do contrato.
            const emprestado = !p.inicio && p.status === 'Ativo' && p.origem === 'historico' && !!inicioContrato;
            const inicio = p.inicio ?? (emprestado ? inicioContrato : null);
            const semData = !inicio && !p.fim;
            return (
              <li key={p.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <DsBadge tone={getContactStatusTone(p.status)}>{p.status}</DsBadge>
                  <span className={semData ? 'text-warn' : 'text-ink'}>{faixaDoPeriodo(p, inicio)}</span>
                  {vigente && <span className="text-meta text-muted-ink">vigente</span>}
                  {(emprestado || p.motivo || p.origem === 'receita') && (
                    <span className="text-meta text-muted-ink">
                      {[emprestado ? 'início do contrato' : null, p.origem === 'receita' ? 'Receita Federal' : null, p.motivo].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {vigente && !trocouStatus && (
                    <button
                      type="button"
                      onClick={() => setAjustando(a => !a)}
                      className="ml-auto flex items-center gap-1 text-meta text-action hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      {ajustando ? 'Fechar' : 'Ajustar data'}
                    </button>
                  )}
                </div>
                {vigente && ajustando && !trocouStatus && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Desde">
                      <Input
                        type="date"
                        max={hoje}
                        value={form.status_cliente_desde || ''}
                        onChange={e => set('status_cliente_desde', e.target.value)}
                      />
                    </Field>
                    <Field label="Motivo (opcional)">
                      <Input
                        value={form.status_cliente_motivo || ''}
                        onChange={e => set('status_cliente_motivo', e.target.value)}
                      />
                    </Field>
                    <p className="text-xs text-muted-foreground sm:col-span-2">Vale ao salvar esta aba. Só o responsável pelo cliente, admin e super admin ajustam.</p>
                  </div>
                )}
                {apagadas.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-meta text-muted-ink">
                      {apagadas.length} {apagadas.length === 1 ? 'tarefa apagada ou não gerada' : 'tarefas apagadas ou não geradas'} neste período
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-meta text-muted-ink">
                      {apagadas.map(d => (
                        <li key={d.id}>
                          {d.fiscal_obligations_catalog?.name ?? 'Obrigação'} · competência {String(d.competence_month).padStart(2, '0')}/{d.competence_year}
                          {d.due_date ? ` · vence ${fmtData(d.due_date)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {trocouStatus && (
        <p className="mt-3 text-sm text-muted-ink">Troca de status pendente: informe a data no campo Status do Cliente (acima) e salve.</p>
      )}
    </section>
  );
}

// ============ Sócios ============
function SociosSection({ contactId }: { contactId: string }) {
  const { partners, isLoading, totalParticipation, updatePartner } = useContactPartners(contactId);
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
                    {p.cpf ? maskCPF(p.cpf) : '—'}
                    {p.whatsapp && ` · ${maskPhone(p.whatsapp)}`}
                    {' · '}{p.participation_percentage || 0}%
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
                      onClick={() => updatePartner.mutate({ id: p.id, data_saida: new Date().toISOString().slice(0, 10) } as any)}
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
          <Field label="CPF"><Input value={f.cpf || ''} onChange={e => setF({ ...f, cpf: maskCPF(e.target.value) })} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="WhatsApp"><Input value={f.whatsapp || ''} onChange={e => setF({ ...f, whatsapp: maskPhone(e.target.value) })} /></Field>
          <Field label="Participação (%)">
            <Input type="number" step="0.01" value={f.participation_percentage ?? 0}
              onChange={e => setF({ ...f, participation_percentage: e.target.value })} />
          </Field>
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
