import { useState, useEffect } from 'react';
import { TAX_REGIMES } from '@/constants/taxRegimes';
import { PORTE_OPTIONS } from '@/constants/porte';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';

interface ContactBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'prospecto', label: 'Prospecto' },
  { value: 'suspenso', label: 'Suspenso' },
];

const CANAL_OPTIONS = [
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ambos', label: 'Ambos' },
];

export function ContactBulkEditDialog({ open, onOpenChange, selectedIds, onDone }: ContactBulkEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id;
  const [saving, setSaving] = useState(false);

  // Toggles
  const [editPorte, setEditPorte] = useState(false);
  const [porte, setPorte] = useState('');
  const [editStatusCliente, setEditStatusCliente] = useState(false);
  const [statusCliente, setStatusCliente] = useState('');
  const [editRegime, setEditRegime] = useState(false);
  const [taxRegime, setTaxRegime] = useState('');
  const [editResponsible, setEditResponsible] = useState(false);
  const [responsibleId, setResponsibleId] = useState('');

  const [editObrigacoes, setEditObrigacoes] = useState(false);
  const [obrigacoesIds, setObrigacoesIds] = useState<string[]>([]);

  const [editCategorias, setEditCategorias] = useState(false);
  const [categoriasIds, setCategoriasIds] = useState<string[]>([]);

  const [editBoletoActive, setEditBoletoActive] = useState(false);
  const [boletoActive, setBoletoActive] = useState(false);
  const [editBoletoDueDay, setEditBoletoDueDay] = useState(false);
  const [boletoDueDay, setBoletoDueDay] = useState<string>('');
  const [editBoletoValue, setEditBoletoValue] = useState(false);
  const [boletoValue, setBoletoValue] = useState<string>('');
  const [editBoletoStartDate, setEditBoletoStartDate] = useState(false);
  const [boletoStartDate, setBoletoStartDate] = useState<string>('');
  const [editCanal, setEditCanal] = useState(false);
  const [canalEntrega, setCanalEntrega] = useState<string>('');
  const [editEnviarAuto, setEditEnviarAuto] = useState(false);
  const [enviarAuto, setEnviarAuto] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditPorte(false); setPorte('');
      setEditStatusCliente(false); setStatusCliente('');
      setEditRegime(false); setTaxRegime('');
      setEditResponsible(false); setResponsibleId('');
      setEditObrigacoes(false); setObrigacoesIds([]);
      setEditCategorias(false); setCategoriasIds([]);
      setEditBoletoActive(false); setBoletoActive(false);
      setEditBoletoDueDay(false); setBoletoDueDay('');
      setEditBoletoValue(false); setBoletoValue('');
      setEditBoletoStartDate(false); setBoletoStartDate('');
      setEditCanal(false); setCanalEntrega('');
      setEditEnviarAuto(false); setEnviarAuto(false);
    }
  }, [open]);

  const { data: profiles = [] } = useQuery({
    queryKey: ['company-profiles-bulk', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

  const { data: obrigacoesCatalog = [] } = useQuery({
    queryKey: ['obrigacoes-catalog-bulk', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_obligations_catalog')
        .select('id, name, code')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: categoriasList = [] } = useQuery({
    queryKey: ['categorias-bulk', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('company_id', companyId!)
        .eq('scope', 'interno') // Contatos é módulo só da CA — sempre Eventos Contábeis internos.
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

  const toggleInList = (id: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (editPorte && porte) updates.porte = porte;
      if (editStatusCliente && statusCliente) updates.status_cliente = statusCliente;
      if (editRegime && taxRegime) updates.tax_regime = taxRegime;
      if (editResponsible && responsibleId) updates.responsible_id = responsibleId;
      if (editCategorias) updates.categorias = categoriasIds;
      if (editBoletoActive) updates.boleto_active = boletoActive;
      if (editBoletoDueDay && boletoDueDay) updates.boleto_due_day = parseInt(boletoDueDay, 10);
      if (editBoletoValue && boletoValue) updates.boleto_value = parseFloat(boletoValue);
      if (editBoletoStartDate && boletoStartDate) updates.boleto_start_date = boletoStartDate;
      if (editCanal && canalEntrega) updates.canal_entrega = canalEntrega;
      if (editEnviarAuto) updates.enviar_cobranca_auto = enviarAuto;

      const hasContactUpdates = Object.keys(updates).length > 0;
      if (!hasContactUpdates && !editObrigacoes) {
        toast({ title: 'Nenhum campo selecionado para edição', variant: 'destructive' });
        setSaving(false);
        return;
      }

      if (hasContactUpdates) {
        const { error } = await (supabase as any)
          .from('contacts')
          .update(updates)
          .in('id', selectedIds);
        if (error) throw error;
      }

      if (editObrigacoes && companyId) {
        // Substituir obrigações: deletar todas e inserir as novas
        const { error: delErr } = await (supabase as any)
          .from('client_obligations')
          .delete()
          .in('contact_id', selectedIds);
        if (delErr) throw delErr;

        if (obrigacoesIds.length > 0) {
          const rows = selectedIds.flatMap(cid =>
            obrigacoesIds.map(oid => ({
              company_id: companyId,
              contact_id: cid,
              obligation_id: oid,
              active: true,
            }))
          );
          const { error: insErr } = await (supabase as any).from('client_obligations').insert(rows);
          if (insErr) throw insErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['client_obligations'] });
      toast({ title: `${selectedIds.length} cliente(s) atualizado(s)` });
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao atualizar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle>Editar {selectedIds.length} Cliente(s) em Lote</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-4">
            {/* Dados Cadastrais */}
            <section className="space-y-4">
              <SectionTitle>Dados Cadastrais</SectionTitle>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editPorte} onCheckedChange={setEditPorte} />
                  <Label>Porte</Label>
                </div>
                {editPorte && (
                  <Select value={porte} onValueChange={setPorte}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {PORTE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editStatusCliente} onCheckedChange={setEditStatusCliente} />
                  <Label>Status do Cliente</Label>
                </div>
                {editStatusCliente && (
                  <Select value={statusCliente} onValueChange={setStatusCliente}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editRegime} onCheckedChange={setEditRegime} />
                  <Label>Regime Tributário</Label>
                </div>
                {editRegime && (
                  <Select value={taxRegime} onValueChange={setTaxRegime}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editResponsible} onCheckedChange={setEditResponsible} />
                  <Label>Colaborador Responsável</Label>
                </div>
                {editResponsible && (
                  <Select value={responsibleId} onValueChange={setResponsibleId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </section>

            <Separator />

            {/* Fiscais */}
            <section className="space-y-4">
              <SectionTitle>Fiscais</SectionTitle>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editObrigacoes} onCheckedChange={setEditObrigacoes} />
                  <Label>Obrigações Fiscais</Label>
                </div>
                {editObrigacoes && (
                  <div className="border rounded-md max-h-56 overflow-y-auto p-2 space-y-1 bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-2">
                      As obrigações abaixo <strong>substituirão</strong> as atuais dos clientes selecionados.
                    </p>
                    {obrigacoesCatalog.map((o: any) => (
                      <label key={o.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={obrigacoesIds.includes(o.id)}
                          onCheckedChange={() => toggleInList(o.id, obrigacoesIds, setObrigacoesIds)}
                        />
                        <span className="text-sm">
                          {o.code ? <span className="font-mono text-xs text-muted-foreground mr-1.5">{o.code}</span> : null}
                          {o.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Acesso */}
            <section className="space-y-4">
              <SectionTitle>Categorias (Controle de Acesso)</SectionTitle>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editCategorias} onCheckedChange={setEditCategorias} />
                  <Label>Categorias permitidas</Label>
                </div>
                {editCategorias && (
                  <div className="border rounded-md max-h-56 overflow-y-auto p-2 space-y-1 bg-muted/20">
                    {categoriasList.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma categoria cadastrada.</p>
                    ) : categoriasList.map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={categoriasIds.includes(c.id)}
                          onCheckedChange={() => toggleInList(c.id, categoriasIds, setCategoriasIds)}
                        />
                        <span className="text-sm">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Cobrança */}
            <section className="space-y-4">
              <SectionTitle>Configurações de Cobrança</SectionTitle>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={editBoletoActive} onCheckedChange={setEditBoletoActive} />
                  <Label>Geração de Boleto Ativa</Label>
                </div>
                {editBoletoActive && (
                  <Switch checked={boletoActive} onCheckedChange={setBoletoActive} />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editBoletoDueDay} onCheckedChange={setEditBoletoDueDay} />
                  <Label>Dia de Vencimento</Label>
                </div>
                {editBoletoDueDay && (
                  <Input type="number" min="1" max="31" value={boletoDueDay} onChange={e => setBoletoDueDay(e.target.value)} placeholder="Ex: 10" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editBoletoValue} onCheckedChange={setEditBoletoValue} />
                  <Label>Valor Padrão (R$)</Label>
                </div>
                {editBoletoValue && (
                  <Input type="number" step="0.01" min="0" value={boletoValue} onChange={e => setBoletoValue(e.target.value)} placeholder="0,00" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editBoletoStartDate} onCheckedChange={setEditBoletoStartDate} />
                  <Label>Data de Início da Cobrança</Label>
                </div>
                {editBoletoStartDate && (
                  <Input type="date" value={boletoStartDate} onChange={e => setBoletoStartDate(e.target.value)} />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch checked={editCanal} onCheckedChange={setEditCanal} />
                  <Label>Canal de Entrega</Label>
                </div>
                {editCanal && (
                  <Select value={canalEntrega} onValueChange={setCanalEntrega}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {CANAL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={editEnviarAuto} onCheckedChange={setEditEnviarAuto} />
                  <Label>Envio Automático de Cobrança</Label>
                </div>
                {editEnviarAuto && (
                  <Switch checked={enviarAuto} onCheckedChange={setEnviarAuto} />
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Aplicar Alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
