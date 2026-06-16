import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { useQuery } from '@tanstack/react-query';

interface ContactBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}

export function ContactBulkEditDialog({ open, onOpenChange, selectedIds, onDone }: ContactBulkEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id;
  const [saving, setSaving] = useState(false);

  const [editBoleto, setEditBoleto] = useState(false);
  const [boletoActive, setBoletoActive] = useState(false);
  const [editRegime, setEditRegime] = useState(false);
  const [taxRegime, setTaxRegime] = useState('');
  const [editResponsible, setEditResponsible] = useState(false);
  const [responsibleId, setResponsibleId] = useState('');

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (editBoleto) updates.boleto_active = boletoActive;
      if (editRegime && taxRegime) updates.tax_regime = taxRegime;
      if (editResponsible && responsibleId) updates.responsible_id = responsibleId;

      if (Object.keys(updates).length === 0) {
        toast({ title: 'Nenhum campo selecionado para edição', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('contacts')
        .update(updates)
        .in('id', selectedIds);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: `${selectedIds.length} cliente(s) atualizado(s)` });
      onDone();
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {selectedIds.length} Cliente(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Boleto */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={editBoleto} onCheckedChange={setEditBoleto} />
              <Label>Geração de Boleto</Label>
            </div>
            {editBoleto && (
              <Switch checked={boletoActive} onCheckedChange={setBoletoActive} />
            )}
          </div>

          {/* Tax Regime */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch checked={editRegime} onCheckedChange={setEditRegime} />
              <Label>Regime Tributário</Label>
            </div>
            {editRegime && (
              <Select value={taxRegime} onValueChange={setTaxRegime}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mei">MEI</SelectItem>
                  <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="nao_aplica">Não se aplica</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Responsible */}
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Aplicar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
