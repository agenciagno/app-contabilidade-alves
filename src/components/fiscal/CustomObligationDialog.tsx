import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/hooks/useProfile';

const REGIMES: { value: string; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'mei', label: 'MEI' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
];

export interface CustomObligationInitial {
  id?: string;
  name?: string;
  description?: string | null;
  applies_to?: string[] | null;
  due_rule?: string | null;
  holiday_adjustment?: string | null;
  internal_delivery_offset?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CustomObligationInitial | null;
}

function parseDueDay(rule?: string | null): number {
  if (!rule) return 10;
  const m = /^day_(\d+)$/.exec(rule);
  return m ? Math.min(31, Math.max(1, Number(m[1]))) : 10;
}

export function CustomObligationDialog({ open, onOpenChange, initial }: Props) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [dueDay, setDueDay] = useState<number>(10);
  const [internalOffset, setInternalOffset] = useState<number>(2);
  const [businessDaysOnly, setBusinessDaysOnly] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setAppliesTo(initial?.applies_to ?? []);
    setDueDay(parseDueDay(initial?.due_rule));
    setInternalOffset(initial?.internal_delivery_offset ?? 2);
    setBusinessDaysOnly((initial?.holiday_adjustment ?? 'prev_business_day') !== 'none');
  }, [open, initial]);

  const toggleRegime = (v: string) => {
    setAppliesTo((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome da obrigação.');
      return;
    }
    if (appliesTo.length === 0) {
      toast.error('Selecione ao menos um regime tributário.');
      return;
    }
    if (!dueDay || dueDay < 1 || dueDay > 31) {
      toast.error('Dia do vencimento deve estar entre 1 e 31.');
      return;
    }
    if (internalOffset == null || internalOffset < 0) {
      toast.error('Dias de antecedência inválidos.');
      return;
    }

    const payload: Record<string, any> = {
      name: name.trim(),
      description: description.trim() || null,
      applies_to: appliesTo,
      code: null,
      frequency: 'monthly',
      due_rule: `day_${dueDay}`,
      holiday_adjustment: businessDaysOnly ? 'prev_business_day' : 'none',
      requires_employees: false,
      active: true,
      is_custom: true,
    };

    setSaving(true);
    try {
      if (isEdit && initial?.id) {
        const { error } = await (supabase as any)
          .from('fiscal_obligations_catalog')
          .update(payload)
          .eq('id', initial.id);
        if (error) throw error;
        toast.success('✅ Obrigação personalizada atualizada.');
      } else {
        if (!profile?.company_id) {
          toast.error('Empresa não identificada.');
          setSaving(false);
          return;
        }
        const { error } = await (supabase as any)
          .from('fiscal_obligations_catalog')
          .insert({ ...payload, company_id: profile.company_id });
        if (error) throw error;
        toast.success('✅ Obrigação personalizada criada com sucesso.');
      }
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
      qc.invalidateQueries({ queryKey: ['fiscal-obligations-catalog'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar obrigação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Obrigação Personalizada' : 'Nova Obrigação Personalizada'}
          </DialogTitle>
          <DialogDescription>
            Crie obrigações fiscais específicas da sua empresa, complementando o catálogo padrão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-obl-name">Nome <span className="text-destructive">*</span></Label>
            <Input
              id="custom-obl-name"
              placeholder="Ex: Entrega Mensal de Documentos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-obl-desc">Descrição</Label>
            <Textarea
              id="custom-obl-desc"
              placeholder="Detalhe a obrigação (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label>Aplica a <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {REGIMES.map((r) => {
                const checked = appliesTo.includes(r.value);
                return (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleRegime(r.value)} />
                    <span>{r.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="custom-obl-due">Dia do vencimento <span className="text-destructive">*</span></Label>
              <Input
                id="custom-obl-due"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-obl-offset">Antecedência interna (dias) <span className="text-destructive">*</span></Label>
              <Input
                id="custom-obl-offset"
                type="number"
                min={0}
                max={60}
                value={internalOffset}
                onChange={(e) => setInternalOffset(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <Label htmlFor="custom-obl-bd" className="cursor-pointer">Considerar apenas dias úteis</Label>
              <p className="text-xs text-muted-foreground">Ajusta vencimento para o dia útil anterior quando cair em fim de semana/feriado.</p>
            </div>
            <Switch id="custom-obl-bd" checked={businessDaysOnly} onCheckedChange={setBusinessDaysOnly} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : (isEdit ? 'Salvar alterações' : 'Criar Obrigação')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
