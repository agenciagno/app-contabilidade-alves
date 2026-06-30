import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import type { Database } from '@/integrations/supabase/types';

export type FiscalObligationCatalog =
  Database['public']['Tables']['fiscal_obligations_catalog']['Row'];

interface ObrigacaoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obligation?: FiscalObligationCatalog | null;
  companyId: string;
  onSuccess: () => void;
}

const REGIME_OPTIONS: { value: string; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'mei', label: 'MEI' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
];

function extractDay(due_rule: string | undefined | null): string {
  if (!due_rule) return '';
  const m = due_rule.match(/^day_(\d+)$/);
  return m ? m[1] : '';
}

export function ObrigacaoDialog({
  open,
  onOpenChange,
  obligation,
  companyId,
  onSuccess,
}: ObrigacaoDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRegimes, setSelectedRegimes] = useState<string[]>([]);
  const [dueDay, setDueDay] = useState('');
  const [requiresEmployees, setRequiresEmployees] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (obligation) {
      setName(obligation.name ?? '');
      setDescription(obligation.description ?? '');
      setSelectedRegimes(obligation.applies_to ?? []);
      setDueDay(extractDay(obligation.due_rule));
      setRequiresEmployees(!!obligation.requires_employees);
    } else {
      setName('');
      setDescription('');
      setSelectedRegimes([]);
      setDueDay('');
      setRequiresEmployees(false);
    }
  }, [open, obligation]);

  const toggleRegime = (value: string) => {
    setSelectedRegimes((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  };

  const handleSave = async () => {
    if (name.trim().length < 3) {
      toast.error('Informe um nome com ao menos 3 caracteres.');
      return;
    }
    if (selectedRegimes.length === 0) {
      toast.error('Selecione ao menos um regime.');
      return;
    }
    const dayNum = parseInt(dueDay, 10);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
      toast.error('Dia de vencimento deve ser entre 1 e 31.');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      applies_to: selectedRegimes,
      frequency: 'monthly',
      due_rule: `day_${dayNum}`,
      holiday_adjustment: 'advance',
      requires_employees: requiresEmployees,
      active: true,
      is_custom: true,
      company_id: companyId,
      source: 'manual',
    };

    setSaving(true);
    try {
      if (obligation?.id) {
        const { error } = await supabase
          .from('fiscal_obligations_catalog')
          .update(payload)
          .eq('id', obligation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fiscal_obligations_catalog')
          .insert(payload);
        if (error) throw error;
      }
      toast.success('Obrigação salva com sucesso.');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {obligation ? 'Editar Obrigação' : 'Nova Obrigação'}
          </DialogTitle>
          <DialogDescription>
            Defina o regime, dia de vencimento e ajustes da obrigação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-name">Nome *</Label>
            <Input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: DAS Simples Nacional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-desc">Descrição (opcional)</Label>
            <Textarea
              id="ob-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Regime(s) *</Label>
            <div className="grid grid-cols-2 gap-2">
              {REGIME_OPTIONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedRegimes.includes(r.value)}
                    onCheckedChange={() => toggleRegime(r.value)}
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-day">Dia de vencimento *</Label>
            <Input
              id="ob-day"
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Ajuste automático para último dia útil anterior se cair em fim de semana.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ob-emp" className="cursor-pointer">
                Requer funcionários
              </Label>
              <p className="text-xs text-muted-foreground">
                Aplica-se apenas a empresas com funcionários.
              </p>
            </div>
            <Switch
              id="ob-emp"
              checked={requiresEmployees}
              onCheckedChange={setRequiresEmployees}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
